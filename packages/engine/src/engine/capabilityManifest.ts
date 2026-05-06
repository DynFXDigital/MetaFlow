/**
 * Capability manifest parser/loader.
 *
 * CAPABILITY.md frontmatter contract (MVP):
 * - required: name, description
 * - optional: license, experimental, agentPlugin
 *
 * Unknown fields are allowed with warnings for forward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityAgentPluginPackage,
    CapabilityDiagnosticSeverity,
    CapabilityMetadata,
    CapabilityWarning,
} from './types';

const CAPABILITY_FILE_NAME = 'CAPABILITY.md';
const AGENT_PLUGIN_PACKAGE_FILE_NAME = 'package.json';
const FALLBACK_LICENSE_TOKEN = 'SEE-LICENSE-IN-REPO';
const KNOWN_FIELDS = new Set(['name', 'description', 'license', 'experimental', 'agentPlugin']);

type ManifestFields = {
    name?: string;
    description?: string;
    license?: string;
    experimental?: string;
    agentPlugin?: string;
};

function parseBooleanField(value: string | undefined): boolean | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    return undefined;
}

interface ParseFrontmatterResult {
    fields: Record<string, string>;
    body: string;
    warnings: CapabilityWarning[];
}

function toWarning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDiagnosticSeverity = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
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

function isLikelyVersionRange(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length > 0 && /\d/.test(trimmed) && /^[0-9A-Za-z*.+\-<>=~^|\s]+$/.test(trimmed);
}

function isValidPackageName(value: string): boolean {
    const trimmed = value.trim();
    if (
        trimmed.length === 0 ||
        trimmed !== value ||
        trimmed.startsWith('.') ||
        trimmed.startsWith('_')
    ) {
        return false;
    }

    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(trimmed);
}

function isLikelySemver(value: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.trim());
}

function normalizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const normalized = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    return normalized;
}

function parseAgentPluginPackageContent(
    rawText: string,
    packageJsonPath: string,
): { metadata?: CapabilityAgentPluginPackage; warnings: CapabilityWarning[] } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText) as unknown;
    } catch (error) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_PACKAGE_JSON_INVALID',
                    `package.json could not be parsed: ${(error as Error).message}`,
                    packageJsonPath,
                    'error',
                ),
            ],
        };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_PACKAGE_JSON_OBJECT_REQUIRED',
                    'package.json must contain a top-level JSON object.',
                    packageJsonPath,
                    'error',
                ),
            ],
        };
    }

    const packageObject = parsed as Record<string, unknown>;
    const warnings: CapabilityWarning[] = [];
    const packageName =
        typeof packageObject.name === 'string' ? packageObject.name.trim() : undefined;
    const version =
        typeof packageObject.version === 'string' ? packageObject.version.trim() : undefined;
    const description =
        typeof packageObject.description === 'string'
            ? packageObject.description.trim()
            : undefined;
    const keywords = normalizeStringArray(packageObject.keywords) ?? [];

    if (!packageName) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_NAME_REQUIRED',
                'package.json requires a non-empty "name" field for agent-plugin capabilities.',
                packageJsonPath,
                'error',
            ),
        );
    } else if (!isValidPackageName(packageName)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_NAME_INVALID',
                'package.json "name" must be a valid npm package name.',
                packageJsonPath,
                'error',
            ),
        );
    }

    if (!version) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_VERSION_REQUIRED',
                'package.json requires a non-empty "version" field for agent-plugin capabilities.',
                packageJsonPath,
                'error',
            ),
        );
    } else if (!isLikelySemver(version)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_VERSION_INVALID',
                'package.json "version" should use SemVer syntax such as 1.0.0.',
                packageJsonPath,
                'error',
            ),
        );
    }

    if (!description) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_DESCRIPTION_REQUIRED',
                'package.json requires a non-empty "description" field for agent-plugin capabilities.',
                packageJsonPath,
                'error',
            ),
        );
    }

    if (packageObject.keywords !== undefined && !Array.isArray(packageObject.keywords)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_KEYWORDS_INVALID',
                'package.json "keywords" should be an array of strings when present.',
                packageJsonPath,
                'warning',
            ),
        );
    }

    const metaflow = packageObject.metaflow;
    let pluginHosts: string[] = [];
    let minimumMetaflowVersion: string | undefined;

    if (metaflow !== undefined) {
        if (!metaflow || typeof metaflow !== 'object' || Array.isArray(metaflow)) {
            warnings.push(
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_PACKAGE_METAFLOW_INVALID',
                    'package.json "metaflow" should be an object when present.',
                    packageJsonPath,
                    'error',
                ),
            );
        } else {
            const metaflowObject = metaflow as Record<string, unknown>;
            const normalizedPluginHosts = normalizeStringArray(metaflowObject.pluginHosts);
            if (metaflowObject.pluginHosts !== undefined && !normalizedPluginHosts) {
                warnings.push(
                    toWarning(
                        'CAPABILITY_AGENT_PLUGIN_PACKAGE_HOSTS_INVALID',
                        'package.json "metaflow.pluginHosts" should be an array of strings when present.',
                        packageJsonPath,
                        'error',
                    ),
                );
            } else {
                pluginHosts = normalizedPluginHosts ?? [];
            }

            if (typeof metaflowObject.minimumMetaflowVersion === 'string') {
                minimumMetaflowVersion = metaflowObject.minimumMetaflowVersion.trim() || undefined;
                if (minimumMetaflowVersion && !isLikelyVersionRange(minimumMetaflowVersion)) {
                    warnings.push(
                        toWarning(
                            'CAPABILITY_AGENT_PLUGIN_PACKAGE_MINIMUM_METAFLOW_VERSION_INVALID',
                            'package.json "metaflow.minimumMetaflowVersion" should be a recognizable version range.',
                            packageJsonPath,
                            'error',
                        ),
                    );
                }
            } else if (metaflowObject.minimumMetaflowVersion !== undefined) {
                warnings.push(
                    toWarning(
                        'CAPABILITY_AGENT_PLUGIN_PACKAGE_MINIMUM_METAFLOW_VERSION_INVALID',
                        'package.json "metaflow.minimumMetaflowVersion" should be a string when present.',
                        packageJsonPath,
                        'error',
                    ),
                );
            }
        }
    }

    if (pluginHosts.length === 0) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_PACKAGE_HOSTS_RECOMMENDED',
                'package.json should declare "metaflow.pluginHosts" so plugin consumers can understand supported hosts.',
                packageJsonPath,
                'warning',
            ),
        );
    }

    return {
        metadata: {
            packageJsonPath,
            name: packageName,
            version,
            description,
            keywords,
            pluginHosts,
            minimumMetaflowVersion,
        },
        warnings,
    };
}

function loadAgentPluginPackageForLayer(layerPath: string): {
    metadata?: CapabilityAgentPluginPackage;
    warnings: CapabilityWarning[];
} {
    const packageJsonPath = path.join(layerPath, AGENT_PLUGIN_PACKAGE_FILE_NAME);
    if (!fs.existsSync(packageJsonPath)) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_PACKAGE_MISSING',
                    'CAPABILITY.md declares "agentPlugin: true" but package.json is missing at the capability root.',
                    packageJsonPath,
                    'error',
                ),
            ],
        };
    }

    let rawText: string;
    try {
        rawText = fs.readFileSync(packageJsonPath, 'utf-8');
    } catch (error) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_PACKAGE_READ_ERROR',
                    `Failed to read package.json: ${(error as Error).message}`,
                    packageJsonPath,
                    'error',
                ),
            ],
        };
    }

    return parseAgentPluginPackageContent(rawText, packageJsonPath);
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

    if (fields.experimental !== undefined && parseBooleanField(fields.experimental) === undefined) {
        warnings.push(
            toWarning(
                'CAPABILITY_EXPERIMENTAL_INVALID',
                'CAPABILITY.md "experimental" should be either true or false.',
                filePath,
            ),
        );
    }

    if (fields.agentPlugin !== undefined && parseBooleanField(fields.agentPlugin) === undefined) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_INVALID',
                'CAPABILITY.md "agentPlugin" should be either true or false.',
                filePath,
                'error',
            ),
        );
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
        experimental: parsed.fields.experimental,
        agentPlugin: parsed.fields.agentPlugin,
    };

    warnings.push(...validateManifestFields(fields, manifestPath));

    return {
        id: capabilityId,
        manifestPath,
        name: fields.name?.trim() || undefined,
        description: fields.description?.trim() || undefined,
        license: fields.license?.trim() || undefined,
        experimental: parseBooleanField(fields.experimental),
        agentPlugin: parseBooleanField(fields.agentPlugin),
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

    const manifest = parseCapabilityManifestContent(rawText, capabilityId, manifestPath);
    if (manifest.agentPlugin) {
        const packageResult = loadAgentPluginPackageForLayer(layerPath);
        manifest.agentPluginPackage = packageResult.metadata;
        manifest.warnings.push(...packageResult.warnings);
    }

    return manifest;
}

export const capabilityManifestConstants = {
    CAPABILITY_FILE_NAME,
    AGENT_PLUGIN_PACKAGE_FILE_NAME,
    FALLBACK_LICENSE_TOKEN,
};
