/**
 * Canonical MetaFlow hook parser/loader.
 *
 * Hook manifests describe lifecycle automation metadata and required authority.
 * They do not directly configure a target harness until an adapter projects them.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    HookFailureBehavior,
    HookInvocationType,
    HookMetadata,
    HookTriggerPhase,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const HOOKS_DIR_NAME = 'hooks';
const HOOK_SCHEMA_VERSION = 'metaflow.hook/v1';
const HOOK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'triggerPhase',
    'invocationType',
    'command',
    'args',
    'endpoint',
    'scope',
    'failureBehavior',
    'policyGrants',
    'targets',
    'description',
]);
const TRIGGER_PHASE_VALUES = new Set<HookTriggerPhase>([
    'preToolUse',
    'postToolUse',
    'preApply',
    'postApply',
    'preCommit',
    'custom',
]);
const INVOCATION_TYPE_VALUES = new Set<HookInvocationType>(['command', 'http', 'llm']);
const FAILURE_BEHAVIOR_VALUES = new Set<HookFailureBehavior>(['block', 'warn', 'continue']);

type HookFields = {
    schemaVersion?: unknown;
    id?: unknown;
    triggerPhase?: unknown;
    invocationType?: unknown;
    command?: unknown;
    args?: unknown;
    endpoint?: unknown;
    scope?: unknown;
    failureBehavior?: unknown;
    policyGrants?: unknown;
    targets?: unknown;
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
                `Hook ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Hook ${fieldName} must contain only non-empty strings.`,
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

function emptyHook(manifestPath: string | undefined, warnings: CapabilityWarning[]) {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        triggerPhase: 'custom' as const,
        invocationType: 'command' as const,
        args: [],
        failureBehavior: 'block' as const,
        policyGrants: [],
        targets: [],
        warnings,
    };
}

export function parseHookContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): HookMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyHook(manifestPath, [
            toWarning(
                'HOOK_PARSE_ERROR',
                `Hook JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyHook(manifestPath, [
            toWarning(
                'HOOK_ROOT_INVALID',
                'Hook manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as HookFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'HOOK_UNKNOWN_FIELD',
                    `Unknown hook field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== HOOK_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'HOOK_SCHEMA_VERSION_INVALID',
                `Hook schemaVersion must be "${HOOK_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'HOOK_ID_REQUIRED',
                'Hook id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!HOOK_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'HOOK_ID_INVALID',
                'Hook id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const triggerPhaseText = parseNonEmptyString(fields.triggerPhase);
    const triggerPhase = TRIGGER_PHASE_VALUES.has(triggerPhaseText as HookTriggerPhase)
        ? (triggerPhaseText as HookTriggerPhase)
        : undefined;
    if (!triggerPhaseText) {
        warnings.push(
            toWarning(
                'HOOK_TRIGGER_PHASE_REQUIRED',
                'Hook triggerPhase is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!triggerPhase) {
        warnings.push(
            toWarning(
                'HOOK_TRIGGER_PHASE_INVALID',
                'Hook triggerPhase must be one of preToolUse, postToolUse, preApply, postApply, preCommit, or custom.',
                manifestPath,
                'error',
            ),
        );
    }

    const invocationTypeText = parseNonEmptyString(fields.invocationType);
    const invocationType = INVOCATION_TYPE_VALUES.has(invocationTypeText as HookInvocationType)
        ? (invocationTypeText as HookInvocationType)
        : undefined;
    if (!invocationTypeText) {
        warnings.push(
            toWarning(
                'HOOK_INVOCATION_TYPE_REQUIRED',
                'Hook invocationType is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!invocationType) {
        warnings.push(
            toWarning(
                'HOOK_INVOCATION_TYPE_INVALID',
                'Hook invocationType must be one of command, http, or llm.',
                manifestPath,
                'error',
            ),
        );
    }

    const command = parseNonEmptyString(fields.command);
    if (fields.command !== undefined && !command) {
        warnings.push(
            toWarning(
                'HOOK_COMMAND_INVALID',
                'Hook command must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const endpoint = parseNonEmptyString(fields.endpoint);
    if (fields.endpoint !== undefined && !endpoint) {
        warnings.push(
            toWarning(
                'HOOK_ENDPOINT_INVALID',
                'Hook endpoint must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    if (invocationType === 'command' && !command) {
        warnings.push(
            toWarning(
                'HOOK_COMMAND_REQUIRED',
                'Hook command is required for command invocationType.',
                manifestPath,
                'error',
            ),
        );
    }
    if (invocationType === 'http' && !endpoint) {
        warnings.push(
            toWarning(
                'HOOK_ENDPOINT_REQUIRED',
                'Hook endpoint is required for http invocationType.',
                manifestPath,
                'error',
            ),
        );
    }

    const failureBehaviorText = parseNonEmptyString(fields.failureBehavior);
    const failureBehavior = FAILURE_BEHAVIOR_VALUES.has(failureBehaviorText as HookFailureBehavior)
        ? (failureBehaviorText as HookFailureBehavior)
        : undefined;
    if (!failureBehaviorText) {
        warnings.push(
            toWarning(
                'HOOK_FAILURE_BEHAVIOR_REQUIRED',
                'Hook failureBehavior is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!failureBehavior) {
        warnings.push(
            toWarning(
                'HOOK_FAILURE_BEHAVIOR_INVALID',
                'Hook failureBehavior must be one of block, warn, or continue.',
                manifestPath,
                'error',
            ),
        );
    }

    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'HOOK_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    if (policyGrants.length === 0) {
        warnings.push(
            toWarning(
                'HOOK_POLICY_GRANTS_REQUIRED',
                'Hook policyGrants must name at least one policy grant.',
                manifestPath,
                'error',
            ),
        );
    }
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'HOOK_POLICY_GRANT_UNKNOWN',
                    `Hook references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const args = parseStringArray(fields.args, 'args', 'HOOK_ARGS_INVALID', manifestPath, warnings);
    const targets = parseStringArray(
        fields.targets,
        'targets',
        'HOOK_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const scope = parseNonEmptyString(fields.scope);
    if (fields.scope !== undefined && !scope) {
        warnings.push(
            toWarning(
                'HOOK_SCOPE_INVALID',
                'Hook scope must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'HOOK_DESCRIPTION_INVALID',
                'Hook description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        triggerPhase: triggerPhase ?? 'custom',
        invocationType: invocationType ?? 'command',
        command,
        args,
        endpoint,
        scope,
        failureBehavior: failureBehavior ?? 'block',
        policyGrants,
        targets,
        description,
        warnings,
    };
}

export function loadHooksForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): HookMetadata[] {
    const hooksDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, HOOKS_DIR_NAME);
    if (!fs.existsSync(hooksDir) || !fs.statSync(hooksDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(hooksDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(hooksDir, entry.name);
            return parseHookContent(
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

export const hookManifestConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    HOOKS_DIR_NAME,
    HOOK_SCHEMA_VERSION,
};
