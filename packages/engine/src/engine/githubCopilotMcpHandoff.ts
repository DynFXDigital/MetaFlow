import { McpServerMetadata } from './types';

const GITHUB_COPILOT_MCP_HANDOFF_DESTINATION = '.vscode/mcp.json';

export interface GitHubCopilotMcpServerHandoff {
    id: string;
    supported: boolean;
    config?: Record<string, unknown>;
    policyGrants: string[];
    requiredSecrets: string[];
    warnings: string[];
    sourcePath: string;
}

export interface GitHubCopilotMcpHandoff {
    target: 'github-copilot';
    destination: string;
    format: 'vscode-mcp-json';
    managed: false;
    requiresOperatorReview: true;
    servers: GitHubCopilotMcpServerHandoff[];
    content: string;
    warnings: string[];
}

function hasBlockingWarnings(server: McpServerMetadata): boolean {
    return server.warnings.some((warning) => warning.severity === 'error');
}

function compareServers(left: McpServerMetadata, right: McpServerMetadata): number {
    return left.id.localeCompare(right.id) || left.manifestPath.localeCompare(right.manifestPath);
}

function sortedRecord(value: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
    );
}

function collectHeaders(server: McpServerMetadata): Record<string, string> | undefined {
    const headers = {
        ...(server.httpHeaders ?? {}),
        ...(server.envHttpHeaders ?? {}),
    };
    return Object.keys(headers).length > 0 ? sortedRecord(headers) : undefined;
}

function baseWarnings(server: McpServerMetadata): string[] {
    const warnings: string[] = [];
    if (server.policyGrants.length > 0) {
        warnings.push(`Requires policy grants: ${server.policyGrants.join(', ')}.`);
    }
    if (server.requiredSecrets.length > 0) {
        warnings.push(
            `Requires operator-provided secrets: ${server.requiredSecrets.join(', ')}.`,
        );
    }
    if (server.envHttpHeaders && Object.keys(server.envHttpHeaders).length > 0) {
        warnings.push('Environment-backed HTTP headers must be configured by the operator.');
    }
    return warnings;
}

function renderServerConfig(
    server: McpServerMetadata,
): { config?: Record<string, unknown>; warnings: string[]; supported: boolean } {
    const warnings = baseWarnings(server);

    if (!server.id) {
        warnings.push('MCP server id is required.');
        return { warnings, supported: false };
    }
    if (hasBlockingWarnings(server)) {
        warnings.push('MCP server has blocking validation warnings.');
        return { warnings, supported: false };
    }

    if (server.transport === 'stdio') {
        if (!server.invocation) {
            warnings.push('stdio MCP server requires an invocation command.');
            return { warnings, supported: false };
        }
        const config: Record<string, unknown> = {
            type: 'stdio',
            command: server.invocation.command,
        };
        if (server.invocation.args.length > 0) {
            config.args = server.invocation.args;
        }
        if (server.invocation.env && Object.keys(server.invocation.env).length > 0) {
            config.env = sortedRecord(server.invocation.env);
        }
        return { config, warnings, supported: true };
    }

    if (server.transport === 'http' || server.transport === 'sse') {
        if (!server.endpoint) {
            warnings.push(`${server.transport} MCP server requires an endpoint URL.`);
            return { warnings, supported: false };
        }
        const config: Record<string, unknown> = {
            type: server.transport,
            url: server.endpoint,
        };
        const headers = collectHeaders(server);
        if (headers) {
            config.headers = headers;
        }
        return { config, warnings, supported: true };
    }

    warnings.push(
        `Transport ${server.transport} is not represented in GitHub Copilot workspace MCP handoff output.`,
    );
    return { warnings, supported: false };
}

export function buildGitHubCopilotMcpHandoff(
    servers: McpServerMetadata[],
): GitHubCopilotMcpHandoff | undefined {
    if (servers.length === 0) {
        return undefined;
    }

    const serverHandoffs = servers.sort(compareServers).map((server) => {
        const rendered = renderServerConfig(server);
        return {
            id: server.id,
            supported: rendered.supported,
            config: rendered.config,
            policyGrants: server.policyGrants,
            requiredSecrets: server.requiredSecrets,
            warnings: rendered.warnings,
            sourcePath: server.manifestPath,
        };
    });

    const serverConfigs = Object.fromEntries(
        serverHandoffs
            .filter((server) => server.supported && server.config)
            .map((server) => [server.id, server.config]),
    );
    const content = `${JSON.stringify({ servers: serverConfigs }, null, 2)}\n`;
    const warnings = serverHandoffs.flatMap((server) =>
        server.warnings.map((warning) => `${server.id || '<invalid>'}: ${warning}`),
    );

    return {
        target: 'github-copilot',
        destination: GITHUB_COPILOT_MCP_HANDOFF_DESTINATION,
        format: 'vscode-mcp-json',
        managed: false,
        requiresOperatorReview: true,
        servers: serverHandoffs,
        content,
        warnings,
    };
}

export const githubCopilotMcpHandoffConstants = {
    GITHUB_COPILOT_MCP_HANDOFF_DESTINATION,
};
