/**
 * Canonical MetaFlow MCP server parser/loader.
 *
 * MCP manifests describe tool-server metadata and required authority. They do
 * not directly configure a harness runtime until a target adapter projects them.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    McpServerEnvironmentSource,
    McpServerForwardedEnvVar,
    McpServerInvocation,
    McpServerMetadata,
    McpServerToolApprovalMode,
    McpServerTransport,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const MCP_SERVERS_DIR_NAME = 'mcp';
const MCP_SERVER_SCHEMA_VERSION = 'metaflow.mcpServer/v1';
const MCP_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'transport',
    'invocation',
    'endpoint',
    'requiredSecrets',
    'bearerTokenEnvVar',
    'httpHeaders',
    'envHttpHeaders',
    'oauthScopes',
    'oauthResource',
    'startupTimeoutSeconds',
    'toolTimeoutSeconds',
    'enabled',
    'required',
    'enabledTools',
    'disabledTools',
    'defaultToolsApprovalMode',
    'toolApprovalModes',
    'capabilityCategory',
    'policyGrants',
    'description',
]);
const TRANSPORT_VALUES = new Set<McpServerTransport>(['stdio', 'http', 'sse', 'streamable-http']);
const ENVIRONMENT_SOURCE_VALUES = new Set<McpServerEnvironmentSource>(['local', 'remote']);
const TOOL_APPROVAL_MODE_VALUES = new Set<McpServerToolApprovalMode>([
    'auto',
    'prompt',
    'approve',
]);

type McpServerFields = {
    schemaVersion?: unknown;
    id?: unknown;
    transport?: unknown;
    invocation?: unknown;
    endpoint?: unknown;
    requiredSecrets?: unknown;
    bearerTokenEnvVar?: unknown;
    httpHeaders?: unknown;
    envHttpHeaders?: unknown;
    oauthScopes?: unknown;
    oauthResource?: unknown;
    startupTimeoutSeconds?: unknown;
    toolTimeoutSeconds?: unknown;
    enabled?: unknown;
    required?: unknown;
    enabledTools?: unknown;
    disabledTools?: unknown;
    defaultToolsApprovalMode?: unknown;
    toolApprovalModes?: unknown;
    capabilityCategory?: unknown;
    policyGrants?: unknown;
    description?: unknown;
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
                `MCP server ${fieldName} must be an array of non-empty strings when present.`,
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
                    `MCP server ${fieldName} must contain only non-empty strings.`,
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

function parseStringRecord(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Record<string, string> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                warningCode,
                `MCP server ${fieldName} must be an object with non-empty string keys and values when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: Record<string, string> = {};
    for (const [key, recordValue] of Object.entries(value)) {
        const parsedKey = parseNonEmptyString(key);
        const parsedValue = parseNonEmptyString(recordValue);
        if (!parsedKey || !parsedValue) {
            warnings.push(
                toWarning(
                    warningCode,
                    `MCP server ${fieldName} must contain only non-empty string keys and values.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result[parsedKey] = parsedValue;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function parseOptionalBoolean(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): boolean | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        warnings.push(
            toWarning(
                warningCode,
                `MCP server ${fieldName} must be a boolean when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }
    return value;
}

function parsePositiveNumber(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        warnings.push(
            toWarning(
                warningCode,
                `MCP server ${fieldName} must be a positive number when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }
    return value;
}

function parseToolApprovalMode(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): McpServerToolApprovalMode | undefined {
    const text = parseNonEmptyString(value);
    if (value === undefined) {
        return undefined;
    }
    if (!text || !TOOL_APPROVAL_MODE_VALUES.has(text as McpServerToolApprovalMode)) {
        warnings.push(
            toWarning(
                warningCode,
                `MCP server ${fieldName} must be one of auto, prompt, or approve when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }
    return text as McpServerToolApprovalMode;
}

function parseToolApprovalModes(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Record<string, McpServerToolApprovalMode> {
    if (value === undefined) {
        return {};
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'MCP_SERVER_TOOL_APPROVAL_MODES_INVALID',
                'MCP server toolApprovalModes must be an object keyed by non-empty tool names when present.',
                manifestPath,
                'error',
            ),
        );
        return {};
    }

    const result: Record<string, McpServerToolApprovalMode> = {};
    for (const [toolName, mode] of Object.entries(value)) {
        const parsedName = parseNonEmptyString(toolName);
        const parsedMode = parseToolApprovalMode(
            mode,
            `toolApprovalModes.${toolName}`,
            'MCP_SERVER_TOOL_APPROVAL_MODES_INVALID',
            manifestPath,
            warnings,
        );
        if (parsedName && parsedMode) {
            result[parsedName] = parsedMode;
        }
    }
    return result;
}

function parseForwardedEnvVars(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): McpServerForwardedEnvVar[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                'MCP_SERVER_INVOCATION_ENV_VARS_INVALID',
                'MCP server invocation.envVars must be an array of non-empty strings or objects with name and optional source.',
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: McpServerForwardedEnvVar[] = [];
    for (const entry of value) {
        const text = parseNonEmptyString(entry);
        if (text) {
            result.push({ name: text });
            continue;
        }

        if (!isObjectRecord(entry)) {
            warnings.push(
                toWarning(
                    'MCP_SERVER_INVOCATION_ENV_VARS_INVALID',
                    'MCP server invocation.envVars entries must be non-empty strings or objects.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const name = parseNonEmptyString(entry.name);
        const sourceText = parseNonEmptyString(entry.source);
        if (!name) {
            warnings.push(
                toWarning(
                    'MCP_SERVER_INVOCATION_ENV_VARS_INVALID',
                    'MCP server invocation.envVars object entries require a non-empty name.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        if (
            entry.source !== undefined &&
            (!sourceText || !ENVIRONMENT_SOURCE_VALUES.has(sourceText as McpServerEnvironmentSource))
        ) {
            warnings.push(
                toWarning(
                    'MCP_SERVER_INVOCATION_ENV_VARS_INVALID',
                    'MCP server invocation.envVars source must be local or remote when present.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result.push({
            name,
            ...(sourceText ? { source: sourceText as McpServerEnvironmentSource } : {}),
        });
    }
    return result.length > 0 ? result : undefined;
}

function emptyMcpServer(manifestPath: string | undefined, warnings: CapabilityWarning[]) {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        transport: 'stdio' as const,
        requiredSecrets: [],
        oauthScopes: [],
        enabledTools: [],
        disabledTools: [],
        toolApprovalModes: {},
        policyGrants: [],
        warnings,
    };
}

function parseInvocation(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): McpServerInvocation | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'MCP_SERVER_INVOCATION_INVALID',
                'MCP server invocation must be an object when present.',
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const command = parseNonEmptyString(value.command);
    if (!command) {
        warnings.push(
            toWarning(
                'MCP_SERVER_INVOCATION_COMMAND_REQUIRED',
                'MCP server invocation.command is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const args = parseStringArray(
        value.args,
        'invocation.args',
        'MCP_SERVER_INVOCATION_ARGS_INVALID',
        manifestPath,
        warnings,
    );
    const env = parseStringRecord(
        value.env,
        'invocation.env',
        'MCP_SERVER_INVOCATION_ENV_INVALID',
        manifestPath,
        warnings,
    );
    const cwd = parseNonEmptyString(value.cwd);
    if (value.cwd !== undefined && !cwd) {
        warnings.push(
            toWarning(
                'MCP_SERVER_INVOCATION_CWD_INVALID',
                'MCP server invocation.cwd must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const envVars = parseForwardedEnvVars(value.envVars, manifestPath, warnings);

    return command
        ? {
              command,
              args,
              ...(env ? { env } : {}),
              ...(cwd ? { cwd } : {}),
              ...(envVars ? { envVars } : {}),
          }
        : undefined;
}

export function parseMcpServerContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): McpServerMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyMcpServer(manifestPath, [
            toWarning(
                'MCP_SERVER_PARSE_ERROR',
                `MCP server JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    if (!isObjectRecord(data)) {
        return emptyMcpServer(manifestPath, [
            toWarning(
                'MCP_SERVER_ROOT_INVALID',
                'MCP server manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const fields = data as McpServerFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'MCP_SERVER_UNKNOWN_FIELD',
                    `Unknown MCP server field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== MCP_SERVER_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'MCP_SERVER_SCHEMA_VERSION_INVALID',
                `MCP server schemaVersion must be "${MCP_SERVER_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'MCP_SERVER_ID_REQUIRED',
                'MCP server id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!MCP_SERVER_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'MCP_SERVER_ID_INVALID',
                'MCP server id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const transportText = parseNonEmptyString(fields.transport);
    const transport = TRANSPORT_VALUES.has(transportText as McpServerTransport)
        ? (transportText as McpServerTransport)
        : undefined;
    if (!transportText) {
        warnings.push(
            toWarning(
                'MCP_SERVER_TRANSPORT_REQUIRED',
                'MCP server transport is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!transport) {
        warnings.push(
            toWarning(
                'MCP_SERVER_TRANSPORT_INVALID',
                'MCP server transport must be one of stdio, http, sse, or streamable-http.',
                manifestPath,
                'error',
            ),
        );
    }

    const invocation = parseInvocation(fields.invocation, manifestPath, warnings);
    const endpoint = parseNonEmptyString(fields.endpoint);
    if (fields.endpoint !== undefined && !endpoint) {
        warnings.push(
            toWarning(
                'MCP_SERVER_ENDPOINT_INVALID',
                'MCP server endpoint must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    if (transport === 'stdio' && !invocation) {
        warnings.push(
            toWarning(
                'MCP_SERVER_INVOCATION_REQUIRED',
                'MCP server invocation is required for stdio transport.',
                manifestPath,
                'error',
            ),
        );
    }
    if (transport && transport !== 'stdio' && !endpoint) {
        warnings.push(
            toWarning(
                'MCP_SERVER_ENDPOINT_REQUIRED',
                'MCP server endpoint is required for network transports.',
                manifestPath,
                'error',
            ),
        );
    }

    const requiredSecrets = parseStringArray(
        fields.requiredSecrets,
        'requiredSecrets',
        'MCP_SERVER_REQUIRED_SECRETS_INVALID',
        manifestPath,
        warnings,
    );
    const bearerTokenEnvVar = parseNonEmptyString(fields.bearerTokenEnvVar);
    if (fields.bearerTokenEnvVar !== undefined && !bearerTokenEnvVar) {
        warnings.push(
            toWarning(
                'MCP_SERVER_BEARER_TOKEN_ENV_VAR_INVALID',
                'MCP server bearerTokenEnvVar must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const httpHeaders = parseStringRecord(
        fields.httpHeaders,
        'httpHeaders',
        'MCP_SERVER_HTTP_HEADERS_INVALID',
        manifestPath,
        warnings,
    );
    const envHttpHeaders = parseStringRecord(
        fields.envHttpHeaders,
        'envHttpHeaders',
        'MCP_SERVER_ENV_HTTP_HEADERS_INVALID',
        manifestPath,
        warnings,
    );
    const oauthScopes = parseStringArray(
        fields.oauthScopes,
        'oauthScopes',
        'MCP_SERVER_OAUTH_SCOPES_INVALID',
        manifestPath,
        warnings,
    );
    const oauthResource = parseNonEmptyString(fields.oauthResource);
    if (fields.oauthResource !== undefined && !oauthResource) {
        warnings.push(
            toWarning(
                'MCP_SERVER_OAUTH_RESOURCE_INVALID',
                'MCP server oauthResource must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const startupTimeoutSeconds = parsePositiveNumber(
        fields.startupTimeoutSeconds,
        'startupTimeoutSeconds',
        'MCP_SERVER_STARTUP_TIMEOUT_SECONDS_INVALID',
        manifestPath,
        warnings,
    );
    const toolTimeoutSeconds = parsePositiveNumber(
        fields.toolTimeoutSeconds,
        'toolTimeoutSeconds',
        'MCP_SERVER_TOOL_TIMEOUT_SECONDS_INVALID',
        manifestPath,
        warnings,
    );
    const enabled = parseOptionalBoolean(
        fields.enabled,
        'enabled',
        'MCP_SERVER_ENABLED_INVALID',
        manifestPath,
        warnings,
    );
    const required = parseOptionalBoolean(
        fields.required,
        'required',
        'MCP_SERVER_REQUIRED_INVALID',
        manifestPath,
        warnings,
    );
    const enabledTools = parseStringArray(
        fields.enabledTools,
        'enabledTools',
        'MCP_SERVER_ENABLED_TOOLS_INVALID',
        manifestPath,
        warnings,
    );
    const disabledTools = parseStringArray(
        fields.disabledTools,
        'disabledTools',
        'MCP_SERVER_DISABLED_TOOLS_INVALID',
        manifestPath,
        warnings,
    );
    const defaultToolsApprovalMode = parseToolApprovalMode(
        fields.defaultToolsApprovalMode,
        'defaultToolsApprovalMode',
        'MCP_SERVER_DEFAULT_TOOLS_APPROVAL_MODE_INVALID',
        manifestPath,
        warnings,
    );
    const toolApprovalModes = parseToolApprovalModes(
        fields.toolApprovalModes,
        manifestPath,
        warnings,
    );
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'MCP_SERVER_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    if (policyGrants.length === 0) {
        warnings.push(
            toWarning(
                'MCP_SERVER_POLICY_GRANTS_REQUIRED',
                'MCP server policyGrants must name at least one policy grant.',
                manifestPath,
                'error',
            ),
        );
    }
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'MCP_SERVER_POLICY_GRANT_UNKNOWN',
                    `MCP server references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const capabilityCategory = parseNonEmptyString(fields.capabilityCategory);
    if (fields.capabilityCategory !== undefined && !capabilityCategory) {
        warnings.push(
            toWarning(
                'MCP_SERVER_CAPABILITY_CATEGORY_INVALID',
                'MCP server capabilityCategory must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'MCP_SERVER_DESCRIPTION_INVALID',
                'MCP server description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        transport: transport ?? 'stdio',
        invocation,
        endpoint,
        requiredSecrets,
        bearerTokenEnvVar,
        httpHeaders,
        envHttpHeaders,
        oauthScopes,
        oauthResource,
        startupTimeoutSeconds,
        toolTimeoutSeconds,
        enabled,
        required,
        enabledTools,
        disabledTools,
        defaultToolsApprovalMode,
        toolApprovalModes,
        capabilityCategory,
        policyGrants,
        description,
        warnings,
    };
}

export function loadMcpServersForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): McpServerMetadata[] {
    const mcpDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, MCP_SERVERS_DIR_NAME);
    if (!fs.existsSync(mcpDir) || !fs.statSync(mcpDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(mcpDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(mcpDir, entry.name);
            return parseMcpServerContent(
                fs.readFileSync(manifestPath, 'utf-8'),
                manifestPath,
                knownPolicyGrantIds,
            );
        })
        .sort((left, right) => {
            const idCompare = left.id.localeCompare(right.id, undefined, {
                sensitivity: 'base',
            });
            if (idCompare !== 0) {
                return idCompare;
            }
            return left.manifestPath.localeCompare(right.manifestPath, undefined, {
                sensitivity: 'base',
            });
        });
}

export const mcpServerConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    MCP_SERVERS_DIR_NAME,
    MCP_SERVER_SCHEMA_VERSION,
};
