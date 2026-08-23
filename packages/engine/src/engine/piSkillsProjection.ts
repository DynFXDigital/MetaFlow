/**
 * Pure aggregate projection for MetaFlow's project-local Pi Agent Plugin.
 *
 * Callers provide already validated Agent Skill bytes from the resolved active
 * capability view. This module performs no filesystem I/O and never emits MCP
 * configuration or host-specific metadata.
 */

import { createHash } from 'crypto';
import {
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    isValidAgentSkillName,
    validateAgentSkillContent,
} from './agentPluginCompatibility';
import type { CapabilityDiagnosticSeverity, CapabilityWarning } from './types';

export const PI_PROJECT_PLUGIN_NAME = 'metaflow.project';
export const PI_PROJECT_PLUGIN_BASE_VERSION = '0.1.0';
export const PI_SKILLS_PROJECTION_SCHEMA = 'metaflow.pi-skills-projection.v1';

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

export type PiProjectionOmissionReason =
    'non-portable' | 'mcp-deferred' | 'invalid-source' | 'unsupported-profile' | 'duplicate-skill';

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
    readonly skills: readonly PiSkillProjectionInput[];
    readonly omissions?: readonly PiProjectionOmission[];
    readonly diagnostics?: readonly PiSkillsProjectionDiagnostic[];
}

export interface PiSkillsProjectionConflict {
    readonly skillName: string;
    readonly outputPath: string;
    readonly contenders: readonly PiSkillsProjectionSource[];
}

export interface PiProjectedFile {
    readonly relativePath: string;
    readonly content: Uint8Array;
    readonly contentHash: string;
    readonly sources: readonly PiSkillsProjectionSource[];
}

export interface PiAgentPluginManifest {
    readonly $schema: typeof AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID;
    readonly name: typeof PI_PROJECT_PLUGIN_NAME;
    readonly version: string;
}

export interface PiSkillsProjectionPackage {
    readonly contentSha: string;
    readonly version: string;
    readonly manifest: PiAgentPluginManifest;
    readonly files: readonly PiProjectedFile[];
}

interface PiSkillsProjectionResultBase {
    readonly diagnostics: readonly PiSkillsProjectionDiagnostic[];
    readonly omissions: readonly PiProjectionOmission[];
    readonly conflicts: readonly PiSkillsProjectionConflict[];
}

export type PiSkillsProjectionResult =
    | (PiSkillsProjectionResultBase & {
          readonly blocked: false;
          readonly package: PiSkillsProjectionPackage;
      })
    | (PiSkillsProjectionResultBase & {
          readonly blocked: true;
          readonly package?: undefined;
      });

function compareCodeUnits(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
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
        'mcp-deferred': 'Pi MCP output is deferred pending changed-definition trust proof',
        'invalid-source': 'the source artifact did not pass compatibility validation',
        'unsupported-profile':
            'the source package does not use the supported Agent Plugins profile',
        'duplicate-skill': 'the skill name conflicts with another active capability',
    };
    const codeByKind: Readonly<Record<PiProjectionOmissionReason, string>> = {
        'non-portable': 'PI_AGENT_PLUGIN_PROJECTION_ARTIFACT_NON_PORTABLE',
        'mcp-deferred': 'PI_AGENT_PLUGIN_PROJECTION_MCP_DEFERRED',
        'invalid-source': 'PI_AGENT_PLUGIN_PROJECTION_SOURCE_OMITTED',
        'unsupported-profile': 'PI_AGENT_PLUGIN_PROJECTION_SOURCE_OMITTED',
        'duplicate-skill': 'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE',
    };
    return diagnostic(
        codeByKind[omission.reason],
        `Artifact "${omission.source.sourcePath}" from capability "${omission.source.capabilityId}" was omitted because ${reasonByKind[omission.reason]}.`,
        omission.reason === 'duplicate-skill' ? 'error' : 'info',
        omission.source,
        omission.outputPath,
    );
}

function sha256(content: Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}

function toBytes(content: Uint8Array): Buffer {
    return Buffer.from(content);
}

function decodeUtf8(content: Uint8Array): string | undefined {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
        return undefined;
    }
}

function projectionContentSha(skills: readonly { outputPath: string; content: Buffer }[]): string {
    const hash = createHash('sha256');
    hash.update(PI_SKILLS_PROJECTION_SCHEMA, 'utf8');
    hash.update('\u0000');
    hash.update(AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, 'utf8');
    hash.update('\u0000');
    hash.update(PI_PROJECT_PLUGIN_NAME, 'utf8');
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
 * Build the deterministic skills-only package for `.pi/plugins/metaflow.project`.
 * Duplicate valid skill names block the complete package; invalid individual
 * inputs are omitted without suppressing independently valid skills.
 */
export function projectPiAgentPluginSkills(
    input: PiSkillsProjectionInput,
): PiSkillsProjectionResult {
    const diagnostics = (input.diagnostics ?? []).map(cloneInputDiagnostic);
    const omissions = (input.omissions ?? []).map(cloneOmission);
    for (const omission of omissions) {
        diagnostics.push(omissionDiagnostic(omission));
    }

    const candidates: Array<{
        name: string;
        outputPath: string;
        content: Buffer;
        source: PiSkillsProjectionSource;
    }> = [];
    for (const skill of input.skills) {
        const source = cloneSource(skill.source);
        if (!isValidAgentSkillName(skill.name)) {
            const omission: PiProjectionOmission = {
                artifactType: 'skill',
                reason: 'invalid-source',
                source,
            };
            omissions.push(omission);
            diagnostics.push(
                diagnostic(
                    'PI_AGENT_PLUGIN_PROJECTION_SKILL_NAME_INVALID',
                    `Skill "${skill.name}" from capability "${source.capabilityId}" was omitted because its name is not a valid Agent Skill name.`,
                    'warning',
                    source,
                ),
            );
            continue;
        }
        const outputPath = `skills/${skill.name}/SKILL.md`;
        const content = toBytes(skill.content);
        const decoded = decodeUtf8(content);
        const validation = decoded ? validateAgentSkillContent(skill.name, decoded) : undefined;
        if (!validation?.valid) {
            const omission: PiProjectionOmission = {
                artifactType: 'skill',
                reason: 'invalid-source',
                source,
                outputPath,
            };
            omissions.push(omission);
            diagnostics.push(
                diagnostic(
                    'PI_AGENT_PLUGIN_PROJECTION_SKILL_INVALID',
                    `Skill "${skill.name}" from capability "${source.capabilityId}" was omitted because its SKILL.md bytes do not satisfy Agent Skills metadata requirements.`,
                    'warning',
                    source,
                    outputPath,
                ),
            );
            continue;
        }
        candidates.push({
            name: skill.name,
            outputPath,
            content,
            source,
        });
    }

    candidates.sort(
        (left, right) =>
            compareCodeUnits(left.outputPath, right.outputPath) ||
            compareSources(left.source, right.source),
    );
    const grouped = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
        const entries = grouped.get(candidate.name) ?? [];
        entries.push(candidate);
        grouped.set(candidate.name, entries);
    }

    const conflicts: PiSkillsProjectionConflict[] = [];
    for (const [skillName, entries] of grouped) {
        if (entries.length < 2) {
            continue;
        }
        const outputPath = entries[0].outputPath;
        const contenders = entries.map((entry) => cloneSource(entry.source)).sort(compareSources);
        conflicts.push({ skillName, outputPath, contenders });
        for (const entry of entries) {
            const omission: PiProjectionOmission = {
                artifactType: 'skill',
                reason: 'duplicate-skill',
                source: cloneSource(entry.source),
                outputPath,
            };
            omissions.push(omission);
        }
        diagnostics.push(
            diagnostic(
                'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE',
                `Skill "${skillName}" has multiple active sources: ${contenders.map(sourceLabel).join(', ')}. Resolve the duplicate before reconciling the Pi package.`,
                'error',
                undefined,
                outputPath,
            ),
        );
    }

    conflicts.sort((left, right) => compareCodeUnits(left.outputPath, right.outputPath));
    omissions.sort(compareOmissions);
    diagnostics.sort(compareDiagnostics);
    if (conflicts.length > 0) {
        return {
            blocked: true,
            conflicts,
            omissions,
            diagnostics,
        };
    }

    const selected = candidates.filter((candidate) => grouped.get(candidate.name)?.length === 1);
    const contentSha = projectionContentSha(selected);
    const version = `${PI_PROJECT_PLUGIN_BASE_VERSION}+${contentSha}`;
    const manifest: PiAgentPluginManifest = {
        $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
        name: PI_PROJECT_PLUGIN_NAME,
        version,
    };
    const manifestContent = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const allSources = selected.map((entry) => cloneSource(entry.source)).sort(compareSources);
    const files: PiProjectedFile[] = [
        {
            relativePath: 'plugin.json',
            content: manifestContent,
            contentHash: sha256(manifestContent),
            sources: allSources,
        },
        ...selected.map((entry) => ({
            relativePath: entry.outputPath,
            content: Buffer.from(entry.content),
            contentHash: sha256(entry.content),
            sources: [cloneSource(entry.source)],
        })),
    ];
    files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));

    return {
        blocked: false,
        package: {
            contentSha,
            version,
            manifest,
            files,
        },
        conflicts,
        omissions,
        diagnostics,
    };
}
