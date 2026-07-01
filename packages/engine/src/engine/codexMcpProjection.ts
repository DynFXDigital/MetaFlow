/**
 * Codex MCP server projection helpers.
 *
 * Canonical MetaFlow MCP metadata is authority-sensitive. This projection emits
 * documented Codex stdio and Streamable HTTP server settings and leaves runtime
 * authority to the target adapter and Codex trust/requirements layers.
 */

import { McpServerForwardedEnvVar, McpServerMetadata } from './types';

const CODEX_MCP_CONFIG_DESTINATION = '.codex/config.toml';

function hasBlockingWarnings(server: McpServerMetadata): boolean {
    return server.warnings.some((warning) => warning.severity === 'error');
}

function tomlString(value: string): string {
    return JSON.stringify(value);
}

function tomlStringArray(values: string[]): string {
    return `[${values.map(tomlString).join(', ')}]`;
}

function tomlBoolean(value: boolean): string {
    return value ? 'true' : 'false';
}

function tomlStringRecord(value: Record<string, string>): string {
    const entries = Object.keys(value)
        .sort()
        .map((key) => `${tomlString(key)} = ${tomlString(value[key])}`);
    return `{ ${entries.join(', ')} }`;
}

function tomlEnvVarArray(values: McpServerForwardedEnvVar[]): string {
    const hasStructuredEntry = values.some((value) => value.source);
    if (!hasStructuredEntry) {
        return tomlStringArray(values.map((value) => value.name));
    }
    return `[${values
        .map((value) => {
            const parts = [`name = ${tomlString(value.name)}`];
            if (value.source) {
                parts.push(`source = ${tomlString(value.source)}`);
            }
            return `{ ${parts.join(', ')} }`;
        })
        .join(', ')}]`;
}

function compareServers(left: McpServerMetadata, right: McpServerMetadata): number {
    return left.id.localeCompare(right.id) || left.manifestPath.localeCompare(right.manifestPath);
}

export function isCodexMcpServerProjectable(server: McpServerMetadata): boolean {
    return (
        !hasBlockingWarnings(server) &&
        Boolean(server.id) &&
        ((server.transport === 'stdio' && server.invocation !== undefined) ||
            (server.transport === 'streamable-http' && Boolean(server.endpoint)))
    );
}

export function codexMcpProjectionDestination(
    servers: McpServerMetadata[],
): string | undefined {
    return servers.some(isCodexMcpServerProjectable)
        ? CODEX_MCP_CONFIG_DESTINATION
        : undefined;
}

function collectEnvVars(server: McpServerMetadata): McpServerForwardedEnvVar[] {
    const values: McpServerForwardedEnvVar[] = [
        ...server.requiredSecrets.map((name) => ({ name })),
        ...(server.invocation?.envVars ?? []),
    ];
    const seen = new Set<string>();
    const result: McpServerForwardedEnvVar[] = [];
    for (const value of values) {
        const key = `${value.name}\0${value.source ?? ''}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(value);
    }
    return result;
}

function renderCommonServerOptions(lines: string[], server: McpServerMetadata): void {
    if (server.startupTimeoutSeconds !== undefined) {
        lines.push(`startup_timeout_sec = ${server.startupTimeoutSeconds}`);
    }
    if (server.toolTimeoutSeconds !== undefined) {
        lines.push(`tool_timeout_sec = ${server.toolTimeoutSeconds}`);
    }
    if (server.enabled !== undefined) {
        lines.push(`enabled = ${tomlBoolean(server.enabled)}`);
    }
    if (server.required !== undefined) {
        lines.push(`required = ${tomlBoolean(server.required)}`);
    }
    const enabledTools = server.enabledTools ?? [];
    if (enabledTools.length > 0) {
        lines.push(`enabled_tools = ${tomlStringArray(enabledTools)}`);
    }
    const disabledTools = server.disabledTools ?? [];
    if (disabledTools.length > 0) {
        lines.push(`disabled_tools = ${tomlStringArray(disabledTools)}`);
    }
    if (server.defaultToolsApprovalMode) {
        lines.push(`default_tools_approval_mode = ${tomlString(server.defaultToolsApprovalMode)}`);
    }
}

function renderStdioServer(lines: string[], server: McpServerMetadata): void {
    lines.push(`command = ${tomlString(server.invocation?.command ?? '')}`);
    if (server.invocation && server.invocation.args.length > 0) {
        lines.push(`args = ${tomlStringArray(server.invocation.args)}`);
    }
    const envVars = collectEnvVars(server);
    if (envVars.length > 0) {
        lines.push(`env_vars = ${tomlEnvVarArray(envVars)}`);
    }
    if (server.invocation?.cwd) {
        lines.push(`cwd = ${tomlString(server.invocation.cwd)}`);
    }
}

function renderStreamableHttpServer(lines: string[], server: McpServerMetadata): void {
    lines.push(`url = ${tomlString(server.endpoint ?? '')}`);
    if (server.bearerTokenEnvVar) {
        lines.push(`bearer_token_env_var = ${tomlString(server.bearerTokenEnvVar)}`);
    }
    if (server.httpHeaders) {
        lines.push(`http_headers = ${tomlStringRecord(server.httpHeaders)}`);
    }
    if (server.envHttpHeaders) {
        lines.push(`env_http_headers = ${tomlStringRecord(server.envHttpHeaders)}`);
    }
    const oauthScopes = server.oauthScopes ?? [];
    if (oauthScopes.length > 0) {
        lines.push(`scopes = ${tomlStringArray(oauthScopes)}`);
    }
    if (server.oauthResource) {
        lines.push(`oauth_resource = ${tomlString(server.oauthResource)}`);
    }
}

function renderStdioEnvTable(lines: string[], server: McpServerMetadata): void {
    const env = server.invocation?.env;
    if (!env) {
        return;
    }
    lines.push('');
    lines.push(`[mcp_servers.${server.id}.env]`);
    for (const key of Object.keys(env).sort()) {
        lines.push(`${key} = ${tomlString(env[key])}`);
    }
}

function renderToolApprovalTables(lines: string[], server: McpServerMetadata): void {
    const toolApprovalModes = server.toolApprovalModes ?? {};
    const toolNames = Object.keys(toolApprovalModes).sort();
    for (const toolName of toolNames) {
        lines.push('');
        lines.push(`[mcp_servers.${server.id}.tools.${toolName}]`);
        lines.push(`approval_mode = ${tomlString(toolApprovalModes[toolName])}`);
    }
}

export function renderCodexMcpConfigToml(servers: McpServerMetadata[]): string {
    const lines: string[] = [];
    for (const server of servers.filter(isCodexMcpServerProjectable).sort(compareServers)) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(`[mcp_servers.${server.id}]`);
        if (server.transport === 'stdio') {
            renderStdioServer(lines, server);
        } else {
            renderStreamableHttpServer(lines, server);
        }
        renderCommonServerOptions(lines, server);
        renderStdioEnvTable(lines, server);
        renderToolApprovalTables(lines, server);
    }
    return `${lines.join('\n')}\n`;
}

export const codexMcpProjectionConstants = {
    CODEX_MCP_CONFIG_DESTINATION,
};
