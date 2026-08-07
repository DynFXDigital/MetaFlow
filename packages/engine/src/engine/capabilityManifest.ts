/**
 * Capability descriptor parser/loader.
 *
 * README.md is human-facing package documentation. Its frontmatter is optional
 * and is retained only for compatibility while plugin.json owns plugin metadata.
 *
 * CAPABILITY.md remains a legacy compatibility format:
 * - required: name, description
 * - optional: uid, previousIds, previousPaths, license, experimental, agentPlugin
 *
 * Unknown fields are allowed with warnings for forward compatibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityAgentPluginAuthor,
    CapabilityAgentPluginComponentValue,
    CapabilityAgentPluginManifest,
    CapabilityDescriptorKind,
    CapabilityDescriptorPath,
    CapabilityDiagnosticSeverity,
    CapabilityMetadata,
    CapabilityWarning,
} from './types';

const CAPABILITY_FILE_NAME = 'CAPABILITY.md';
const README_FILE_NAME = 'README.md';
const AGENT_PLUGIN_MANIFEST_FILE_NAME = 'plugin.json';
const FALLBACK_LICENSE_TOKEN = 'SEE-LICENSE-IN-REPO';
const LEGACY_KNOWN_FIELDS = new Set([
    'uid',
    'previousIds',
    'previousPaths',
    'name',
    'description',
    'license',
    'experimental',
    'agentPlugin',
]);
const README_KNOWN_FIELDS = new Set(['name', 'description', 'id']);

type ManifestFields = {
    uid?: string;
    previousIds?: string;
    previousPaths?: string;
    name?: string;
    description?: string;
    license?: string;
    experimental?: string;
    agentPlugin?: string;
};

type ReadmeDescriptorFields = {
    name?: string;
    description?: string;
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

function parseStringListField(value: string | undefined): string[] | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }

    const listBody =
        trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
    const entries = listBody
        .split(',')
        .map((entry) => stripQuotes(entry).trim())
        .filter((entry) => entry.length > 0);

    return entries.length > 0 ? entries : undefined;
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

function readmeHeadingTitle(body: string): string | undefined {
    const heading = body.match(/^#\s+(.+)$/m)?.[1].trim();
    if (!heading) {
        return undefined;
    }

    return heading.replace(/^Capability:\s*/i, '').trim() || undefined;
}

function parseFrontmatter(
    rawText: string,
    filePath?: string,
    descriptorFileName = CAPABILITY_FILE_NAME,
    warningPrefix = 'CAPABILITY',
    frontmatterRequired = true,
): ParseFrontmatterResult {
    const warnings: CapabilityWarning[] = [];
    const normalized = rawText.replace(/^\uFEFF/, '');

    if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
        return {
            fields: {},
            body: normalized,
            warnings: frontmatterRequired
                ? [
                      toWarning(
                          `${warningPrefix}_FRONTMATTER_MISSING`,
                          `${descriptorFileName} is missing required YAML frontmatter delimited by --- markers.`,
                          filePath,
                      ),
                  ]
                : [],
        };
    }

    const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
        return {
            fields: {},
            body: normalized,
            warnings: [
                toWarning(
                    `${warningPrefix}_FRONTMATTER_MALFORMED`,
                    `${descriptorFileName} frontmatter could not be parsed. Ensure opening and closing --- markers are present.`,
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
                    `${warningPrefix}_FRONTMATTER_LINE_INVALID`,
                    `Invalid ${descriptorFileName} frontmatter line ${i + 1}: "${line}". Expected "key: value" format.`,
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

function isValidCapabilityUid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.trim(),
    );
}

function descriptorFileName(kind: CapabilityDescriptorKind): string {
    return kind === 'readme' ? README_FILE_NAME : CAPABILITY_FILE_NAME;
}

function descriptorWarningPrefix(kind: CapabilityDescriptorKind): string {
    return kind === 'readme' ? 'README_DESCRIPTOR' : 'CAPABILITY';
}

function descriptorPathForLayer(layerPath: string, kind: CapabilityDescriptorKind): string {
    return path.join(layerPath, descriptorFileName(kind));
}

/** Resolve the descriptor selected by README-first, absence-only fallback. */
export function resolveCapabilityDescriptorPath(
    layerPath: string,
): CapabilityDescriptorPath | undefined {
    const readmePath = descriptorPathForLayer(layerPath, 'readme');
    if (fs.existsSync(readmePath)) {
        return { kind: 'readme', absolutePath: readmePath };
    }

    const capabilityPath = descriptorPathForLayer(layerPath, 'capability');
    if (fs.existsSync(capabilityPath)) {
        return { kind: 'capability', absolutePath: capabilityPath };
    }

    return undefined;
}

function validateOptionalStringListField(
    value: string | undefined,
    fieldName: string,
    code: string,
    filePath?: string,
): CapabilityWarning[] {
    if (value === undefined || parseStringListField(value)) {
        return [];
    }

    return [
        toWarning(
            code,
            `CAPABILITY.md "${fieldName}" should be a non-empty string or comma-separated list when present.`,
            filePath,
        ),
    ];
}

function isValidPluginName(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed !== value || trimmed.length > 64) {
        return false;
    }

    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed);
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

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAuthor(value: unknown): string | CapabilityAgentPluginAuthor | undefined {
    const authorText = normalizeOptionalString(value);
    if (authorText) {
        return authorText;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }

    const authorObject = value as Record<string, unknown>;
    const name = normalizeOptionalString(authorObject.name);
    const email = normalizeOptionalString(authorObject.email);
    const url = normalizeOptionalString(authorObject.url);
    if (!name && !email && !url) {
        return undefined;
    }

    return {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(url ? { url } : {}),
    };
}

function normalizeComponentValue(value: unknown): CapabilityAgentPluginComponentValue | undefined {
    const componentPath = normalizeOptionalString(value);
    if (componentPath) {
        return componentPath;
    }

    const componentPaths = normalizeStringArray(value);
    return componentPaths && componentPaths.length > 0 ? componentPaths : undefined;
}

function normalizePluginComponents(
    manifestObject: Record<string, unknown>,
    pluginJsonPath: string,
    warnings: CapabilityWarning[],
): Record<string, CapabilityAgentPluginComponentValue> | undefined {
    const components: Record<string, CapabilityAgentPluginComponentValue> = {};
    const componentFields = [
        'agents',
        'commands',
        'skills',
        'rules',
        'hooks',
        'mcpServers',
        'lspServers',
    ];

    const addComponent = (componentName: string, value: unknown): void => {
        if (value === undefined) {
            return;
        }

        const normalized = normalizeComponentValue(value);
        if (!normalized) {
            warnings.push(
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_COMPONENT_INVALID',
                    `plugin.json component "${componentName}" should be a path or an array of paths when present.`,
                    pluginJsonPath,
                    'warning',
                ),
            );
            return;
        }

        components[componentName] = normalized;
    };

    const declaredComponents = manifestObject.components;
    if (declaredComponents !== undefined) {
        if (
            !declaredComponents ||
            typeof declaredComponents !== 'object' ||
            Array.isArray(declaredComponents)
        ) {
            warnings.push(
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_COMPONENTS_INVALID',
                    'plugin.json "components" should be an object of paths or arrays of paths when present.',
                    pluginJsonPath,
                    'warning',
                ),
            );
        } else {
            for (const [componentName, value] of Object.entries(
                declaredComponents as Record<string, unknown>,
            )) {
                addComponent(componentName, value);
            }
        }
    }

    for (const componentName of componentFields) {
        addComponent(componentName, manifestObject[componentName]);
    }

    return Object.keys(components).length > 0 ? components : undefined;
}

function parseAgentPluginManifestContent(
    rawText: string,
    pluginJsonPath: string,
): { metadata?: CapabilityAgentPluginManifest; warnings: CapabilityWarning[] } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText) as unknown;
    } catch (error) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID',
                    `plugin.json could not be parsed: ${(error as Error).message}`,
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_OBJECT_REQUIRED',
                    'plugin.json must contain a top-level JSON object.',
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    const manifestObject = parsed as Record<string, unknown>;
    const warnings: CapabilityWarning[] = [];
    const pluginName =
        typeof manifestObject.name === 'string' ? manifestObject.name.trim() : undefined;
    const version =
        typeof manifestObject.version === 'string' ? manifestObject.version.trim() : undefined;
    const description =
        typeof manifestObject.description === 'string'
            ? manifestObject.description.trim()
            : undefined;
    const author = normalizeAuthor(manifestObject.author);
    const license = normalizeOptionalString(manifestObject.license);
    const keywords = normalizeStringArray(manifestObject.keywords) ?? [];

    if (!pluginName) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_NAME_REQUIRED',
                'plugin.json requires a non-empty "name" field for agent-plugin capabilities.',
                pluginJsonPath,
                'error',
            ),
        );
    } else if (!isValidPluginName(pluginName)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_NAME_INVALID',
                'plugin.json "name" must be kebab-case using only lowercase letters, numbers, and hyphens.',
                pluginJsonPath,
                'error',
            ),
        );
    }

    if (!version) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_VERSION_REQUIRED',
                'plugin.json requires a non-empty "version" field for agent-plugin capabilities.',
                pluginJsonPath,
                'error',
            ),
        );
    } else if (!isLikelySemver(version)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_VERSION_INVALID',
                'plugin.json "version" should use SemVer syntax such as 1.0.0.',
                pluginJsonPath,
                'error',
            ),
        );
    }

    if (manifestObject.keywords !== undefined && !Array.isArray(manifestObject.keywords)) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_KEYWORDS_INVALID',
                'plugin.json "keywords" should be an array of strings when present.',
                pluginJsonPath,
                'warning',
            ),
        );
    }

    const metaflow = manifestObject.metaflow;
    let pluginHosts: string[] = [];
    let minimumMetaflowVersion: string | undefined;

    if (metaflow !== undefined) {
        if (!metaflow || typeof metaflow !== 'object' || Array.isArray(metaflow)) {
            warnings.push(
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_METAFLOW_INVALID',
                    'plugin.json "metaflow" should be an object when present.',
                    pluginJsonPath,
                    'error',
                ),
            );
        } else {
            const metaflowObject = metaflow as Record<string, unknown>;
            const normalizedPluginHosts = normalizeStringArray(metaflowObject.pluginHosts);
            if (metaflowObject.pluginHosts !== undefined && !normalizedPluginHosts) {
                warnings.push(
                    toWarning(
                        'CAPABILITY_AGENT_PLUGIN_MANIFEST_HOSTS_INVALID',
                        'plugin.json "metaflow.pluginHosts" should be an array of strings when present.',
                        pluginJsonPath,
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
                            'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID',
                            'plugin.json "metaflow.minimumMetaflowVersion" should be a recognizable version range.',
                            pluginJsonPath,
                            'error',
                        ),
                    );
                }
            } else if (metaflowObject.minimumMetaflowVersion !== undefined) {
                warnings.push(
                    toWarning(
                        'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID',
                        'plugin.json "metaflow.minimumMetaflowVersion" should be a string when present.',
                        pluginJsonPath,
                        'error',
                    ),
                );
            }
        }
    }

    if (pluginHosts.length === 0) {
        warnings.push(
            toWarning(
                'CAPABILITY_AGENT_PLUGIN_MANIFEST_HOSTS_RECOMMENDED',
                'plugin.json should declare "metaflow.pluginHosts" so plugin consumers can understand supported hosts.',
                pluginJsonPath,
                'warning',
            ),
        );
    }

    const components = normalizePluginComponents(manifestObject, pluginJsonPath, warnings);
    const homepage = normalizeOptionalString(manifestObject.homepage);
    const repository = normalizeOptionalString(manifestObject.repository);
    const documentation = normalizeOptionalString(manifestObject.documentation);

    return {
        metadata: {
            pluginJsonPath,
            name: pluginName,
            version,
            description,
            author,
            license,
            keywords,
            components,
            pluginHosts,
            minimumMetaflowVersion,
            homepage,
            repository,
            documentation,
        },
        warnings,
    };
}

function loadAgentPluginManifestForLayer(
    layerPath: string,
    descriptorKind: CapabilityDescriptorKind,
): {
    metadata?: CapabilityAgentPluginManifest;
    warnings: CapabilityWarning[];
} {
    const pluginJsonPath = path.join(layerPath, AGENT_PLUGIN_MANIFEST_FILE_NAME);
    if (!fs.existsSync(pluginJsonPath)) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING',
                    descriptorKind === 'capability'
                        ? 'CAPABILITY.md declares "agentPlugin: true" but plugin.json is missing at the capability root.'
                        : 'README.md is associated with an agent-plugin package but plugin.json is missing at the package root.',
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    let rawText: string;
    try {
        rawText = fs.readFileSync(pluginJsonPath, 'utf-8');
    } catch (error) {
        return {
            warnings: [
                toWarning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_READ_ERROR',
                    `Failed to read plugin.json: ${(error as Error).message}`,
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    return parseAgentPluginManifestContent(rawText, pluginJsonPath);
}

function validateManifestFields(fields: ManifestFields, filePath?: string): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];

    if (fields.uid !== undefined && !isValidCapabilityUid(fields.uid)) {
        warnings.push(
            toWarning(
                'CAPABILITY_UID_INVALID',
                'CAPABILITY.md "uid" should be an RFC 4122 UUID such as 123e4567-e89b-12d3-a456-426614174000.',
                filePath,
            ),
        );
    }

    warnings.push(
        ...validateOptionalStringListField(
            fields.previousIds,
            'previousIds',
            'CAPABILITY_PREVIOUS_IDS_INVALID',
            filePath,
        ),
        ...validateOptionalStringListField(
            fields.previousPaths,
            'previousPaths',
            'CAPABILITY_PREVIOUS_PATHS_INVALID',
            filePath,
        ),
    );

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
        if (!LEGACY_KNOWN_FIELDS.has(key)) {
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
        uid: parsed.fields.uid,
        previousIds: parsed.fields.previousIds,
        previousPaths: parsed.fields.previousPaths,
        name: parsed.fields.name,
        description: parsed.fields.description,
        license: parsed.fields.license,
        experimental: parsed.fields.experimental,
        agentPlugin: parsed.fields.agentPlugin,
    };

    warnings.push(...validateManifestFields(fields, manifestPath));

    return {
        id: capabilityId,
        uid: fields.uid?.trim() || undefined,
        previousIds: parseStringListField(fields.previousIds),
        previousPaths: parseStringListField(fields.previousPaths),
        manifestPath,
        descriptorKind: 'capability',
        name: fields.name?.trim() || undefined,
        description: fields.description?.trim() || undefined,
        license: fields.license?.trim() || undefined,
        experimental: parseBooleanField(fields.experimental),
        agentPlugin: parseBooleanField(fields.agentPlugin),
        body: parsed.body,
        warnings,
    };
}

/** Parse the portable README descriptor contract into normalized metadata. */
export function parseReadmeDescriptorContent(
    rawText: string,
    capabilityId: string,
    descriptorPath: string,
): CapabilityMetadata {
    const parsed = parseFrontmatter(
        rawText,
        descriptorPath,
        README_FILE_NAME,
        descriptorWarningPrefix('readme'),
        false,
    );
    const warnings = [...parsed.warnings];

    for (const key of Object.keys(parsed.fields)) {
        if (!README_KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'README_DESCRIPTOR_UNKNOWN_FIELD',
                    `Unknown README.md frontmatter field: "${key}".`,
                    descriptorPath,
                ),
            );
        }
    }

    const fields: ReadmeDescriptorFields = {
        name: readmeHeadingTitle(parsed.body) ?? parsed.fields.name,
        description: parsed.fields.description,
    };

    return {
        id: capabilityId,
        manifestPath: descriptorPath,
        descriptorKind: 'readme',
        name: fields.name?.trim() || undefined,
        description: fields.description?.trim() || undefined,
        body: parsed.body,
        warnings,
    };
}

/** Return whether a package-root README has the required descriptor fields. */
export function isValidReadmeDescriptor(metadata: CapabilityMetadata): boolean {
    return !metadata.warnings.some(
        (warning) =>
            warning.code.startsWith('README_DESCRIPTOR_FRONTMATTER_'),
    );
}

export function hasValidReadmeDescriptorAtRoot(layerPath: string): boolean {
    const readmePath = descriptorPathForLayer(layerPath, 'readme');
    try {
        if (!fs.statSync(readmePath).isFile()) {
            return false;
        }

        const rawText = fs.readFileSync(readmePath, 'utf-8');
        const parsed = parseReadmeDescriptorContent(rawText, path.basename(layerPath), readmePath);
        return isValidReadmeDescriptor(parsed);
    } catch {
        return false;
    }
}

function hasDifferentDescriptorContents(readmePath: string, capabilityPath: string): boolean {
    try {
        return fs.readFileSync(readmePath, 'utf-8') !== fs.readFileSync(capabilityPath, 'utf-8');
    } catch {
        return true;
    }
}

function duplicateDescriptorWarning(readmePath: string, capabilityPath: string): CapabilityWarning {
    const differs = hasDifferentDescriptorContents(readmePath, capabilityPath);
    return toWarning(
        'CAPABILITY_DESCRIPTOR_DUPLICATE',
        `Both README.md and CAPABILITY.md are present; README.md is selected and CAPABILITY.md is ignored.${
            differs ? ' The descriptor contents differ and are not merged.' : ''
        }`,
        readmePath,
    );
}

/**
 * Load the selected README.md or legacy CAPABILITY.md from a layer directory.
 */
export function loadCapabilityDescriptorForLayer(
    layerPath: string,
    capabilityId: string,
): CapabilityMetadata | undefined {
    const descriptor = resolveCapabilityDescriptorPath(layerPath);
    if (!descriptor) {
        return undefined;
    }

    let rawText: string;
    try {
        rawText = fs.readFileSync(descriptor.absolutePath, 'utf-8');
    } catch (err) {
        return {
            id: capabilityId,
            manifestPath: descriptor.absolutePath,
            descriptorKind: descriptor.kind,
            warnings: [
                toWarning(
                    `${descriptorWarningPrefix(descriptor.kind)}_READ_ERROR`,
                    `Failed to read ${descriptorFileName(descriptor.kind)}: ${(err as Error).message}`,
                    descriptor.absolutePath,
                ),
            ],
        };
    }

    const manifest =
        descriptor.kind === 'readme'
            ? parseReadmeDescriptorContent(rawText, capabilityId, descriptor.absolutePath)
            : parseCapabilityManifestContent(rawText, capabilityId, descriptor.absolutePath);

    if (descriptor.kind === 'readme') {
        const capabilityPath = descriptorPathForLayer(layerPath, 'capability');
        if (fs.existsSync(capabilityPath)) {
            manifest.warnings.push(
                duplicateDescriptorWarning(descriptor.absolutePath, capabilityPath),
            );
        }
    }

    const pluginJsonPath = path.join(layerPath, AGENT_PLUGIN_MANIFEST_FILE_NAME);
    const shouldLoadPluginManifest =
        descriptor.kind === 'readme'
            ? fs.existsSync(pluginJsonPath)
            : manifest.agentPlugin === true;
    if (shouldLoadPluginManifest) {
        const pluginResult = loadAgentPluginManifestForLayer(layerPath, descriptor.kind);
        if (descriptor.kind === 'readme' && pluginResult.metadata) {
            manifest.agentPlugin = true;
            manifest.agentPluginManifest = pluginResult.metadata;
                manifest.name = manifest.name || pluginResult.metadata.name;
                manifest.description = pluginResult.metadata.description || manifest.description;
                manifest.license = pluginResult.metadata.license || manifest.license;
        } else if (descriptor.kind === 'capability') {
            manifest.agentPluginManifest = pluginResult.metadata;
        }
        manifest.warnings.push(...pluginResult.warnings);
    }

    return manifest;
}

/** Backward-compatible name for the capability descriptor loader. */
export function loadCapabilityManifestForLayer(
    layerPath: string,
    capabilityId: string,
): CapabilityMetadata | undefined {
    return loadCapabilityDescriptorForLayer(layerPath, capabilityId);
}

export function collectDuplicateCapabilityUidWarnings(
    capabilities: CapabilityMetadata[],
): CapabilityWarning[] {
    const byUid = new Map<string, CapabilityMetadata[]>();
    for (const capability of capabilities) {
        const uid = capability.uid?.trim().toLowerCase();
        if (!uid) {
            continue;
        }

        const entries = byUid.get(uid) ?? [];
        entries.push(capability);
        byUid.set(uid, entries);
    }

    const warnings: CapabilityWarning[] = [];
    for (const [uid, entries] of byUid) {
        if (entries.length < 2) {
            continue;
        }

        const locations = entries
            .map((entry) => entry.manifestPath)
            .sort((left, right) => left.localeCompare(right));

        for (const entry of entries) {
            warnings.push(
                toWarning(
                    'CAPABILITY_UID_DUPLICATE',
                    `CAPABILITY.md "uid" ${uid} is duplicated by ${locations.join(', ')}.`,
                    entry.manifestPath,
                    'error',
                ),
            );
        }
    }

    return warnings;
}

export const capabilityManifestConstants = {
    CAPABILITY_FILE_NAME,
    README_FILE_NAME,
    AGENT_PLUGIN_MANIFEST_FILE_NAME,
    FALLBACK_LICENSE_TOKEN,
};
