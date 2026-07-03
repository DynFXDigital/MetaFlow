/**
 * Canonical MetaFlow instruction and prompt metadata parser/loader.
 *
 * Content manifests describe Markdown-first instruction and prompt files.
 * The Markdown document remains the projected target content for adapters.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    ContentMetadata,
    ContentRisk,
    ContentType,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const INSTRUCTIONS_DIR_NAME = 'instructions';
const PROMPTS_DIR_NAME = 'prompts';
const INSTRUCTION_SCHEMA_VERSION = 'metaflow.instruction/v1';
const PROMPT_SCHEMA_VERSION = 'metaflow.prompt/v1';
const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MARKDOWN_ENTRYPOINT_EXTENSION = '.md';
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
const CONTENT_RISKS = new Set<ContentRisk>(['standard', 'governed', 'experimental']);

type ContentFields = {
    schemaVersion?: unknown;
    id?: unknown;
    name?: unknown;
    entrypoint?: unknown;
    appliesTo?: unknown;
    risk?: unknown;
    targets?: unknown;
    description?: unknown;
};

interface ContentKindConfig {
    contentType: ContentType;
    directoryName: string;
    schemaVersion: string;
    label: string;
    warningPrefix: string;
}

const CONTENT_KIND_CONFIGS: Record<ContentType, ContentKindConfig> = {
    instruction: {
        contentType: 'instruction',
        directoryName: INSTRUCTIONS_DIR_NAME,
        schemaVersion: INSTRUCTION_SCHEMA_VERSION,
        label: 'Instruction',
        warningPrefix: 'INSTRUCTION',
    },
    prompt: {
        contentType: 'prompt',
        directoryName: PROMPTS_DIR_NAME,
        schemaVersion: PROMPT_SCHEMA_VERSION,
        label: 'Prompt',
        warningPrefix: 'PROMPT',
    },
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
    config: ContentKindConfig,
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
                `${config.warningPrefix}_FIELD_INVALID`,
                `${config.label} ${fieldName} must be an array of non-empty strings when present.`,
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
                    `${config.warningPrefix}_FIELD_INVALID`,
                    `${config.label} ${fieldName} must contain only non-empty strings.`,
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

function emptyContent(
    config: ContentKindConfig,
    manifestPath: string | undefined,
    contentDirectory: string,
    warnings: CapabilityWarning[],
): ContentMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        contentDirectory,
        contentType: config.contentType,
        entrypoint: '',
        appliesTo: [],
        targets: [],
        warnings,
    };
}

function normalizeEntrypoint(entrypoint: string): string {
    return entrypoint.replace(/\\/g, '/');
}

function isSafeMarkdownEntrypoint(entrypoint: string): boolean {
    const normalized = normalizeEntrypoint(entrypoint);
    return (
        normalized.length > 0 &&
        normalized.endsWith(MARKDOWN_ENTRYPOINT_EXTENSION) &&
        !path.isAbsolute(normalized) &&
        normalized !== '..' &&
        !normalized.startsWith('../') &&
        !normalized.includes('/../')
    );
}

function expectedIdFromEntrypoint(entrypoint: string): string | undefined {
    const normalized = normalizeEntrypoint(entrypoint);
    if (!normalized.endsWith(MARKDOWN_ENTRYPOINT_EXTENSION)) {
        return undefined;
    }
    if (normalized.includes('/')) {
        return undefined;
    }
    return normalized.slice(0, -MARKDOWN_ENTRYPOINT_EXTENSION.length);
}

export function parseContentManifestContent(
    rawText: string,
    contentType: ContentType,
    manifestPath?: string,
    contentDirectory = path.dirname(manifestPath ?? ''),
): ContentMetadata {
    const config = CONTENT_KIND_CONFIGS[contentType];
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyContent(config, manifestPath, contentDirectory, [
            toWarning(
                `${config.warningPrefix}_PARSE_ERROR`,
                `${config.label} manifest JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyContent(config, manifestPath, contentDirectory, [
            toWarning(
                `${config.warningPrefix}_ROOT_INVALID`,
                `${config.label} manifest root must be a JSON object.`,
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as ContentFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    `${config.warningPrefix}_UNKNOWN_FIELD`,
                    `Unknown ${contentType} field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== config.schemaVersion) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_SCHEMA_VERSION_INVALID`,
                `${config.label} schemaVersion must be "${config.schemaVersion}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_ID_REQUIRED`,
                `${config.label} id is required and must be a non-empty string.`,
                manifestPath,
                'error',
            ),
        );
    } else if (!CONTENT_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_ID_INVALID`,
                `${config.label} id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.`,
                manifestPath,
                'error',
            ),
        );
    }

    const name = parseNonEmptyString(fields.name);
    if (fields.name !== undefined && !name) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_NAME_INVALID`,
                `${config.label} name must be a non-empty string when present.`,
                manifestPath,
                'error',
            ),
        );
    }

    const defaultEntrypoint = id ? `${id}.md` : '';
    const rawEntrypoint = parseNonEmptyString(fields.entrypoint) ?? defaultEntrypoint;
    const entrypoint = normalizeEntrypoint(rawEntrypoint);
    if (fields.entrypoint !== undefined && !parseNonEmptyString(fields.entrypoint)) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_ENTRYPOINT_INVALID`,
                `${config.label} entrypoint must be a non-empty relative Markdown path when present.`,
                manifestPath,
                'error',
            ),
        );
    } else if (!isSafeMarkdownEntrypoint(entrypoint)) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_ENTRYPOINT_INVALID`,
                `${config.label} entrypoint must be a Markdown file within the ${config.directoryName} directory.`,
                manifestPath,
                'error',
            ),
        );
    }

    const entrypointId = expectedIdFromEntrypoint(entrypoint);
    if (id && entrypointId && id !== entrypointId) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_ID_ENTRYPOINT_MISMATCH`,
                `${config.label} id "${id}" does not match entrypoint "${entrypoint}"; current projections use the Markdown file name for target paths.`,
                manifestPath,
            ),
        );
    }

    if (entrypoint) {
        const entrypointPath = path.join(contentDirectory, entrypoint);
        try {
            if (!fs.existsSync(entrypointPath) || !fs.statSync(entrypointPath).isFile()) {
                warnings.push(
                    toWarning(
                        `${config.warningPrefix}_ENTRYPOINT_MISSING`,
                        `${config.label} entrypoint "${entrypoint}" does not exist beside the content manifest.`,
                        manifestPath,
                        'warning',
                    ),
                );
            }
        } catch {
            warnings.push(
                toWarning(
                    `${config.warningPrefix}_ENTRYPOINT_MISSING`,
                    `${config.label} entrypoint "${entrypoint}" could not be inspected beside the content manifest.`,
                    manifestPath,
                    'warning',
                ),
            );
        }
    }

    const risk = parseNonEmptyString(fields.risk);
    if (fields.risk !== undefined && (!risk || !CONTENT_RISKS.has(risk as ContentRisk))) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_RISK_INVALID`,
                `${config.label} risk must be standard, governed, or experimental when present.`,
                manifestPath,
                'error',
            ),
        );
    }

    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                `${config.warningPrefix}_DESCRIPTION_INVALID`,
                `${config.label} description must be a non-empty string when present.`,
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        contentDirectory,
        contentType,
        ...(name ? { name } : {}),
        entrypoint,
        appliesTo: parseStringArray(fields.appliesTo, config, 'appliesTo', manifestPath, warnings),
        ...(risk && CONTENT_RISKS.has(risk as ContentRisk) ? { risk: risk as ContentRisk } : {}),
        targets: parseStringArray(fields.targets, config, 'targets', manifestPath, warnings),
        ...(description ? { description } : {}),
        warnings,
    };
}

function loadContentForLayer(layerPath: string, contentType: ContentType): ContentMetadata[] {
    const config = CONTENT_KIND_CONFIGS[contentType];
    const contentDirectory = path.join(
        layerPath,
        CANONICAL_METAFLOW_DIR_NAME,
        config.directoryName,
    );
    if (!fs.existsSync(contentDirectory) || !fs.statSync(contentDirectory).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(contentDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(contentDirectory, entry.name);
            return parseContentManifestContent(
                fs.readFileSync(manifestPath, 'utf-8'),
                contentType,
                manifestPath,
                contentDirectory,
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

export function loadInstructionsForLayer(layerPath: string): ContentMetadata[] {
    return loadContentForLayer(layerPath, 'instruction');
}

export function loadPromptsForLayer(layerPath: string): ContentMetadata[] {
    return loadContentForLayer(layerPath, 'prompt');
}

export const contentManifestConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    INSTRUCTIONS_DIR_NAME,
    PROMPTS_DIR_NAME,
    INSTRUCTION_SCHEMA_VERSION,
    PROMPT_SCHEMA_VERSION,
};
