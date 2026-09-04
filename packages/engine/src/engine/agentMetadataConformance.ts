/**
 * Semantic Agent Plugins conformance model.
 *
 * The Agent Plugins v1 portable core is deliberately narrow: Skills and MCP.
 * Richer metadata remains representable as a client extension, but is not
 * portable. This module describes that boundary without rewriting source files.
 */

import * as path from 'node:path';
import type { AgentPluginDisposition, MetaFlowConfig } from '../config/configSchema';
import type { CapabilityWarning, LayerContent, LayerFile } from './types';

export type AgentMetadataArtifactKind =
    | 'manifest'
    | 'skill'
    | 'mcp'
    | 'prompt'
    | 'command'
    | 'instruction'
    | 'rule'
    | 'agent'
    | 'hook'
    | 'other';

export type AgentMetadataActivation =
    | 'package'
    | 'model-or-user-invoked'
    | 'tool-invoked'
    | 'user-invoked'
    | 'always-on-or-scoped'
    | 'host-selected'
    | 'event-driven'
    | 'unknown';

export type AgentMetadataScope =
    'plugin' | 'repository' | 'directory-or-file-pattern' | 'host-defined' | 'unknown';

export type AgentMetadataStandardCoverage =
    | 'portable'
    | 'client-extension'
    | 'legacy-host'
    | 'no-equivalent'
    | 'invalid'
    | 'not-applicable';

export type AgentMetadataVendorDependency = 'none' | 'github-copilot' | 'other-host' | 'unknown';

export type AgentMetadataMigrationLoss =
    'none' | 'semantic-review' | 'known-loss' | 'not-applicable';

export type AgentMetadataStandardConstruct = 'skill' | 'mcp';

export interface AgentMetadataSemanticClassification {
    readonly layerId?: string;
    readonly sourcePath: string;
    readonly absolutePath?: string;
    readonly artifactKind: AgentMetadataArtifactKind;
    readonly activation: AgentMetadataActivation;
    readonly scope: AgentMetadataScope;
    readonly standardCoverage: AgentMetadataStandardCoverage;
    readonly vendorDependency: AgentMetadataVendorDependency;
    readonly migrationLoss: AgentMetadataMigrationLoss;
    /** Lossless package-path projection, when one exists. */
    readonly projectedV1Path?: string;
    /** A possible portable replacement; never an assertion of semantic equivalence. */
    readonly suggestedStandardConstruct?: AgentMetadataStandardConstruct;
}

export interface AgentMetadataConformanceSummary {
    readonly total: number;
    readonly portable: number;
    readonly clientExtensions: number;
    readonly legacyHost: number;
    readonly noEquivalent: number;
    readonly invalid: number;
    readonly standardConformancePercent: number;
    readonly portablePercent: number;
}

export interface AgentMetadataConformanceReport {
    readonly disposition: AgentPluginDisposition;
    readonly classifications: readonly AgentMetadataSemanticClassification[];
    readonly diagnostics: readonly CapabilityWarning[];
    readonly summary: AgentMetadataConformanceSummary;
}

export type AgentMetadataMigrationDecision =
    'keep-vendor' | 'add-standard-alongside' | 'replace-with-disclosed-loss';

export interface AgentMetadataMigrationCandidate {
    readonly id: string;
    readonly classification: AgentMetadataSemanticClassification;
    readonly allowedDecisions: readonly AgentMetadataMigrationDecision[];
}

export interface AgentMetadataMigrationOperation {
    readonly candidateId: string;
    readonly decision: AgentMetadataMigrationDecision;
    readonly action:
        | 'keep'
        | 'project-copy'
        | 'project-and-remove-source'
        | 'manual-authoring'
        | 'manual-authoring-and-remove-source';
    readonly sourcePath: string;
    readonly targetPath?: string;
    readonly disclosedLoss: AgentMetadataMigrationLoss;
}

export interface AgentMetadataMigrationPlan {
    readonly blocked: boolean;
    readonly candidates: readonly AgentMetadataMigrationCandidate[];
    readonly unresolvedCandidateIds: readonly string[];
    readonly operations: readonly AgentMetadataMigrationOperation[];
}

const COPILOT_EXTENSION_PREFIX = 'com.github.copilot/';

/**
 * Project runtime config back to its complete configured capability inventory.
 * Profile normalization marks inactive layer sources disabled; conformance audits
 * intentionally inspect those sources while continuing to respect disabled repos.
 */
export function projectConfigForAgentMetadataAudit(config: MetaFlowConfig): MetaFlowConfig {
    if (!config.layerSources) {
        return config;
    }

    return {
        ...config,
        layerSources: config.layerSources.map((source) => ({
            ...source,
            enabled: true,
        })),
    };
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function stripGitHubPrefix(value: string): { path: string; github: boolean } {
    const normalized = normalizeRelativePath(value);
    return normalized.startsWith('.github/')
        ? { path: normalized.slice('.github/'.length), github: true }
        : { path: normalized, github: false };
}

/**
 * Return the Agent Plugins v1 package path for a lossless packaging relocation.
 * This changes package shape only; it does not claim portable semantics for a
 * Copilot extension file.
 */
export function projectAgentPluginV1Path(relativePath: string): string | undefined {
    const normalized = normalizeRelativePath(relativePath);
    if (normalized.startsWith(COPILOT_EXTENSION_PREFIX)) {
        return normalized;
    }
    if (normalized === 'plugin.json' || normalized === 'mcp.json') {
        return normalized;
    }

    const stripped = stripGitHubPrefix(normalized).path;
    if (stripped.startsWith('skills/')) {
        return stripped;
    }
    if (stripped === 'hooks.json') {
        return `${COPILOT_EXTENSION_PREFIX}hooks/hooks.json`;
    }

    const mappings = [
        ['prompts/', 'prompts/'],
        ['commands/', 'commands/'],
        ['instructions/', 'rules/'],
        ['rules/', 'rules/'],
        ['agents/', 'agents/'],
        ['hooks/', 'hooks/'],
    ] as const;
    for (const [sourcePrefix, targetPrefix] of mappings) {
        if (stripped.startsWith(sourcePrefix)) {
            return `${COPILOT_EXTENSION_PREFIX}${targetPrefix}${stripped.slice(sourcePrefix.length)}`;
        }
    }

    return undefined;
}

function semanticShape(
    kind: AgentMetadataArtifactKind,
): Pick<AgentMetadataSemanticClassification, 'activation' | 'scope'> {
    switch (kind) {
        case 'manifest':
            return { activation: 'package', scope: 'plugin' };
        case 'skill':
            return { activation: 'model-or-user-invoked', scope: 'plugin' };
        case 'mcp':
            return { activation: 'tool-invoked', scope: 'plugin' };
        case 'prompt':
        case 'command':
            return { activation: 'user-invoked', scope: 'host-defined' };
        case 'instruction':
        case 'rule':
            return { activation: 'always-on-or-scoped', scope: 'directory-or-file-pattern' };
        case 'agent':
            return { activation: 'host-selected', scope: 'host-defined' };
        case 'hook':
            return { activation: 'event-driven', scope: 'host-defined' };
        default:
            return { activation: 'unknown', scope: 'unknown' };
    }
}

function kindForPath(value: string): AgentMetadataArtifactKind {
    const normalized = normalizeRelativePath(value);
    if (normalized === 'plugin.json' || normalized.endsWith('/plugin.json')) {
        return 'manifest';
    }
    if (normalized === 'mcp.json') {
        return 'mcp';
    }
    const stripped = stripGitHubPrefix(
        normalized.startsWith(COPILOT_EXTENSION_PREFIX)
            ? normalized.slice(COPILOT_EXTENSION_PREFIX.length)
            : normalized,
    ).path;
    if (/^skills\/[^/]+\/SKILL\.md$/i.test(stripped)) {
        return 'skill';
    }
    if (stripped === 'hooks.json' || stripped.startsWith('hooks/')) {
        return 'hook';
    }
    if (stripped.startsWith('prompts/')) {
        return 'prompt';
    }
    if (stripped.startsWith('commands/')) {
        return 'command';
    }
    if (stripped.startsWith('instructions/') || stripped === 'copilot-instructions.md') {
        return 'instruction';
    }
    if (stripped.startsWith('rules/')) {
        return 'rule';
    }
    if (stripped.startsWith('agents/')) {
        return 'agent';
    }
    return 'other';
}

/** Classify one source artifact without reading or mutating it. */
export function classifyAgentMetadataPath(
    relativePath: string,
    options: { layerId?: string; absolutePath?: string } = {},
): AgentMetadataSemanticClassification {
    const sourcePath = normalizeRelativePath(relativePath);
    const artifactKind = kindForPath(sourcePath);
    const shape = semanticShape(artifactKind);
    if (artifactKind === 'other') {
        return {
            ...options,
            sourcePath,
            artifactKind,
            ...shape,
            standardCoverage: 'not-applicable',
            vendorDependency: 'unknown',
            migrationLoss: 'not-applicable',
        };
    }

    const projectedV1Path = projectAgentPluginV1Path(sourcePath);
    const inCopilotExtension = sourcePath.startsWith(COPILOT_EXTENSION_PREFIX);
    const githubPath = sourcePath.startsWith('.github/');
    const portable =
        sourcePath === 'plugin.json' ||
        sourcePath === 'mcp.json' ||
        /^skills\/[^/]+\/SKILL\.md$/i.test(sourcePath);

    let standardCoverage: AgentMetadataStandardCoverage;
    let migrationLoss: AgentMetadataMigrationLoss;
    if (portable) {
        standardCoverage = 'portable';
        migrationLoss = 'none';
    } else if (inCopilotExtension) {
        standardCoverage = 'client-extension';
        migrationLoss = 'none';
    } else if (artifactKind === 'skill') {
        standardCoverage = 'legacy-host';
        migrationLoss = 'none';
    } else if (artifactKind === 'manifest') {
        standardCoverage = 'legacy-host';
        migrationLoss = 'semantic-review';
    } else {
        standardCoverage = 'no-equivalent';
        migrationLoss = 'semantic-review';
    }

    return {
        ...options,
        sourcePath,
        artifactKind,
        ...shape,
        standardCoverage,
        vendorDependency: portable
            ? 'none'
            : inCopilotExtension || githubPath || artifactKind !== 'mcp'
              ? 'github-copilot'
              : 'none',
        migrationLoss,
        ...(projectedV1Path !== undefined ? { projectedV1Path } : {}),
        ...(['prompt', 'command'].includes(artifactKind)
            ? { suggestedStandardConstruct: 'skill' as const }
            : {}),
    };
}

function sourcePathForLayerFile(layer: LayerContent, file: LayerFile): string {
    if (!layer.rootPath) {
        return normalizeRelativePath(file.relativePath);
    }
    const relative = path.relative(layer.rootPath, file.absolutePath);
    if (
        relative === '' ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        return normalizeRelativePath(file.relativePath);
    }
    return normalizeRelativePath(relative);
}

function diagnosticForClassification(
    classification: AgentMetadataSemanticClassification,
): CapabilityWarning | undefined {
    const common = {
        filePath: classification.absolutePath,
        severity: 'warning' as const,
    };
    switch (classification.standardCoverage) {
        case 'client-extension':
            return {
                code: 'AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE',
                message: `${classification.sourcePath} is a conformant client extension, but depends on GitHub Copilot and is not portable Agent Plugins v1 metadata.`,
                ...common,
            };
        case 'legacy-host':
            return classification.migrationLoss === 'none'
                ? {
                      code: 'AGENT_PLUGIN_SAFE_RELOCATION_AVAILABLE',
                      message: `${classification.sourcePath} can be packaged losslessly at ${classification.projectedV1Path}; source migration still requires an explicit keep, add, or replace decision.`,
                      ...common,
                  }
                : {
                      code: 'AGENT_PLUGIN_LEGACY_MANIFEST',
                      message: `${classification.sourcePath} uses legacy host packaging and is not an Agent Plugins v1 manifest. Preserve it unless the user explicitly selects a migration shape.`,
                      ...common,
                  };
        case 'no-equivalent':
            return {
                code: 'AGENT_METADATA_NO_STANDARD_EQUIVALENT',
                message: `${classification.sourcePath} has no direct portable Agent Plugins v1 equivalent. It can remain a GitHub Copilot extension; any conversion requires an explicit keep, add, or replace decision.`,
                ...common,
            };
        case 'invalid':
            return {
                code: 'AGENT_PLUGIN_PACKAGE_INVALID',
                message: `${classification.sourcePath} belongs to a package that does not satisfy its declared Agent Plugins contract.`,
                ...common,
            };
        default:
            return undefined;
    }
}

function summarize(
    classifications: readonly AgentMetadataSemanticClassification[],
): AgentMetadataConformanceSummary {
    const included = classifications.filter((entry) => entry.standardCoverage !== 'not-applicable');
    const count = (coverage: AgentMetadataStandardCoverage): number =>
        included.filter((entry) => entry.standardCoverage === coverage).length;
    const portable = count('portable');
    const clientExtensions = count('client-extension');
    const total = included.length;
    const percent = (value: number): number =>
        total === 0 ? 100 : Math.round((value * 100) / total);
    return {
        total,
        portable,
        clientExtensions,
        legacyHost: count('legacy-host'),
        noEquivalent: count('no-equivalent'),
        invalid: count('invalid'),
        standardConformancePercent: percent(portable + clientExtensions),
        portablePercent: percent(portable),
    };
}

function classificationIdentity(entry: AgentMetadataSemanticClassification): string {
    return `${entry.layerId ?? ''}\u0000${entry.sourcePath}`;
}

function migrationCandidateId(entry: AgentMetadataSemanticClassification): string {
    return `${entry.layerId ?? 'unscoped'}::${entry.sourcePath}`;
}

/** Audit resolved source layers while preserving every source artifact. */
export function auditAgentMetadataConformance(
    layers: readonly LayerContent[],
    disposition: AgentPluginDisposition,
): AgentMetadataConformanceReport {
    const byIdentity = new Map<string, AgentMetadataSemanticClassification>();
    const diagnostics: CapabilityWarning[] = [];

    for (const layer of layers) {
        for (const file of layer.files) {
            const classification = classifyAgentMetadataPath(sourcePathForLayerFile(layer, file), {
                layerId: layer.layerId,
                absolutePath: file.absolutePath,
            });
            byIdentity.set(classificationIdentity(classification), classification);
        }

        const inspection =
            layer.agentPluginCompatibilityInspection ??
            layer.capability?.agentPluginManifest?.compatibilityInspection;
        if (inspection) {
            const pluginIdentity = `${layer.layerId}\u0000plugin.json`;
            const existing =
                byIdentity.get(pluginIdentity) ??
                classifyAgentMetadataPath('plugin.json', {
                    layerId: layer.layerId,
                    absolutePath: path.join(inspection.pluginRoot, 'plugin.json'),
                });
            byIdentity.set(pluginIdentity, {
                ...existing,
                standardCoverage:
                    inspection.profile === 'agent-plugins-v1' && inspection.validManifest
                        ? 'portable'
                        : inspection.profile === 'legacy-host'
                          ? 'legacy-host'
                          : 'invalid',
                vendorDependency: inspection.profile === 'legacy-host' ? 'github-copilot' : 'none',
                migrationLoss:
                    inspection.profile === 'agent-plugins-v1' && inspection.validManifest
                        ? 'none'
                        : 'semantic-review',
            });

            if (disposition === 'audit-standard' && inspection.manifest?.extensions) {
                for (const namespace of Object.keys(inspection.manifest.extensions).sort()) {
                    diagnostics.push({
                        code: 'AGENT_PLUGIN_VENDOR_EXTENSION_NONPORTABLE',
                        message: `Agent Plugins extension "${namespace}" is conformant but vendor-specific and nonportable.`,
                        filePath: path.join(inspection.pluginRoot, 'plugin.json'),
                        severity: 'warning',
                    });
                }
            }
        }
    }

    const classifications = [...byIdentity.values()].sort((left, right) =>
        classificationIdentity(left).localeCompare(classificationIdentity(right)),
    );
    if (disposition === 'audit-standard') {
        for (const classification of classifications) {
            const entry = diagnosticForClassification(classification);
            if (entry) {
                diagnostics.push(entry);
            }
        }
    }

    const dedupedDiagnostics = new Map<string, CapabilityWarning>();
    for (const entry of diagnostics) {
        dedupedDiagnostics.set(
            `${entry.code}\u0000${entry.filePath ?? ''}\u0000${entry.message}`,
            entry,
        );
    }
    return {
        disposition,
        classifications,
        diagnostics: [...dedupedDiagnostics.values()],
        summary: summarize(classifications),
    };
}

/**
 * Build a non-mutating migration plan. Every candidate needs an explicit
 * decision; this API never treats a projection path as consent to rewrite or
 * delete source metadata.
 */
export function planAgentMetadataMigration(
    classifications: readonly AgentMetadataSemanticClassification[],
    decisions: Readonly<Record<string, AgentMetadataMigrationDecision>> = {},
): AgentMetadataMigrationPlan {
    const candidates = classifications
        .filter(
            (entry) =>
                entry.standardCoverage === 'legacy-host' ||
                entry.standardCoverage === 'no-equivalent',
        )
        .map((classification) => ({
            id: migrationCandidateId(classification),
            classification,
            allowedDecisions: [
                'keep-vendor',
                'add-standard-alongside',
                'replace-with-disclosed-loss',
            ] as const,
        }));
    const unresolvedCandidateIds: string[] = [];
    const operations: AgentMetadataMigrationOperation[] = [];

    for (const candidate of candidates) {
        const decision = decisions[candidate.id];
        if (!decision || !candidate.allowedDecisions.includes(decision)) {
            unresolvedCandidateIds.push(candidate.id);
            continue;
        }
        const classification = candidate.classification;
        const hasLosslessStandardProjection =
            classification.projectedV1Path !== undefined && classification.migrationLoss === 'none';
        operations.push({
            candidateId: candidate.id,
            decision,
            action:
                decision === 'keep-vendor'
                    ? 'keep'
                    : decision === 'add-standard-alongside'
                      ? hasLosslessStandardProjection
                          ? 'project-copy'
                          : 'manual-authoring'
                      : hasLosslessStandardProjection
                        ? 'project-and-remove-source'
                        : 'manual-authoring-and-remove-source',
            sourcePath: classification.sourcePath,
            ...(hasLosslessStandardProjection && classification.projectedV1Path
                ? { targetPath: classification.projectedV1Path }
                : {}),
            disclosedLoss: classification.migrationLoss,
        });
    }

    return {
        blocked: unresolvedCandidateIds.length > 0,
        candidates,
        unresolvedCandidateIds,
        operations,
    };
}
