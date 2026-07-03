/**
 * Canonical MetaFlow tool manifest parser/loader.
 *
 * Tool manifests describe callable tool metadata and authority requirements.
 * They do not grant runtime tool access or configure target harnesses directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    ToolKind,
    ToolMetadata,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const TOOLS_DIR_NAME = 'tools';
const TOOL_SCHEMA_VERSION = 'metaflow.tool/v1';
const TOOL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'kind',
    'command',
    'args',
    'mcpServer',
    'mcpTool',
    'endpoint',
    'policyGrants',
    'targets',
    'executionProfiles',
    'inputSchema',
    'description',
]);
const TOOL_KIND_VALUES = new Set<ToolKind>(['command', 'mcp', 'http', 'manual']);

type ToolFields = {
    schemaVersion?: unknown;
    id?: unknown;
    kind?: unknown;
    command?: unknown;
    args?: unknown;
    mcpServer?: unknown;
    mcpTool?: unknown;
    endpoint?: unknown;
    policyGrants?: unknown;
    targets?: unknown;
    executionProfiles?: unknown;
    inputSchema?: unknown;
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
                `Tool ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Tool ${fieldName} must contain only non-empty strings.`,
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

function emptyTool(manifestPath: string | undefined, warnings: CapabilityWarning[]): ToolMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        kind: 'manual',
        args: [],
        policyGrants: [],
        targets: [],
        executionProfiles: [],
        warnings,
    };
}

export function parseToolContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): ToolMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyTool(manifestPath, [
            toWarning(
                'TOOL_PARSE_ERROR',
                `Tool manifest JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyTool(manifestPath, [
            toWarning('TOOL_ROOT_INVALID', 'Tool manifest root must be a JSON object.', manifestPath, 'error'),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as ToolFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'TOOL_UNKNOWN_FIELD',
                    `Unknown tool field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== TOOL_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'TOOL_SCHEMA_VERSION_INVALID',
                `Tool schemaVersion must be "${TOOL_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'TOOL_ID_REQUIRED',
                'Tool id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!TOOL_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'TOOL_ID_INVALID',
                'Tool id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const kindText = parseNonEmptyString(fields.kind);
    const kind = TOOL_KIND_VALUES.has(kindText as ToolKind) ? (kindText as ToolKind) : undefined;
    if (!kindText) {
        warnings.push(toWarning('TOOL_KIND_REQUIRED', 'Tool kind is required.', manifestPath, 'error'));
    } else if (!kind) {
        warnings.push(
            toWarning(
                'TOOL_KIND_INVALID',
                'Tool kind must be one of command, mcp, http, or manual.',
                manifestPath,
                'error',
            ),
        );
    }

    const command = parseNonEmptyString(fields.command);
    if (fields.command !== undefined && !command) {
        warnings.push(
            toWarning('TOOL_COMMAND_INVALID', 'Tool command must be a non-empty string when present.', manifestPath, 'error'),
        );
    }
    const mcpServer = parseNonEmptyString(fields.mcpServer);
    if (fields.mcpServer !== undefined && !mcpServer) {
        warnings.push(
            toWarning('TOOL_MCP_SERVER_INVALID', 'Tool mcpServer must be a non-empty string when present.', manifestPath, 'error'),
        );
    }
    const mcpTool = parseNonEmptyString(fields.mcpTool);
    if (fields.mcpTool !== undefined && !mcpTool) {
        warnings.push(
            toWarning('TOOL_MCP_TOOL_INVALID', 'Tool mcpTool must be a non-empty string when present.', manifestPath, 'error'),
        );
    }
    const endpoint = parseNonEmptyString(fields.endpoint);
    if (fields.endpoint !== undefined && !endpoint) {
        warnings.push(
            toWarning('TOOL_ENDPOINT_INVALID', 'Tool endpoint must be a non-empty string when present.', manifestPath, 'error'),
        );
    }

    const args = parseStringArray(fields.args, 'args', 'TOOL_ARGS_INVALID', manifestPath, warnings);
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'TOOL_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'TOOL_POLICY_GRANT_UNKNOWN',
                    `Tool references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const targets = parseStringArray(fields.targets, 'targets', 'TOOL_TARGETS_INVALID', manifestPath, warnings);
    const executionProfiles = parseStringArray(
        fields.executionProfiles,
        'executionProfiles',
        'TOOL_EXECUTION_PROFILES_INVALID',
        manifestPath,
        warnings,
    );
    const inputSchema =
        fields.inputSchema === undefined || isObjectRecord(fields.inputSchema)
            ? (fields.inputSchema as Record<string, unknown> | undefined)
            : undefined;
    if (fields.inputSchema !== undefined && !inputSchema) {
        warnings.push(
            toWarning(
                'TOOL_INPUT_SCHEMA_INVALID',
                'Tool inputSchema must be an object when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning('TOOL_DESCRIPTION_INVALID', 'Tool description must be a non-empty string when present.', manifestPath, 'error'),
        );
    }

    if (kind === 'command' && !command) {
        warnings.push(
            toWarning('TOOL_COMMAND_REQUIRED', 'Command tools require command.', manifestPath, 'error'),
        );
    }
    if (kind === 'mcp' && (!mcpServer || !mcpTool)) {
        warnings.push(
            toWarning('TOOL_MCP_REQUIRED', 'MCP tools require mcpServer and mcpTool.', manifestPath, 'error'),
        );
    }
    if (kind === 'http' && !endpoint) {
        warnings.push(
            toWarning('TOOL_ENDPOINT_REQUIRED', 'HTTP tools require endpoint.', manifestPath, 'error'),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        kind: kind ?? 'manual',
        command,
        args,
        mcpServer,
        mcpTool,
        endpoint,
        policyGrants,
        targets,
        executionProfiles,
        inputSchema,
        description,
        warnings,
    };
}

export function loadToolsForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): ToolMetadata[] {
    const toolsDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, TOOLS_DIR_NAME);
    if (!fs.existsSync(toolsDir) || !fs.statSync(toolsDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(toolsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(toolsDir, entry.name);
            return parseToolContent(
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

export const toolManifestConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    TOOLS_DIR_NAME,
    TOOL_SCHEMA_VERSION,
};
