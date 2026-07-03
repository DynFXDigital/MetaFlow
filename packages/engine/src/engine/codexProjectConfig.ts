/**
 * Canonical MetaFlow Codex project configuration parser/renderer.
 *
 * Project configs describe trusted-repository Codex defaults. They do not grant
 * runtime authority or bypass Codex trust, managed configuration, or approval
 * policies.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    CodexProjectConfigMetadata,
    CodexProjectConfigSettings,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const PROJECT_CONFIG_DIR_NAME = 'project-config';
const CODEX_PROJECT_CONFIG_SCHEMA_VERSION = 'metaflow.codexProjectConfig/v1';
const CODEX_PROJECT_CONFIG_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const CODEX_PROJECT_CONFIG_DESTINATION = '.codex/config.toml';

const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'settings',
    'policyGrants',
    'targets',
    'notes',
]);

const KNOWN_SETTINGS = new Set([
    'model',
    'modelReasoningEffort',
    'modelReasoningSummary',
    'modelVerbosity',
    'approvalPolicy',
    'approvalsReviewer',
    'sandboxMode',
    'webSearch',
    'personality',
    'modelInstructionsFile',
    'projectRootMarkers',
    'features',
    'sandboxWorkspaceWrite',
    'shellEnvironmentPolicy',
]);

const FORBIDDEN_PROJECT_SETTINGS = new Set([
    'openaiBaseUrl',
    'chatgptBaseUrl',
    'appsMcpProductSku',
    'modelProvider',
    'modelProviders',
    'notify',
    'profile',
    'profiles',
    'experimentalRealtimeWsBaseUrl',
    'otel',
]);

const BOOLEAN_FEATURE_KEYS = new Set([
    'apps',
    'codexGitCommit',
    'fastMode',
    'hooks',
    'memories',
    'multiAgent',
    'personality',
    'shellSnapshot',
    'shellTool',
    'unifiedExec',
    'undo',
    'webSearch',
]);

const APPROVAL_POLICY_VALUES = new Set(['untrusted', 'on-request', 'never']);
const APPROVALS_REVIEWER_VALUES = new Set(['user', 'auto_review']);
const SANDBOX_MODE_VALUES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const WEB_SEARCH_VALUES = new Set(['cached', 'live', 'disabled']);
const SHELL_INHERIT_VALUES = new Set(['all', 'core', 'none']);

type CodexProjectConfigFields = {
    schemaVersion?: unknown;
    id?: unknown;
    settings?: unknown;
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
                `Codex project config ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Codex project config ${fieldName} must contain only non-empty strings.`,
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
                `Codex project config ${fieldName} must be an object of string values when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: Record<string, string> = {};
    for (const [key, rawValue] of Object.entries(value)) {
        const text = parseNonEmptyString(rawValue);
        if (!text) {
            warnings.push(
                toWarning(
                    warningCode,
                    `Codex project config ${fieldName}.${key} must be a non-empty string.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result[key] = text;
    }
    return result;
}

function parseBooleanRecord(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Record<string, boolean> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                warningCode,
                `Codex project config ${fieldName} must be an object of boolean values when present.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: Record<string, boolean> = {};
    for (const [key, rawValue] of Object.entries(value)) {
        if (!BOOLEAN_FEATURE_KEYS.has(key)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_FEATURE_UNKNOWN',
                    `Unknown Codex project config feature "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
            continue;
        }
        if (typeof rawValue !== 'boolean') {
            warnings.push(
                toWarning(
                    warningCode,
                    `Codex project config ${fieldName}.${key} must be a boolean.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result[key] = rawValue;
    }
    return result;
}

function parseEnumString(
    value: unknown,
    fieldName: string,
    allowed: Set<string>,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): string | undefined {
    const text = parseNonEmptyString(value);
    if (value === undefined) {
        return undefined;
    }
    if (!text || !allowed.has(text)) {
        warnings.push(
            toWarning(
                warningCode,
                `Codex project config ${fieldName} must be one of ${Array.from(allowed).join(', ')}.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }
    return text;
}

function parseOptionalString(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): string | undefined {
    const text = parseNonEmptyString(value);
    if (value !== undefined && !text) {
        warnings.push(
            toWarning(
                warningCode,
                `Codex project config ${fieldName} must be a non-empty string when present.`,
                manifestPath,
                'error',
            ),
        );
    }
    return text;
}

function parseSandboxWorkspaceWrite(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): CodexProjectConfigSettings['sandboxWorkspaceWrite'] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SANDBOX_WORKSPACE_WRITE_INVALID',
                'Codex project config sandboxWorkspaceWrite must be an object when present.',
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: NonNullable<CodexProjectConfigSettings['sandboxWorkspaceWrite']> = {};
    for (const key of Object.keys(value)) {
        if (
            ![
                'writableRoots',
                'networkAccess',
                'excludeTmpdirEnvVar',
                'excludeSlashTmp',
            ].includes(key)
        ) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_SANDBOX_WORKSPACE_WRITE_FIELD_UNKNOWN',
                    `Unknown Codex project config sandboxWorkspaceWrite field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    result.writableRoots = parseStringArray(
        value.writableRoots,
        'sandboxWorkspaceWrite.writableRoots',
        'CODEX_PROJECT_CONFIG_SANDBOX_WORKSPACE_WRITE_ROOTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const [key, outputKey] of [
        ['networkAccess', 'networkAccess'],
        ['excludeTmpdirEnvVar', 'excludeTmpdirEnvVar'],
        ['excludeSlashTmp', 'excludeSlashTmp'],
    ] as const) {
        if (value[key] !== undefined) {
            if (typeof value[key] !== 'boolean') {
                warnings.push(
                    toWarning(
                        'CODEX_PROJECT_CONFIG_SANDBOX_WORKSPACE_WRITE_BOOLEAN_INVALID',
                        `Codex project config sandboxWorkspaceWrite.${key} must be a boolean.`,
                        manifestPath,
                        'error',
                    ),
                );
            } else {
                result[outputKey] = value[key];
            }
        }
    }
    if (result.networkAccess === true) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SANDBOX_WORKSPACE_WRITE_NETWORK_ACCESS_RISK',
                'Codex project config sandboxWorkspaceWrite.networkAccess=true expands network authority and requires explicit runtime review.',
                manifestPath,
            ),
        );
    }

    return result;
}

function parseShellEnvironmentPolicy(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): CodexProjectConfigSettings['shellEnvironmentPolicy'] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_INVALID',
                'Codex project config shellEnvironmentPolicy must be an object when present.',
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const result: NonNullable<CodexProjectConfigSettings['shellEnvironmentPolicy']> = {};
    for (const key of Object.keys(value)) {
        if (!['inherit', 'includeOnly', 'exclude', 'set', 'ignoreDefaultExcludes'].includes(key)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_FIELD_UNKNOWN',
                    `Unknown Codex project config shellEnvironmentPolicy field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    result.inherit = parseEnumString(
        value.inherit,
        'shellEnvironmentPolicy.inherit',
        SHELL_INHERIT_VALUES,
        'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_INHERIT_INVALID',
        manifestPath,
        warnings,
    );
    result.includeOnly = parseStringArray(
        value.includeOnly,
        'shellEnvironmentPolicy.includeOnly',
        'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_INCLUDE_ONLY_INVALID',
        manifestPath,
        warnings,
    );
    result.exclude = parseStringArray(
        value.exclude,
        'shellEnvironmentPolicy.exclude',
        'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_EXCLUDE_INVALID',
        manifestPath,
        warnings,
    );
    result.set = parseStringRecord(
        value.set,
        'shellEnvironmentPolicy.set',
        'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_SET_INVALID',
        manifestPath,
        warnings,
    );
    if (value.ignoreDefaultExcludes !== undefined) {
        if (typeof value.ignoreDefaultExcludes !== 'boolean') {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_IGNORE_DEFAULT_EXCLUDES_INVALID',
                    'Codex project config shellEnvironmentPolicy.ignoreDefaultExcludes must be a boolean.',
                    manifestPath,
                    'error',
                ),
            );
        } else {
            result.ignoreDefaultExcludes = value.ignoreDefaultExcludes;
        }
    }
    if (result.inherit === 'all') {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_INHERIT_ALL_RISK',
                'Codex project config shellEnvironmentPolicy.inherit=all forwards the ambient shell environment and requires secret-exposure review.',
                manifestPath,
            ),
        );
    }
    if (result.ignoreDefaultExcludes === true) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SHELL_ENVIRONMENT_POLICY_IGNORE_DEFAULT_EXCLUDES_RISK',
                'Codex project config shellEnvironmentPolicy.ignoreDefaultExcludes=true disables default environment exclusions and requires secret-exposure review.',
                manifestPath,
            ),
        );
    }

    return result;
}

function parseSettings(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): CodexProjectConfigSettings {
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SETTINGS_INVALID',
                'Codex project config settings must be an object.',
                manifestPath,
                'error',
            ),
        );
        return {};
    }

    for (const key of Object.keys(value)) {
        if (FORBIDDEN_PROJECT_SETTINGS.has(key)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_SETTING_FORBIDDEN',
                    `Codex project config setting "${key}" is ignored by Codex project configs and must not be declared in MetaFlow project config metadata.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        if (!KNOWN_SETTINGS.has(key)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_SETTING_UNKNOWN',
                    `Unknown Codex project config setting "${key}" is not projected.`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const settings: CodexProjectConfigSettings = {
        model: parseOptionalString(
            value.model,
            'settings.model',
            'CODEX_PROJECT_CONFIG_MODEL_INVALID',
            manifestPath,
            warnings,
        ),
        modelReasoningEffort: parseOptionalString(
            value.modelReasoningEffort,
            'settings.modelReasoningEffort',
            'CODEX_PROJECT_CONFIG_REASONING_EFFORT_INVALID',
            manifestPath,
            warnings,
        ),
        modelReasoningSummary: parseOptionalString(
            value.modelReasoningSummary,
            'settings.modelReasoningSummary',
            'CODEX_PROJECT_CONFIG_REASONING_SUMMARY_INVALID',
            manifestPath,
            warnings,
        ),
        modelVerbosity: parseOptionalString(
            value.modelVerbosity,
            'settings.modelVerbosity',
            'CODEX_PROJECT_CONFIG_MODEL_VERBOSITY_INVALID',
            manifestPath,
            warnings,
        ),
        approvalPolicy: parseEnumString(
            value.approvalPolicy,
            'settings.approvalPolicy',
            APPROVAL_POLICY_VALUES,
            'CODEX_PROJECT_CONFIG_APPROVAL_POLICY_INVALID',
            manifestPath,
            warnings,
        ),
        approvalsReviewer: parseEnumString(
            value.approvalsReviewer,
            'settings.approvalsReviewer',
            APPROVALS_REVIEWER_VALUES,
            'CODEX_PROJECT_CONFIG_APPROVALS_REVIEWER_INVALID',
            manifestPath,
            warnings,
        ),
        sandboxMode: parseEnumString(
            value.sandboxMode,
            'settings.sandboxMode',
            SANDBOX_MODE_VALUES,
            'CODEX_PROJECT_CONFIG_SANDBOX_MODE_INVALID',
            manifestPath,
            warnings,
        ),
        webSearch: parseEnumString(
            value.webSearch,
            'settings.webSearch',
            WEB_SEARCH_VALUES,
            'CODEX_PROJECT_CONFIG_WEB_SEARCH_INVALID',
            manifestPath,
            warnings,
        ),
        personality: parseOptionalString(
            value.personality,
            'settings.personality',
            'CODEX_PROJECT_CONFIG_PERSONALITY_INVALID',
            manifestPath,
            warnings,
        ),
        modelInstructionsFile: parseOptionalString(
            value.modelInstructionsFile,
            'settings.modelInstructionsFile',
            'CODEX_PROJECT_CONFIG_MODEL_INSTRUCTIONS_FILE_INVALID',
            manifestPath,
            warnings,
        ),
        projectRootMarkers: parseStringArray(
            value.projectRootMarkers,
            'settings.projectRootMarkers',
            'CODEX_PROJECT_CONFIG_PROJECT_ROOT_MARKERS_INVALID',
            manifestPath,
            warnings,
        ),
        features: parseBooleanRecord(
            value.features,
            'settings.features',
            'CODEX_PROJECT_CONFIG_FEATURES_INVALID',
            manifestPath,
            warnings,
        ),
        sandboxWorkspaceWrite: parseSandboxWorkspaceWrite(
            value.sandboxWorkspaceWrite,
            manifestPath,
            warnings,
        ),
        shellEnvironmentPolicy: parseShellEnvironmentPolicy(
            value.shellEnvironmentPolicy,
            manifestPath,
            warnings,
        ),
    };

    if (settings.approvalPolicy === 'never') {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_APPROVAL_POLICY_NEVER_RISK',
                'Codex project config approvalPolicy=never reduces approval prompts and requires explicit operator review.',
                manifestPath,
            ),
        );
    }
    if (settings.sandboxMode === 'danger-full-access') {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SANDBOX_MODE_DANGER_FULL_ACCESS_RISK',
                'Codex project config sandboxMode=danger-full-access disables filesystem sandboxing and requires explicit operator review.',
                manifestPath,
            ),
        );
    }
    if (settings.webSearch === 'live') {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_WEB_SEARCH_LIVE_RISK',
                'Codex project config webSearch=live enables live network-backed search and requires network policy review.',
                manifestPath,
            ),
        );
    }

    return settings;
}

function emptyCodexProjectConfig(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): CodexProjectConfigMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        settings: {},
        policyGrants: [],
        targets: [],
        notes: [],
        warnings,
    };
}

export function parseCodexProjectConfigContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): CodexProjectConfigMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyCodexProjectConfig(manifestPath, [
            toWarning(
                'CODEX_PROJECT_CONFIG_PARSE_ERROR',
                `Codex project config JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyCodexProjectConfig(manifestPath, [
            toWarning(
                'CODEX_PROJECT_CONFIG_ROOT_INVALID',
                'Codex project config manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as CodexProjectConfigFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_UNKNOWN_FIELD',
                    `Unknown Codex project config field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== CODEX_PROJECT_CONFIG_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_SCHEMA_VERSION_INVALID',
                `Codex project config schemaVersion must be "${CODEX_PROJECT_CONFIG_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_ID_REQUIRED',
                'Codex project config id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!CODEX_PROJECT_CONFIG_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'CODEX_PROJECT_CONFIG_ID_INVALID',
                'Codex project config id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const settings = parseSettings(fields.settings, manifestPath, warnings);
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'CODEX_PROJECT_CONFIG_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'CODEX_PROJECT_CONFIG_POLICY_GRANT_UNKNOWN',
                    `Codex project config references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const targets = parseStringArray(
        fields.targets,
        'targets',
        'CODEX_PROJECT_CONFIG_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const notes = parseStringArray(
        fields.notes,
        'notes',
        'CODEX_PROJECT_CONFIG_NOTES_INVALID',
        manifestPath,
        warnings,
    );

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        settings,
        policyGrants,
        targets,
        notes,
        warnings,
    };
}

function hasErrorWarnings(config: CodexProjectConfigMetadata): boolean {
    return config.warnings.some((warning) => warning.severity === 'error');
}

function appliesToCodex(config: CodexProjectConfigMetadata): boolean {
    return config.targets.length === 0 || config.targets.includes('codex');
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

function snakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function pushString(lines: string[], key: string, value: string | undefined): void {
    if (value !== undefined) {
        lines.push(`${key} = ${tomlString(value)}`);
    }
}

function pushStringArray(lines: string[], key: string, values: string[] | undefined): void {
    if (values && values.length > 0) {
        lines.push(`${key} = ${tomlStringArray(values)}`);
    }
}

function pushBoolean(lines: string[], key: string, value: boolean | undefined): void {
    if (value !== undefined) {
        lines.push(`${key} = ${tomlBoolean(value)}`);
    }
}

function pushStringRecord(lines: string[], key: string, values: Record<string, string> | undefined): void {
    if (!values || Object.keys(values).length === 0) {
        return;
    }
    const entries = Object.entries(values)
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([entryKey, entryValue]) => `${tomlString(entryKey)} = ${tomlString(entryValue)}`);
    lines.push(`${key} = { ${entries.join(', ')} }`);
}

export function renderCodexProjectConfigToml(config: CodexProjectConfigMetadata): string {
    const lines: string[] = [];
    const settings = config.settings;

    pushString(lines, 'model', settings.model);
    pushString(lines, 'model_reasoning_effort', settings.modelReasoningEffort);
    pushString(lines, 'model_reasoning_summary', settings.modelReasoningSummary);
    pushString(lines, 'model_verbosity', settings.modelVerbosity);
    pushString(lines, 'approval_policy', settings.approvalPolicy);
    pushString(lines, 'approvals_reviewer', settings.approvalsReviewer);
    pushString(lines, 'sandbox_mode', settings.sandboxMode);
    pushString(lines, 'web_search', settings.webSearch);
    pushString(lines, 'personality', settings.personality);
    pushString(lines, 'model_instructions_file', settings.modelInstructionsFile);
    pushStringArray(lines, 'project_root_markers', settings.projectRootMarkers);

    if (settings.features && Object.keys(settings.features).length > 0) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push('[features]');
        for (const [key, value] of Object.entries(settings.features).sort((left, right) =>
            left[0].localeCompare(right[0]),
        )) {
            lines.push(`${snakeCase(key)} = ${tomlBoolean(value)}`);
        }
    }

    if (settings.sandboxWorkspaceWrite) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push('[sandbox_workspace_write]');
        pushStringArray(lines, 'writable_roots', settings.sandboxWorkspaceWrite.writableRoots);
        pushBoolean(lines, 'network_access', settings.sandboxWorkspaceWrite.networkAccess);
        pushBoolean(
            lines,
            'exclude_tmpdir_env_var',
            settings.sandboxWorkspaceWrite.excludeTmpdirEnvVar,
        );
        pushBoolean(lines, 'exclude_slash_tmp', settings.sandboxWorkspaceWrite.excludeSlashTmp);
    }

    if (settings.shellEnvironmentPolicy) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push('[shell_environment_policy]');
        pushString(lines, 'inherit', settings.shellEnvironmentPolicy.inherit);
        pushStringArray(lines, 'include_only', settings.shellEnvironmentPolicy.includeOnly);
        pushStringArray(lines, 'exclude', settings.shellEnvironmentPolicy.exclude);
        pushStringRecord(lines, 'set', settings.shellEnvironmentPolicy.set);
        pushBoolean(
            lines,
            'ignore_default_excludes',
            settings.shellEnvironmentPolicy.ignoreDefaultExcludes,
        );
    }

    return `${lines.join('\n')}\n`;
}

export function codexProjectConfigDestination(
    config: CodexProjectConfigMetadata,
): string | undefined {
    if (!config.id || hasErrorWarnings(config) || !appliesToCodex(config)) {
        return undefined;
    }
    return CODEX_PROJECT_CONFIG_DESTINATION;
}

export function loadCodexProjectConfigsForLayer(
    layerAbsPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): CodexProjectConfigMetadata[] {
    const projectConfigDir = path.join(
        layerAbsPath,
        CANONICAL_METAFLOW_DIR_NAME,
        PROJECT_CONFIG_DIR_NAME,
    );
    if (!fs.existsSync(projectConfigDir)) {
        return [];
    }

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(projectConfigDir, { withFileTypes: true });
    } catch {
        return [
            emptyCodexProjectConfig(projectConfigDir, [
                toWarning(
                    'CODEX_PROJECT_CONFIG_DIR_READ_ERROR',
                    'Codex project config directory could not be read.',
                    projectConfigDir,
                    'error',
                ),
            ]),
        ];
    }

    return entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => {
            const manifestPath = path.join(projectConfigDir, entry.name);
            try {
                return parseCodexProjectConfigContent(
                    fs.readFileSync(manifestPath, 'utf-8'),
                    manifestPath,
                    knownPolicyGrantIds,
                );
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                return emptyCodexProjectConfig(manifestPath, [
                    toWarning(
                        'CODEX_PROJECT_CONFIG_READ_ERROR',
                        `Codex project config manifest could not be read: ${message}`,
                        manifestPath,
                        'error',
                    ),
                ]);
            }
        });
}

export const codexProjectConfigConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    PROJECT_CONFIG_DIR_NAME,
    CODEX_PROJECT_CONFIG_SCHEMA_VERSION,
    CODEX_PROJECT_CONFIG_DESTINATION,
};
