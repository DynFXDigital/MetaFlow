/**
 * Canonical MetaFlow runtime evidence parser/loader.
 *
 * Runtime evidence records attach reviewable proof or waivers to target-harness
 * behavior. They do not create runtime state, grant authority, or execute checks.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    RuntimeEvidenceArtifactMetadata,
    RuntimeEvidenceMetadata,
    RuntimeEvidenceStatus,
    TargetCapabilityConcept,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const RUNTIME_EVIDENCE_DIR_NAME = 'runtime-evidence';
const RUNTIME_EVIDENCE_SCHEMA_VERSION = 'metaflow.runtimeEvidence/v1';
const RUNTIME_EVIDENCE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const RUNTIME_EVIDENCE_STATUSES = new Set<RuntimeEvidenceStatus>([
    'passed',
    'partial',
    'failed',
    'not-run',
    'waived',
]);
const RUNTIME_EVIDENCE_ARTIFACT_KINDS = new Set([
    'log',
    'report',
    'screenshot',
    'trace',
    'recording',
    'artifact',
    'url',
    'run',
    'other',
]);
const LOCAL_EVIDENCE_ARTIFACT_KINDS = new Set([
    'log',
    'report',
    'screenshot',
    'trace',
    'recording',
    'artifact',
]);
const TARGET_CAPABILITY_CONCEPTS = new Set<TargetCapabilityConcept>([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'projectConfig',
    'commandRules',
    'worktreeInclude',
    'mcpServers',
    'tools',
    'hooks',
    'packageManifests',
    'pluginRuntime',
    'agentRuntime',
    'automationRuntime',
    'authenticationRuntime',
    'permissionRuntime',
    'enterprisePolicyRuntime',
    'policyGrants',
    'executionSurfaces',
    'memoryScopes',
    'chronicleRuntime',
    'appshotsRuntime',
    'recordReplayRuntime',
    'importRuntime',
    'modelProviderRuntime',
    'nonInteractiveRuntime',
    'sdkRuntime',
    'appServerRuntime',
    'ideExtensionRuntime',
    'windowsPlatformRuntime',
    'linuxPlatformRuntime',
    'macosPlatformRuntime',
    'localEnvironmentRuntime',
    'cloudEnvironmentRuntime',
    'appConnectorRuntime',
    'localCloudHandoff',
    'issuePrOperation',
    'reviewRuntime',
    'remoteConnectionRuntime',
    'remoteMcpRuntime',
    'oauthMcpRuntime',
    'sideEffectMcpRuntime',
    'memoryRuntime',
    'browserRuntime',
    'chromeRuntime',
    'computerUseRuntime',
    'sitesRuntime',
    'evaluationSupport',
    'evaluationRuntime',
]);
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'target',
    'concepts',
    'harness',
    'adapterVersion',
    'scenario',
    'status',
    'command',
    'evidence',
    'evidenceArtifacts',
    'limitations',
    'policyGrants',
    'description',
]);

type RuntimeEvidenceFields = {
    schemaVersion?: unknown;
    id?: unknown;
    target?: unknown;
    concepts?: unknown;
    harness?: unknown;
    adapterVersion?: unknown;
    scenario?: unknown;
    status?: unknown;
    command?: unknown;
    evidence?: unknown;
    evidenceArtifacts?: unknown;
    limitations?: unknown;
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
                `Runtime evidence ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Runtime evidence ${fieldName} must contain only non-empty strings.`,
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

function parseEvidenceArtifacts(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): RuntimeEvidenceArtifactMetadata[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_ARTIFACT_INVALID',
                'Runtime evidence evidenceArtifacts must be an array of artifact objects when present.',
                manifestPath,
                'error',
            ),
        );
        return [];
    }

    const artifacts: RuntimeEvidenceArtifactMetadata[] = [];
    for (const artifact of value) {
        if (!isObjectRecord(artifact)) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_ARTIFACT_INVALID',
                    'Runtime evidence evidenceArtifacts entries must be objects.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const kind = parseNonEmptyString(artifact.kind);
        const ref = parseNonEmptyString(artifact.ref);
        const description = parseNonEmptyString(artifact.description);
        if (!kind || !RUNTIME_EVIDENCE_ARTIFACT_KINDS.has(kind) || !ref) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_ARTIFACT_INVALID',
                    'Runtime evidence evidenceArtifacts entries require a supported kind and non-empty ref.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        if (artifact.description !== undefined && !description) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_ARTIFACT_INVALID',
                    'Runtime evidence evidenceArtifacts description must be a non-empty string when present.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        artifacts.push({
            kind,
            ref,
            ...(description ? { description } : {}),
        });
    }
    return artifacts;
}

function isExternalArtifactRef(ref: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(ref);
}

function inferLayerRootFromRuntimeEvidenceManifest(manifestPath: string | undefined): string | undefined {
    if (!manifestPath) {
        return undefined;
    }
    const evidenceDir = path.dirname(manifestPath);
    if (path.basename(evidenceDir) !== RUNTIME_EVIDENCE_DIR_NAME) {
        return undefined;
    }
    const metaflowDir = path.dirname(evidenceDir);
    if (path.basename(metaflowDir) !== CANONICAL_METAFLOW_DIR_NAME) {
        return undefined;
    }
    return path.dirname(metaflowDir);
}

function warnOnMissingLocalEvidenceArtifacts(
    artifacts: RuntimeEvidenceArtifactMetadata[],
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): void {
    const layerRoot = inferLayerRootFromRuntimeEvidenceManifest(manifestPath);
    if (!layerRoot) {
        return;
    }

    for (const artifact of artifacts) {
        if (!LOCAL_EVIDENCE_ARTIFACT_KINDS.has(artifact.kind)) {
            continue;
        }
        if (isExternalArtifactRef(artifact.ref)) {
            continue;
        }
        const artifactPath = path.isAbsolute(artifact.ref)
            ? artifact.ref
            : path.resolve(layerRoot, artifact.ref);
        if (!fs.existsSync(artifactPath)) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_ARTIFACT_MISSING',
                    `Runtime evidence artifact "${artifact.ref}" does not exist relative to the metadata layer.`,
                    manifestPath,
                ),
            );
        }
    }
}

function emptyRuntimeEvidence(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): RuntimeEvidenceMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        target: '',
        concepts: [],
        harness: '',
        adapterVersion: '',
        scenario: '',
        status: 'not-run',
        evidence: [],
        evidenceArtifacts: [],
        limitations: [],
        policyGrants: [],
        warnings,
    };
}

export function parseRuntimeEvidenceContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): RuntimeEvidenceMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyRuntimeEvidence(manifestPath, [
            toWarning(
                'RUNTIME_EVIDENCE_PARSE_ERROR',
                `Runtime evidence JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyRuntimeEvidence(manifestPath, [
            toWarning(
                'RUNTIME_EVIDENCE_ROOT_INVALID',
                'Runtime evidence manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as RuntimeEvidenceFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_UNKNOWN_FIELD',
                    `Unknown runtime evidence field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== RUNTIME_EVIDENCE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_SCHEMA_VERSION_INVALID',
                `Runtime evidence schemaVersion must be "${RUNTIME_EVIDENCE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_ID_REQUIRED',
                'Runtime evidence id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!RUNTIME_EVIDENCE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_ID_INVALID',
                'Runtime evidence id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const target = parseNonEmptyString(fields.target);
    if (!target) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_TARGET_REQUIRED',
                'Runtime evidence target is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const concepts = parseStringArray(
        fields.concepts,
        'concepts',
        'RUNTIME_EVIDENCE_CONCEPT_INVALID',
        manifestPath,
        warnings,
    ).filter((concept): concept is TargetCapabilityConcept => {
        if (TARGET_CAPABILITY_CONCEPTS.has(concept as TargetCapabilityConcept)) {
            return true;
        }
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_CONCEPT_UNKNOWN',
                `Runtime evidence concept "${concept}" is not a known target capability concept.`,
                manifestPath,
                'error',
            ),
        );
        return false;
    });
    if (fields.concepts === undefined || concepts.length === 0) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_CONCEPT_REQUIRED',
                'Runtime evidence concepts must include at least one known target capability concept.',
                manifestPath,
                'error',
            ),
        );
    }

    const harness = parseNonEmptyString(fields.harness);
    const adapterVersion = parseNonEmptyString(fields.adapterVersion);
    const scenario = parseNonEmptyString(fields.scenario);
    const statusText = parseNonEmptyString(fields.status);
    const status = RUNTIME_EVIDENCE_STATUSES.has(statusText as RuntimeEvidenceStatus)
        ? (statusText as RuntimeEvidenceStatus)
        : undefined;
    if (!harness || !adapterVersion || !scenario || !status) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_REQUIRED_FIELD_INVALID',
                'Runtime evidence requires non-empty harness, adapterVersion, scenario, and status fields; status must be passed, partial, failed, not-run, or waived.',
                manifestPath,
                'error',
            ),
        );
    }

    const command = parseNonEmptyString(fields.command);
    if (fields.command !== undefined && !command) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_COMMAND_INVALID',
                'Runtime evidence command must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const evidence = parseStringArray(
        fields.evidence,
        'evidence',
        'RUNTIME_EVIDENCE_EVIDENCE_INVALID',
        manifestPath,
        warnings,
    );
    const evidenceArtifacts = parseEvidenceArtifacts(fields.evidenceArtifacts, manifestPath, warnings);
    warnOnMissingLocalEvidenceArtifacts(evidenceArtifacts, manifestPath, warnings);
    const limitations = parseStringArray(
        fields.limitations,
        'limitations',
        'RUNTIME_EVIDENCE_LIMITATIONS_INVALID',
        manifestPath,
        warnings,
    );
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'RUNTIME_EVIDENCE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'RUNTIME_EVIDENCE_POLICY_GRANT_UNKNOWN',
                    `Runtime evidence references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    if (
        (status === 'passed' || status === 'partial') &&
        evidence.length === 0 &&
        evidenceArtifacts.length === 0
    ) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_ARTIFACT_RECOMMENDED',
                `Runtime evidence status "${status}" should include evidence references or structured evidenceArtifacts for review.`,
                manifestPath,
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'RUNTIME_EVIDENCE_DESCRIPTION_INVALID',
                'Runtime evidence description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        target: target ?? '',
        concepts,
        harness: harness ?? '',
        adapterVersion: adapterVersion ?? '',
        scenario: scenario ?? '',
        status: status ?? 'not-run',
        ...(command ? { command } : {}),
        evidence,
        evidenceArtifacts,
        limitations,
        policyGrants,
        ...(description ? { description } : {}),
        warnings,
    };
}

export function loadRuntimeEvidenceForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): RuntimeEvidenceMetadata[] {
    const evidenceDir = path.join(
        layerPath,
        CANONICAL_METAFLOW_DIR_NAME,
        RUNTIME_EVIDENCE_DIR_NAME,
    );
    if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(evidenceDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(evidenceDir, entry.name);
            return parseRuntimeEvidenceContent(
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

export const runtimeEvidenceConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    RUNTIME_EVIDENCE_DIR_NAME,
    RUNTIME_EVIDENCE_SCHEMA_VERSION,
};
