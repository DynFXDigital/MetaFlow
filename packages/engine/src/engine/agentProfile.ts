/**
 * Canonical MetaFlow agent profile parser/loader.
 *
 * Agent profiles describe target custom-agent behavior. They do not grant
 * runtime authority or spawn agents directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    AgentProfileMetadata,
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    McpServerMetadata,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const AGENTS_DIR_NAME = 'agents';
const AGENT_PROFILE_SCHEMA_VERSION = 'metaflow.agentProfile/v1';
const AGENT_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'name',
    'description',
    'developerInstructions',
    'nicknameCandidates',
    'model',
    'modelReasoningEffort',
    'sandboxMode',
    'tools',
    'mcpServers',
    'policyGrants',
    'targets',
    'notes',
]);

type AgentProfileFields = {
    schemaVersion?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    developerInstructions?: unknown;
    nicknameCandidates?: unknown;
    model?: unknown;
    modelReasoningEffort?: unknown;
    sandboxMode?: unknown;
    tools?: unknown;
    mcpServers?: unknown;
    policyGrants?: unknown;
    targets?: unknown;
    notes?: unknown;
};

function toWarning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDiagnosticSeverity = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseStringArray(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                warningCode,
                `Agent profile ${fieldName} must be an array of non-empty strings when present.`,
                manifestPath,
                'error',
            ),
        );
        return [];
    }

    const result: string[] = [];
    for (const entry of value) {
        const text = parseNonEmptyString(entry);
        if (!text) {
            warnings.push(
                toWarning(
                    warningCode,
                    `Agent profile ${fieldName} must contain only non-empty strings.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result.push(text);
    }
    return result;
}

function emptyAgentProfile(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): AgentProfileMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        name: '',
        description: '',
        developerInstructions: '',
        nicknameCandidates: [],
        tools: [],
        mcpServers: [],
        policyGrants: [],
        targets: [],
        notes: [],
        warnings,
    };
}

export function parseAgentProfileContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
    knownMcpServerIds: Set<string> = new Set(),
): AgentProfileMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyAgentProfile(manifestPath, [
            toWarning(
                'AGENT_PROFILE_PARSE_ERROR',
                `Agent profile JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyAgentProfile(manifestPath, [
            toWarning(
                'AGENT_PROFILE_ROOT_INVALID',
                'Agent profile manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as AgentProfileFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'AGENT_PROFILE_UNKNOWN_FIELD',
                    `Unknown agent profile field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== AGENT_PROFILE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_SCHEMA_VERSION_INVALID',
                `Agent profile schemaVersion must be "${AGENT_PROFILE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_ID_REQUIRED',
                'Agent profile id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!AGENT_PROFILE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_ID_INVALID',
                'Agent profile id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const name = parseNonEmptyString(fields.name);
    if (!name) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_NAME_REQUIRED',
                'Agent profile name is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (!description) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_DESCRIPTION_REQUIRED',
                'Agent profile description is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const developerInstructions = parseNonEmptyString(fields.developerInstructions);
    if (!developerInstructions) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_DEVELOPER_INSTRUCTIONS_REQUIRED',
                'Agent profile developerInstructions is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const nicknameCandidates = parseStringArray(
        fields.nicknameCandidates,
        'nicknameCandidates',
        'AGENT_PROFILE_NICKNAME_CANDIDATES_INVALID',
        manifestPath,
        warnings,
    );

    const duplicateNicknames = new Set<string>();
    for (const nickname of nicknameCandidates) {
        if (!/^[A-Za-z0-9 _-]+$/.test(nickname)) {
            warnings.push(
                toWarning(
                    'AGENT_PROFILE_NICKNAME_CANDIDATE_INVALID',
                    'Agent profile nicknameCandidates entries must use ASCII letters, digits, spaces, hyphens, or underscores.',
                    manifestPath,
                    'error',
                ),
            );
        }
        const normalized = nickname.toLowerCase();
        if (duplicateNicknames.has(normalized)) {
            warnings.push(
                toWarning(
                    'AGENT_PROFILE_NICKNAME_CANDIDATE_DUPLICATE',
                    'Agent profile nicknameCandidates entries must be unique.',
                    manifestPath,
                    'error',
                ),
            );
        }
        duplicateNicknames.add(normalized);
    }

    const model = parseNonEmptyString(fields.model);
    if (fields.model !== undefined && !model) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_MODEL_INVALID',
                'Agent profile model must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const modelReasoningEffort = parseNonEmptyString(fields.modelReasoningEffort);
    if (fields.modelReasoningEffort !== undefined && !modelReasoningEffort) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_REASONING_EFFORT_INVALID',
                'Agent profile modelReasoningEffort must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const sandboxMode = parseNonEmptyString(fields.sandboxMode);
    if (fields.sandboxMode !== undefined && !sandboxMode) {
        warnings.push(
            toWarning(
                'AGENT_PROFILE_SANDBOX_MODE_INVALID',
                'Agent profile sandboxMode must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const tools = parseStringArray(
        fields.tools,
        'tools',
        'AGENT_PROFILE_TOOLS_INVALID',
        manifestPath,
        warnings,
    );

    const mcpServers = parseStringArray(
        fields.mcpServers,
        'mcpServers',
        'AGENT_PROFILE_MCP_SERVERS_INVALID',
        manifestPath,
        warnings,
    );
    for (const serverId of mcpServers) {
        if (knownMcpServerIds.size > 0 && !knownMcpServerIds.has(serverId)) {
            warnings.push(
                toWarning(
                    'AGENT_PROFILE_MCP_SERVER_UNKNOWN',
                    `Agent profile references unknown MCP server "${serverId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'AGENT_PROFILE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (!knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'AGENT_PROFILE_POLICY_GRANT_UNKNOWN',
                    `Agent profile references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const targets = parseStringArray(
        fields.targets,
        'targets',
        'AGENT_PROFILE_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const notes = parseStringArray(
        fields.notes,
        'notes',
        'AGENT_PROFILE_NOTES_INVALID',
        manifestPath,
        warnings,
    );

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        name: name ?? '',
        description: description ?? '',
        developerInstructions: developerInstructions ?? '',
        nicknameCandidates,
        model,
        modelReasoningEffort,
        sandboxMode,
        tools,
        mcpServers,
        policyGrants,
        targets,
        notes,
        warnings,
    };
}

function hasErrorWarnings(profile: AgentProfileMetadata): boolean {
    return profile.warnings.some((warning) => warning.severity === 'error');
}

function appliesToCodex(profile: AgentProfileMetadata): boolean {
    return profile.targets.length === 0 || profile.targets.includes('codex');
}

function appliesToGitHubCopilot(profile: AgentProfileMetadata): boolean {
    return profile.targets.length === 0 || profile.targets.includes('github-copilot');
}

function tomlString(value: string): string {
    return JSON.stringify(value);
}

function tomlStringArray(values: string[]): string {
    return `[${values.map(tomlString).join(', ')}]`;
}

export function renderCodexAgentProfileToml(profile: AgentProfileMetadata): string {
    const lines = [
        `name = ${tomlString(profile.name)}`,
        `description = ${tomlString(profile.description)}`,
        `developer_instructions = ${tomlString(profile.developerInstructions)}`,
    ];

    if (profile.nicknameCandidates.length > 0) {
        lines.push(`nickname_candidates = ${tomlStringArray(profile.nicknameCandidates)}`);
    }
    if (profile.model) {
        lines.push(`model = ${tomlString(profile.model)}`);
    }
    if (profile.modelReasoningEffort) {
        lines.push(`model_reasoning_effort = ${tomlString(profile.modelReasoningEffort)}`);
    }
    if (profile.sandboxMode) {
        lines.push(`sandbox_mode = ${tomlString(profile.sandboxMode)}`);
    }

    return `${lines.join('\n')}\n`;
}

export function codexAgentProfileDestination(profile: AgentProfileMetadata): string | undefined {
    if (!profile.id || hasErrorWarnings(profile) || !appliesToCodex(profile)) {
        return undefined;
    }
    return `.codex/agents/${profile.id}.toml`;
}

function yamlScalar(value: string): string {
    return JSON.stringify(value);
}

function yamlStringArray(values: string[]): string {
    return `[${values.map(yamlScalar).join(', ')}]`;
}

function renderYamlStringMap(map: Record<string, string>, indentation: string): string[] {
    return Object.entries(map)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${indentation}${key}: ${yamlScalar(value)}`);
}

function isProjectableGitHubCopilotMcpServer(server: McpServerMetadata): boolean {
    return (
        (server.transport === 'stdio' && Boolean(server.invocation)) ||
        ((server.transport === 'http' || server.transport === 'sse') && Boolean(server.endpoint))
    );
}

function githubCopilotMcpServerLines(
    profile: AgentProfileMetadata,
    servers: McpServerMetadata[],
): string[] {
    const referencedServerIds = new Set(profile.mcpServers);
    const selectedServers = servers
        .filter((server) => referencedServerIds.has(server.id))
        .filter((server) => !server.warnings.some((warning) => warning.severity === 'error'))
        .filter(isProjectableGitHubCopilotMcpServer)
        .sort((left, right) => left.id.localeCompare(right.id));
    if (selectedServers.length === 0) {
        return [];
    }

    const lines = ['mcp-servers:'];
    for (const server of selectedServers) {
        const enabledTools = server.enabledTools && server.enabledTools.length > 0
            ? server.enabledTools
            : ['*'];
        lines.push(`  ${server.id}:`);
        if (server.transport === 'stdio' && server.invocation) {
            lines.push('    type: "local"');
            lines.push(`    command: ${yamlScalar(server.invocation.command)}`);
            lines.push(`    args: ${yamlStringArray(server.invocation.args)}`);
            lines.push(`    tools: ${yamlStringArray(enabledTools)}`);
            if (server.invocation.env && Object.keys(server.invocation.env).length > 0) {
                lines.push('    env:');
                lines.push(...renderYamlStringMap(server.invocation.env, '      '));
            }
        } else if ((server.transport === 'http' || server.transport === 'sse') && server.endpoint) {
            lines.push(`    type: ${yamlScalar(server.transport)}`);
            lines.push(`    url: ${yamlScalar(server.endpoint)}`);
            lines.push(`    tools: ${yamlStringArray(enabledTools)}`);
            const headers = {
                ...(server.httpHeaders ?? {}),
                ...(server.envHttpHeaders ?? {}),
            };
            if (Object.keys(headers).length > 0) {
                lines.push('    headers:');
                lines.push(...renderYamlStringMap(headers, '      '));
            }
        }
    }
    return lines.length > 1 ? lines : [];
}

export function renderGitHubCopilotAgentProfileMarkdown(
    profile: AgentProfileMetadata,
    servers: McpServerMetadata[] = [],
): string {
    const frontmatter = [
        '---',
        `name: ${yamlScalar(profile.name)}`,
        `description: ${yamlScalar(profile.description)}`,
        'target: "github-copilot"',
    ];
    if (profile.tools.length > 0) {
        frontmatter.push(`tools: ${yamlStringArray(profile.tools)}`);
    }
    if (profile.model) {
        frontmatter.push(`model: ${yamlScalar(profile.model)}`);
    }
    frontmatter.push(...githubCopilotMcpServerLines(profile, servers));
    frontmatter.push('---');

    return `${frontmatter.join('\n')}\n\n${profile.developerInstructions.trim()}\n`;
}

export function githubCopilotAgentProfileDestination(
    profile: AgentProfileMetadata,
): string | undefined {
    if (!profile.id || hasErrorWarnings(profile) || !appliesToGitHubCopilot(profile)) {
        return undefined;
    }
    return `.github/agents/${profile.id}.agent.md`;
}

export function loadAgentProfilesForLayer(
    layerAbsPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
    knownMcpServerIds: Set<string> = new Set(),
): AgentProfileMetadata[] {
    const agentsDir = path.join(layerAbsPath, CANONICAL_METAFLOW_DIR_NAME, AGENTS_DIR_NAME);
    if (!fs.existsSync(agentsDir)) {
        return [];
    }

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    } catch {
        return [
            emptyAgentProfile(agentsDir, [
                toWarning(
                    'AGENT_PROFILE_DIR_READ_ERROR',
                    'Agent profile directory could not be read.',
                    agentsDir,
                    'error',
                ),
            ]),
        ];
    }

    return entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => {
            const manifestPath = path.join(agentsDir, entry.name);
            try {
                return parseAgentProfileContent(
                    fs.readFileSync(manifestPath, 'utf-8'),
                    manifestPath,
                    knownPolicyGrantIds,
                    knownMcpServerIds,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                return emptyAgentProfile(manifestPath, [
                    toWarning(
                        'AGENT_PROFILE_READ_ERROR',
                        `Agent profile manifest could not be read: ${message}`,
                        manifestPath,
                        'error',
                    ),
                ]);
            }
        });
}
