/**
 * Canonical MetaFlow memory scope parser/loader.
 *
 * Memory scopes describe retention and sharing boundaries for agent context.
 * They do not create persistent harness memory or grant memory access directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    MemoryScopeMetadata,
    MemoryScopeStorage,
    MemoryScopeType,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const MEMORY_DIR_NAME = 'memory';
const MEMORY_SCOPE_SCHEMA_VERSION = 'metaflow.memoryScope/v1';
const MEMORY_SCOPE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'scopeType',
    'storage',
    'retention',
    'sharing',
    'readPolicy',
    'writePolicy',
    'policyGrants',
    'targets',
    'description',
]);
const SCOPE_TYPE_VALUES = new Set<MemoryScopeType>([
    'repository',
    'user',
    'organization',
    'task',
    'decisionHistory',
]);
const STORAGE_VALUES = new Set<MemoryScopeStorage>([
    'ephemeral',
    'session',
    'persistent',
    'external',
]);

type MemoryScopeFields = {
    schemaVersion?: unknown;
    id?: unknown;
    scopeType?: unknown;
    storage?: unknown;
    retention?: unknown;
    sharing?: unknown;
    readPolicy?: unknown;
    writePolicy?: unknown;
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
                `Memory scope ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Memory scope ${fieldName} must contain only non-empty strings.`,
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

function emptyMemoryScope(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): MemoryScopeMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        scopeType: 'task',
        storage: 'ephemeral',
        policyGrants: [],
        targets: [],
        warnings,
    };
}

export function parseMemoryScopeContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): MemoryScopeMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyMemoryScope(manifestPath, [
            toWarning(
                'MEMORY_SCOPE_PARSE_ERROR',
                `Memory scope JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyMemoryScope(manifestPath, [
            toWarning(
                'MEMORY_SCOPE_ROOT_INVALID',
                'Memory scope manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as MemoryScopeFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'MEMORY_SCOPE_UNKNOWN_FIELD',
                    `Unknown memory scope field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== MEMORY_SCOPE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_SCHEMA_VERSION_INVALID',
                `Memory scope schemaVersion must be "${MEMORY_SCOPE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_ID_REQUIRED',
                'Memory scope id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!MEMORY_SCOPE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_ID_INVALID',
                'Memory scope id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const scopeTypeText = parseNonEmptyString(fields.scopeType);
    const scopeType = SCOPE_TYPE_VALUES.has(scopeTypeText as MemoryScopeType)
        ? (scopeTypeText as MemoryScopeType)
        : undefined;
    if (!scopeTypeText) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_TYPE_REQUIRED',
                'Memory scope scopeType is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!scopeType) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_TYPE_INVALID',
                'Memory scope scopeType must be one of repository, user, organization, task, or decisionHistory.',
                manifestPath,
                'error',
            ),
        );
    }

    const storageText = parseNonEmptyString(fields.storage);
    const storage = STORAGE_VALUES.has(storageText as MemoryScopeStorage)
        ? (storageText as MemoryScopeStorage)
        : undefined;
    if (!storageText) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_STORAGE_REQUIRED',
                'Memory scope storage is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!storage) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_STORAGE_INVALID',
                'Memory scope storage must be one of ephemeral, session, persistent, or external.',
                manifestPath,
                'error',
            ),
        );
    }

    const retention = parseNonEmptyString(fields.retention);
    if (fields.retention !== undefined && !retention) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_RETENTION_INVALID',
                'Memory scope retention must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const sharing = parseNonEmptyString(fields.sharing);
    if (fields.sharing !== undefined && !sharing) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_SHARING_INVALID',
                'Memory scope sharing must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const readPolicy = parseNonEmptyString(fields.readPolicy);
    if (fields.readPolicy !== undefined && !readPolicy) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_READ_POLICY_INVALID',
                'Memory scope readPolicy must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const writePolicy = parseNonEmptyString(fields.writePolicy);
    if (fields.writePolicy !== undefined && !writePolicy) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_WRITE_POLICY_INVALID',
                'Memory scope writePolicy must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'MEMORY_SCOPE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    if (policyGrants.length === 0) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_POLICY_GRANTS_REQUIRED',
                'Memory scope policyGrants must name at least one policy grant.',
                manifestPath,
                'error',
            ),
        );
    }
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'MEMORY_SCOPE_POLICY_GRANT_UNKNOWN',
                    `Memory scope references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const targets = parseStringArray(
        fields.targets,
        'targets',
        'MEMORY_SCOPE_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'MEMORY_SCOPE_DESCRIPTION_INVALID',
                'Memory scope description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        scopeType: scopeType ?? 'task',
        storage: storage ?? 'ephemeral',
        retention,
        sharing,
        readPolicy,
        writePolicy,
        policyGrants,
        targets,
        description,
        warnings,
    };
}

export function loadMemoryScopesForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): MemoryScopeMetadata[] {
    const memoryDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, MEMORY_DIR_NAME);
    if (!fs.existsSync(memoryDir) || !fs.statSync(memoryDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(memoryDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(memoryDir, entry.name);
            return parseMemoryScopeContent(
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

export const memoryScopeConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    MEMORY_DIR_NAME,
    MEMORY_SCOPE_SCHEMA_VERSION,
};
