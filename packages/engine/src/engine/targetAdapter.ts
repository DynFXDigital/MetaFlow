/**
 * Canonical MetaFlow target adapter parser/loader.
 *
 * Target adapter manifests describe projection preferences and validation posture.
 * They do not grant harness authority or configure target runtimes directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTargetCapabilityMatrix } from './targetCapabilityMatrix';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    ProjectionTarget,
    TargetAdapterMaterializationMode,
    TargetAdapterMetadata,
    TargetAdapterValidationStatus,
    TargetCapabilityConcept,
    TargetCapabilitySupportStatus,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const TARGETS_DIR_NAME = 'targets';
const TARGET_ADAPTER_SCHEMA_VERSION = 'metaflow.targetAdapter/v1';
const TARGET_ADAPTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'target',
    'enabled',
    'adapterVersion',
    'materializationMode',
    'concepts',
    'requiredPolicyGrants',
    'validationStatus',
    'validationEvidence',
    'notes',
    'description',
]);
const TARGET_VALUES = new Set<ProjectionTarget>(['codex', 'github-copilot', 'generic']);
const MATERIALIZATION_MODE_VALUES = new Set<TargetAdapterMaterializationMode>([
    'managed',
    'candidate',
    'report-only',
    'disabled',
]);
const VALIDATION_STATUS_VALUES = new Set<TargetAdapterValidationStatus>([
    'unverified',
    'staticVerified',
    'runtimeVerified',
    'manualWaived',
]);
const CONCEPT_VALUES = new Set<TargetCapabilityConcept>([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'projectConfig',
    'commandRules',
    'mcpServers',
    'tools',
    'hooks',
    'packageManifests',
    'policyGrants',
    'executionSurfaces',
    'memoryScopes',
    'localCloudHandoff',
    'issuePrOperation',
    'remoteMcpRuntime',
    'oauthMcpRuntime',
    'sideEffectMcpRuntime',
    'memoryRuntime',
    'browserRuntime',
    'chromeRuntime',
    'computerUseRuntime',
    'sitesRuntime',
    'evaluationSupport',
]);
const AUTHORITY_SENSITIVE_CONCEPTS = new Set<TargetCapabilityConcept>([
    'agents',
    'projectConfig',
    'commandRules',
    'mcpServers',
    'tools',
    'hooks',
    'executionSurfaces',
    'memoryScopes',
    'localCloudHandoff',
    'issuePrOperation',
    'remoteMcpRuntime',
    'oauthMcpRuntime',
    'sideEffectMcpRuntime',
    'memoryRuntime',
    'browserRuntime',
    'chromeRuntime',
    'computerUseRuntime',
    'sitesRuntime',
    'evaluationSupport',
]);
const CURRENT_ADAPTER_VERSION_BY_TARGET = new Map<ProjectionTarget, string>(
    getTargetCapabilityMatrix().map((entry) => [entry.target, entry.adapterVersion]),
);
const SUPPORT_BY_TARGET_AND_CONCEPT = new Map<string, TargetCapabilitySupportStatus>(
    getTargetCapabilityMatrix().map((entry) => [
        `${entry.target}:${entry.concept}`,
        entry.support,
    ]),
);

type TargetAdapterFields = {
    schemaVersion?: unknown;
    id?: unknown;
    target?: unknown;
    enabled?: unknown;
    adapterVersion?: unknown;
    materializationMode?: unknown;
    concepts?: unknown;
    requiredPolicyGrants?: unknown;
    validationStatus?: unknown;
    validationEvidence?: unknown;
    notes?: unknown;
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
                `Target adapter ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Target adapter ${fieldName} must contain only non-empty strings.`,
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

function parseMaterializationMode(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): TargetAdapterMaterializationMode | undefined {
    const text = parseNonEmptyString(value);
    if (!text || !MATERIALIZATION_MODE_VALUES.has(text as TargetAdapterMaterializationMode)) {
        warnings.push(
            toWarning(
                warningCode,
                `Target adapter ${fieldName} must be one of managed, candidate, report-only, or disabled.`,
                manifestPath,
                'error',
            ),
        );
        return undefined;
    }
    return text as TargetAdapterMaterializationMode;
}

function parseConcepts(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Partial<Record<TargetCapabilityConcept, TargetAdapterMaterializationMode>> {
    if (value === undefined) {
        return {};
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_CONCEPTS_INVALID',
                'Target adapter concepts must be an object mapping canonical concepts to materialization modes.',
                manifestPath,
                'error',
            ),
        );
        return {};
    }

    const result: Partial<Record<TargetCapabilityConcept, TargetAdapterMaterializationMode>> = {};
    for (const [key, rawMode] of Object.entries(value)) {
        if (!CONCEPT_VALUES.has(key as TargetCapabilityConcept)) {
            warnings.push(
                toWarning(
                    'TARGET_ADAPTER_CONCEPT_UNKNOWN',
                    `Unknown target adapter concept "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
            continue;
        }
        const mode = parseMaterializationMode(
            rawMode,
            `concepts.${key}`,
            'TARGET_ADAPTER_CONCEPT_MODE_INVALID',
            manifestPath,
            warnings,
        );
        if (mode) {
            result[key as TargetCapabilityConcept] = mode;
        }
    }
    return result;
}

function managedAuthoritySensitiveConcepts(
    materializationMode: TargetAdapterMaterializationMode,
    concepts: Partial<Record<TargetCapabilityConcept, TargetAdapterMaterializationMode>>,
): TargetCapabilityConcept[] {
    const managedConcepts: TargetCapabilityConcept[] = [];
    for (const concept of AUTHORITY_SENSITIVE_CONCEPTS) {
        const conceptMode = concepts[concept] ?? materializationMode;
        if (conceptMode === 'managed') {
            managedConcepts.push(concept);
        }
    }
    return managedConcepts.sort();
}

function conceptSupportForTarget(
    target: ProjectionTarget | undefined,
    concept: TargetCapabilityConcept,
): TargetCapabilitySupportStatus | undefined {
    if (!target) {
        return undefined;
    }
    return SUPPORT_BY_TARGET_AND_CONCEPT.get(`${target}:${concept}`);
}

function validateConceptSupport(
    target: ProjectionTarget | undefined,
    enabled: boolean,
    materializationMode: TargetAdapterMaterializationMode,
    concepts: Partial<Record<TargetCapabilityConcept, TargetAdapterMaterializationMode>>,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): void {
    if (!target || !enabled) {
        return;
    }
    for (const concept of CONCEPT_VALUES) {
        const conceptMode = concepts[concept] ?? materializationMode;
        if (conceptMode !== 'managed') {
            continue;
        }
        const support = conceptSupportForTarget(target, concept);
        if (support === 'unsupported' || support === 'runtime-only') {
            warnings.push(
                toWarning(
                    'TARGET_ADAPTER_CONCEPT_SUPPORT_UNAVAILABLE',
                    `Target adapter target "${target}" cannot manage concept "${concept}" because the current target capability matrix marks it as ${support}.`,
                    manifestPath,
                ),
            );
        }
    }
}

export function isAuthoritySensitiveTargetAdapterConcept(
    concept: TargetCapabilityConcept | undefined,
): boolean {
    return concept !== undefined && AUTHORITY_SENSITIVE_CONCEPTS.has(concept);
}

export function effectiveTargetAdapterMaterializationMode(
    adapter: TargetAdapterMetadata,
    concept?: TargetCapabilityConcept,
): TargetAdapterMaterializationMode {
    if (!adapter.enabled) {
        return 'disabled';
    }
    const declaredMode = concept
        ? adapter.concepts[concept] ?? adapter.materializationMode
        : adapter.materializationMode;
    if (
        declaredMode === 'managed' &&
        isAuthoritySensitiveTargetAdapterConcept(concept) &&
        adapter.requiredPolicyGrants.length === 0
    ) {
        return 'candidate';
    }
    return declaredMode;
}

function emptyTargetAdapter(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): TargetAdapterMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        target: 'generic',
        enabled: false,
        materializationMode: 'report-only',
        concepts: {},
        requiredPolicyGrants: [],
        validationStatus: 'unverified',
        validationEvidence: [],
        notes: [],
        warnings,
    };
}

export function parseTargetAdapterContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): TargetAdapterMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyTargetAdapter(manifestPath, [
            toWarning(
                'TARGET_ADAPTER_PARSE_ERROR',
                `Target adapter JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyTargetAdapter(manifestPath, [
            toWarning(
                'TARGET_ADAPTER_ROOT_INVALID',
                'Target adapter manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as TargetAdapterFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'TARGET_ADAPTER_UNKNOWN_FIELD',
                    `Unknown target adapter field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== TARGET_ADAPTER_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_SCHEMA_VERSION_INVALID',
                `Target adapter schemaVersion must be "${TARGET_ADAPTER_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_ID_REQUIRED',
                'Target adapter id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!TARGET_ADAPTER_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_ID_INVALID',
                'Target adapter id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const targetText = parseNonEmptyString(fields.target);
    const target = TARGET_VALUES.has(targetText as ProjectionTarget)
        ? (targetText as ProjectionTarget)
        : undefined;
    if (!targetText) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_TARGET_REQUIRED',
                'Target adapter target is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!target) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_TARGET_INVALID',
                'Target adapter target must be one of codex, github-copilot, or generic.',
                manifestPath,
                'error',
            ),
        );
    }

    let enabled = true;
    if (fields.enabled !== undefined) {
        if (typeof fields.enabled !== 'boolean') {
            warnings.push(
                toWarning(
                    'TARGET_ADAPTER_ENABLED_INVALID',
                    'Target adapter enabled must be a boolean when present.',
                    manifestPath,
                    'error',
                ),
            );
        } else {
            enabled = fields.enabled;
        }
    }

    const adapterVersion = parseNonEmptyString(fields.adapterVersion);
    if (
        fields.adapterVersion === undefined &&
        target &&
        CURRENT_ADAPTER_VERSION_BY_TARGET.has(target)
    ) {
        const expectedAdapterVersion = CURRENT_ADAPTER_VERSION_BY_TARGET.get(target);
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_VERSION_RECOMMENDED',
                `Target adapter target "${target}" should declare adapterVersion "${expectedAdapterVersion}" to prove the manifest was reviewed against the current target capability matrix.`,
                manifestPath,
            ),
        );
    } else if (fields.adapterVersion !== undefined && !adapterVersion) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_VERSION_INVALID',
                'Target adapter adapterVersion must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const expectedAdapterVersion = target
        ? CURRENT_ADAPTER_VERSION_BY_TARGET.get(target)
        : undefined;
    if (adapterVersion && expectedAdapterVersion && adapterVersion !== expectedAdapterVersion) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_VERSION_MISMATCH',
                `Target adapter target "${target}" adapterVersion "${adapterVersion}" does not match current target adapterVersion "${expectedAdapterVersion}".`,
                manifestPath,
            ),
        );
    }

    const materializationMode =
        fields.materializationMode === undefined
            ? 'report-only'
            : parseMaterializationMode(
                  fields.materializationMode,
                  'materializationMode',
                  'TARGET_ADAPTER_MATERIALIZATION_MODE_INVALID',
                  manifestPath,
                  warnings,
              );
    const concepts = parseConcepts(fields.concepts, manifestPath, warnings);
    const requiredPolicyGrants = parseStringArray(
        fields.requiredPolicyGrants,
        'requiredPolicyGrants',
        'TARGET_ADAPTER_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of requiredPolicyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'TARGET_ADAPTER_POLICY_GRANT_UNKNOWN',
                    `Target adapter references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }
    const authoritySensitiveManagedConcepts = managedAuthoritySensitiveConcepts(
        materializationMode ?? 'report-only',
        concepts,
    );
    if (
        enabled &&
        requiredPolicyGrants.length === 0 &&
        authoritySensitiveManagedConcepts.length > 0
    ) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_POLICY_GRANTS_RECOMMENDED',
                `Target adapter manages authority-sensitive concepts (${authoritySensitiveManagedConcepts.join(', ')}) but declares no requiredPolicyGrants for policy review.`,
                manifestPath,
            ),
        );
    }
    validateConceptSupport(
        target,
        enabled,
        materializationMode ?? 'report-only',
        concepts,
        manifestPath,
        warnings,
    );

    const validationStatusText = parseNonEmptyString(fields.validationStatus);
    const validationStatus =
        validationStatusText === undefined
            ? 'unverified'
            : VALIDATION_STATUS_VALUES.has(validationStatusText as TargetAdapterValidationStatus)
              ? (validationStatusText as TargetAdapterValidationStatus)
              : undefined;
    if (fields.validationStatus !== undefined && !validationStatus) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_VALIDATION_STATUS_INVALID',
                'Target adapter validationStatus must be one of unverified, staticVerified, runtimeVerified, or manualWaived.',
                manifestPath,
                'error',
            ),
        );
    }

    const validationEvidence = parseStringArray(
        fields.validationEvidence,
        'validationEvidence',
        'TARGET_ADAPTER_VALIDATION_EVIDENCE_INVALID',
        manifestPath,
        warnings,
    );
    if (
        validationEvidence.length === 0 &&
        (validationStatus === 'staticVerified' ||
            validationStatus === 'runtimeVerified' ||
            validationStatus === 'manualWaived')
    ) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_VALIDATION_EVIDENCE_RECOMMENDED',
                `Target adapter validationStatus "${validationStatus}" should include validationEvidence references.`,
                manifestPath,
            ),
        );
    }
    const notes = parseStringArray(
        fields.notes,
        'notes',
        'TARGET_ADAPTER_NOTES_INVALID',
        manifestPath,
        warnings,
    );
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'TARGET_ADAPTER_DESCRIPTION_INVALID',
                'Target adapter description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        target: target ?? 'generic',
        enabled,
        adapterVersion,
        materializationMode: materializationMode ?? 'report-only',
        concepts,
        requiredPolicyGrants,
        validationStatus: validationStatus ?? 'unverified',
        validationEvidence,
        notes,
        description,
        warnings,
    };
}

export function loadTargetAdaptersForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): TargetAdapterMetadata[] {
    const targetsDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, TARGETS_DIR_NAME);
    if (!fs.existsSync(targetsDir) || !fs.statSync(targetsDir).isDirectory()) {
        return [];
    }

    const adapters = fs
        .readdirSync(targetsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(targetsDir, entry.name);
            return parseTargetAdapterContent(
                fs.readFileSync(manifestPath, 'utf-8'),
                manifestPath,
                knownPolicyGrantIds,
            );
        })
        .sort((left, right) => {
            const targetCompare = left.target.localeCompare(right.target, undefined, {
                sensitivity: 'base',
            });
            if (targetCompare !== 0) {
                return targetCompare;
            }
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

    warnOnDuplicateEnabledTargetAdapters(adapters);
    return adapters;
}

export const targetAdapterConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    TARGETS_DIR_NAME,
    TARGET_ADAPTER_SCHEMA_VERSION,
};

function warnOnDuplicateEnabledTargetAdapters(adapters: TargetAdapterMetadata[]): void {
    const enabledByTarget = new Map<ProjectionTarget, TargetAdapterMetadata[]>();
    for (const adapter of adapters) {
        if (!adapter.enabled) {
            continue;
        }
        const group = enabledByTarget.get(adapter.target) ?? [];
        group.push(adapter);
        enabledByTarget.set(adapter.target, group);
    }

    for (const [target, group] of enabledByTarget.entries()) {
        if (group.length <= 1) {
            continue;
        }
        const adapterIds = group.map((adapter) => adapter.id || adapter.manifestPath).join(', ');
        for (const adapter of group) {
            adapter.warnings.push(
                toWarning(
                    'TARGET_ADAPTER_TARGET_DUPLICATE',
                    `Target adapter target "${target}" has multiple enabled declarations: ${adapterIds}. Projection selection uses deterministic adapter ordering, but target policy should be expressed by one enabled adapter per target.`,
                    adapter.manifestPath,
                ),
            );
        }
    }
}
