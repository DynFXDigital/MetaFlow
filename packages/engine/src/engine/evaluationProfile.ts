/**
 * Canonical MetaFlow evaluation profile parser/loader.
 *
 * Evaluation profiles describe checks and evidence expectations for a capability.
 * They do not execute test gates or configure harness reviewer agents directly.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    EvaluationEvidenceKind,
    EvaluationProfileMetadata,
    EvaluationType,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const EVALUATION_DIR_NAME = 'evaluation';
const EVALUATION_PROFILE_SCHEMA_VERSION = 'metaflow.evaluationProfile/v1';
const EVALUATION_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'evaluationType',
    'command',
    'args',
    'successCriteria',
    'artifacts',
    'evidenceKind',
    'harness',
    'adapterVersion',
    'scenario',
    'validationCommand',
    'evidence',
    'limitations',
    'policyGrants',
    'targets',
    'description',
]);
const EVALUATION_TYPE_VALUES = new Set<EvaluationType>([
    'build',
    'test',
    'lint',
    'semantic',
    'benchmark',
    'regressionGate',
    'reviewerAgent',
]);
const EVALUATION_EVIDENCE_KIND_VALUES = new Set<EvaluationEvidenceKind>([
    'staticProjection',
    'harnessRuntime',
]);

type EvaluationProfileFields = {
    schemaVersion?: unknown;
    id?: unknown;
    evaluationType?: unknown;
    command?: unknown;
    args?: unknown;
    successCriteria?: unknown;
    artifacts?: unknown;
    evidenceKind?: unknown;
    harness?: unknown;
    adapterVersion?: unknown;
    scenario?: unknown;
    validationCommand?: unknown;
    evidence?: unknown;
    limitations?: unknown;
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
                `Evaluation profile ${fieldName} must be an array of non-empty strings when present.`,
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
                    `Evaluation profile ${fieldName} must contain only non-empty strings.`,
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

function emptyEvaluationProfile(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): EvaluationProfileMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        evaluationType: 'test',
        args: [],
        successCriteria: '',
        artifacts: [],
        evidence: [],
        limitations: [],
        policyGrants: [],
        targets: [],
        warnings,
    };
}

export function parseEvaluationProfileContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): EvaluationProfileMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyEvaluationProfile(manifestPath, [
            toWarning(
                'EVALUATION_PROFILE_PARSE_ERROR',
                `Evaluation profile JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyEvaluationProfile(manifestPath, [
            toWarning(
                'EVALUATION_PROFILE_ROOT_INVALID',
                'Evaluation profile manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as EvaluationProfileFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'EVALUATION_PROFILE_UNKNOWN_FIELD',
                    `Unknown evaluation profile field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== EVALUATION_PROFILE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_SCHEMA_VERSION_INVALID',
                `Evaluation profile schemaVersion must be "${EVALUATION_PROFILE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_ID_REQUIRED',
                'Evaluation profile id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!EVALUATION_PROFILE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_ID_INVALID',
                'Evaluation profile id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const evaluationTypeText = parseNonEmptyString(fields.evaluationType);
    const evaluationType = EVALUATION_TYPE_VALUES.has(evaluationTypeText as EvaluationType)
        ? (evaluationTypeText as EvaluationType)
        : undefined;
    if (!evaluationTypeText) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_TYPE_REQUIRED',
                'Evaluation profile evaluationType is required.',
                manifestPath,
                'error',
            ),
        );
    } else if (!evaluationType) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_TYPE_INVALID',
                'Evaluation profile evaluationType must be one of build, test, lint, semantic, benchmark, regressionGate, or reviewerAgent.',
                manifestPath,
                'error',
            ),
        );
    }

    const command = parseNonEmptyString(fields.command);
    if (fields.command !== undefined && !command) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_COMMAND_INVALID',
                'Evaluation profile command must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const args = parseStringArray(
        fields.args,
        'args',
        'EVALUATION_PROFILE_ARGS_INVALID',
        manifestPath,
        warnings,
    );

    const successCriteria = parseNonEmptyString(fields.successCriteria);
    if (!successCriteria) {
        warnings.push(
            toWarning(
                fields.successCriteria === undefined
                    ? 'EVALUATION_PROFILE_SUCCESS_CRITERIA_REQUIRED'
                    : 'EVALUATION_PROFILE_SUCCESS_CRITERIA_INVALID',
                fields.successCriteria === undefined
                    ? 'Evaluation profile successCriteria is required.'
                    : 'Evaluation profile successCriteria must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const artifacts = parseStringArray(
        fields.artifacts,
        'artifacts',
        'EVALUATION_PROFILE_ARTIFACTS_INVALID',
        manifestPath,
        warnings,
    );
    const evidenceKindText = parseNonEmptyString(fields.evidenceKind);
    const evidenceKind = EVALUATION_EVIDENCE_KIND_VALUES.has(
        evidenceKindText as EvaluationEvidenceKind,
    )
        ? (evidenceKindText as EvaluationEvidenceKind)
        : undefined;
    if (fields.evidenceKind !== undefined && !evidenceKind) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_EVIDENCE_KIND_INVALID',
                'Evaluation profile evidenceKind must be staticProjection or harnessRuntime when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const harness = parseNonEmptyString(fields.harness);
    if (fields.harness !== undefined && !harness) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_HARNESS_INVALID',
                'Evaluation profile harness must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const adapterVersion = parseNonEmptyString(fields.adapterVersion);
    if (fields.adapterVersion !== undefined && !adapterVersion) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_ADAPTER_VERSION_INVALID',
                'Evaluation profile adapterVersion must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const scenario = parseNonEmptyString(fields.scenario);
    if (fields.scenario !== undefined && !scenario) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_SCENARIO_INVALID',
                'Evaluation profile scenario must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const validationCommand = parseNonEmptyString(fields.validationCommand);
    if (fields.validationCommand !== undefined && !validationCommand) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_VALIDATION_COMMAND_INVALID',
                'Evaluation profile validationCommand must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }
    const evidence = parseStringArray(
        fields.evidence,
        'evidence',
        'EVALUATION_PROFILE_EVIDENCE_INVALID',
        manifestPath,
        warnings,
    );
    const limitations = parseStringArray(
        fields.limitations,
        'limitations',
        'EVALUATION_PROFILE_LIMITATIONS_INVALID',
        manifestPath,
        warnings,
    );
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'EVALUATION_PROFILE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'EVALUATION_PROFILE_POLICY_GRANT_UNKNOWN',
                    `Evaluation profile references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const targets = parseStringArray(
        fields.targets,
        'targets',
        'EVALUATION_PROFILE_TARGETS_INVALID',
        manifestPath,
        warnings,
    );
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'EVALUATION_PROFILE_DESCRIPTION_INVALID',
                'Evaluation profile description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        evaluationType: evaluationType ?? 'test',
        command,
        args,
        successCriteria: successCriteria ?? '',
        artifacts,
        evidenceKind,
        harness,
        adapterVersion,
        scenario,
        validationCommand,
        evidence,
        limitations,
        policyGrants,
        targets,
        description,
        warnings,
    };
}

export function loadEvaluationProfilesForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
): EvaluationProfileMetadata[] {
    const evaluationDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, EVALUATION_DIR_NAME);
    if (!fs.existsSync(evaluationDir) || !fs.statSync(evaluationDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(evaluationDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(evaluationDir, entry.name);
            return parseEvaluationProfileContent(
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

export const evaluationProfileConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    EVALUATION_DIR_NAME,
    EVALUATION_PROFILE_SCHEMA_VERSION,
};
