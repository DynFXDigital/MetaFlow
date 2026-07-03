/**
 * Layer resolution engine.
 *
 * Resolves layers in precedence order and builds the effective file map.
 * Later layers override earlier layers for same-path files.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as path from 'path';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import {
    MetaFlowConfig,
    MetadataRepo,
    NamedMetadataRepo,
    LayerSource,
} from '../config/configSchema';
import {
    resolvePathFromWorkspace,
    isWithinBoundary,
    normalizeInputPath,
} from '../config/configPathUtils';
import {
    CapabilityDiagnosticSeverity,
    CapabilityMetadata,
    CapabilityWarning,
    EffectiveFile,
    LayerContent,
    LayerFile,
    PackageManifestMetadata,
    TargetCapabilityConcept,
    TargetCapabilityMatrixEntry,
} from './types';
import { loadCapabilityManifestForLayer } from './capabilityManifest';
import { loadPolicyGrantsForLayer } from './policyGrant';
import { loadMcpServersForLayer } from './mcpServer';
import { loadHooksForLayer } from './hookManifest';
import { loadExecutionProfilesForLayer } from './executionProfile';
import { loadMemoryScopesForLayer } from './memoryScope';
import { loadEvaluationProfilesForLayer } from './evaluationProfile';
import {
    codexAgentProfileDestination,
    githubCopilotAgentProfileDestination,
    loadAgentProfilesForLayer,
    renderCodexAgentProfileToml,
    renderGitHubCopilotAgentProfileMarkdown,
} from './agentProfile';
import { loadInstructionsForLayer, loadPromptsForLayer } from './contentManifest';
import { loadSkillsForLayer } from './skillManifest';
import { loadCodexProjectConfigsForLayer } from './codexProjectConfig';
import { loadPackageManifestsForLayer, PackageReferenceIndex } from './packageManifest';
import { loadToolsForLayer } from './toolManifest';
import { renderCodexConfigProjection } from './codexConfigProjection';
import {
    codexHookProjectionDestination,
    renderCodexHooksJson,
} from './codexHookProjection';
import { loadTargetAdaptersForLayer } from './targetAdapter';
import { getTargetCapabilityMatrix } from './targetCapabilityMatrix';
import {
    isCodexProjectConfigPath,
    isCodexProjectInstructionPath,
    isCodexRepositorySkillPath,
    isCodexWorktreeIncludePath,
} from './codexPaths';

const KNOWN_ARTIFACT_ROOTS = new Set([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'hooks',
    'chatmodes',
]);

const KNOWN_GITHUB_ROOT_FILES = new Set(['copilot-instructions.md']);

export interface ResolveLayersOptions {
    /** Enables runtime layer discovery for repos with discover.enabled=true. */
    enableDiscovery?: boolean;
    /** Force runtime discovery for specific repo IDs even when discover.enabled is not set. */
    forceDiscoveryRepoIds?: string[];
}

/**
 * Resolve all layers from a config and return an ordered array of LayerContent.
 *
 * @param config Validated MetaFlowConfig.
 * @param workspaceRoot Absolute workspace root path.
 * @returns Array of resolved layer contents in precedence order.
 */
export function resolveLayers(
    config: MetaFlowConfig,
    workspaceRoot: string,
    options?: ResolveLayersOptions,
): LayerContent[] {
    const resolveOptions: ResolveLayersOptions = {
        enableDiscovery: options?.enableDiscovery ?? true,
        forceDiscoveryRepoIds: options?.forceDiscoveryRepoIds,
    };

    if (config.metadataRepos && config.layerSources) {
        return resolveMultiRepoLayers(
            config.metadataRepos,
            config.layerSources,
            workspaceRoot,
            resolveOptions,
        );
    }
    if (config.metadataRepo && config.layers) {
        return resolveSingleRepoLayers(
            config.metadataRepo,
            config.layers,
            workspaceRoot,
            resolveOptions,
        );
    }
    return [];
}

/**
 * Build the effective file map from resolved layers.
 * Later layers override earlier layers for the same relative path.
 *
 * @param layers Ordered array of LayerContent (low → high specificity).
 * @returns Map of relativePath → EffectiveFile (without classification set).
 */
export function buildEffectiveFileMap(layers: LayerContent[]): Map<string, EffectiveFile> {
    const fileMap = new Map<string, EffectiveFile>();

    for (const layer of layers) {
        for (const file of layer.files) {
            const normalizedPath = file.relativePath.replace(/\\/g, '/');
            fileMap.set(normalizedPath, {
                relativePath: normalizedPath,
                sourceRelativePath: file.sourceRelativePath?.replace(/\\/g, '/'),
                sourcePath: file.absolutePath,
                sourceLayer: layer.layerId,
                sourceRepo: layer.repoId,
                sourceCapabilityId: layer.capability?.id,
                sourceCapabilityName: layer.capability?.name,
                sourceCapabilityDescription: layer.capability?.description,
                sourceCapabilityLicense: layer.capability?.license,
                sourceCapabilityExperimental: layer.capability?.experimental,
                sourceTargetAdapters: layer.targetAdapters,
                projectedContent: file.projectedContent,
                classification: 'synchronized', // placeholder — set by classifier
            });
        }
    }

    return fileMap;
}

type EntryKind = 'directory' | 'file' | 'other';

function getCanonicalDirectoryKey(dirPath: string): string | undefined {
    try {
        const canonical = fs.realpathSync(dirPath);
        return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    } catch {
        return undefined;
    }
}

function getEntryKind(entry: fs.Dirent, fullPath: string): EntryKind {
    if (entry.isDirectory()) {
        return 'directory';
    }

    if (entry.isFile()) {
        return 'file';
    }

    if (!entry.isSymbolicLink()) {
        return 'other';
    }

    try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            return 'directory';
        }
        if (stats.isFile()) {
            return 'file';
        }
    } catch {
        return 'other';
    }

    return 'other';
}

// ── Internal helpers ───────────────────────────────────────────────

function resolveSingleRepoLayers(
    repo: MetadataRepo,
    layers: string[],
    workspaceRoot: string,
    options: ResolveLayersOptions,
): LayerContent[] {
    const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
    const result: LayerContent[] = [];
    const explicitLayers = new Set(layers);

    for (const layerPath of layers) {
        const normalizedLayerPath = normalizeInputPath(layerPath);
        const layerAbsPath = path.join(repoRoot, normalizedLayerPath);
        const capabilityId = deriveCapabilityId(normalizedLayerPath, repoRoot);

        // Validate path traversal
        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue; // skip layer silently — diagnostics handle this elsewhere
        }

        if (!fs.existsSync(layerAbsPath)) {
            continue; // directory was removed — omit this layer from results
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push(buildLayerContent(normalizedLayerPath, layerAbsPath, capabilityId, files));
    }

    const shouldForceSingleRepoDiscovery =
        options.forceDiscoveryRepoIds?.includes('primary') === true;
    if (options.enableDiscovery && shouldForceSingleRepoDiscovery) {
        const discoveredLayers = discoverLayersInRepo(repoRoot).filter(
            (layerPath) => !explicitLayers.has(layerPath),
        );

        for (const layerPath of discoveredLayers) {
            const layerAbsPath = path.join(repoRoot, layerPath);
            const capabilityId = deriveCapabilityId(layerPath, repoRoot);
            if (!isWithinBoundary(layerAbsPath, repoRoot)) {
                continue;
            }

            const files = walkDirectory(layerAbsPath, layerAbsPath);
            result.push(buildLayerContent(layerPath, layerAbsPath, capabilityId, files));
        }
    }

    return result;
}

function resolveMultiRepoLayers(
    repos: NamedMetadataRepo[],
    layerSources: LayerSource[],
    workspaceRoot: string,
    options: ResolveLayersOptions,
): LayerContent[] {
    const repoMap = new Map<string, string>();
    const discoveredLayerSources: LayerSource[] = [];
    const explicitLayerKeys = new Set(layerSources.map((ls) => `${ls.repoId}:${ls.path}`));

    for (const repo of repos) {
        if (repo.enabled === false) {
            continue;
        }

        const repoRoot = resolvePathFromWorkspace(workspaceRoot, repo.localPath);
        repoMap.set(repo.id, repoRoot);

        const shouldDiscoverRepo =
            options.enableDiscovery &&
            (repo.discover?.enabled === true ||
                options.forceDiscoveryRepoIds?.includes(repo.id) === true);

        if (shouldDiscoverRepo) {
            const discoveredPaths = discoverLayersInRepo(repoRoot, repo.discover?.exclude);
            for (const discoveredPath of discoveredPaths) {
                const layerKey = `${repo.id}:${discoveredPath}`;
                if (explicitLayerKeys.has(layerKey)) {
                    continue;
                }
                discoveredLayerSources.push({
                    repoId: repo.id,
                    path: discoveredPath,
                    enabled: true,
                });
            }
        }
    }

    const allLayerSources = [
        ...layerSources,
        ...discoveredLayerSources.sort((a, b) =>
            `${a.repoId}:${a.path}`.localeCompare(`${b.repoId}:${b.path}`),
        ),
    ];

    const result: LayerContent[] = [];

    for (const ls of allLayerSources) {
        if (ls.enabled === false) {
            continue;
        }

        const repoRoot = repoMap.get(ls.repoId);
        if (!repoRoot) {
            continue; // invalid repoId — diagnostics handle this
        }

        const normalizedLayerPath = normalizeInputPath(ls.path);
        const layerAbsPath = path.join(repoRoot, normalizedLayerPath);
        const capabilityId = deriveCapabilityId(normalizedLayerPath, repoRoot);

        if (!isWithinBoundary(layerAbsPath, repoRoot)) {
            continue;
        }

        if (!fs.existsSync(layerAbsPath)) {
            continue; // directory was removed — omit this layer from results
        }

        const files = walkDirectory(layerAbsPath, layerAbsPath);
        result.push(
            buildLayerContent(
                `${ls.repoId}/${normalizedLayerPath}`,
                layerAbsPath,
                capabilityId,
                files,
                ls.repoId,
            ),
        );
    }

    return result;
}

function buildLayerContent(
    layerId: string,
    layerAbsPath: string,
    capabilityId: string,
    files: LayerFile[],
    repoId?: string,
): LayerContent {
    const policyGrants = loadPolicyGrantsForLayer(layerAbsPath);
    const knownPolicyGrantIds = new Set(policyGrants.map((grant) => grant.id).filter(Boolean));
    const codexProjectConfigs = loadCodexProjectConfigsForLayer(layerAbsPath, knownPolicyGrantIds);
    const mcpServers = loadMcpServersForLayer(layerAbsPath, knownPolicyGrantIds);
    const knownMcpServerIds = new Set(mcpServers.map((server) => server.id).filter(Boolean));
    const agentProfiles = loadAgentProfilesForLayer(
        layerAbsPath,
        knownPolicyGrantIds,
        knownMcpServerIds,
    );
    const instructions = loadInstructionsForLayer(layerAbsPath);
    const prompts = loadPromptsForLayer(layerAbsPath);
    const skills = loadSkillsForLayer(layerAbsPath);
    const hooks = loadHooksForLayer(layerAbsPath, knownPolicyGrantIds);
    const tools = loadToolsForLayer(layerAbsPath, knownPolicyGrantIds);
    const targetAdapters = loadTargetAdaptersForLayer(layerAbsPath, knownPolicyGrantIds);
    const packageReferenceIndex = buildPackageReferenceIndex(
        files,
        agentProfiles,
        mcpServers,
        hooks,
        tools,
        skills,
        instructions,
        prompts,
    );
    const packageManifests = loadPackageManifestsForLayer(
        layerAbsPath,
        knownPolicyGrantIds,
        packageReferenceIndex,
    );
    validatePackageOperationalReadiness(packageManifests);
    validatePackageTargetCompatibility(packageManifests);
    const capability = loadCapabilityManifestForLayer(layerAbsPath, capabilityId);
    validateCapabilityLayerDeclarations(capability, {
        ...packageReferenceIndex,
        packages: new Set(packageManifests.map((manifest) => manifest.id).filter(Boolean)),
        policyGrants: knownPolicyGrantIds,
    });
    const hasTargetNativeCodexConfig = files.some(
        (file) => normalizeInputPath(file.relativePath) === '.codex/config.toml',
    );
    const agentProfileFiles: LayerFile[] = agentProfiles.flatMap((profile) => {
        const destination = codexAgentProfileDestination(profile);
        if (!destination) {
            return [];
        }
        return [
            {
                relativePath: destination,
                sourceRelativePath: `.metaflow/agents/${path.basename(profile.manifestPath)}`,
                absolutePath: profile.manifestPath,
                projectedContent: renderCodexAgentProfileToml(profile),
            },
        ];
    });
    const githubCopilotAgentProfileFiles: LayerFile[] = agentProfiles.flatMap((profile) => {
        const destination = githubCopilotAgentProfileDestination(profile);
        if (!destination) {
            return [];
        }
        return [
            {
                relativePath: destination,
                sourceRelativePath: `.metaflow/agents/${path.basename(profile.manifestPath)}`,
                absolutePath: profile.manifestPath,
                projectedContent: renderGitHubCopilotAgentProfileMarkdown(profile, mcpServers),
            },
        ];
    });
    const codexConfigProjection = hasTargetNativeCodexConfig
        ? undefined
        : renderCodexConfigProjection(
              codexProjectConfigs,
              mcpServers,
              targetAdapters,
              path.join(layerAbsPath, '.metaflow', 'mcp'),
          );
    const codexConfigFiles: LayerFile[] = codexConfigProjection
        ? [
              {
                  relativePath: codexConfigProjection.destination,
                  sourceRelativePath: codexConfigProjection.sourceRelativePath,
                  absolutePath: codexConfigProjection.sourcePath,
                  projectedContent: codexConfigProjection.content,
              },
          ]
        : [];
    const hasTargetNativeCodexHooks = files.some(
        (file) => normalizeInputPath(file.relativePath) === '.codex/hooks.json',
    );
    const codexHooksDestination = hasTargetNativeCodexHooks
        ? undefined
        : codexHookProjectionDestination(hooks);
    const codexHookFiles: LayerFile[] = codexHooksDestination
        ? [
              {
                  relativePath: codexHooksDestination,
                  sourceRelativePath: '.metaflow/hooks',
                  absolutePath: path.join(layerAbsPath, '.metaflow', 'hooks'),
                  projectedContent: renderCodexHooksJson(hooks),
              },
          ]
        : [];
    return {
        layerId,
        repoId,
        files: [
            ...files,
            ...agentProfileFiles,
            ...githubCopilotAgentProfileFiles,
            ...codexConfigFiles,
            ...codexHookFiles,
        ],
        capability,
        policyGrants,
        mcpServers,
        hooks,
        executionProfiles: loadExecutionProfilesForLayer(layerAbsPath, knownPolicyGrantIds),
        memoryScopes: loadMemoryScopesForLayer(layerAbsPath, knownPolicyGrantIds),
        evaluationProfiles: loadEvaluationProfilesForLayer(layerAbsPath, knownPolicyGrantIds),
        agentProfiles,
        instructions,
        prompts,
        skills,
        codexProjectConfigs,
        targetAdapters,
        packageManifests,
        tools,
    };
}

interface CapabilityReferenceIndex extends PackageReferenceIndex {
    packages: Set<string>;
    policyGrants: Set<string>;
}

function buildPackageReferenceIndex(
    files: LayerFile[],
    agentProfiles: { id: string }[],
    mcpServers: { id: string }[],
    hooks: { id: string }[],
    tools: { id: string }[],
    skills: { id: string }[] = [],
    instructions: { id: string }[] = [],
    prompts: { id: string }[] = [],
): PackageReferenceIndex {
    return {
        agents: idsFromMetadata(agentProfiles),
        skills: mergeIds(idsFromPaths(files, skillIdFromPath), idsFromMetadata(skills)),
        instructions: mergeIds(
            idsFromPaths(files, (filePath) => markdownArtifactIdFromPath(filePath, 'instructions')),
            idsFromMetadata(instructions),
        ),
        prompts: mergeIds(
            idsFromPaths(files, (filePath) => markdownArtifactIdFromPath(filePath, 'prompts')),
            idsFromMetadata(prompts),
        ),
        mcpServers: idsFromMetadata(mcpServers),
        tools: idsFromMetadata(tools),
        hooks: idsFromMetadata(hooks),
    };
}

function idsFromMetadata(items: { id: string }[]): Set<string> {
    return new Set(items.map((item) => item.id).filter(Boolean));
}

function mergeIds(...sets: Set<string>[]): Set<string> {
    const merged = new Set<string>();
    for (const set of sets) {
        for (const id of set) {
            merged.add(id);
        }
    }
    return merged;
}

function idsFromPaths(
    files: LayerFile[],
    idResolver: (filePath: string) => string | undefined,
): Set<string> {
    const ids = new Set<string>();
    for (const file of files) {
        for (const filePath of [file.relativePath, file.sourceRelativePath]) {
            if (!filePath) {
                continue;
            }
            const id = idResolver(normalizeInputPath(filePath));
            if (id) {
                ids.add(id);
            }
        }
    }
    return ids;
}

function capabilityWarning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDiagnosticSeverity = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
}

function packageWarning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDiagnosticSeverity = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
}

function validatePackageOperationalReadiness(packageManifests: PackageManifestMetadata[]): void {
    const adapterVersionByTarget = new Map<string, string>();
    for (const entry of getTargetCapabilityMatrix()) {
        adapterVersionByTarget.set(entry.target, entry.adapterVersion);
    }

    for (const manifest of packageManifests) {
        const hasAuthoritySensitiveComponents =
            manifest.tools.length > 0 ||
            manifest.mcpServers.length > 0 ||
            manifest.hooks.length > 0;
        if (hasAuthoritySensitiveComponents && manifest.policyGrants.length === 0) {
            manifest.warnings.push(
                packageWarning(
                    'PACKAGE_POLICY_GRANTS_RECOMMENDED',
                    'Package includes tools, MCP servers, or hooks but declares no policyGrants for authority review.',
                    manifest.manifestPath,
                ),
            );
        }

        const hasEnabledTargets = Object.values(manifest.targets).some(
            (declaration) => declaration.enabled !== false,
        );
        if (hasEnabledTargets && manifest.validationEvidence.length === 0) {
            manifest.warnings.push(
                packageWarning(
                    'PACKAGE_TARGET_VALIDATION_EVIDENCE_RECOMMENDED',
                    'Package has enabled target declarations but no validationEvidence for target package readiness.',
                    manifest.manifestPath,
                ),
            );
        }

        for (const entry of manifest.marketplaceEntries) {
            const targetDeclaration = manifest.targets[entry.target];
            if (!targetDeclaration) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_MARKETPLACE_TARGET_UNDECLARED',
                        `Package marketplace entry target "${entry.target}" is not declared in package targets.`,
                        manifest.manifestPath,
                    ),
                );
                continue;
            }
            if (targetDeclaration.enabled === false) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_MARKETPLACE_TARGET_DISABLED',
                        `Package marketplace entry target "${entry.target}" is disabled in package targets.`,
                        manifest.manifestPath,
                    ),
                );
            }
            if (
                entry.packageName &&
                targetDeclaration.pluginName &&
                entry.packageName !== targetDeclaration.pluginName
            ) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_MARKETPLACE_PACKAGE_NAME_MISMATCH',
                        `Package marketplace entry target "${entry.target}" packageName "${entry.packageName}" does not match target pluginName "${targetDeclaration.pluginName}".`,
                        manifest.manifestPath,
                    ),
                );
            }
        }

        for (const record of manifest.runtimeValidation) {
            const targetDeclaration = manifest.targets[record.target];
            if (!targetDeclaration) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_RUNTIME_VALIDATION_TARGET_UNDECLARED',
                        `Package runtimeValidation target "${record.target}" is not declared in package targets.`,
                        manifest.manifestPath,
                    ),
                );
                continue;
            }
            if (targetDeclaration.enabled === false) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_RUNTIME_VALIDATION_TARGET_DISABLED',
                        `Package runtimeValidation target "${record.target}" is disabled in package targets.`,
                        manifest.manifestPath,
                    ),
                );
            }
            const expectedAdapterVersion = adapterVersionByTarget.get(record.target);
            if (expectedAdapterVersion && record.adapterVersion !== expectedAdapterVersion) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH',
                        `Package runtimeValidation target "${record.target}" adapterVersion "${record.adapterVersion}" does not match current target adapterVersion "${expectedAdapterVersion}".`,
                        manifest.manifestPath,
                    ),
                );
            }
            if (
                (record.status === 'passed' || record.status === 'partial') &&
                record.evidence.length === 0
            ) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED',
                        `Package runtimeValidation target "${record.target}" status "${record.status}" has no evidence references.`,
                        manifest.manifestPath,
                    ),
                );
            }
            if (!record.command && record.evidence.length === 0) {
                manifest.warnings.push(
                    packageWarning(
                        'PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED',
                        `Package runtimeValidation target "${record.target}" should include a validation command or evidence reference so the runtime claim is reviewable.`,
                        manifest.manifestPath,
                    ),
                );
            }
        }
    }
}

function validatePackageTargetCompatibility(packageManifests: PackageManifestMetadata[]): void {
    if (packageManifests.length === 0) {
        return;
    }

    const matrix = getTargetCapabilityMatrix();
    for (const manifest of packageManifests) {
        for (const [targetId, declaration] of Object.entries(manifest.targets)) {
            if (declaration.enabled === false) {
                continue;
            }
            validatePackageTarget(manifest, targetId, matrix);
        }
    }
}

function validatePackageTarget(
    manifest: PackageManifestMetadata,
    targetId: string,
    matrix: TargetCapabilityMatrixEntry[],
): void {
    const rows = matrix.filter((entry) => entry.target === targetId);
    if (rows.length === 0) {
        manifest.warnings.push(
            packageWarning(
                'PACKAGE_TARGET_UNKNOWN',
                `Package target "${targetId}" has no known target capability matrix entry.`,
                manifest.manifestPath,
            ),
        );
        return;
    }

    warnOnPackageConceptSupport(manifest, targetId, 'packageManifests', 1, rows);
    warnOnPackageConceptSupport(manifest, targetId, 'agents', manifest.agents.length, rows);
    warnOnPackageConceptSupport(manifest, targetId, 'skills', manifest.skills.length, rows);
    warnOnPackageConceptSupport(
        manifest,
        targetId,
        'instructions',
        manifest.instructions.length,
        rows,
    );
    warnOnPackageConceptSupport(manifest, targetId, 'prompts', manifest.prompts.length, rows);
    warnOnPackageConceptSupport(
        manifest,
        targetId,
        'mcpServers',
        manifest.mcpServers.length,
        rows,
    );
    warnOnPackageConceptSupport(manifest, targetId, 'tools', manifest.tools.length, rows);
    warnOnPackageConceptSupport(manifest, targetId, 'hooks', manifest.hooks.length, rows);
    warnOnPackageConceptSupport(
        manifest,
        targetId,
        'policyGrants',
        manifest.policyGrants.length,
        rows,
    );
    for (const record of manifest.runtimeValidation.filter((entry) => entry.target === targetId)) {
        warnOnRuntimeValidationConceptSupport(manifest, targetId, record.concepts ?? [], rows);
    }
}

function warnOnRuntimeValidationConceptSupport(
    manifest: PackageManifestMetadata,
    targetId: string,
    concepts: TargetCapabilityConcept[],
    rows: TargetCapabilityMatrixEntry[],
): void {
    for (const concept of concepts) {
        const row = rows.find((entry) => entry.concept === concept);
        if (!row) {
            manifest.warnings.push(
                packageWarning(
                    'PACKAGE_RUNTIME_VALIDATION_CONCEPT_TARGET_UNKNOWN',
                    `Package runtimeValidation target "${targetId}" concept "${concept}" has no target capability matrix row.`,
                    manifest.manifestPath,
                ),
            );
            continue;
        }

        if (row.support === 'unsupported') {
            manifest.warnings.push(
                packageWarning(
                    'PACKAGE_RUNTIME_VALIDATION_CONCEPT_UNSUPPORTED',
                    `Package runtimeValidation target "${targetId}" concept "${concept}" is unsupported by the target capability matrix.`,
                    manifest.manifestPath,
                    'error',
                ),
            );
        }
    }
}

function warnOnPackageConceptSupport(
    manifest: PackageManifestMetadata,
    targetId: string,
    concept: TargetCapabilityConcept,
    count: number,
    rows: TargetCapabilityMatrixEntry[],
): void {
    if (count === 0) {
        return;
    }

    const row = rows.find((entry) => entry.concept === concept);
    if (!row) {
        manifest.warnings.push(
            packageWarning(
                'PACKAGE_TARGET_CONCEPT_UNKNOWN',
                `Package target "${targetId}" has no capability matrix row for ${concept}.`,
                manifest.manifestPath,
            ),
        );
        return;
    }

    if (row.support === 'supported' || row.support === 'generated-substitute') {
        return;
    }

    const severity = row.support === 'unsupported' ? 'error' : 'warning';
    const code =
        row.support === 'unsupported'
            ? 'PACKAGE_TARGET_CONCEPT_UNSUPPORTED'
            : 'PACKAGE_TARGET_CONCEPT_PARTIAL';
    manifest.warnings.push(
        packageWarning(
            code,
            `Package target "${targetId}" includes ${concept} metadata whose target support is ${row.support}.`,
            manifest.manifestPath,
            severity,
        ),
    );
}

function validateCapabilityLayerDeclarations(
    capability: CapabilityMetadata | undefined,
    referenceIndex: CapabilityReferenceIndex,
): void {
    if (!capability) {
        return;
    }

    const manifestPath = capability.manifestPath;
    validateCapabilityComponentReferences(capability, referenceIndex, manifestPath);
    validateCapabilityPackageReferences(capability, referenceIndex.packages, manifestPath);
    validateCapabilityTargetDeclarations(capability, referenceIndex, manifestPath);
}

function validateCapabilityComponentReferences(
    capability: CapabilityMetadata,
    referenceIndex: CapabilityReferenceIndex,
    manifestPath: string,
): void {
    if (!capability.components) {
        return;
    }

    for (const [componentKind, componentIds] of Object.entries(capability.components)) {
        const knownIds = capabilityReferenceSetForKind(componentKind, referenceIndex);
        if (!knownIds) {
            capability.warnings.push(
                capabilityWarning(
                    'CANONICAL_CAPABILITY_COMPONENT_KIND_UNKNOWN',
                    `.metaflow/capability.json components.${componentKind} does not match a known canonical component kind.`,
                    manifestPath,
                ),
            );
            continue;
        }

        for (const componentId of componentIds) {
            if (!knownIds.has(componentId)) {
                capability.warnings.push(
                    capabilityWarning(
                        'CANONICAL_CAPABILITY_COMPONENT_REFERENCE_UNKNOWN',
                        `.metaflow/capability.json components.${componentKind} references unknown component "${componentId}".`,
                        manifestPath,
                        'error',
                    ),
                );
            }
        }
    }
}

function validateCapabilityPackageReferences(
    capability: CapabilityMetadata,
    knownPackageIds: Set<string>,
    manifestPath: string,
): void {
    for (const packageId of capability.packages ?? []) {
        if (!knownPackageIds.has(packageId)) {
            capability.warnings.push(
                capabilityWarning(
                    'CANONICAL_CAPABILITY_PACKAGE_UNKNOWN',
                    `.metaflow/capability.json packages references unknown package "${packageId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }
}

function validateCapabilityTargetDeclarations(
    capability: CapabilityMetadata,
    referenceIndex: CapabilityReferenceIndex,
    manifestPath: string,
): void {
    if (!capability.targets) {
        return;
    }

    const knownTargets = new Set([
        'metaflow',
        'generic',
        ...getTargetCapabilityMatrix().map((entry) => entry.target),
    ]);
    for (const targetId of Object.keys(capability.targets)) {
        if (!knownTargets.has(targetId)) {
            capability.warnings.push(
                capabilityWarning(
                    'CANONICAL_CAPABILITY_TARGET_UNKNOWN',
                    `.metaflow/capability.json targets.${targetId} has no known target capability matrix entry.`,
                    manifestPath,
                ),
            );
        }
        for (const grantId of capability.targets[targetId].requiredPolicyGrants) {
            if (!referenceIndex.policyGrants.has(grantId)) {
                capability.warnings.push(
                    capabilityWarning(
                        'CANONICAL_CAPABILITY_TARGET_POLICY_GRANT_UNKNOWN',
                        `.metaflow/capability.json targets.${targetId}.requiredPolicyGrants references unknown policy grant "${grantId}".`,
                        manifestPath,
                        'error',
                    ),
                );
            }
        }
    }
}

function capabilityReferenceSetForKind(
    componentKind: string,
    referenceIndex: CapabilityReferenceIndex,
): Set<string> | undefined {
    switch (componentKind) {
        case 'agent':
        case 'agents':
            return referenceIndex.agents;
        case 'skill':
        case 'skills':
            return referenceIndex.skills;
        case 'instruction':
        case 'instructions':
            return referenceIndex.instructions;
        case 'prompt':
        case 'prompts':
            return referenceIndex.prompts;
        case 'mcp':
        case 'mcpServer':
        case 'mcpServers':
            return referenceIndex.mcpServers;
        case 'tool':
        case 'tools':
            return referenceIndex.tools;
        case 'hook':
        case 'hooks':
            return referenceIndex.hooks;
        case 'package':
        case 'packages':
            return referenceIndex.packages;
        case 'policyGrant':
        case 'policyGrants':
            return referenceIndex.policyGrants;
        default:
            return undefined;
    }
}

function skillIdFromPath(filePath: string): string | undefined {
    const match = filePath.match(
        /^(?:\.metaflow\/skills|\.agents\/skills|skills)\/([^/]+)\/SKILL\.md$/i,
    );
    return match?.[1];
}

function markdownArtifactIdFromPath(
    filePath: string,
    artifactRoot: 'instructions' | 'prompts',
): string | undefined {
    const match = filePath.match(
        new RegExp(`^(?:\\.metaflow/)?${artifactRoot}/([^/]+)\\.md$`, 'i'),
    );
    return match?.[1];
}

/**
 * Recursively walk a directory and collect all files (relative to layerRoot).
 */
function walkDirectory(
    dirPath: string,
    layerRoot: string,
    visitedDirectories = new Set<string>(),
): LayerFile[] {
    const files: LayerFile[] = [];

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return files;
    }

    const canonicalDir = getCanonicalDirectoryKey(dirPath);
    if (canonicalDir) {
        if (visitedDirectories.has(canonicalDir)) {
            return files;
        }
        visitedDirectories.add(canonicalDir);
    }

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
        return files;
    }

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryKind = getEntryKind(entry, fullPath);
        if (entryKind === 'directory') {
            files.push(...walkDirectory(fullPath, layerRoot, visitedDirectories));
        } else if (entryKind === 'file') {
            const sourceRelativePath = normalizeInputPath(path.relative(layerRoot, fullPath));
            const relativePaths = expandLayerRelativePaths(sourceRelativePath);
            for (const relativePath of relativePaths) {
                if (!isKnownArtifactPath(relativePath)) {
                    continue;
                }
                files.push({
                    relativePath,
                    sourceRelativePath:
                        relativePath === sourceRelativePath ? undefined : sourceRelativePath,
                    absolutePath: fullPath,
                });
            }
        }
    }

    return files;
}

/**
 * Normalize layer-relative paths into artifact-relative paths.
 *
 * Metadata packs commonly nest artifacts under `.github/` or `.metaflow/`.
 * The overlay/classifier pipeline expects paths rooted at artifact dirs
 * (e.g., `instructions/**`, `skills/**`), so we strip an optional leading
 * `.github/` prefix here and expand supported canonical MetaFlow sources below.
 */
function normalizeLayerRelativePath(relativePath: string): string {
    const posixPath = relativePath.replace(/\\/g, '/');
    if (posixPath.startsWith('.github/')) {
        return posixPath.slice('.github/'.length);
    }
    return posixPath;
}

function expandLayerRelativePaths(relativePath: string): string[] {
    const normalized = normalizeLayerRelativePath(relativePath);
    const canonicalInstructionMatch = normalized.match(/^\.metaflow\/instructions\/([^/]+\.md)$/);
    if (canonicalInstructionMatch) {
        return [`instructions/${canonicalInstructionMatch[1]}`];
    }

    const canonicalPromptMatch = normalized.match(/^\.metaflow\/prompts\/([^/]+\.md)$/);
    if (canonicalPromptMatch) {
        return [`prompts/${canonicalPromptMatch[1]}`];
    }

    const canonicalSkillMatch = normalized.match(/^\.metaflow\/skills\/([^/]+)\/SKILL\.md$/);
    if (!canonicalSkillMatch) {
        return [normalized];
    }

    const skillId = canonicalSkillMatch[1];
    return [`skills/${skillId}/SKILL.md`, `.agents/skills/${skillId}/SKILL.md`];
}

function deriveCapabilityId(layerPath: string, repoRoot: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') {
        return path.basename(repoRoot);
    }

    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] || path.basename(repoRoot);
}

function isKnownArtifactPath(relativePath: string): boolean {
    if (KNOWN_GITHUB_ROOT_FILES.has(relativePath)) {
        return true;
    }
    if (isCodexProjectInstructionPath(relativePath)) {
        return true;
    }
    if (isCodexRepositorySkillPath(relativePath)) {
        return true;
    }
    if (isCodexProjectConfigPath(relativePath)) {
        return true;
    }
    if (isCodexWorktreeIncludePath(relativePath)) {
        return true;
    }

    const topDir = relativePath.split('/')[0];
    return KNOWN_ARTIFACT_ROOTS.has(topDir);
}

function isKnownArtifactRootDirectory(directoryName: string): boolean {
    return KNOWN_ARTIFACT_ROOTS.has(directoryName);
}

/**
 * Discover layer directories in a repository by finding directories
 * that directly contain known artifact roots.
 */
export function discoverLayersInRepo(repoRoot: string, excludePatterns: string[] = []): string[] {
    const discovered = new Set<string>();
    const visitedDirectories = new Set<string>();

    if (!fs.existsSync(repoRoot)) {
        return [];
    }

    let repoStats: fs.Stats;
    try {
        repoStats = fs.statSync(repoRoot);
    } catch {
        return [];
    }

    if (!repoStats.isDirectory()) {
        return [];
    }

    const walk = (currentDir: string): void => {
        const canonicalDir = getCanonicalDirectoryKey(currentDir);
        if (canonicalDir) {
            if (visitedDirectories.has(canonicalDir)) {
                return;
            }
            visitedDirectories.add(canonicalDir);
        }

        const currentBase = path.basename(currentDir);
        if (currentBase === '.github') {
            // Parent directory is the layer boundary for .github-based packs.
            return;
        }

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            return;
        }

        const childNames = new Set(entries.map((entry) => entry.name));
        const hasArtifactAtRoot = Array.from(KNOWN_ARTIFACT_ROOTS).some((root) =>
            childNames.has(root),
        );
        const hasGithubArtifacts =
            childNames.has('.github') && hasAnyKnownArtifactDir(path.join(currentDir, '.github'));
        const hasCodexRepositorySkills =
            childNames.has('.agents') &&
            hasCodexRepositorySkillsDir(path.join(currentDir, '.agents'));
        const hasCodexProjectInstructions = hasCodexProjectInstructionFile(childNames, currentDir);
        const hasCodexWorktreeInclude = hasCodexWorktreeIncludeFile(childNames, currentDir);
        const hasCodexProjectConfig =
            childNames.has('.codex') && hasCodexProjectConfigDir(path.join(currentDir, '.codex'));
        const hasCanonicalMetaFlowArtifacts =
            childNames.has('.metaflow') &&
            hasCanonicalMetaFlowArtifactsDir(path.join(currentDir, '.metaflow'));
        const hasCapabilityManifest = hasCapabilityManifestAtRoot(childNames, currentDir);

        if (
            hasArtifactAtRoot ||
            hasGithubArtifacts ||
            hasCodexRepositorySkills ||
            hasCodexProjectInstructions ||
            hasCodexWorktreeInclude ||
            hasCodexProjectConfig ||
            hasCanonicalMetaFlowArtifacts ||
            hasCapabilityManifest
        ) {
            const rel = path.relative(repoRoot, currentDir).replace(/\\/g, '/');
            const layerPath = normalizeDiscoveredLayerPath(rel === '' ? '.' : rel);
            if (!matchesAnyExclude(layerPath, excludePatterns)) {
                discovered.add(layerPath);
            }
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (getEntryKind(entry, fullPath) !== 'directory') {
                continue;
            }
            if (isKnownArtifactRootDirectory(entry.name)) {
                continue;
            }
            if (entry.name.startsWith('.') && entry.name !== '.github') {
                continue;
            }
            if (entry.name === '.git' || entry.name === 'node_modules') {
                continue;
            }
            walk(fullPath);
        }
    };

    walk(repoRoot);
    return Array.from(discovered).sort((a, b) => a.localeCompare(b));
}

function hasCodexProjectInstructionFile(childNames: Set<string>, currentDir: string): boolean {
    for (const fileName of ['AGENTS.md', 'AGENTS.override.md']) {
        if (!childNames.has(fileName)) {
            continue;
        }
        try {
            if (fs.statSync(path.join(currentDir, fileName)).isFile()) {
                return true;
            }
        } catch {
            continue;
        }
    }
    return false;
}

function hasCodexWorktreeIncludeFile(childNames: Set<string>, currentDir: string): boolean {
    if (!childNames.has('.worktreeinclude')) {
        return false;
    }
    try {
        return fs.statSync(path.join(currentDir, '.worktreeinclude')).isFile();
    } catch {
        return false;
    }
}

function hasCodexRepositorySkillsDir(agentsDirPath: string): boolean {
    const candidate = path.join(agentsDirPath, 'skills');
    try {
        return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
        return false;
    }
}

function hasCodexProjectConfigDir(codexDirPath: string): boolean {
    try {
        if (!fs.existsSync(codexDirPath) || !fs.statSync(codexDirPath).isDirectory()) {
            return false;
        }

        const entries = fs.readdirSync(codexDirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(codexDirPath, entry.name);
            if (getEntryKind(entry, fullPath) === 'file') {
                return true;
            }
            if (
                getEntryKind(entry, fullPath) === 'directory' &&
                hasCodexProjectConfigDir(fullPath)
            ) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

function hasCanonicalMetaFlowArtifactsDir(metaFlowDirPath: string): boolean {
    try {
        const capabilityJsonPath = path.join(metaFlowDirPath, 'capability.json');
        if (fs.existsSync(capabilityJsonPath) && fs.statSync(capabilityJsonPath).isFile()) {
            return true;
        }

        const skillsDir = path.join(metaFlowDirPath, 'skills');
        if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
            const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
            const hasSkill = entries.some((entry) => {
                if (!entry.isDirectory()) {
                    return false;
                }
                const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
                const skillManifestPath = path.join(skillsDir, entry.name, 'skill.json');
                try {
                    return (
                        (fs.existsSync(skillPath) && fs.statSync(skillPath).isFile()) ||
                        (fs.existsSync(skillManifestPath) &&
                            fs.statSync(skillManifestPath).isFile())
                    );
                } catch {
                    return false;
                }
            });
            if (hasSkill) {
                return true;
            }
        }

        const instructionsDir = path.join(metaFlowDirPath, 'instructions');
        if (hasMarkdownOrJsonFile(instructionsDir)) {
            return true;
        }

        const promptsDir = path.join(metaFlowDirPath, 'prompts');
        if (hasMarkdownOrJsonFile(promptsDir)) {
            return true;
        }

        const policiesDir = path.join(metaFlowDirPath, 'policies');
        if (fs.existsSync(policiesDir) && fs.statSync(policiesDir).isDirectory()) {
            const policyEntries = fs.readdirSync(policiesDir, { withFileTypes: true });
            const hasPolicyGrant = policyEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasPolicyGrant) {
                return true;
            }
        }

        const mcpDir = path.join(metaFlowDirPath, 'mcp');
        if (fs.existsSync(mcpDir) && fs.statSync(mcpDir).isDirectory()) {
            const mcpEntries = fs.readdirSync(mcpDir, { withFileTypes: true });
            const hasMcpServer = mcpEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasMcpServer) {
                return true;
            }
        }

        const hooksDir = path.join(metaFlowDirPath, 'hooks');
        if (fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory()) {
            const hookEntries = fs.readdirSync(hooksDir, { withFileTypes: true });
            const hasHook = hookEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasHook) {
                return true;
            }
        }

        const executionDir = path.join(metaFlowDirPath, 'execution');
        if (fs.existsSync(executionDir) && fs.statSync(executionDir).isDirectory()) {
            const executionEntries = fs.readdirSync(executionDir, { withFileTypes: true });
            const hasExecutionProfile = executionEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasExecutionProfile) {
                return true;
            }
        }

        const memoryDir = path.join(metaFlowDirPath, 'memory');
        if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
            const memoryEntries = fs.readdirSync(memoryDir, { withFileTypes: true });
            const hasMemoryScope = memoryEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasMemoryScope) {
                return true;
            }
        }

        const evaluationDir = path.join(metaFlowDirPath, 'evaluation');
        if (fs.existsSync(evaluationDir) && fs.statSync(evaluationDir).isDirectory()) {
            const evaluationEntries = fs.readdirSync(evaluationDir, { withFileTypes: true });
            const hasEvaluationProfile = evaluationEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasEvaluationProfile) {
                return true;
            }
        }

        const agentsDir = path.join(metaFlowDirPath, 'agents');
        if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
            const agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
            const hasAgentProfile = agentEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasAgentProfile) {
                return true;
            }
        }

        const projectConfigDir = path.join(metaFlowDirPath, 'project-config');
        if (fs.existsSync(projectConfigDir) && fs.statSync(projectConfigDir).isDirectory()) {
            const projectConfigEntries = fs.readdirSync(projectConfigDir, { withFileTypes: true });
            const hasProjectConfig = projectConfigEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasProjectConfig) {
                return true;
            }
        }

        const targetsDir = path.join(metaFlowDirPath, 'targets');
        if (fs.existsSync(targetsDir) && fs.statSync(targetsDir).isDirectory()) {
            const targetEntries = fs.readdirSync(targetsDir, { withFileTypes: true });
            const hasTargetAdapter = targetEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasTargetAdapter) {
                return true;
            }
        }

        const packagesDir = path.join(metaFlowDirPath, 'packages');
        if (fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory()) {
            const packageEntries = fs.readdirSync(packagesDir, { withFileTypes: true });
            const hasPackageManifest = packageEntries.some(
                (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
            );
            if (hasPackageManifest) {
                return true;
            }
        }

        const toolsDir = path.join(metaFlowDirPath, 'tools');
        if (!fs.existsSync(toolsDir) || !fs.statSync(toolsDir).isDirectory()) {
            return false;
        }

        const toolEntries = fs.readdirSync(toolsDir, { withFileTypes: true });
        return toolEntries.some(
            (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'),
        );
    } catch {
        return false;
    }
}

function hasMarkdownOrJsonFile(dirPath: string): boolean {
    try {
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return false;
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.some(
            (entry) =>
                entry.isFile() &&
                (entry.name.toLowerCase().endsWith('.md') ||
                    entry.name.toLowerCase().endsWith('.json')),
        );
    } catch {
        return false;
    }
}

function hasCapabilityManifestAtRoot(childNames: Set<string>, currentDir: string): boolean {
    if (!childNames.has('CAPABILITY.md')) {
        return false;
    }

    const manifestPath = path.join(currentDir, 'CAPABILITY.md');
    try {
        return fs.statSync(manifestPath).isFile();
    } catch {
        return false;
    }
}

function hasAnyKnownArtifactDir(dirPath: string): boolean {
    if (!fs.existsSync(dirPath)) {
        return false;
    }

    for (const rootFile of KNOWN_GITHUB_ROOT_FILES) {
        const candidate = path.join(dirPath, rootFile);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return true;
            }
        } catch {
            continue;
        }
    }

    for (const root of KNOWN_ARTIFACT_ROOTS) {
        const candidate = path.join(dirPath, root);
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                return true;
            }
        } catch {
            continue;
        }
    }

    return false;
}

function matchesAnyExclude(layerPath: string, excludePatterns: string[]): boolean {
    if (excludePatterns.length === 0) {
        return false;
    }

    return excludePatterns.some((pattern) => minimatch(layerPath, pattern, { dot: true }));
}

function normalizeDiscoveredLayerPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}
