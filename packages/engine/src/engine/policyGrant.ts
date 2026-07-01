/**
 * Canonical MetaFlow policy grant parser/loader.
 *
 * Policy grants describe authority requested by a capability. They are metadata for
 * adapter reporting and evaluation; they do not grant harness permissions directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    PolicyGrantApproval,
    PolicyGrantAuthorityCategory,
    PolicyGrantMetadata,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const POLICY_GRANTS_DIR_NAME = 'policies';
const POLICY_GRANT_SCHEMA_VERSION = 'metaflow.policyGrant/v1';
const POLICY_GRANT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'authority',
    'approval',
    'scope',
    'audit',
    'description',
]);
const APPROVAL_VALUES = new Set<PolicyGrantApproval>(['auto', 'on-request', 'manual', 'forbidden']);

type PolicyGrantFields = {
    schemaVersion?: unknown;
    id?: unknown;
    authority?: unknown;
    approval?: unknown;
    scope?: unknown;
    audit?: unknown;
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

function deriveAuthorityCategory(authority: string): PolicyGrantAuthorityCategory {
    if (authority.startsWith('shell.')) {
        return 'shell';
    }
    if (authority.startsWith('browser.')) {
        return 'browser';
    }
    if (authority.startsWith('mcp.')) {
        return 'mcp';
    }
    if (authority.startsWith('github.')) {
        return 'github';
    }
    if (authority.startsWith('cloudTask.') || authority.startsWith('cloud-task.')) {
        return 'cloudTask';
    }
    if (authority.startsWith('memory.')) {
        return 'memory';
    }
    if (authority.startsWith('notification.')) {
        return 'notification';
    }
    return 'other';
}

function emptyPolicyGrant(manifestPath: string | undefined, warnings: CapabilityWarning[]) {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        authority: '',
        category: 'other' as const,
        approval: 'manual' as const,
        audit: false,
        warnings,
    };
}

export function parsePolicyGrantContent(
    rawText: string,
    manifestPath?: string,
): PolicyGrantMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyPolicyGrant(manifestPath, [
            toWarning(
                'POLICY_GRANT_PARSE_ERROR',
                `Policy grant JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    if (!isObjectRecord(data)) {
        return emptyPolicyGrant(manifestPath, [
            toWarning(
                'POLICY_GRANT_ROOT_INVALID',
                'Policy grant manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const fields = data as PolicyGrantFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'POLICY_GRANT_UNKNOWN_FIELD',
                    `Unknown policy grant field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== POLICY_GRANT_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_SCHEMA_VERSION_INVALID',
                `Policy grant schemaVersion must be "${POLICY_GRANT_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_ID_REQUIRED',
                'Policy grant id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!POLICY_GRANT_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_ID_INVALID',
                'Policy grant id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const authority = parseNonEmptyString(fields.authority);
    if (!authority) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_AUTHORITY_REQUIRED',
                'Policy grant authority is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const approvalText = parseNonEmptyString(fields.approval);
    const approval = APPROVAL_VALUES.has(approvalText as PolicyGrantApproval)
        ? (approvalText as PolicyGrantApproval)
        : undefined;
    if (!approvalText) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_APPROVAL_REQUIRED',
                'Policy grant approval is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!approval) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_APPROVAL_INVALID',
                'Policy grant approval must be one of auto, on-request, manual, or forbidden.',
                manifestPath,
                'error',
            ),
        );
    }

    let scope: Record<string, unknown> | undefined;
    if (fields.scope !== undefined) {
        if (isObjectRecord(fields.scope)) {
            scope = fields.scope;
        } else {
            warnings.push(
                toWarning(
                    'POLICY_GRANT_SCOPE_INVALID',
                    'Policy grant scope must be a JSON object when present.',
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const audit = fields.audit === undefined ? false : fields.audit;
    if (typeof audit !== 'boolean') {
        warnings.push(
            toWarning(
                'POLICY_GRANT_AUDIT_INVALID',
                'Policy grant audit must be a boolean when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'POLICY_GRANT_DESCRIPTION_INVALID',
                'Policy grant description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const normalizedAuthority = authority ?? '';
    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        authority: normalizedAuthority,
        category: deriveAuthorityCategory(normalizedAuthority),
        approval: approval ?? 'manual',
        scope,
        audit: typeof audit === 'boolean' ? audit : false,
        description,
        warnings,
    };
}

export function loadPolicyGrantsForLayer(layerPath: string): PolicyGrantMetadata[] {
    const policyDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, POLICY_GRANTS_DIR_NAME);
    if (!fs.existsSync(policyDir) || !fs.statSync(policyDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(policyDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(policyDir, entry.name);
            return parsePolicyGrantContent(fs.readFileSync(manifestPath, 'utf-8'), manifestPath);
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

export const policyGrantConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    POLICY_GRANTS_DIR_NAME,
    POLICY_GRANT_SCHEMA_VERSION,
};
