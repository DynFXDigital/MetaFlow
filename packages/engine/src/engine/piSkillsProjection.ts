/**
 * Pure 1:1 projection from validated Agent Plugins packages to Pi project plugins.
 *
 * Each source plugin retains its portable manifest identity and becomes one
 * direct child of `.pi/plugins`. Provenance is attached only to the returned
 * file inventory for the external target ledger; it is never written into a
 * projected package.
 */

import { createHash } from 'crypto';
import {
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    isValidAgentPluginName,
    isValidAgentSkillName,
    validateAgentSkillContent,
} from './agentPluginCompatibility';
import type { AgentPluginManifestInventory } from './agentPluginCompatibility';
import type { CapabilityDiagnosticSeverity, CapabilityWarning } from './types';

export const PI_PROJECT_PLUGINS_RELATIVE_ROOT = '.pi/plugins';
export const PI_SKILLS_PROJECTION_SCHEMA = 'metaflow.pi-skills-projection.v2';

export interface PiSkillsProjectionSource {
    readonly layerId: string;
    readonly repoId?: string;
    readonly capabilityId: string;
    readonly capabilityName?: string;
    /** Source artifact path used for provenance only; never included in package hashes. */
    readonly sourcePath: string;
}

export interface PiSkillProjectionInput {
    readonly name: string;
    /** Exact SKILL.md bytes. */
    readonly content: Uint8Array;
    readonly source: PiSkillsProjectionSource;
}

export interface PiAgentPluginProjectionInput {
    readonly manifest: AgentPluginManifestInventory;
    readonly source: PiSkillsProjectionSource;
    readonly skills: readonly PiSkillProjectionInput[];
    /** Present when the source declares mcp.json, which this target cannot yet reproduce. */
    readonly mcpSource?: PiSkillsProjectionSource;
}

export type PiProjectionOmissionReason =
    | 'non-portable'
    | 'mcp-deferred'
    | 'invalid-source'
    | 'unsupported-profile'
    | 'duplicate-plugin'
    | 'duplicate-skill';

export interface PiProjectionOmission {
    readonly artifactType: string;
    readonly reason: PiProjectionOmissionReason;
    readonly source: PiSkillsProjectionSource;
    readonly outputPath?: string;
}

export interface PiSkillsProjectionDiagnostic extends CapabilityWarning {
    readonly outputPath?: string;
    readonly source?: PiSkillsProjectionSource;
}

export interface PiSkillsProjectionInput {
    readonly plugins: readonly PiAgentPluginProjectionInput[];
    readonly omissions?: readonly PiProjectionOmission[];
    readonly diagnostics?: readonly PiSkillsProjectionDiagnostic[];
}

export interface PiSkillsProjectionConflict {
    readonly kind: 'plugin-name' | 'skill-name';
    readonly pluginName?: string;
    readonly skillName?: string;
    readonly outputPath: string;
    readonly contenders: readonly PiSkillsProjectionSource[];
}

export interface PiProjectedFile {
    readonly relativePath: string;
    readonly content: Uint8Array;
    readonly contentHash: string;
    readonly sources: readonly PiSkillsProjectionSource[];
}

export interface PiAgentPluginManifest extends AgentPluginManifestInventory {
    readonly $schema: typeof AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID;
}

export interface PiSkillsProjectionPackage {
    readonly name: string;
    readonly relativeRoot: string;
    readonly contentSha: string;
    readonly manifest: PiAgentPluginManifest;
    readonly files: readonly PiProjectedFile[];
    readonly sources: readonly PiSkillsProjectionSource[];
}

interface PiSkillsProjectionResultBase {
    readonly diagnostics: readonly PiSkillsProjectionDiagnostic[];
    readonly omissions: readonly PiProjectionOmission[];
    readonly conflicts: readonly PiSkillsProjectionConflict[];
}

export type PiSkillsProjectionResult =
    | (PiSkillsProjectionResultBase & {
          readonly blocked: false;
          readonly packages: readonly PiSkillsProjectionPackage[];
      })
    | (PiSkillsProjectionResultBase & {
          readonly blocked: true;
          readonly packages?: undefined;
      });

function compareCodeUnits(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function sourceIdentity(source: PiSkillsProjectionSource): string {
    return [source.repoId ?? '', source.layerId, source.capabilityId, source.sourcePath].join(
        '\u0000',
    );
}

function sourceLabel(source: PiSkillsProjectionSource): string {
    return [
        source.repoId ?? 'default',
        source.layerId,
        source.capabilityId,
        source.sourcePath,
    ].join(':');
}

function compareSources(left: PiSkillsProjectionSource, right: PiSkillsProjectionSource): number {
    return compareCodeUnits(sourceIdentity(left), sourceIdentity(right));
}

function cloneSource(source: PiSkillsProjectionSource): PiSkillsProjectionSource {
    return {
        layerId: source.layerId,
        ...(source.repoId !== undefined ? { repoId: source.repoId } : {}),
        capabilityId: source.capabilityId,
        ...(source.capabilityName !== undefined ? { capabilityName: source.capabilityName } : {}),
        sourcePath: source.sourcePath,
    };
}

function canonicalSources(
    sources: readonly PiSkillsProjectionSource[],
): readonly PiSkillsProjectionSource[] {
    const unique = new Map<string, PiSkillsProjectionSource>();
    for (const source of sources) {
        unique.set(sourceIdentity(source), cloneSource(source));
    }
    return [...unique.values()].sort(compareSources);
}

function cloneOmission(omission: PiProjectionOmission): PiProjectionOmission {
    return {
        artifactType: omission.artifactType,
        reason: omission.reason,
        source: cloneSource(omission.source),
        ...(omission.outputPath !== undefined ? { outputPath: omission.outputPath } : {}),
    };
}

function compareOmissions(left: PiProjectionOmission, right: PiProjectionOmission): number {
    return (
        compareCodeUnits(left.outputPath ?? '', right.outputPath ?? '') ||
        compareCodeUnits(left.reason, right.reason) ||
        compareCodeUnits(left.artifactType, right.artifactType) ||
        compareSources(left.source, right.source)
    );
}

function compareDiagnostics(
    left: PiSkillsProjectionDiagnostic,
    right: PiSkillsProjectionDiagnostic,
): number {
    return (
        compareCodeUnits(left.code, right.code) ||
        compareCodeUnits(left.outputPath ?? '', right.outputPath ?? '') ||
        compareCodeUnits(
            left.source ? sourceIdentity(left.source) : '',
            right.source ? sourceIdentity(right.source) : '',
        ) ||
        compareCodeUnits(left.filePath ?? '', right.filePath ?? '') ||
        compareCodeUnits(left.message, right.message)
    );
}

function diagnostic(
    code: string,
    message: string,
    severity: CapabilityDiagnosticSeverity,
    source?: PiSkillsProjectionSource,
    outputPath?: string,
): PiSkillsProjectionDiagnostic {
    return {
        code,
        message,
        severity,
        ...(source
            ? {
                  filePath: source.sourcePath,
                  source: cloneSource(source),
              }
            : {}),
        ...(outputPath !== undefined ? { outputPath } : {}),
    };
}

function omissionDiagnostic(omission: PiProjectionOmission): PiSkillsProjectionDiagnostic {
    const reasonByKind: Readonly<Record<PiProjectionOmissionReason, string>> = {
        'non-portable': 'the artifact type is outside the portable skills-only target',
        'mcp-deferred': 'the source plugin declares MCP behavior that this target cannot reproduce',
        'invalid-source': 'the source artifact did not pass compatibility validation',
        'unsupported-profile':
            'the source package does not use the supported Agent Plugins profile',
        'duplicate-plugin': 'another active source uses the same plugin name',
        'duplicate-skill': 'another active plugin uses the same Pi skill command name',
    };
    const codeByKind: Readonly<Record<PiProjectionOmissionReason, string>> = {
        'non-portable': 'PI_AGENT_PLUGIN_PROJECTION_ARTIFACT_NON_PORTABLE',
        'mcp-deferred': 'PI_AGENT_PLUGIN_PROJECTION_MCP_DEFERRED',
        'invalid-source': 'PI_AGENT_PLUGIN_PROJECTION_SOURCE_OMITTED',
        'unsupported-profile': 'PI_AGENT_PLUGIN_PROJECTION_SOURCE_OMITTED',
        'duplicate-plugin': 'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_DUPLICATE',
        'duplicate-skill': 'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE',
    };
    const severity: CapabilityDiagnosticSeverity =
        omission.reason === 'non-portable'
            ? 'info'
            : omission.reason === 'invalid-source' || omission.reason === 'unsupported-profile'
              ? 'warning'
              : 'error';
    return diagnostic(
        codeByKind[omission.reason],
        `Artifact "${omission.source.sourcePath}" from capability "${omission.source.capabilityId}" was omitted because ${reasonByKind[omission.reason]}.`,
        severity,
        omission.source,
        omission.outputPath,
    );
}

function sha256(content: Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}

function decodeUtf8(content: Uint8Array): string | undefined {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
        return undefined;
    }
}

function canonicalJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalJsonValue);
    }
    if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort(compareCodeUnits)) {
            result[key] = canonicalJsonValue((value as Record<string, unknown>)[key]);
        }
        return result;
    }
    return value;
}

function cloneManifest(manifest: AgentPluginManifestInventory): PiAgentPluginManifest {
    const author = manifest.author
        ? {
              ...(manifest.author.name !== undefined ? { name: manifest.author.name } : {}),
              ...(manifest.author.email !== undefined ? { email: manifest.author.email } : {}),
              ...(manifest.author.url !== undefined ? { url: manifest.author.url } : {}),
          }
        : undefined;
    return {
        $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
        name: manifest.name,
        ...(manifest.version !== undefined ? { version: manifest.version } : {}),
        ...(manifest.description !== undefined ? { description: manifest.description } : {}),
        ...(author ? { author } : {}),
        ...(manifest.homepage !== undefined ? { homepage: manifest.homepage } : {}),
        ...(manifest.repository !== undefined ? { repository: manifest.repository } : {}),
        ...(manifest.license !== undefined ? { license: manifest.license } : {}),
        ...(manifest.keywords !== undefined ? { keywords: [...manifest.keywords] } : {}),
        ...(manifest.extensions !== undefined
            ? {
                  extensions: canonicalJsonValue(manifest.extensions) as Readonly<
                      Record<string, unknown>
                  >,
              }
            : {}),
    };
}

function validManifestInventory(manifest: AgentPluginManifestInventory): boolean {
    const metadataValues = [
        manifest.version,
        manifest.description,
        manifest.homepage,
        manifest.repository,
        manifest.license,
    ];
    return (
        isValidAgentPluginName(manifest.name) &&
        metadataValues.every((value) => value === undefined || typeof value === 'string') &&
        (manifest.keywords === undefined ||
            (Array.isArray(manifest.keywords) &&
                manifest.keywords.every((entry) => typeof entry === 'string'))) &&
        (manifest.author === undefined ||
            (typeof manifest.author === 'object' &&
                manifest.author !== null &&
                Object.entries(manifest.author).every(
                    ([key, value]) =>
                        ['name', 'email', 'url'].includes(key) && typeof value === 'string',
                ))) &&
        (manifest.extensions === undefined ||
            (typeof manifest.extensions === 'object' &&
                manifest.extensions !== null &&
                !Array.isArray(manifest.extensions)))
    );
}

interface CandidateSkill {
    readonly pluginName: string;
    readonly name: string;
    readonly outputPath: string;
    readonly content: Buffer;
    readonly source: PiSkillsProjectionSource;
}

function packageContentSha(manifestContent: Buffer, skills: readonly CandidateSkill[]): string {
    const hash = createHash('sha256');
    hash.update(PI_SKILLS_PROJECTION_SCHEMA, 'utf8');
    hash.update('\u0000');
    hash.update(manifestContent);
    hash.update('\u0000');
    for (const skill of skills) {
        hash.update(skill.outputPath, 'utf8');
        hash.update('\u0000');
        hash.update(skill.content);
        hash.update('\u0000');
    }
    return hash.digest('hex');
}

function cloneInputDiagnostic(value: PiSkillsProjectionDiagnostic): PiSkillsProjectionDiagnostic {
    return {
        code: value.code,
        message: value.message,
        ...(value.filePath !== undefined ? { filePath: value.filePath } : {}),
        ...(value.severity !== undefined ? { severity: value.severity } : {}),
        ...(value.outputPath !== undefined ? { outputPath: value.outputPath } : {}),
        ...(value.source !== undefined ? { source: cloneSource(value.source) } : {}),
    };
}

/**
 * Build deterministic skills-only packages at `.pi/plugins/<source-name>`.
 * Duplicate plugin names, globally ambiguous Pi skill names, and MCP-bearing
 * source plugins block the complete projection so reconciliation stays exact.
 */
export function projectPiAgentPluginSkills(
    input: PiSkillsProjectionInput,
): PiSkillsProjectionResult {
    const diagnostics = (input.diagnostics ?? []).map(cloneInputDiagnostic);
    const omissions = (input.omissions ?? []).map(cloneOmission);
    for (const omission of omissions) {
        diagnostics.push(omissionDiagnostic(omission));
    }

    const plugins = input.plugins
        .map((plugin) => ({
            manifest: cloneManifest(plugin.manifest),
            source: cloneSource(plugin.source),
            skills: plugin.skills,
            ...(plugin.mcpSource ? { mcpSource: cloneSource(plugin.mcpSource) } : {}),
        }))
        .sort(
            (left, right) =>
                compareCodeUnits(left.manifest.name, right.manifest.name) ||
                compareSources(left.source, right.source),
        );

    let blocked = false;
    for (const plugin of plugins) {
        if (!validManifestInventory(plugin.manifest)) {
            blocked = true;
            diagnostics.push(
                diagnostic(
                    'PI_AGENT_PLUGIN_PROJECTION_MANIFEST_INVALID',
                    `Plugin manifest from capability "${plugin.source.capabilityId}" is not a valid portable Agent Plugins 1.0 manifest.`,
                    'error',
                    plugin.source,
                ),
            );
        }
        if (plugin.manifest.extensions && Object.keys(plugin.manifest.extensions).length > 0) {
            blocked = true;
            diagnostics.push(
                diagnostic(
                    'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_EXTENSIONS_UNSUPPORTED',
                    `Plugin "${plugin.manifest.name}" declares client extensions that the skills-only target cannot reproduce, so projection is blocked.`,
                    'error',
                    plugin.source,
                    `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${plugin.manifest.name}`,
                ),
            );
        }
        if (plugin.mcpSource) {
            blocked = true;
            const outputPath = `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${plugin.manifest.name}`;
            if (
                !omissions.some(
                    (entry) =>
                        entry.reason === 'mcp-deferred' &&
                        sourceIdentity(entry.source) === sourceIdentity(plugin.mcpSource!),
                )
            ) {
                const omission: PiProjectionOmission = {
                    artifactType: 'mcp',
                    reason: 'mcp-deferred',
                    source: cloneSource(plugin.mcpSource),
                    outputPath,
                };
                omissions.push(omission);
                diagnostics.push(omissionDiagnostic(omission));
            }
            diagnostics.push(
                diagnostic(
                    'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_MCP_UNSUPPORTED',
                    `Plugin "${plugin.manifest.name}" declares mcp.json, so projecting it without its MCP behavior is blocked.`,
                    'error',
                    plugin.mcpSource,
                    outputPath,
                ),
            );
        }
    }

    const conflicts: PiSkillsProjectionConflict[] = [];
    const pluginsByName = new Map<string, typeof plugins>();
    for (const plugin of plugins) {
        const entries = pluginsByName.get(plugin.manifest.name) ?? [];
        entries.push(plugin);
        pluginsByName.set(plugin.manifest.name, entries);
    }
    for (const [pluginName, entries] of pluginsByName) {
        if (entries.length < 2) {
            continue;
        }
        blocked = true;
        const outputPath = `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${pluginName}`;
        const contenders = entries.map((entry) => cloneSource(entry.source)).sort(compareSources);
        conflicts.push({ kind: 'plugin-name', pluginName, outputPath, contenders });
        for (const entry of entries) {
            omissions.push({
                artifactType: 'plugin',
                reason: 'duplicate-plugin',
                source: cloneSource(entry.source),
                outputPath,
            });
        }
        diagnostics.push(
            diagnostic(
                'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_DUPLICATE',
                `Plugin name "${pluginName}" has multiple active sources: ${contenders.map(sourceLabel).join(', ')}. Resolve the duplicate before reconciling Pi plugins.`,
                'error',
                undefined,
                outputPath,
            ),
        );
    }

    const candidates: CandidateSkill[] = [];
    for (const plugin of plugins) {
        for (const skill of plugin.skills) {
            const source = cloneSource(skill.source);
            const outputPath = `skills/${skill.name}/SKILL.md`;
            const content = Buffer.from(skill.content);
            const decoded = decodeUtf8(content);
            const validation = decoded ? validateAgentSkillContent(skill.name, decoded) : undefined;
            if (!isValidAgentSkillName(skill.name) || !validation?.valid) {
                const omission: PiProjectionOmission = {
                    artifactType: 'skill',
                    reason: 'invalid-source',
                    source,
                    outputPath: `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${plugin.manifest.name}/${outputPath}`,
                };
                omissions.push(omission);
                diagnostics.push(
                    diagnostic(
                        'PI_AGENT_PLUGIN_PROJECTION_SKILL_INVALID',
                        `Skill "${skill.name}" from capability "${source.capabilityId}" was omitted because its SKILL.md bytes do not satisfy Agent Skills metadata requirements.`,
                        'warning',
                        source,
                        omission.outputPath,
                    ),
                );
                continue;
            }
            candidates.push({
                pluginName: plugin.manifest.name,
                name: skill.name,
                outputPath,
                content,
                source,
            });
        }
    }
    candidates.sort(
        (left, right) =>
            compareCodeUnits(left.name, right.name) ||
            compareCodeUnits(left.pluginName, right.pluginName) ||
            compareSources(left.source, right.source),
    );

    const skillsByName = new Map<string, CandidateSkill[]>();
    for (const candidate of candidates) {
        const entries = skillsByName.get(candidate.name) ?? [];
        entries.push(candidate);
        skillsByName.set(candidate.name, entries);
    }
    for (const [skillName, entries] of skillsByName) {
        if (entries.length < 2) {
            continue;
        }
        blocked = true;
        const contenders = entries.map((entry) => cloneSource(entry.source)).sort(compareSources);
        const outputPath = `skills/${skillName}/SKILL.md`;
        conflicts.push({ kind: 'skill-name', skillName, outputPath, contenders });
        for (const entry of entries) {
            omissions.push({
                artifactType: 'skill',
                reason: 'duplicate-skill',
                source: cloneSource(entry.source),
                outputPath: `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${entry.pluginName}/${entry.outputPath}`,
            });
        }
        diagnostics.push(
            diagnostic(
                'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE',
                `Pi skill command "${skillName}" has multiple active plugin sources: ${contenders.map(sourceLabel).join(', ')}. Pi skill names are session-global, so resolve the duplicate before reconciliation.`,
                'error',
                undefined,
                outputPath,
            ),
        );
    }

    conflicts.sort((left, right) => compareCodeUnits(left.outputPath, right.outputPath));
    omissions.sort(compareOmissions);
    diagnostics.sort(compareDiagnostics);
    if (blocked || conflicts.length > 0) {
        return { blocked: true, conflicts, omissions, diagnostics };
    }

    const packages: PiSkillsProjectionPackage[] = [];
    for (const plugin of plugins) {
        const selected = candidates
            .filter((candidate) => candidate.pluginName === plugin.manifest.name)
            .sort((left, right) => compareCodeUnits(left.outputPath, right.outputPath));
        const manifestContent = Buffer.from(
            `${JSON.stringify(plugin.manifest, null, 2)}\n`,
            'utf8',
        );
        const files: PiProjectedFile[] = [
            {
                relativePath: 'plugin.json',
                content: manifestContent,
                contentHash: sha256(manifestContent),
                sources: [cloneSource(plugin.source)],
            },
            ...selected.map((entry) => ({
                relativePath: entry.outputPath,
                content: Buffer.from(entry.content),
                contentHash: sha256(entry.content),
                sources: [cloneSource(entry.source)],
            })),
        ];
        files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
        packages.push({
            name: plugin.manifest.name,
            relativeRoot: `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${plugin.manifest.name}`,
            contentSha: packageContentSha(manifestContent, selected),
            manifest: plugin.manifest,
            files,
            sources: canonicalSources([plugin.source, ...selected.map((entry) => entry.source)]),
        });
    }
    packages.sort((left, right) => compareCodeUnits(left.name, right.name));
    return { blocked: false, packages, conflicts, omissions, diagnostics };
}
