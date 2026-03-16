/**
 * Capability manifest parser/loader.
 *
 * CAPABILITY.md frontmatter contract (MVP):
 * - required: name, description
 * - optional: license
 *
 * Unknown fields are allowed with warnings for forward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CapabilityMetadata, CapabilityWarning } from './types';

const CAPABILITY_FILE_NAME = 'CAPABILITY.md';
const FALLBACK_LICENSE_TOKEN = 'SEE-LICENSE-IN-REPO';
const KNOWN_FIELDS = new Set(['name', 'description', 'license']);

type ManifestFields = {
    name?: string;
    description?: string;
    license?: string;
};

interface ParseFrontmatterResult {
    fields: Record<string, string>;
    body: string;
    warnings: CapabilityWarning[];
}

function toWarning(code: string, message: string, filePath?: string): CapabilityWarning {
    return { code, message, filePath };
}

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

function parseFrontmatter(rawText: string, filePath?: string): ParseFrontmatterResult {
    const warnings: CapabilityWarning[] = [];
    const normalized = rawText.replace(/^\uFEFF/, '');

    if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
        return {
            fields: {},
            body: normalized,
            warnings: [
                toWarning(
                    'CAPABILITY_FRONTMATTER_MISSING',
                    'CAPABILITY.md is missing required YAML frontmatter delimited by --- markers.',
                    filePath,
                ),
            ],
        };
    }

    const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
        return {
            fields: {},
            body: normalized,
            warnings: [
                toWarning(
                    'CAPABILITY_FRONTMATTER_MALFORMED',
                    'CAPABILITY.md frontmatter could not be parsed. Ensure opening and closing --- markers are present.',
                    filePath,
                ),
            ],
        };
    }

    const [, frontmatterBody, markdownBody] = frontmatterMatch;
    const fields: Record<string, string> = {};
    const lines = frontmatterBody.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line.length === 0 || line.startsWith('#')) {
            continue;
        }

        const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (!keyValueMatch) {
            warnings.push(
                toWarning(
                    'CAPABILITY_FRONTMATTER_LINE_INVALID',
                    `Invalid frontmatter line ${i + 1}: "${line}". Expected "key: value" format.`,
                    filePath,
                ),
            );
            continue;
        }

        const [, key, rawValue] = keyValueMatch;
        fields[key] = stripQuotes(rawValue);
    }

    return {
        fields,
        body: markdownBody,
        warnings,
    };
}

function isSpdxIdentifierToken(value: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9.+:-]*$/.test(value);
}

function tokenizeSpdxExpression(value: string): string[] {
    return value.match(/\(|\)|[^\s()]+/g) ?? [];
}

function isLikelySpdxExpression(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }

    const tokens = tokenizeSpdxExpression(trimmed);
    if (tokens.length === 0) {
        return false;
    }

    let index = 0;

    const peek = (): string | undefined => tokens[index];
    const consume = (): string | undefined => {
        const token = tokens[index];
        index += 1;
        return token;
    };

    const parsePrimary = (): boolean => {
        const token = peek();
        if (!token) {
            return false;
        }

        if (token === '(') {
            consume();
            if (!parseOrExpr()) {
                return false;
            }
            if (peek() !== ')') {
                return false;
            }
            consume();
            return true;
        }

        if (!isSpdxIdentifierToken(token)) {
            return false;
        }

        consume();
        return true;
    };

    const parseWithExpr = (): boolean => {
        if (!parsePrimary()) {
            return false;
        }

        while ((peek() || '').toUpperCase() === 'WITH') {
            consume();
            const exceptionId = consume();
            if (!exceptionId || !isSpdxIdentifierToken(exceptionId)) {
                return false;
            }
        }

        return true;
    };

    const parseAndExpr = (): boolean => {
        if (!parseWithExpr()) {
            return false;
        }

        while ((peek() || '').toUpperCase() === 'AND') {
            consume();
            if (!parseWithExpr()) {
                return false;
            }
        }

        return true;
    };

    const parseOrExpr = (): boolean => {
        if (!parseAndExpr()) {
            return false;
        }

        while ((peek() || '').toUpperCase() === 'OR') {
            consume();
            if (!parseAndExpr()) {
                return false;
            }
        }

        return true;
    };

    const ok = parseOrExpr();
    return ok && index === tokens.length;
}

function validateManifestFields(fields: ManifestFields, filePath?: string): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];

    if (!fields.name || fields.name.trim().length === 0) {
        warnings.push(
            toWarning(
                'CAPABILITY_NAME_REQUIRED',
                'CAPABILITY.md requires a non-empty "name" field in frontmatter.',
                filePath,
            ),
        );
    }

    if (!fields.description || fields.description.trim().length === 0) {
        warnings.push(
            toWarning(
                'CAPABILITY_DESCRIPTION_REQUIRED',
                'CAPABILITY.md requires a non-empty "description" field in frontmatter.',
                filePath,
            ),
        );
    }

    if (fields.license) {
        const trimmed = fields.license.trim();
        const licenseIsValid =
            trimmed === FALLBACK_LICENSE_TOKEN || isLikelySpdxExpression(trimmed);

        if (!licenseIsValid) {
            warnings.push(
                toWarning(
                    'CAPABILITY_LICENSE_INVALID',
                    `CAPABILITY.md "license" should be an SPDX identifier/expression or ${FALLBACK_LICENSE_TOKEN}.`,
                    filePath,
                ),
            );
        }
    }

    return warnings;
}

/**
 * Parse CAPABILITY.md content into normalized metadata + warnings.
 */
export function parseCapabilityManifestContent(
    rawText: string,
    capabilityId: string,
    manifestPath: string,
): CapabilityMetadata {
    const parsed = parseFrontmatter(rawText, manifestPath);
    const warnings = [...parsed.warnings];

    for (const key of Object.keys(parsed.fields)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'CAPABILITY_UNKNOWN_FIELD',
                    `Unknown CAPABILITY.md frontmatter field: "${key}".`,
                    manifestPath,
                ),
            );
        }
    }

    const fields: ManifestFields = {
        name: parsed.fields.name,
        description: parsed.fields.description,
        license: parsed.fields.license,
    };

    warnings.push(...validateManifestFields(fields, manifestPath));

    return {
        id: capabilityId,
        manifestPath,
        name: fields.name?.trim() || undefined,
        description: fields.description?.trim() || undefined,
        license: fields.license?.trim() || undefined,
        body: parsed.body,
        warnings,
    };
}

/**
 * Load CAPABILITY.md from a layer directory when present.
 */
export function loadCapabilityManifestForLayer(
    layerPath: string,
    capabilityId: string,
): CapabilityMetadata | undefined {
    const manifestPath = path.join(layerPath, CAPABILITY_FILE_NAME);
    if (!fs.existsSync(manifestPath)) {
        return undefined;
    }

    let rawText: string;
    try {
        rawText = fs.readFileSync(manifestPath, 'utf-8');
    } catch (err) {
        return {
            id: capabilityId,
            manifestPath,
            warnings: [
                toWarning(
                    'CAPABILITY_READ_ERROR',
                    `Failed to read CAPABILITY.md: ${(err as Error).message}`,
                    manifestPath,
                ),
            ],
        };
    }

    return parseCapabilityManifestContent(rawText, capabilityId, manifestPath);
}

export const capabilityManifestConstants = {
    CAPABILITY_FILE_NAME,
    FALLBACK_LICENSE_TOKEN,
};
