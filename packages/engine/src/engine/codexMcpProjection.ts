/**
 * Codex MCP server projection helpers.
 *
 * Canonical MetaFlow MCP metadata is authority-sensitive. This projection emits
 * the documented Codex stdio server subset and leaves runtime authority to the
 * target adapter and Codex trust/requirements layers.
 */

import { McpServerMetadata } from './types';

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

function compareServers(left: McpServerMetadata, right: McpServerMetadata): number {
    return left.id.localeCompare(right.id) || left.manifestPath.localeCompare(right.manifestPath);
}

export function isCodexMcpServerProjectable(server: McpServerMetadata): boolean {
    return (
        !hasBlockingWarnings(server) &&
        Boolean(server.id) &&
        server.transport === 'stdio' &&
        server.invocation !== undefined
    );
}

export function codexMcpProjectionDestination(
    servers: McpServerMetadata[],
): string | undefined {
    return servers.some(isCodexMcpServerProjectable)
        ? CODEX_MCP_CONFIG_DESTINATION
        : undefined;
}

export function renderCodexMcpConfigToml(servers: McpServerMetadata[]): string {
    const lines: string[] = [];
    for (const server of servers.filter(isCodexMcpServerProjectable).sort(compareServers)) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(`[mcp_servers.${server.id}]`);
        lines.push(`command = ${tomlString(server.invocation?.command ?? '')}`);
        if (server.invocation && server.invocation.args.length > 0) {
            lines.push(`args = ${tomlStringArray(server.invocation.args)}`);
        }
        if (server.requiredSecrets.length > 0) {
            lines.push(`env_vars = ${tomlStringArray(server.requiredSecrets)}`);
        }
    }
    return `${lines.join('\n')}\n`;
}

export const codexMcpProjectionConstants = {
    CODEX_MCP_CONFIG_DESTINATION,
};
