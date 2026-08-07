import * as fs from 'fs';
import * as path from 'path';
import type { CapabilityMetadata } from '@metaflow/engine';

export const README_DESCRIPTOR_FILE_NAME = 'README.md';
export const LEGACY_CAPABILITY_DESCRIPTOR_FILE_NAME = 'CAPABILITY.md';

export type CapabilityDescriptorKind = 'readme' | 'legacy-capability';

export interface CapabilityDescriptorPluginManifest {
    pluginJsonPath: string;
    name?: string;
    version?: string;
    description?: string;
    pluginHosts: string[];
    minimumMetaflowVersion?: string;
}

export interface CapabilityDescriptorWarning {
    code: string;
    message: string;
    filePath?: string;
    severity?: 'error' | 'warning' | 'info';
}

export interface CapabilityDescriptorResolution {
    kind?: CapabilityDescriptorKind;
    descriptorPath?: string;
    name?: string;
    description?: string;
    license?: string;
    experimental?: boolean;
    agentPlugin?: boolean;
    agentPluginManifest?: CapabilityDescriptorPluginManifest;
    body?: string;
    warnings: CapabilityDescriptorWarning[];
}

interface ParsedDescriptorFile {
    name?: string;
    description?: string;
    body: string;
    rawText: string;
    warnings: CapabilityDescriptorWarning[];
}

function warning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDescriptorWarning['severity'] = 'warning',
): CapabilityDescriptorWarning {
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

function parseDescriptorFile(rawText: string, descriptorPath: string): ParsedDescriptorFile {
    const normalized = rawText.replace(/^\uFEFF/, '');
    const warnings: CapabilityDescriptorWarning[] = [];
    const fileName = path.basename(descriptorPath);
    const isReadme = fileName === README_DESCRIPTOR_FILE_NAME;
    const codePrefix = isReadme ? 'README_DESCRIPTOR' : 'CAPABILITY_DESCRIPTOR';

    if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
        return {
            body: normalized,
            rawText,
            warnings: isReadme
                ? []
                : [
                warning(
                    `${codePrefix}_FRONTMATTER_MISSING`,
                    `${fileName} is missing required YAML frontmatter delimited by --- markers.`,
                    descriptorPath,
                ),
            ],
        };
    }

    const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!frontmatterMatch) {
        return {
            body: normalized,
            rawText,
            warnings: [
                warning(
                    `${codePrefix}_FRONTMATTER_MALFORMED`,
                    `${fileName} frontmatter could not be parsed. Ensure opening and closing --- markers are present.`,
                    descriptorPath,
                ),
            ],
        };
    }

    const [, frontmatterBody, body] = frontmatterMatch;
    const fields = new Map<string, string>();
    for (const [index, sourceLine] of frontmatterBody.split(/\r?\n/).entries()) {
        const line = sourceLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (!keyValueMatch) {
            warnings.push(
                warning(
                    `${codePrefix}_FRONTMATTER_LINE_INVALID`,
                    `Invalid frontmatter line ${index + 1}: "${line}". Expected "key: value" format.`,
                    descriptorPath,
                ),
            );
            continue;
        }

        fields.set(keyValueMatch[1], stripQuotes(keyValueMatch[2]));
    }

    if (isReadme) {
        for (const fieldName of fields.keys()) {
            if (!['name', 'description', 'id'].includes(fieldName)) {
                warnings.push(
                    warning(
                        'README_DESCRIPTOR_UNKNOWN_FIELD',
                        `README.md frontmatter field "${fieldName}" is not part of the portable descriptor contract.`,
                        descriptorPath,
                    ),
                );
            }
        }
    }

    const name = fields.get('name')?.trim() || undefined;
    const description = fields.get('description')?.trim() || undefined;

    if (!name && !isReadme) {
        warnings.push(
            warning(
                `${codePrefix}_NAME_REQUIRED`,
                `${fileName} requires a non-empty "name" field in frontmatter.`,
                descriptorPath,
            ),
        );
    }
    if (!description && !isReadme) {
        warnings.push(
            warning(
                `${codePrefix}_DESCRIPTION_REQUIRED`,
                `${fileName} requires a non-empty "description" field in frontmatter.`,
                descriptorPath,
            ),
        );
    }
    return {
        name,
        description,
        body,
        rawText,
        warnings,
    };
}

function loadPluginManifest(layerRoot: string): {
    metadata?: CapabilityDescriptorPluginManifest;
    warnings: CapabilityDescriptorWarning[];
} {
    const pluginJsonPath = path.join(layerRoot, 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
        return { warnings: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8')) as unknown;
    } catch (error: unknown) {
        return {
            warnings: [
                warning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID',
                    `plugin.json could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            warnings: [
                warning(
                    'CAPABILITY_AGENT_PLUGIN_MANIFEST_OBJECT_REQUIRED',
                    'plugin.json must contain a top-level JSON object.',
                    pluginJsonPath,
                    'error',
                ),
            ],
        };
    }

    const manifest = parsed as Record<string, unknown>;
    const metaflow =
        manifest.metaflow &&
        typeof manifest.metaflow === 'object' &&
        !Array.isArray(manifest.metaflow)
            ? (manifest.metaflow as Record<string, unknown>)
            : undefined;
    const pluginHosts = Array.isArray(metaflow?.pluginHosts)
        ? metaflow.pluginHosts.filter((value): value is string => typeof value === 'string')
        : [];

    return {
        metadata: {
            pluginJsonPath,
            name: typeof manifest.name === 'string' ? manifest.name.trim() || undefined : undefined,
            version:
                typeof manifest.version === 'string'
                    ? manifest.version.trim() || undefined
                    : undefined,
            description:
                typeof manifest.description === 'string'
                    ? manifest.description.trim() || undefined
                    : undefined,
            pluginHosts,
            minimumMetaflowVersion:
                typeof metaflow?.minimumMetaflowVersion === 'string'
                    ? metaflow.minimumMetaflowVersion.trim() || undefined
                    : undefined,
        },
        warnings: [],
    };
}

export function resolveCapabilityDescriptor(
    layerRoot: string,
    legacyManifest?: CapabilityMetadata,
): CapabilityDescriptorResolution {
    const readmePath = path.join(layerRoot, README_DESCRIPTOR_FILE_NAME);
    const legacyPath = path.join(layerRoot, LEGACY_CAPABILITY_DESCRIPTOR_FILE_NAME);
    const hasReadme = fs.existsSync(readmePath);
    const hasLegacy = fs.existsSync(legacyPath);

    if (hasReadme) {
        let rawText: string;
        try {
            rawText = fs.readFileSync(readmePath, 'utf-8');
        } catch (error: unknown) {
            return {
                kind: 'readme',
                descriptorPath: readmePath,
                warnings: [
                    warning(
                        'README_DESCRIPTOR_READ_ERROR',
                        `Failed to read README.md: ${error instanceof Error ? error.message : String(error)}`,
                        readmePath,
                        'error',
                    ),
                ],
            };
        }

        const parsed = parseDescriptorFile(rawText, readmePath);
        const plugin = loadPluginManifest(layerRoot);
        const warnings = [...parsed.warnings, ...plugin.warnings];
        if (hasLegacy) {
            warnings.push(
                warning(
                    'DESCRIPTOR_DUPLICATE',
                    'Both README.md and legacy CAPABILITY.md are present. README.md is selected and the files are not merged.',
                    readmePath,
                ),
            );

            let legacyRawText: string | undefined;
            try {
                legacyRawText = fs.readFileSync(legacyPath, 'utf-8');
            } catch {
                legacyRawText = undefined;
            }
            if (legacyRawText !== undefined && legacyRawText !== rawText) {
                warnings.push(
                    warning(
                        'DESCRIPTOR_CONFLICT',
                        'README.md and legacy CAPABILITY.md contain different descriptor values or body content. README.md remains authoritative.',
                        readmePath,
                    ),
                );
            }
        }

        return {
            kind: 'readme',
            descriptorPath: readmePath,
            name: plugin.metadata?.name ?? parsed.name,
            description: plugin.metadata?.description ?? parsed.description,
            agentPlugin: plugin.metadata !== undefined,
            agentPluginManifest: plugin.metadata,
            body: parsed.body,
            warnings,
        };
    }

    if (hasLegacy) {
        const plugin = loadPluginManifest(layerRoot);
        return {
            kind: 'legacy-capability',
            descriptorPath: legacyPath,
            name: legacyManifest?.name,
            description: legacyManifest?.description,
            license: legacyManifest?.license,
            experimental: legacyManifest?.experimental,
            agentPlugin: legacyManifest?.agentPlugin ?? plugin.metadata !== undefined,
            agentPluginManifest: legacyManifest?.agentPluginManifest ?? plugin.metadata,
            body: legacyManifest?.body,
            warnings: [...(legacyManifest?.warnings ?? []), ...plugin.warnings],
        };
    }

    return {
        warnings: [],
    };
}
