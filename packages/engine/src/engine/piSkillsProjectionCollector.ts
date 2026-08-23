/**
 * Filesystem adapter from resolved MetaFlow layers to the pure Pi projector.
 *
 * This module reads only Agent Skills already accepted by the strict portable
 * compatibility inspector. Reads use a file handle and compare file identity
 * and filesystem-resolved containment before and after reading. The pure
 * projector then revalidates the exact bytes before emitting output.
 *
 * This closes ordinary replacement races but does not claim a security boundary
 * against an adversary with concurrent control of the source filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getArtifactType } from './artifactType';
import type { AgentPluginCompatibilityInspection } from './agentPluginCompatibility';
import {
    PiProjectionOmission,
    PiSkillProjectionInput,
    PiSkillsProjectionDiagnostic,
    PiSkillsProjectionInput,
    PiSkillsProjectionResult,
    PiSkillsProjectionSource,
    projectPiAgentPluginSkills,
} from './piSkillsProjection';
import type { CapabilityWarning, LayerContent, LayerFile } from './types';

function compareCodeUnits(left: string, right: string): number {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

function normalizePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function canonicalKey(value: string): string {
    const normalized = path.normalize(value);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isInside(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
}

function sourceIdentity(source: PiSkillsProjectionSource): string {
    return [source.repoId ?? '', source.layerId, source.capabilityId, source.sourcePath].join(
        '\u0000',
    );
}

function baseSource(layer: LayerContent, sourcePath: string): PiSkillsProjectionSource {
    return {
        layerId: layer.layerId,
        ...(layer.repoId !== undefined ? { repoId: layer.repoId } : {}),
        capabilityId: layer.capability?.id ?? layer.capabilityId ?? layer.layerId,
        ...(layer.capability?.name !== undefined ? { capabilityName: layer.capability.name } : {}),
        sourcePath: normalizePath(sourcePath),
    };
}

function packageRoot(layer: LayerContent): string | undefined {
    if (layer.rootPath) {
        return layer.rootPath;
    }
    const inspection =
        layer.agentPluginCompatibilityInspection ??
        layer.capability?.agentPluginManifest?.compatibilityInspection;
    if (inspection) {
        return inspection.pluginRoot;
    }
    const manifestPath = layer.capability?.manifestPath;
    return manifestPath ? path.dirname(manifestPath) : undefined;
}

function relativeSourcePath(
    rootPath: string | undefined,
    value: string,
    fallbackPath: string,
): string {
    if (!rootPath) {
        return normalizePath(fallbackPath);
    }
    const relative = path.relative(rootPath, value);
    if (relative === '') {
        return '.';
    }
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return normalizePath(fallbackPath);
    }
    return normalizePath(relative);
}

function layerFileSourcePath(rootPath: string | undefined, file: LayerFile): string {
    return rootPath
        ? relativeSourcePath(rootPath, path.resolve(file.absolutePath), file.relativePath)
        : normalizePath(file.relativePath);
}

function sameFileIdentity(left: fs.Stats, right: fs.Stats): boolean {
    if (left.dev !== right.dev || left.ino !== right.ino) {
        return false;
    }
    if (left.ino !== 0 || right.ino !== 0) {
        return true;
    }
    return (
        left.size === right.size &&
        left.birthtimeMs === right.birthtimeMs &&
        left.mtimeMs === right.mtimeMs
    );
}

function readContainedSkill(
    pluginRoot: string,
    skillPath: string,
): { content: Buffer; realPath: string } {
    const realRoot = fs.realpathSync(pluginRoot);
    if (!fs.statSync(realRoot).isDirectory()) {
        throw new Error('plugin root is not a directory');
    }
    const beforePath = fs.realpathSync(skillPath);
    const beforeStats = fs.statSync(beforePath);
    if (!isInside(realRoot, beforePath) || !beforeStats.isFile()) {
        throw new Error('SKILL.md is not a contained regular file');
    }
    const descriptor = fs.openSync(beforePath, 'r');
    try {
        const openedStats = fs.fstatSync(descriptor);
        if (!openedStats.isFile() || !sameFileIdentity(beforeStats, openedStats)) {
            throw new Error('SKILL.md identity changed before it was read');
        }
        const content = fs.readFileSync(descriptor);
        const afterRoot = fs.realpathSync(pluginRoot);
        const afterPath = fs.realpathSync(skillPath);
        const afterStats = fs.statSync(afterPath);
        if (
            canonicalKey(realRoot) !== canonicalKey(afterRoot) ||
            canonicalKey(beforePath) !== canonicalKey(afterPath) ||
            !isInside(afterRoot, afterPath) ||
            !afterStats.isFile() ||
            !sameFileIdentity(openedStats, afterStats)
        ) {
            throw new Error('SKILL.md containment or identity changed while it was read');
        }
        return { content, realPath: afterPath };
    } finally {
        fs.closeSync(descriptor);
    }
}

function stableDiagnosticMessage(warning: CapabilityWarning): string {
    switch (warning.code) {
        case 'AGENT_PLUGIN_ROOT_INVALID':
            return 'Plugin root is unavailable or invalid.';
        case 'AGENT_PLUGIN_MANIFEST_PATH_INVALID':
            return 'plugin.json is unavailable, outside the package root, or not a regular file.';
        case 'AGENT_PLUGIN_MANIFEST_JSON_INVALID':
            return 'plugin.json could not be read as a valid JSON object.';
        case 'AGENT_PLUGIN_SKILLS_LOCATION_INVALID':
            return 'skills/ is unavailable, outside the package root, or not a directory.';
        case 'AGENT_PLUGIN_SKILLS_READ_FAILED':
            return 'skills/ could not be read.';
        case 'AGENT_PLUGIN_SKILL_PATH_INVALID':
        case 'AGENT_PLUGIN_SKILL_READ_FAILED':
            return warning.message.replace(/:.*$/, '.');
        case 'AGENT_PLUGIN_MCP_LOCATION_INVALID':
            return 'mcp.json is unavailable, outside the package root, or not a regular file.';
        case 'AGENT_PLUGIN_MCP_JSON_INVALID':
            return 'mcp.json could not be read as a valid JSON object.';
        case 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING':
            return 'The capability enables agent-plugin packaging, but plugin.json is missing at the package root.';
        default:
            return warning.message;
    }
}

function diagnosticFallbackPath(code: string): string {
    if (code.includes('_MCP_')) {
        return 'mcp.json';
    }
    if (code.includes('_SKILL')) {
        return 'skills';
    }
    return 'plugin.json';
}

function mapDiagnostic(
    layer: LayerContent,
    rootPath: string | undefined,
    warning: CapabilityWarning,
): PiSkillsProjectionDiagnostic {
    const sourcePath = warning.filePath
        ? relativeSourcePath(rootPath, warning.filePath, diagnosticFallbackPath(warning.code))
        : 'plugin.json';
    return {
        code: warning.code,
        message: stableDiagnosticMessage(warning),
        ...(warning.filePath !== undefined ? { filePath: sourcePath } : {}),
        ...(warning.severity !== undefined ? { severity: warning.severity } : {}),
        source: baseSource(layer, sourcePath),
    };
}

function collectDiagnostics(
    layer: LayerContent,
    inspection: AgentPluginCompatibilityInspection | undefined,
    rootPath: string | undefined,
): PiSkillsProjectionDiagnostic[] {
    const warnings = [
        ...(layer.capability?.warnings.filter(
            (warning) => warning.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING',
        ) ?? []),
        ...(inspection?.diagnostics ?? []),
    ];
    const seen = new Set<string>();
    const diagnostics: PiSkillsProjectionDiagnostic[] = [];
    for (const warning of warnings) {
        const key = [warning.code, warning.filePath ?? '', warning.message].join('\u0000');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        diagnostics.push(mapDiagnostic(layer, rootPath, warning));
    }
    return diagnostics;
}

function omissionKey(omission: PiProjectionOmission): string {
    return [
        omission.reason,
        omission.artifactType,
        omission.outputPath ?? '',
        sourceIdentity(omission.source),
    ].join('\u0000');
}

function diagnosticKey(diagnostic: PiSkillsProjectionDiagnostic): string {
    return [
        diagnostic.code,
        diagnostic.outputPath ?? '',
        diagnostic.source ? sourceIdentity(diagnostic.source) : '',
        diagnostic.filePath ?? '',
        diagnostic.message,
    ].join('\u0000');
}

function compareSkills(left: PiSkillProjectionInput, right: PiSkillProjectionInput): number {
    return (
        compareCodeUnits(left.name, right.name) ||
        compareCodeUnits(sourceIdentity(left.source), sourceIdentity(right.source))
    );
}

function compareOmissions(left: PiProjectionOmission, right: PiProjectionOmission): number {
    return compareCodeUnits(omissionKey(left), omissionKey(right));
}

function compareDiagnostics(
    left: PiSkillsProjectionDiagnostic,
    right: PiSkillsProjectionDiagnostic,
): number {
    return compareCodeUnits(diagnosticKey(left), diagnosticKey(right));
}

function addLayerArtifactOmissions(
    layer: LayerContent,
    rootPath: string | undefined,
    handledSkillPaths: ReadonlySet<string>,
    omissions: PiProjectionOmission[],
): void {
    for (const file of layer.files) {
        if (handledSkillPaths.has(canonicalKey(path.resolve(file.absolutePath)))) {
            continue;
        }
        let realFileKey: string | undefined;
        try {
            realFileKey = canonicalKey(fs.realpathSync(file.absolutePath));
        } catch {
            // Missing or dangling source files are still represented as omissions below.
        }
        if (realFileKey && handledSkillPaths.has(realFileKey)) {
            continue;
        }
        const sourcePath = layerFileSourcePath(rootPath, file);
        const portableSkillDescriptor = /^skills\/[^/]+\/SKILL\.md$/.test(sourcePath);
        omissions.push({
            artifactType: getArtifactType(sourcePath),
            reason: portableSkillDescriptor ? 'invalid-source' : 'non-portable',
            source: baseSource(layer, sourcePath),
        });
    }
}

/** Collect exact skill bytes, compatibility diagnostics, and explicit omissions. */
export function collectPiSkillsProjectionInput(
    layers: readonly LayerContent[],
): PiSkillsProjectionInput {
    const skills: PiSkillProjectionInput[] = [];
    const omissions: PiProjectionOmission[] = [];
    const diagnostics: PiSkillsProjectionDiagnostic[] = [];

    for (const layer of layers) {
        const capability = layer.capability;
        const pluginManifest = capability?.agentPluginManifest;
        const inspection =
            layer.agentPluginCompatibilityInspection ?? pluginManifest?.compatibilityInspection;
        const rootPath = packageRoot(layer);
        diagnostics.push(...collectDiagnostics(layer, inspection, rootPath));

        const portable =
            capability?.agentPlugin !== false &&
            inspection?.profile === 'agent-plugins-v1' &&
            inspection.validManifest;
        const handledSkillPaths = new Set<string>();
        if (portable && inspection && rootPath) {
            for (const skill of inspection.validSkills) {
                const sourcePath = relativeSourcePath(
                    rootPath,
                    skill.skillPath,
                    `skills/${skill.name}/SKILL.md`,
                );
                const source = baseSource(layer, sourcePath);
                handledSkillPaths.add(canonicalKey(path.resolve(skill.skillPath)));
                try {
                    const read = readContainedSkill(rootPath, skill.skillPath);
                    handledSkillPaths.add(canonicalKey(read.realPath));
                    skills.push({ name: skill.name, content: read.content, source });
                } catch {
                    omissions.push({
                        artifactType: 'skills',
                        reason: 'invalid-source',
                        source,
                        outputPath: `skills/${skill.name}/SKILL.md`,
                    });
                    diagnostics.push({
                        code: 'PI_AGENT_PLUGIN_PROJECTION_SKILL_READ_FAILED',
                        message: `Skill "${skill.name}" from capability "${source.capabilityId}" could not be read and revalidated within its package root, so it was omitted.`,
                        filePath: sourcePath,
                        severity: 'warning',
                        outputPath: `skills/${skill.name}/SKILL.md`,
                        source,
                    });
                }
            }

            const mcpPath = path.join(rootPath, 'mcp.json');
            if (fs.existsSync(mcpPath)) {
                omissions.push({
                    artifactType: 'mcp',
                    reason: 'mcp-deferred',
                    source: baseSource(layer, 'mcp.json'),
                });
            }
            for (const field of inspection.recognizedHostFields) {
                omissions.push({
                    artifactType: 'manifest-field',
                    reason: 'non-portable',
                    source: baseSource(layer, `plugin.json#${field}`),
                });
            }
        } else if (inspection || pluginManifest || capability?.agentPlugin === true) {
            omissions.push({
                artifactType: 'plugin',
                reason:
                    inspection?.profile === 'invalid' || !inspection
                        ? 'invalid-source'
                        : 'unsupported-profile',
                source: baseSource(layer, 'plugin.json'),
            });
            for (const field of inspection?.recognizedHostFields ?? []) {
                omissions.push({
                    artifactType: 'manifest-field',
                    reason: 'non-portable',
                    source: baseSource(layer, `plugin.json#${field}`),
                });
            }
        }

        addLayerArtifactOmissions(layer, rootPath, handledSkillPaths, omissions);
    }

    const uniqueOmissions = new Map<string, PiProjectionOmission>();
    for (const omission of omissions) {
        uniqueOmissions.set(omissionKey(omission), omission);
    }
    const uniqueDiagnostics = new Map<string, PiSkillsProjectionDiagnostic>();
    for (const entry of diagnostics) {
        uniqueDiagnostics.set(diagnosticKey(entry), entry);
    }
    skills.sort(compareSkills);
    const sortedOmissions = [...uniqueOmissions.values()].sort(compareOmissions);
    const sortedDiagnostics = [...uniqueDiagnostics.values()].sort(compareDiagnostics);

    return {
        skills,
        omissions: sortedOmissions,
        diagnostics: sortedDiagnostics,
    };
}

/** Collect from resolved active layers and invoke the pure skills-only projector. */
export function projectResolvedPiAgentPluginSkills(
    layers: readonly LayerContent[],
): PiSkillsProjectionResult {
    return projectPiAgentPluginSkills(collectPiSkillsProjectionInput(layers));
}
