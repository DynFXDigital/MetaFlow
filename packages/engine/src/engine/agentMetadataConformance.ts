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
    | 'client-extension'
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

export type AgentMetadataProjectionCoverage = 'portable' | 'client-extension';

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
    /** Client namespace for extension-backed metadata. */
    readonly extensionNamespace?: string;
    /** Lossless package-path projection, when one exists. */
    readonly projectedV1Path?: string;
    /** Coverage of the projected package location; client extensions remain nonportable. */
    readonly projectedV1Coverage?: AgentMetadataProjectionCoverage;
    /** Loss introduced by copying the artifact unchanged to projectedV1Path. */
    readonly packagingProjectionLoss?: 'none';
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
    readonly targetCoverage?: AgentMetadataProjectionCoverage;
    readonly disclosedLoss: AgentMetadataMigrationLoss;
}

export interface AgentMetadataMigrationConflict {
    readonly code: 'projection-target-conflict';
    readonly layerId?: string;
    readonly targetPath: string;
    readonly sourcePaths: readonly string[];
    readonly candidateIds: readonly string[];
}

export interface AgentMetadataMigrationPlan {
    readonly blocked: boolean;
    readonly candidates: readonly AgentMetadataMigrationCandidate[];
    readonly unresolvedCandidateIds: readonly string[];
    readonly operations: readonly AgentMetadataMigrationOperation[];
    readonly conflicts: readonly AgentMetadataMigrationConflict[];
}

const COPILOT_EXTENSION_NAMESPACE = 'com.github.copilot';
const COPILOT_EXTENSION_PREFIX = `${COPILOT_EXTENSION_NAMESPACE}/`;
const CLIENT_EXTENSION_NAMESPACE_PATTERN =
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function isAgentPluginExtensionNamespace(value: string): boolean {
    return CLIENT_EXTENSION_NAMESPACE_PATTERN.test(value);
}

function manifestExtensionVendorDependency(
    namespaces: readonly string[],
): AgentMetadataVendorDependency {
    if (namespaces.length === 0) {
        return 'none';
    }
    return namespaces.every((namespace) => namespace === COPILOT_EXTENSION_NAMESPACE)
        ? 'github-copilot'
        : 'other-host';
}

/** Return the reverse-domain namespace for a file-backed client extension. */
export function agentPluginExtensionNamespaceForPath(value: string): string | undefined {
    const normalized = normalizeRelativePath(value);
    const separator = normalized.indexOf('/');
    if (separator <= 0) {
        return undefined;
    }
    const namespace = normalized.slice(0, separator);
    return isAgentPluginExtensionNamespace(namespace) ? namespace : undefined;
}

function manifestExtensionSourcePath(namespace: string): string {
    const pointerSegment = namespace.replace(/~/g, '~0').replace(/\//g, '~1');
    return `plugin.json#/extensions/${pointerSegment}`;
}

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

function safeProjectionSourcePath(value: string): string | undefined {
    const posix = value.replace(/\\/g, '/');
    if (posix.includes('\0') || path.posix.isAbsolute(posix) || path.win32.isAbsolute(value)) {
        return undefined;
    }
    const withoutLeadingDot = posix.startsWith('./') ? posix.slice(2) : posix;
    const segments = withoutLeadingDot.split('/');
    if (
        segments.length === 0 ||
        segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
        return undefined;
    }
    return segments.join('/');
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
    const normalized = safeProjectionSourcePath(relativePath);
    if (!normalized) {
        return undefined;
    }
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
    if (stripped === 'copilot-instructions.md') {
        return `${COPILOT_EXTENSION_PREFIX}rules/copilot-instructions.md`;
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
        case 'client-extension':
            return { activation: 'unknown', scope: 'host-defined' };
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
    if (agentPluginExtensionNamespaceForPath(normalized)) {
        return 'client-extension';
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

    const projectedV1Path = projectAgentPluginV1Path(relativePath);
    const extensionNamespace = agentPluginExtensionNamespaceForPath(sourcePath);
    const inClientExtension = extensionNamespace !== undefined;
    const inCopilotExtension = extensionNamespace === COPILOT_EXTENSION_NAMESPACE;
    const githubPath = sourcePath.startsWith('.github/');
    const portable =
        sourcePath === 'plugin.json' ||
        sourcePath === 'mcp.json' ||
        /^skills\/[^/]+\/SKILL\.md$/i.test(sourcePath);
    const projectedV1Coverage: AgentMetadataProjectionCoverage | undefined =
        projectedV1Path !== undefined && projectedV1Path !== sourcePath
            ? artifactKind === 'skill'
                ? 'portable'
                : ['prompt', 'command', 'instruction', 'rule', 'agent', 'hook'].includes(
                        artifactKind,
                    )
                  ? 'client-extension'
                  : undefined
            : undefined;

    let standardCoverage: AgentMetadataStandardCoverage;
    let migrationLoss: AgentMetadataMigrationLoss;
    if (portable) {
        standardCoverage = 'portable';
        migrationLoss = 'none';
    } else if (inClientExtension) {
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
            : inCopilotExtension
              ? 'github-copilot'
              : inClientExtension
                ? 'other-host'
                : githubPath || artifactKind !== 'mcp'
                  ? 'github-copilot'
                  : 'none',
        migrationLoss,
        ...(extensionNamespace !== undefined ? { extensionNamespace } : {}),
        ...(projectedV1Path !== undefined ? { projectedV1Path } : {}),
        ...(projectedV1Coverage !== undefined
            ? { projectedV1Coverage, packagingProjectionLoss: 'none' as const }
            : {}),
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

function comparableAbsolutePath(value: string): string {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathAtOrBelow(candidatePath: string, parentPath: string): boolean {
    const candidate = comparableAbsolutePath(candidatePath);
    const parent = comparableAbsolutePath(parentPath);
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isStrictComponentDiagnostic(code: string): boolean {
    return code.startsWith('AGENT_PLUGIN_SKILL') || code.startsWith('AGENT_PLUGIN_MCP_');
}

function conformanceInspectionDiagnostic(
    diagnostic: CapabilityWarning,
    strictV1: boolean,
): CapabilityWarning {
    return strictV1 && isStrictComponentDiagnostic(diagnostic.code)
        ? { ...diagnostic, severity: 'error' }
        : diagnostic;
}

function diagnosticsForClassification(
    classification: AgentMetadataSemanticClassification,
    projectionConflicts: boolean,
): readonly CapabilityWarning[] {
    const common = {
        filePath: classification.absolutePath,
        severity: 'warning' as const,
    };
    const safeRelocation =
        !projectionConflicts &&
        classification.packagingProjectionLoss === 'none' &&
        classification.projectedV1Path
            ? {
                  code: 'AGENT_PLUGIN_SAFE_RELOCATION_AVAILABLE',
                  message: `${classification.sourcePath} can be packaged unchanged at ${classification.projectedV1Path} as a ${classification.projectedV1Coverage}; source migration still requires an explicit keep, add, or replace decision.`,
                  ...common,
              }
            : undefined;
    const migrationReview =
        classification.migrationLoss === 'semantic-review' ||
        classification.migrationLoss === 'known-loss'
            ? {
                  code: 'AGENT_METADATA_MIGRATION_LOSS_REVIEW',
                  message: `${classification.sourcePath} has migration loss classified as ${classification.migrationLoss}; no semantic conversion or source removal is authorized without an explicit decision.`,
                  ...common,
              }
            : undefined;
    switch (classification.standardCoverage) {
        case 'client-extension': {
            const manifestExtension = classification.sourcePath.startsWith(
                'plugin.json#/extensions/',
            );
            const dependency =
                classification.vendorDependency === 'github-copilot'
                    ? 'GitHub Copilot'
                    : classification.extensionNamespace
                      ? `the ${classification.extensionNamespace} client namespace`
                      : 'a client-specific host';
            return [
                {
                    code: manifestExtension
                        ? 'AGENT_PLUGIN_VENDOR_EXTENSION_NONPORTABLE'
                        : 'AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE',
                    message: manifestExtension
                        ? `Agent Plugins extension "${classification.extensionNamespace}" is conformant but vendor-specific and nonportable.`
                        : `${classification.sourcePath} is a conformant client extension, but depends on ${dependency} and is not portable Agent Plugins v1 metadata.`,
                    ...common,
                },
            ];
        }
        case 'legacy-host':
            return safeRelocation
                ? [safeRelocation]
                : [
                      {
                          code: 'AGENT_PLUGIN_LEGACY_MANIFEST',
                          message: `${classification.sourcePath} uses legacy host packaging and is not an Agent Plugins v1 manifest. Preserve it unless the user explicitly selects a migration shape.`,
                          ...common,
                      },
                      ...(migrationReview ? [migrationReview] : []),
                  ];
        case 'no-equivalent':
            return [
                {
                    code: 'AGENT_METADATA_NO_STANDARD_EQUIVALENT',
                    message: `${classification.sourcePath} has no direct portable Agent Plugins v1 equivalent. It can remain a GitHub Copilot extension; any semantic conversion requires an explicit review decision.`,
                    ...common,
                },
                ...(migrationReview ? [migrationReview] : []),
                ...(safeRelocation ? [safeRelocation] : []),
            ];
        case 'invalid':
            if (
                classification.artifactKind === 'client-extension' &&
                classification.extensionNamespace
            ) {
                return [
                    {
                        code: 'AGENT_PLUGIN_EXTENSION_NAMESPACE_INVALID',
                        message: `plugin.json extension key "${classification.extensionNamespace}" is not a reverse-domain client namespace and is not Agent Plugins v1-conformant. Preserve it until a reviewed correction is selected.`,
                        filePath: classification.absolutePath,
                        severity: 'warning',
                    },
                ];
            }
            return [
                {
                    code: 'AGENT_PLUGIN_PACKAGE_INVALID',
                    message: `${classification.sourcePath} belongs to a package that does not satisfy its declared Agent Plugins contract.`,
                    filePath: classification.absolutePath,
                    severity: 'error',
                },
            ];
        default:
            return [];
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

interface PackagingProjectionCollision {
    readonly layerId?: string;
    readonly targetPath: string;
    readonly classifications: readonly AgentMetadataSemanticClassification[];
}

function packagingProjectionCollisions(
    classifications: readonly AgentMetadataSemanticClassification[],
): readonly PackagingProjectionCollision[] {
    const groups = new Map<string, AgentMetadataSemanticClassification[]>();
    for (const classification of classifications) {
        if (classification.packagingProjectionLoss !== 'none' || !classification.projectedV1Path) {
            continue;
        }
        const key = `${classification.layerId ?? ''}\u0000${classification.projectedV1Path}`;
        const entries = groups.get(key) ?? [];
        entries.push(classification);
        groups.set(key, entries);
    }
    return [...groups.values()]
        .filter((entries) => entries.length > 1)
        .map((entries) => ({
            ...(entries[0].layerId !== undefined ? { layerId: entries[0].layerId } : {}),
            targetPath: entries[0].projectedV1Path as string,
            classifications: entries,
        }));
}

/** Audit resolved source layers while preserving every source artifact. */
export function auditAgentMetadataConformance(
    layers: readonly LayerContent[],
    disposition: AgentPluginDisposition,
): AgentMetadataConformanceReport {
    const byIdentity = new Map<string, AgentMetadataSemanticClassification>();
    const diagnostics: CapabilityWarning[] = [];

    for (const layer of layers) {
        for (const file of layer.agentMetadataFiles ?? layer.files) {
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
            const strictV1 = inspection.profile === 'agent-plugins-v1';
            const strictV1Manifest = strictV1 && inspection.validManifest;
            const manifestExtensionNamespaces = Object.keys(
                inspection.manifest?.extensions ?? {},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostics.map((entry) =>
                conformanceInspectionDiagnostic(entry, strictV1),
            );
            const pluginIdentity = `${layer.layerId}\u0000plugin.json`;
            const existing =
                byIdentity.get(pluginIdentity) ??
                classifyAgentMetadataPath('plugin.json', {
                    layerId: layer.layerId,
                    absolutePath: path.join(inspection.pluginRoot, 'plugin.json'),
                });
            byIdentity.set(pluginIdentity, {
                ...existing,
                standardCoverage: strictV1Manifest
                    ? 'portable'
                    : inspection.profile === 'legacy-host'
                      ? 'legacy-host'
                      : 'invalid',
                vendorDependency: inspection.profile === 'legacy-host' ? 'github-copilot' : 'none',
                migrationLoss: strictV1Manifest ? 'none' : 'semantic-review',
            });

            if (strictV1Manifest) {
                for (const namespace of manifestExtensionNamespaces) {
                    const validNamespace = isAgentPluginExtensionNamespace(namespace);
                    const extensionClassification: AgentMetadataSemanticClassification = {
                        layerId: layer.layerId,
                        sourcePath: manifestExtensionSourcePath(namespace),
                        absolutePath: path.join(inspection.pluginRoot, 'plugin.json'),
                        artifactKind: 'client-extension',
                        ...semanticShape('client-extension'),
                        standardCoverage: validNamespace ? 'client-extension' : 'invalid',
                        vendorDependency: validNamespace
                            ? manifestExtensionVendorDependency([namespace])
                            : 'unknown',
                        migrationLoss: validNamespace ? 'none' : 'semantic-review',
                        extensionNamespace: namespace,
                    };
                    byIdentity.set(
                        classificationIdentity(extensionClassification),
                        extensionClassification,
                    );
                }
            }

            const invalidComponentLocations = inspectionDiagnostics
                .filter(
                    (entry) =>
                        entry.severity === 'error' &&
                        entry.filePath !== undefined &&
                        isStrictComponentDiagnostic(entry.code),
                )
                .map((entry) => entry.filePath as string);
            for (const [identity, classification] of byIdentity) {
                if (
                    classification.layerId === layer.layerId &&
                    classification.absolutePath &&
                    invalidComponentLocations.some((invalidPath) =>
                        isPathAtOrBelow(classification.absolutePath as string, invalidPath),
                    )
                ) {
                    byIdentity.set(identity, {
                        ...classification,
                        standardCoverage: 'invalid',
                        migrationLoss: 'semantic-review',
                    });
                }
            }

            if (disposition === 'audit-standard') {
                diagnostics.push(...inspectionDiagnostics);
            }
        }
    }

    const classifications = [...byIdentity.values()].sort((left, right) =>
        classificationIdentity(left).localeCompare(classificationIdentity(right)),
    );
    if (disposition === 'audit-standard') {
        const projectionCollisions = packagingProjectionCollisions(classifications);
        const conflictingClassifications = new Set(
            projectionCollisions.flatMap((collision) =>
                collision.classifications.map(classificationIdentity),
            ),
        );
        for (const collision of projectionCollisions) {
            diagnostics.push({
                code: 'AGENT_PLUGIN_PROJECTION_TARGET_CONFLICT',
                message: `${collision.classifications.map((entry) => entry.sourcePath).join(', ')} all project to ${collision.targetPath}; this package relocation is not safe until the user resolves the collision.`,
                filePath: collision.classifications[0].absolutePath,
                severity: 'warning',
            });
        }
        for (const classification of classifications) {
            for (const entry of diagnosticsForClassification(
                classification,
                conflictingClassifications.has(classificationIdentity(classification)),
            )) {
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
        const hasLosslessPackagingProjection =
            classification.projectedV1Path !== undefined &&
            classification.packagingProjectionLoss === 'none';
        const usesPackagingProjection =
            decision !== 'keep-vendor' && hasLosslessPackagingProjection;
        const disclosedLoss: AgentMetadataMigrationLoss =
            decision === 'keep-vendor'
                ? 'not-applicable'
                : usesPackagingProjection
                  ? decision === 'replace-with-disclosed-loss'
                      ? 'known-loss'
                      : 'none'
                  : classification.migrationLoss;
        operations.push({
            candidateId: candidate.id,
            decision,
            action:
                decision === 'keep-vendor'
                    ? 'keep'
                    : decision === 'add-standard-alongside'
                      ? hasLosslessPackagingProjection
                          ? 'project-copy'
                          : 'manual-authoring'
                      : hasLosslessPackagingProjection
                        ? 'project-and-remove-source'
                        : 'manual-authoring-and-remove-source',
            sourcePath: classification.sourcePath,
            ...(usesPackagingProjection && classification.projectedV1Path
                ? {
                      targetPath: classification.projectedV1Path,
                      targetCoverage: classification.projectedV1Coverage,
                  }
                : {}),
            disclosedLoss,
        });
    }

    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const operationClassifications = operations
        .filter((operation) => operation.targetPath !== undefined)
        .map((operation) => candidateById.get(operation.candidateId)?.classification)
        .filter(
            (classification): classification is AgentMetadataSemanticClassification =>
                classification !== undefined,
        );
    const conflicts: AgentMetadataMigrationConflict[] = packagingProjectionCollisions(
        operationClassifications,
    ).map((collision) => ({
        code: 'projection-target-conflict',
        ...(collision.layerId !== undefined ? { layerId: collision.layerId } : {}),
        targetPath: collision.targetPath,
        sourcePaths: collision.classifications.map((entry) => entry.sourcePath),
        candidateIds: collision.classifications.map(migrationCandidateId),
    }));

    return {
        blocked: unresolvedCandidateIds.length > 0 || conflicts.length > 0,
        candidates,
        unresolvedCandidateIds,
        operations,
        conflicts,
    };
}
