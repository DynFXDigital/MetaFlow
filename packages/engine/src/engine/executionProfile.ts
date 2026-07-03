/**
 * Canonical MetaFlow execution profile parser/loader.
 *
 * Execution profiles describe where and how a capability is allowed to run.
 * They do not provision local, cloud, CI, or container runtimes directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    ExecutionIsolation,
    ExecutionProfileMetadata,
    ExecutionSurface,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const EXECUTION_DIR_NAME = 'execution';
const EXECUTION_PROFILE_SCHEMA_VERSION = 'metaflow.executionProfile/v1';
const EXECUTION_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'surface',
    'isolation',
    'runner',
    'workingDirectory',
    'timeoutSeconds',
    'requiredSecrets',
    'environment',
    'policyGrants',
    'targets',
    'description',
]);
const SURFACE_VALUES = new Set<ExecutionSurface>([
    'localWorkstation',
    'devContainer',
    'cloudSandbox',
    'ciRunner',
    'longRunningVm',
    'issuePrNative',
    'alwaysOnWorkflow',
    'githubAction',
    'appServer',
    'sdkEmbedded',
]);
const ISOLATION_VALUES = new Set<ExecutionIsolation>([
    'none',
    'workspace-write',
    'container',
    'vm',
    'cloud-sandbox',
]);

type ExecutionProfileFields = {
    schemaVersion?: unknown;
    id?: unknown;
    surface?: unknown;
    isolation?: unknown;
    runner?: unknown;
    workingDirectory?: unknown;
    timeoutSeconds?: unknown;
    requiredSecrets?: unknown;
    environment?: unknown;
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
                `Execution profile ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Execution profile ${fieldName} must contain only non-empty strings.`,
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

function parseEnvironment(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Record<string, string> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_ENVIRONMENT_INVALID',
                'Execution profile environment must be an object with string values when present.',
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }

    const environment: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        const name = parseNonEmptyString(key);
        const text = parseNonEmptyString(entry);
        if (!name || !text) {
            warnings.push(
                toWarning(
                    'EXECUTION_PROFILE_ENVIRONMENT_INVALID',
                    'Execution profile environment must contain only non-empty string keys and values.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        environment[name] = text;
    }
    return environment;
}

function emptyExecutionProfile(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): ExecutionProfileMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        surface: 'localWorkstation',
        isolation: 'workspace-write',
        requiredSecrets: [],
        policyGrants: [],
        targets: [],
        warnings,
    };
}

export function parseExecutionProfileContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): ExecutionProfileMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyExecutionProfile(manifestPath, [
            toWarning(
                'EXECUTION_PROFILE_PARSE_ERROR',
                `Execution profile JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyExecutionProfile(manifestPath, [
            toWarning(
                'EXECUTION_PROFILE_ROOT_INVALID',
                'Execution profile manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as ExecutionProfileFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'EXECUTION_PROFILE_UNKNOWN_FIELD',
                    `Unknown execution profile field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== EXECUTION_PROFILE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_SCHEMA_VERSION_INVALID',
                `Execution profile schemaVersion must be "${EXECUTION_PROFILE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_ID_REQUIRED',
                'Execution profile id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!EXECUTION_PROFILE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_ID_INVALID',
                'Execution profile id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const surfaceText = parseNonEmptyString(fields.surface);
    const surface = SURFACE_VALUES.has(surfaceText as ExecutionSurface)
        ? (surfaceText as ExecutionSurface)
        : undefined;
    if (!surfaceText) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_SURFACE_REQUIRED',
                'Execution profile surface is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!surface) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_SURFACE_INVALID',
                'Execution profile surface must be one of localWorkstation, devContainer, cloudSandbox, ciRunner, longRunningVm, issuePrNative, or alwaysOnWorkflow.',
                manifestPath,
                'error',
            ),
        );
    }

    const isolationText = parseNonEmptyString(fields.isolation);
    const isolation = ISOLATION_VALUES.has(isolationText as ExecutionIsolation)
        ? (isolationText as ExecutionIsolation)
        : undefined;
    if (!isolationText) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_ISOLATION_REQUIRED',
                'Execution profile isolation is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!isolation) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_ISOLATION_INVALID',
                'Execution profile isolation must be one of none, workspace-write, container, vm, or cloud-sandbox.',
                manifestPath,
                'error',
            ),
        );
    }

    const runner = parseNonEmptyString(fields.runner);
    if (fields.runner !== undefined && !runner) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_RUNNER_INVALID',
                'Execution profile runner must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const workingDirectory = parseNonEmptyString(fields.workingDirectory);
    if (fields.workingDirectory !== undefined && !workingDirectory) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_WORKING_DIRECTORY_INVALID',
                'Execution profile workingDirectory must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    let timeoutSeconds: number | undefined;
    if (fields.timeoutSeconds !== undefined) {
        if (
            typeof fields.timeoutSeconds === 'number' &&
            Number.isInteger(fields.timeoutSeconds) &&
            fields.timeoutSeconds > 0
        ) {
            timeoutSeconds = fields.timeoutSeconds;
        } else {
            warnings.push(
                toWarning(
                    'EXECUTION_PROFILE_TIMEOUT_INVALID',
                    'Execution profile timeoutSeconds must be a positive integer when present.',
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const requiredSecrets = parseStringArray(
        fields.requiredSecrets,
        'requiredSecrets',
        'EXECUTION_PROFILE_REQUIRED_SECRETS_INVALID',
        manifestPath,
        warnings,
    );
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'EXECUTION_PROFILE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    if (policyGrants.length === 0) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_POLICY_GRANTS_REQUIRED',
                'Execution profile policyGrants must name at least one policy grant.',
                manifestPath,
                'error',
            ),
        );
    }
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'EXECUTION_PROFILE_POLICY_GRANT_UNKNOWN',
                    `Execution profile references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const environment = parseEnvironment(fields.environment, manifestPath, warnings);
    const targets = parseStringArray(
        fields.targets,
        'targets',
        'EXECUTION_PROFILE_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'EXECUTION_PROFILE_DESCRIPTION_INVALID',
                'Execution profile description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        surface: surface ?? 'localWorkstation',
        isolation: isolation ?? 'workspace-write',
        runner,
        workingDirectory,
        timeoutSeconds,
        requiredSecrets,
        environment,
        policyGrants,
        targets,
        description,
        warnings,
    };
}

export function loadExecutionProfilesForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): ExecutionProfileMetadata[] {
    const executionDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, EXECUTION_DIR_NAME);
    if (!fs.existsSync(executionDir) || !fs.statSync(executionDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(executionDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(executionDir, entry.name);
            return parseExecutionProfileContent(
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

export const executionProfileConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    EXECUTION_DIR_NAME,
    EXECUTION_PROFILE_SCHEMA_VERSION,
};
