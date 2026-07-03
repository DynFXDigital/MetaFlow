/**
 * Canonical MetaFlow skill manifest parser/loader.
 *
 * Skill manifests describe Markdown-first reusable skills. The SKILL.md
 * entrypoint remains the projected target content for current adapters.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    SkillMetadata,
    SkillRisk,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const SKILLS_DIR_NAME = 'skills';
const SKILL_SCHEMA_VERSION = 'metaflow.skill/v1';
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SUPPORTED_ENTRYPOINT = 'SKILL.md';
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'name',
    'entrypoint',
    'appliesTo',
    'risk',
    'targets',
    'description',
]);
const SKILL_RISKS = new Set<SkillRisk>(['standard', 'governed', 'experimental']);

type SkillFields = {
    schemaVersion?: unknown;
    id?: unknown;
    name?: unknown;
    entrypoint?: unknown;
    appliesTo?: unknown;
    risk?: unknown;
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
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                'SKILL_FIELD_INVALID',
                `Skill ${fieldName} must be an array of non-empty strings when present.`,
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
                    'SKILL_FIELD_INVALID',
                    `Skill ${fieldName} must contain only non-empty strings.`,
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

function emptySkill(
    manifestPath: string | undefined,
    skillDirectory: string,
    warnings: CapabilityWarning[],
): SkillMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        skillDirectory,
        entrypoint: SUPPORTED_ENTRYPOINT,
        appliesTo: [],
        targets: [],
        warnings,
    };
}

function normalizeEntrypoint(entrypoint: string): string {
    return entrypoint.replace(/\\/g, '/');
}

function isSafeRelativeEntrypoint(entrypoint: string): boolean {
    const normalized = normalizeEntrypoint(entrypoint);
    return (
        normalized.length > 0 &&
        !path.isAbsolute(normalized) &&
        normalized !== '..' &&
        !normalized.startsWith('../') &&
        !normalized.includes('/../')
    );
}

export function parseSkillManifestContent(
    rawText: string,
    manifestPath?: string,
    skillDirectory = path.dirname(manifestPath ?? ''),
    expectedDirectoryId?: string,
): SkillMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptySkill(manifestPath, skillDirectory, [
            toWarning(
                'SKILL_PARSE_ERROR',
                `Skill manifest JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptySkill(manifestPath, skillDirectory, [
            toWarning(
                'SKILL_ROOT_INVALID',
                'Skill manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as SkillFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'SKILL_UNKNOWN_FIELD',
                    `Unknown skill field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== SKILL_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'SKILL_SCHEMA_VERSION_INVALID',
                `Skill schemaVersion must be "${SKILL_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'SKILL_ID_REQUIRED',
                'Skill id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!SKILL_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'SKILL_ID_INVALID',
                'Skill id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    } else if (expectedDirectoryId && id !== expectedDirectoryId) {
        warnings.push(
            toWarning(
                'SKILL_ID_PATH_MISMATCH',
                `Skill id "${id}" does not match containing directory "${expectedDirectoryId}"; current projections use the directory id for target paths.`,
                manifestPath,
            ),
        );
    }

    const name = parseNonEmptyString(fields.name);
    if (fields.name !== undefined && !name) {
        warnings.push(
            toWarning(
                'SKILL_NAME_INVALID',
                'Skill name must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const rawEntrypoint = parseNonEmptyString(fields.entrypoint) ?? SUPPORTED_ENTRYPOINT;
    const entrypoint = normalizeEntrypoint(rawEntrypoint);
    if (fields.entrypoint !== undefined && !parseNonEmptyString(fields.entrypoint)) {
        warnings.push(
            toWarning(
                'SKILL_ENTRYPOINT_INVALID',
                'Skill entrypoint must be a non-empty relative path when present.',
                manifestPath,
                'error',
            ),
        );
    } else if (!isSafeRelativeEntrypoint(entrypoint)) {
        warnings.push(
            toWarning(
                'SKILL_ENTRYPOINT_INVALID',
                'Skill entrypoint must stay within the skill directory.',
                manifestPath,
                'error',
            ),
        );
    } else if (entrypoint !== SUPPORTED_ENTRYPOINT) {
        warnings.push(
            toWarning(
                'SKILL_ENTRYPOINT_UNSUPPORTED',
                `Skill entrypoint "${entrypoint}" is parsed but current Codex and GitHub Copilot projections use "${SUPPORTED_ENTRYPOINT}".`,
                manifestPath,
            ),
        );
    }

    const entrypointPath = path.join(skillDirectory, entrypoint);
    try {
        if (!fs.existsSync(entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
            warnings.push(
                toWarning(
                    'SKILL_ENTRYPOINT_MISSING',
                    `Skill entrypoint "${entrypoint}" does not exist beside skill.json.`,
                    manifestPath,
                    'warning',
                ),
            );
        }
    } catch {
        warnings.push(
            toWarning(
                'SKILL_ENTRYPOINT_MISSING',
                `Skill entrypoint "${entrypoint}" could not be inspected beside skill.json.`,
                manifestPath,
                'warning',
            ),
        );
    }

    const risk = parseNonEmptyString(fields.risk);
    if (fields.risk !== undefined && (!risk || !SKILL_RISKS.has(risk as SkillRisk))) {
        warnings.push(
            toWarning(
                'SKILL_RISK_INVALID',
                'Skill risk must be standard, governed, or experimental when present.',
                manifestPath,
                'error',
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'SKILL_DESCRIPTION_INVALID',
                'Skill description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        skillDirectory,
        ...(name ? { name } : {}),
        entrypoint,
        appliesTo: parseStringArray(fields.appliesTo, 'appliesTo', manifestPath, warnings),
        ...(risk && SKILL_RISKS.has(risk as SkillRisk) ? { risk: risk as SkillRisk } : {}),
        targets: parseStringArray(fields.targets, 'targets', manifestPath, warnings),
        ...(description ? { description } : {}),
        warnings,
    };
}

export function loadSkillsForLayer(layerPath: string): SkillMetadata[] {
    const skillsDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, SKILLS_DIR_NAME);
    if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            const skillDirectory = path.join(skillsDir, entry.name);
            const manifestPath = path.join(skillDirectory, 'skill.json');
            if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
                return [];
            }
            return [
                parseSkillManifestContent(
                    fs.readFileSync(manifestPath, 'utf-8'),
                    manifestPath,
                    skillDirectory,
                    entry.name,
                ),
            ];
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

export const skillManifestConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    SKILLS_DIR_NAME,
    SKILL_SCHEMA_VERSION,
    SUPPORTED_ENTRYPOINT,
};
