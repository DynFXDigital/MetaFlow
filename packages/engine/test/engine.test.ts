/**
 * Engine package integration tests.
 *
 * Verifies the public API of @metaflow/engine works correctly
 * as a standalone package. These complement the unit tests
 * in src/src/test/unit/ which also import from @metaflow/engine.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Import everything via the public barrel export
import {
    // Config
    loadConfig,
    loadConfigFromPath,
    discoverConfigPath,
    resolvePathFromWorkspace,
    isWithinBoundary,
    normalizeInputPath,
    // Engine
    resolveLayers,
    discoverLayersInRepo,
    buildEffectiveFileMap,
    applyFilters,
    applyProfile,
    classifyFiles,
    classifySingle,
    resolveFileInjection,
    matchesGlob,
    matchesAnyGlob,
    generateProvenanceHeader,
    parseProvenanceHeader,
    stripProvenanceHeader,
    computeContentHash,
    loadManagedState,
    saveManagedState,
    createEmptyState,
    checkDrift,
    checkAllDrift,
    apply,
    clean,
    planSynchronization,
    preview,
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    toSynchronizedRelativePath,
    toAuthoredConfig,
    normalizeConfigShape,
    getTargetCapabilityMatrix,
    buildAdapterReadinessReports,
    describeProjectionWithTargetAdapters,
    parsePolicyGrantContent,
    parseMcpServerContent,
    parseHookContent,
    parseExecutionProfileContent,
    parseMemoryScopeContent,
    parseEvaluationProfileContent,
    parseTargetAdapterContent,
    // Types
    MetaFlowConfig,
    EffectiveFile,
    ConfigLoadResult,
    ProfileConfig,
    InjectionConfig,
    LayerSource,
} from '../src/index';

// ── Helpers ────────────────────────────────────────────────────────

function createTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
    fs.mkdirSync(path.join(dir, '.metaflow'), { recursive: true });
    return dir;
}

function cleanupDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function captureErrorMessage(fn: () => unknown): string {
    try {
        fn();
        assert.fail('Expected function to throw');
    } catch (err: unknown) {
        return err instanceof Error ? err.message : String(err);
    }
}

function createDirectoryLink(targetPath: string, linkPath: string): void {
    fs.symlinkSync(
        path.resolve(targetPath),
        linkPath,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
}

function expectedSynchronizedPath(
    relativePath: string,
    sourceLayer = 'core',
    sourceRepo = 'default',
): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const dir = path.posix.dirname(normalized);
    const base = path.posix.basename(normalized);
    const prefixed = `_${sourceRepo}-${sourceLayer.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}__${base}`;
    return dir === '.' ? prefixed : `${dir}/${prefixed}`;
}

// ── Public API smoke tests ─────────────────────────────────────────

describe('Engine package: public API', () => {
    it('all expected exports are defined', () => {
        // Config exports
        assert.strictEqual(typeof loadConfig, 'function');
        assert.strictEqual(typeof loadConfigFromPath, 'function');
        assert.strictEqual(typeof discoverConfigPath, 'function');
        assert.strictEqual(typeof normalizeInputPath, 'function');
        assert.strictEqual(typeof resolveLayers, 'function');
        assert.strictEqual(typeof discoverLayersInRepo, 'function');
        assert.strictEqual(typeof buildEffectiveFileMap, 'function');
        assert.strictEqual(typeof applyFilters, 'function');
        assert.strictEqual(typeof applyProfile, 'function');
        assert.strictEqual(typeof classifyFiles, 'function');
        assert.strictEqual(typeof classifySingle, 'function');
        assert.strictEqual(typeof matchesGlob, 'function');
        assert.strictEqual(typeof matchesAnyGlob, 'function');
        assert.strictEqual(typeof generateProvenanceHeader, 'function');
        assert.strictEqual(typeof parseProvenanceHeader, 'function');
        assert.strictEqual(typeof stripProvenanceHeader, 'function');
        assert.strictEqual(typeof computeContentHash, 'function');
        assert.strictEqual(typeof loadManagedState, 'function');
        assert.strictEqual(typeof saveManagedState, 'function');
        assert.strictEqual(typeof createEmptyState, 'function');
        assert.strictEqual(typeof checkDrift, 'function');
        assert.strictEqual(typeof checkAllDrift, 'function');
        assert.strictEqual(typeof apply, 'function');
        assert.strictEqual(typeof clean, 'function');
        assert.strictEqual(typeof preview, 'function');
        assert.strictEqual(typeof computeSettingsEntries, 'function');
        assert.strictEqual(typeof getTargetCapabilityMatrix, 'function');
        assert.strictEqual(typeof buildAdapterReadinessReports, 'function');
        assert.strictEqual(typeof describeProjectionWithTargetAdapters, 'function');
        assert.strictEqual(typeof parsePolicyGrantContent, 'function');
        assert.strictEqual(typeof parseMcpServerContent, 'function');
        assert.strictEqual(typeof parseHookContent, 'function');
        assert.strictEqual(typeof parseExecutionProfileContent, 'function');
        assert.strictEqual(typeof parseMemoryScopeContent, 'function');
        assert.strictEqual(typeof parseEvaluationProfileContent, 'function');
        assert.strictEqual(typeof parseTargetAdapterContent, 'function');
    });

    it('target capability matrix covers Codex and GitHub Copilot adapter concepts', () => {
        const matrix = getTargetCapabilityMatrix();
        const requiredConcepts = [
            'skills',
            'agents',
            'mcpServers',
            'hooks',
            'packageManifests',
            'policyGrants',
            'executionSurfaces',
            'memoryScopes',
            'localCloudHandoff',
            'issuePrOperation',
            'evaluationSupport',
        ];
        for (const target of ['codex', 'github-copilot']) {
            const rows = matrix.filter((entry) => entry.target === target);
            assert.ok(rows.length > 0, `${target} rows should exist`);
            for (const concept of requiredConcepts) {
                assert.ok(
                    rows.some((entry) => entry.concept === concept),
                    `${target} should cover ${concept}`,
                );
            }
        }

        const codexSkills = matrix.find(
            (entry) => entry.target === 'codex' && entry.concept === 'skills',
        );
        assert.strictEqual(codexSkills?.support, 'supported');
        assert.ok(
            codexSkills?.nativeSurfaces.includes('.agents/skills/<skill-id>/SKILL.md'),
            'Codex skills row should name the generated repository skill surface',
        );

        const codexPolicy = matrix.find(
            (entry) => entry.target === 'codex' && entry.concept === 'policyGrants',
        );
        assert.strictEqual(codexPolicy?.support, 'partial');
        assert.ok(
            codexPolicy?.authorityImplications.some((note) =>
                note.includes('Authority-sensitive projections'),
            ),
            'policy grant row should report authority implications',
        );

        const codexMcp = matrix.find(
            (entry) => entry.target === 'codex' && entry.concept === 'mcpServers',
        );
        assert.strictEqual(codexMcp?.support, 'partial');
        assert.ok(
            codexMcp?.nativeSurfaces.includes('.metaflow/mcp/*.json'),
            'Codex MCP row should name the canonical MCP metadata surface',
        );
    });

    it('builds adapter readiness reports from canonical metadata', () => {
        const reports = buildAdapterReadinessReports({
            targets: ['codex', 'github-copilot'],
            policyGrants: [
                {
                    id: 'github-pr-read',
                    manifestPath: '/metadata/.metaflow/policies/github-pr-read.json',
                    authority: 'github.pullRequest.read',
                    category: 'github',
                    approval: 'auto',
                    audit: true,
                    warnings: [],
                },
            ],
            mcpServers: [
                {
                    id: 'github',
                    manifestPath: '/metadata/.metaflow/mcp/github.json',
                    transport: 'stdio',
                    invocation: { command: 'github-mcp-server', args: ['stdio'] },
                    requiredSecrets: ['GITHUB_TOKEN'],
                    policyGrants: ['github-pr-read'],
                    warnings: [],
                },
            ],
            hooks: [
                {
                    id: 'release-gate',
                    manifestPath: '/metadata/.metaflow/hooks/release-gate.json',
                    triggerPhase: 'preApply',
                    invocationType: 'command',
                    command: 'npm',
                    args: ['test'],
                    failureBehavior: 'block',
                    policyGrants: ['github-pr-read'],
                    targets: ['codex'],
                    warnings: [],
                },
            ],
            executionProfiles: [
                {
                    id: 'local',
                    manifestPath: '/metadata/.metaflow/execution/local.json',
                    surface: 'localWorkstation',
                    isolation: 'workspace-write',
                    requiredSecrets: [],
                    policyGrants: ['github-pr-read'],
                    targets: ['codex'],
                    warnings: [],
                },
            ],
            memoryScopes: [
                {
                    id: 'repo-decisions',
                    manifestPath: '/metadata/.metaflow/memory/repo-decisions.json',
                    scopeType: 'repository',
                    storage: 'persistent',
                    policyGrants: ['github-pr-read'],
                    targets: ['codex'],
                    warnings: [],
                },
            ],
            evaluationProfiles: [
                {
                    id: 'release-gate',
                    manifestPath: '/metadata/.metaflow/evaluation/release-gate.json',
                    evaluationType: 'regressionGate',
                    args: ['run', 'gate:quick'],
                    successCriteria: 'Gate exits 0.',
                    artifacts: ['doc/ftr/latest.md'],
                    policyGrants: ['github-pr-read'],
                    targets: ['codex'],
                    warnings: [],
                },
            ],
        });

        const codexReport = reports.find((report) => report.target === 'codex');
        assert.strictEqual(codexReport?.adapterVersion, 'codex-v0.1');
        assert.deepStrictEqual(codexReport?.managedMetadata, {
            policyGrants: 1,
            mcpServers: 1,
            hooks: 1,
            executionProfiles: 1,
            memoryScopes: 1,
            evaluationProfiles: 1,
        });
        assert.ok(
            codexReport?.actionItems.some(
                (item) =>
                    item.concept === 'policyGrants' &&
                    item.message.includes('runtime authority review'),
            ),
        );
        assert.ok(
            codexReport?.actionItems.some(
                (item) =>
                    item.concept === 'evaluationSupport' &&
                    item.evidence.includes('RUN-037'),
            ),
        );
        assert.ok(
            codexReport?.warnings.some((warning) =>
                warning.includes('MCP servers require explicit tool'),
            ),
        );

        const copilotReport = reports.find((report) => report.target === 'github-copilot');
        assert.strictEqual(copilotReport?.managedMetadata.hooks, 0);
        assert.strictEqual(copilotReport?.managedMetadata.policyGrants, 1);
        assert.ok(
            copilotReport?.actionItems.some((item) => item.concept === 'mcpServers'),
            'shared MCP metadata should contribute to GitHub Copilot readiness',
        );
    });
});

describe('Engine package: config loading', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('loadConfig finds and normalizes .metaflow/config.jsonc', () => {
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
        };
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow', 'config.jsonc'),
            JSON.stringify(config),
            'utf-8',
        );

        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.strictEqual(result.config.metadataRepos?.[0].localPath, '.ai/ai-metadata');
            assert.deepStrictEqual(result.config.metadataRepos?.[0].capabilities, [
                { path: 'company/core', enabled: true },
            ]);
            assert.deepStrictEqual(result.config.layerSources, [
                { repoId: 'primary', path: 'company/core', enabled: true },
            ]);
            assert.strictEqual(result.migrated, true);
        }
    });

    it('loadConfig returns errors for missing config', () => {
        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, false);
    });

    it('discoverConfigPath finds root config', () => {
        fs.writeFileSync(path.join(tmpDir, '.metaflow', 'config.jsonc'), '{}', 'utf-8');
        const found = discoverConfigPath(tmpDir);
        assert.ok(found);
        assert.ok(found!.endsWith(path.join('.metaflow', 'config.jsonc')));
    });

    it('discoverConfigPath returns undefined when config is absent', () => {
        const found = discoverConfigPath(tmpDir);
        assert.strictEqual(found, undefined);
    });

    it('discoverConfigPath resolves .metaflow/config.jsonc', () => {
        const configDir = path.join(tmpDir, '.metaflow');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'config.jsonc'), '{}', 'utf-8');
        const found = discoverConfigPath(tmpDir);
        assert.ok(found);
        assert.ok(found!.endsWith(path.join('.metaflow', 'config.jsonc')));
    });

    it('toAuthoredConfig prefers runtime layerSources over stale capability values', () => {
        const authored = toAuthoredConfig({
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [
                        {
                            path: 'company/core',
                            enabled: false,
                        },
                    ],
                },
            ],
            layerSources: [
                {
                    repoId: 'primary',
                    path: 'company/core',
                    enabled: true,
                },
            ],
        });

        assert.deepStrictEqual(authored.metadataRepos?.[0].capabilities, [
            {
                path: 'company/core',
                enabled: true,
            },
        ]);
    });

    it('toAuthoredConfig preserves non-built-in repo order while sorting capabilities canonically', () => {
        const authored = toAuthoredConfig({
            metadataRepos: [
                {
                    id: 'repo-z',
                    localPath: '.ai/repo-z',
                    capabilities: [{ path: 'team/zeta' }, { path: '.' }, { path: 'team' }],
                },
                {
                    id: 'repo-a',
                    localPath: '.ai/repo-a',
                    capabilities: [{ path: 'gamma/core' }, { path: 'beta/.github' }],
                },
            ],
        });

        assert.deepStrictEqual(
            authored.metadataRepos?.map((repo) => repo.id),
            ['repo-z', 'repo-a'],
        );
        assert.deepStrictEqual(
            authored.metadataRepos?.[0].capabilities?.map((capability) => capability.path),
            ['.', 'team', 'team/zeta'],
        );
        assert.deepStrictEqual(
            authored.metadataRepos?.[1].capabilities?.map((capability) => capability.path),
            ['beta', 'gamma/core'],
        );
    });

    it('loadConfig preserves fileNamingStrategy through normalization', () => {
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
            fileNamingStrategy: 'original-unless-conflict',
        };
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow', 'config.jsonc'),
            JSON.stringify(config),
            'utf-8',
        );

        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.strictEqual(result.config.fileNamingStrategy, 'original-unless-conflict');
            assert.strictEqual(
                toAuthoredConfig(result.config).fileNamingStrategy,
                'original-unless-conflict',
            );
        }
    });
});

describe('Engine package: cross-platform path handling', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('normalizeInputPath converts backslashes to forward slashes', () => {
        assert.strictEqual(normalizeInputPath('.ai\\metadata'), '.ai/metadata');
        assert.strictEqual(normalizeInputPath('..\\company\\core'), '../company/core');
        assert.strictEqual(normalizeInputPath('company\\core/layer'), 'company/core/layer');
        assert.strictEqual(normalizeInputPath('.ai/metadata'), '.ai/metadata');
    });

    it('resolvePathFromWorkspace handles Windows-style backslash paths', () => {
        const result = resolvePathFromWorkspace('/workspace', '.ai\\metadata');
        assert.ok(path.isAbsolute(result));
        assert.ok(result.includes('metadata'));
    });

    it('resolvePathFromWorkspace produces same result for equivalent paths', () => {
        const forward = resolvePathFromWorkspace('/workspace', '.ai/metadata');
        const backslash = resolvePathFromWorkspace('/workspace', '.ai\\metadata');
        assert.strictEqual(forward, backslash);
    });

    it('loadConfig accepts Windows-style localPath in config file', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', 'instructions', 'test.instructions.md'),
            '# Test',
        );

        const config = {
            metadataRepo: { localPath: '.ai\\ai-metadata' },
            layers: ['core'],
        };
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow', 'config.jsonc'),
            JSON.stringify(config),
            'utf-8',
        );

        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, true);
    });

    it('resolveLayers resolves Windows-style layer path within repo', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'company', 'core', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'company', 'core', 'instructions', 'test.instructions.md'),
            '# Test',
        );

        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company\\core'],
        };
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow', 'config.jsonc'),
            JSON.stringify(config),
            'utf-8',
        );

        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            const layers = resolveLayers(result.config, tmpDir);
            assert.strictEqual(layers.length, 1);
            assert.ok(layers[0].files.length > 0);
        }
    });
});

describe('Engine package: overlay pipeline', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('full pipeline: resolve → build → filter → profile → classify', () => {
        // Set up metadata repo with a layer
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', 'instructions'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'skills', 'test.md'), '# Test skill');
        fs.writeFileSync(path.join(repoDir, 'core', 'instructions', 'coding.md'), '# Coding');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            filters: { include: ['**'], exclude: [] },
            injection: {
                instructions: 'settings',
                skills: 'synchronize',
            },
        };

        // Step 1: resolve layers
        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].files.length, 2);

        // Step 2: build effective file map
        const fileMap = buildEffectiveFileMap(layers);
        assert.strictEqual(fileMap.size, 2);

        // Step 3: apply filters
        let files = applyFilters(Array.from(fileMap.values()), config.filters);
        assert.strictEqual(files.length, 2);

        // Step 4: apply profile (none)
        files = applyProfile(files, undefined);
        assert.strictEqual(files.length, 2);

        // Step 5: classify
        classifyFiles(files, config.injection);
        const skill = files.find((f) => f.relativePath.includes('skills'));
        const instr = files.find((f) => f.relativePath.includes('instructions'));
        assert.strictEqual(skill?.classification, 'synchronized');
        assert.strictEqual(instr?.classification, 'settings');
    });

    it('normalizes .github-prefixed paths before classification', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'instructions', 'test.instructions.md'),
            '# Test instruction',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: {
                instructions: 'settings',
            },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());

        assert.ok(files.some((f) => f.relativePath === 'instructions/test.instructions.md'));

        classifyFiles(files, config.injection);
        const instruction = files.find(
            (f) => f.relativePath === 'instructions/test.instructions.md',
        );
        assert.strictEqual(instruction?.classification, 'settings');
    });

    it('discovers CAPABILITY-only layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-capability-only-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'empty-capability'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoRoot, 'capabilities', 'empty-capability', 'CAPABILITY.md'),
            ['---', 'name: Empty Capability', 'description: Empty', '---'].join('\n'),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/empty-capability']);
    });

    it('discovers canonical .metaflow capability manifest layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-capability-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'canonical-only', '.metaflow'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoRoot, 'capabilities', 'canonical-only', '.metaflow', 'capability.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.capability/v1',
                id: 'metadata-authoring.canonical-only',
                name: 'Canonical Only',
                summary: 'Canonical manifest capability.',
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/canonical-only']);
    });

    it('discovers canonical .metaflow policy grant layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-policy-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'policy-only', '.metaflow', 'policies'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'policy-only',
                '.metaflow',
                'policies',
                'github-pr-read.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'github-pr-read',
                authority: 'github.pullRequest.read',
                approval: 'auto',
                audit: true,
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/policy-only']);
    });

    it('discovers canonical .metaflow MCP server layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-mcp-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'mcp-only', '.metaflow', 'mcp'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoRoot, 'capabilities', 'mcp-only', '.metaflow', 'mcp', 'github.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.mcpServer/v1',
                id: 'github',
                transport: 'stdio',
                invocation: { command: 'github-mcp-server', args: ['stdio'] },
                policyGrants: ['github-pr-read'],
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/mcp-only']);
    });

    it('discovers canonical .metaflow hook layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-hook-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'hook-only', '.metaflow', 'hooks'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'hook-only',
                '.metaflow',
                'hooks',
                'release-gate.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.hook/v1',
                id: 'release-gate',
                triggerPhase: 'preApply',
                invocationType: 'command',
                command: 'npm',
                args: ['test'],
                failureBehavior: 'block',
                policyGrants: ['shell-test'],
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/hook-only']);
    });

    it('discovers canonical .metaflow execution profile layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-execution-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'execution-only', '.metaflow', 'execution'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'execution-only',
                '.metaflow',
                'execution',
                'local.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.executionProfile/v1',
                id: 'local',
                surface: 'localWorkstation',
                isolation: 'workspace-write',
                policyGrants: ['shell-test'],
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/execution-only']);
    });

    it('discovers canonical .metaflow memory scope layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-memory-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'memory-only', '.metaflow', 'memory'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'memory-only',
                '.metaflow',
                'memory',
                'repo-decisions.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.memoryScope/v1',
                id: 'repo-decisions',
                scopeType: 'repository',
                storage: 'persistent',
                policyGrants: ['memory-repo'],
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/memory-only']);
    });

    it('discovers canonical .metaflow evaluation profile layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-evaluation-repo');
        fs.mkdirSync(
            path.join(repoRoot, 'capabilities', 'evaluation-only', '.metaflow', 'evaluation'),
            { recursive: true },
        );
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'evaluation-only',
                '.metaflow',
                'evaluation',
                'release-gate.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.evaluationProfile/v1',
                id: 'release-gate',
                evaluationType: 'regressionGate',
                successCriteria: 'All configured release checks pass.',
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/evaluation-only']);
    });

    it('discovers canonical .metaflow target adapter layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-canonical-target-repo');
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'target-only', '.metaflow', 'targets'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(
                repoRoot,
                'capabilities',
                'target-only',
                '.metaflow',
                'targets',
                'codex.json',
            ),
            JSON.stringify({
                schemaVersion: 'metaflow.targetAdapter/v1',
                id: 'codex-default',
                target: 'codex',
                materializationMode: 'candidate',
            }),
            'utf-8',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['capabilities/target-only']);
    });

    it('does not discover artifact roots as standalone layer directories', () => {
        const repoRoot = path.join(tmpDir, '.ai', 'discover-artifact-root-repo');
        fs.mkdirSync(path.join(repoRoot, 'instructions', 'nested-capability'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(repoRoot, 'prompts'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'agents'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'skills', 'review-skill'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'capabilities', 'real-capability'), {
            recursive: true,
        });
        fs.writeFileSync(path.join(repoRoot, 'CAPABILITY.md'), '# Root Capability');
        fs.writeFileSync(
            path.join(repoRoot, 'instructions', 'nested-capability', 'CAPABILITY.md'),
            '# Not a discovered layer',
        );
        fs.writeFileSync(
            path.join(repoRoot, 'capabilities', 'real-capability', 'CAPABILITY.md'),
            '# Real Capability',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.deepStrictEqual(discovered, ['.', 'capabilities/real-capability']);
    });

    it('classifies deprecated chatmodes as Synchronized-only', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'chatmodes'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'chatmodes', 'legacy.chatmode.md'),
            '# Legacy chatmode',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: {
                chatmodes: 'settings',
            },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());

        assert.ok(files.some((f) => f.relativePath === 'chatmodes/legacy.chatmode.md'));

        classifyFiles(files, config.injection);
        const chatmode = files.find((f) => f.relativePath === 'chatmodes/legacy.chatmode.md');
        assert.strictEqual(chatmode?.classification, 'synchronized');
    });

    it('ignores unknown .github directories when resolving layers', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'ISSUE_TEMPLATE'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'components'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'chatmodes', 'legacy.chatmode.md'),
            '# Legacy chatmode',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'ISSUE_TEMPLATE', 'bug.yml'),
            'name: Bug',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'components', 'widget.md'),
            '# Widget',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());

        assert.ok(files.some((f) => f.relativePath === 'chatmodes/legacy.chatmode.md'));
        assert.ok(!files.some((f) => f.relativePath.startsWith('ISSUE_TEMPLATE/')));
        assert.ok(!files.some((f) => f.relativePath.startsWith('components/')));
    });

    it('loads capability metadata from CAPABILITY.md and propagates it to effective files', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', 'CAPABILITY.md'),
            [
                '---',
                'name: SDLC Traceability',
                'description: Traceability metadata capability.',
                'license: MIT',
                'experimental: true',
                '---',
            ].join('\n'),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'instructions', 'coding.md'),
            '# Coding',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.ok(layers[0].capability);
        assert.strictEqual(layers[0].capability?.name, 'SDLC Traceability');

        const fileMap = buildEffectiveFileMap(layers);
        const file = Array.from(fileMap.values())[0];
        assert.strictEqual(file.sourceCapabilityId, 'core');
        assert.strictEqual(file.sourceCapabilityName, 'SDLC Traceability');
        assert.strictEqual(file.sourceCapabilityDescription, 'Traceability metadata capability.');
        assert.strictEqual(file.sourceCapabilityLicense, 'MIT');
        assert.strictEqual(file.sourceCapabilityExperimental, true);
    });

    it('loads canonical metadata from .metaflow/capability.json before CAPABILITY.md', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'capability.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.capability/v1',
                id: 'traceability.canonical',
                uid: '123e4567-e89b-12d3-a456-426614174000',
                previousIds: ['traceability.legacy'],
                previousPaths: ['old/core'],
                name: 'Canonical Traceability',
                summary: 'Canonical traceability metadata capability.',
                license: 'MIT',
                experimental: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', 'CAPABILITY.md'),
            ['---', 'name: Legacy Traceability', 'description: Legacy.', '---'].join('\n'),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'instructions', 'coding.md'),
            '# Coding',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers[0].capability?.id, 'traceability.canonical');
        assert.strictEqual(layers[0].capability?.name, 'Canonical Traceability');
        assert.strictEqual(
            layers[0].capability?.description,
            'Canonical traceability metadata capability.',
        );
        assert.strictEqual(layers[0].capability?.uid, '123e4567-e89b-12d3-a456-426614174000');
        assert.deepStrictEqual(layers[0].capability?.previousIds, ['traceability.legacy']);
        assert.deepStrictEqual(layers[0].capability?.previousPaths, ['old/core']);
        assert.ok(
            layers[0].capability?.manifestPath
                .replace(/\\/g, '/')
                .endsWith('.metaflow/capability.json'),
        );

        const fileMap = buildEffectiveFileMap(layers);
        const file = Array.from(fileMap.values())[0];
        assert.strictEqual(file.sourceCapabilityId, 'traceability.canonical');
        assert.strictEqual(file.sourceCapabilityName, 'Canonical Traceability');
        assert.strictEqual(
            file.sourceCapabilityDescription,
            'Canonical traceability metadata capability.',
        );
        assert.strictEqual(file.sourceCapabilityLicense, 'MIT');
        assert.strictEqual(file.sourceCapabilityExperimental, true);
    });

    it('loads canonical policy grants as layer metadata', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'github-pr-read.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'github-pr-read',
                authority: 'github.pullRequest.read',
                approval: 'auto',
                scope: { repository: 'current' },
                audit: true,
                description: 'Read pull request metadata for review workflows.',
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'shell-test.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'shell-test',
                authority: 'shell.test.run',
                approval: 'on-request',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].files.length, 0);
        assert.strictEqual(layers[0].policyGrants?.length, 2);

        const githubGrant = layers[0].policyGrants?.find((grant) => grant.id === 'github-pr-read');
        assert.strictEqual(githubGrant?.authority, 'github.pullRequest.read');
        assert.strictEqual(githubGrant?.category, 'github');
        assert.strictEqual(githubGrant?.approval, 'auto');
        assert.deepStrictEqual(githubGrant?.scope, { repository: 'current' });
        assert.strictEqual(githubGrant?.audit, true);
        assert.strictEqual(githubGrant?.warnings.length, 0);

        const shellGrant = layers[0].policyGrants?.find((grant) => grant.id === 'shell-test');
        assert.strictEqual(shellGrant?.category, 'shell');
        assert.strictEqual(shellGrant?.audit, false);
    });

    it('reports validation diagnostics for invalid canonical policy grants', () => {
        const grant = parsePolicyGrantContent(
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v0',
                id: 'Invalid ID',
                approval: 'maybe',
                scope: ['repo'],
                audit: 'yes',
                extra: true,
            }),
            'policy.json',
        );

        assert.strictEqual(grant.id, 'Invalid ID');
        assert.strictEqual(grant.approval, 'manual');
        assert.strictEqual(grant.category, 'other');
        assert.deepStrictEqual(
            grant.warnings.map((warning) => warning.code),
            [
                'POLICY_GRANT_UNKNOWN_FIELD',
                'POLICY_GRANT_SCHEMA_VERSION_INVALID',
                'POLICY_GRANT_ID_INVALID',
                'POLICY_GRANT_AUTHORITY_REQUIRED',
                'POLICY_GRANT_APPROVAL_INVALID',
                'POLICY_GRANT_SCOPE_INVALID',
                'POLICY_GRANT_AUDIT_INVALID',
            ],
        );
        assert.ok(
            grant.warnings.every(
                (warning) =>
                    warning.severity === 'error' || warning.code === 'POLICY_GRANT_UNKNOWN_FIELD',
            ),
        );
    });

    it('loads canonical MCP servers as layer metadata with policy grant requirements', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'mcp'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'github-pr-read.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'github-pr-read',
                authority: 'github.pullRequest.read',
                approval: 'auto',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'mcp', 'github.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.mcpServer/v1',
                id: 'github',
                transport: 'stdio',
                invocation: { command: 'github-mcp-server', args: ['stdio'] },
                requiredSecrets: ['GITHUB_TOKEN'],
                capabilityCategory: 'source-control',
                policyGrants: ['github-pr-read'],
                description: 'GitHub MCP access for pull request review.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].mcpServers?.length, 1);
        const server = layers[0].mcpServers?.[0];
        assert.strictEqual(server?.id, 'github');
        assert.strictEqual(server?.transport, 'stdio');
        assert.deepStrictEqual(server?.invocation, {
            command: 'github-mcp-server',
            args: ['stdio'],
        });
        assert.deepStrictEqual(server?.requiredSecrets, ['GITHUB_TOKEN']);
        assert.strictEqual(server?.capabilityCategory, 'source-control');
        assert.deepStrictEqual(server?.policyGrants, ['github-pr-read']);
        assert.strictEqual(server?.warnings.length, 0);
    });

    it('reports validation diagnostics for invalid canonical MCP servers', () => {
        const server = parseMcpServerContent(
            JSON.stringify({
                schemaVersion: 'metaflow.mcpServer/v0',
                id: 'Invalid ID',
                transport: 'stdio',
                invocation: { args: ['stdio'] },
                requiredSecrets: ['TOKEN', 42],
                capabilityCategory: '',
                policyGrants: ['missing-grant'],
                extra: true,
            }),
            'mcp.json',
            new Set(['github-pr-read']),
        );

        assert.strictEqual(server.id, 'Invalid ID');
        assert.strictEqual(server.transport, 'stdio');
        assert.deepStrictEqual(
            server.warnings.map((warning) => warning.code),
            [
                'MCP_SERVER_UNKNOWN_FIELD',
                'MCP_SERVER_SCHEMA_VERSION_INVALID',
                'MCP_SERVER_ID_INVALID',
                'MCP_SERVER_INVOCATION_COMMAND_REQUIRED',
                'MCP_SERVER_INVOCATION_REQUIRED',
                'MCP_SERVER_REQUIRED_SECRETS_INVALID',
                'MCP_SERVER_POLICY_GRANT_UNKNOWN',
                'MCP_SERVER_CAPABILITY_CATEGORY_INVALID',
            ],
        );
    });

    it('loads canonical hooks as layer metadata with policy grant requirements', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'hooks'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'shell-test.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'shell-test',
                authority: 'shell.test.run',
                approval: 'on-request',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'hooks', 'release-gate.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.hook/v1',
                id: 'release-gate',
                triggerPhase: 'preApply',
                invocationType: 'command',
                command: 'npm',
                args: ['test'],
                scope: 'workspace',
                failureBehavior: 'block',
                policyGrants: ['shell-test'],
                targets: ['codex', 'github-copilot'],
                description: 'Run release checks before applying metadata.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].hooks?.length, 1);
        const hook = layers[0].hooks?.[0];
        assert.strictEqual(hook?.id, 'release-gate');
        assert.strictEqual(hook?.triggerPhase, 'preApply');
        assert.strictEqual(hook?.invocationType, 'command');
        assert.strictEqual(hook?.command, 'npm');
        assert.deepStrictEqual(hook?.args, ['test']);
        assert.strictEqual(hook?.scope, 'workspace');
        assert.strictEqual(hook?.failureBehavior, 'block');
        assert.deepStrictEqual(hook?.policyGrants, ['shell-test']);
        assert.deepStrictEqual(hook?.targets, ['codex', 'github-copilot']);
        assert.strictEqual(hook?.warnings.length, 0);
    });

    it('reports validation diagnostics for invalid canonical hooks', () => {
        const hook = parseHookContent(
            JSON.stringify({
                schemaVersion: 'metaflow.hook/v0',
                id: 'Invalid ID',
                triggerPhase: 'unknown',
                invocationType: 'command',
                args: ['test', 42],
                scope: '',
                failureBehavior: 'halt',
                policyGrants: ['missing-grant'],
                targets: ['codex', 42],
                extra: true,
            }),
            'hook.json',
            new Set(['shell-test']),
        );

        assert.strictEqual(hook.id, 'Invalid ID');
        assert.strictEqual(hook.invocationType, 'command');
        assert.deepStrictEqual(
            hook.warnings.map((warning) => warning.code),
            [
                'HOOK_UNKNOWN_FIELD',
                'HOOK_SCHEMA_VERSION_INVALID',
                'HOOK_ID_INVALID',
                'HOOK_TRIGGER_PHASE_INVALID',
                'HOOK_COMMAND_REQUIRED',
                'HOOK_FAILURE_BEHAVIOR_INVALID',
                'HOOK_POLICY_GRANT_UNKNOWN',
                'HOOK_ARGS_INVALID',
                'HOOK_TARGETS_INVALID',
                'HOOK_SCOPE_INVALID',
            ],
        );
    });

    it('loads canonical execution profiles as layer metadata with policy grant requirements', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'execution'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'shell-test.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'shell-test',
                authority: 'shell.test.run',
                approval: 'on-request',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'execution', 'local.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.executionProfile/v1',
                id: 'local',
                surface: 'localWorkstation',
                isolation: 'workspace-write',
                runner: 'codex-cli',
                workingDirectory: '.',
                timeoutSeconds: 900,
                requiredSecrets: ['OPENAI_API_KEY'],
                environment: { NODE_ENV: 'test' },
                policyGrants: ['shell-test'],
                targets: ['codex'],
                description: 'Run local Codex CLI checks.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].executionProfiles?.length, 1);
        const profile = layers[0].executionProfiles?.[0];
        assert.strictEqual(profile?.id, 'local');
        assert.strictEqual(profile?.surface, 'localWorkstation');
        assert.strictEqual(profile?.isolation, 'workspace-write');
        assert.strictEqual(profile?.runner, 'codex-cli');
        assert.strictEqual(profile?.workingDirectory, '.');
        assert.strictEqual(profile?.timeoutSeconds, 900);
        assert.deepStrictEqual(profile?.requiredSecrets, ['OPENAI_API_KEY']);
        assert.deepStrictEqual(profile?.environment, { NODE_ENV: 'test' });
        assert.deepStrictEqual(profile?.policyGrants, ['shell-test']);
        assert.deepStrictEqual(profile?.targets, ['codex']);
        assert.strictEqual(profile?.warnings.length, 0);
    });

    it('reports validation diagnostics for invalid canonical execution profiles', () => {
        const profile = parseExecutionProfileContent(
            JSON.stringify({
                schemaVersion: 'metaflow.executionProfile/v0',
                id: 'Invalid ID',
                surface: 'desktop',
                isolation: 'wide-open',
                runner: '',
                workingDirectory: '',
                timeoutSeconds: 0,
                requiredSecrets: ['TOKEN', 42],
                environment: { NODE_ENV: 'test', EMPTY: '' },
                policyGrants: ['missing-grant'],
                targets: ['codex', 42],
                description: '',
                extra: true,
            }),
            'execution.json',
            new Set(['shell-test']),
        );

        assert.strictEqual(profile.id, 'Invalid ID');
        assert.strictEqual(profile.surface, 'localWorkstation');
        assert.strictEqual(profile.isolation, 'workspace-write');
        assert.deepStrictEqual(
            profile.warnings.map((warning) => warning.code),
            [
                'EXECUTION_PROFILE_UNKNOWN_FIELD',
                'EXECUTION_PROFILE_SCHEMA_VERSION_INVALID',
                'EXECUTION_PROFILE_ID_INVALID',
                'EXECUTION_PROFILE_SURFACE_INVALID',
                'EXECUTION_PROFILE_ISOLATION_INVALID',
                'EXECUTION_PROFILE_RUNNER_INVALID',
                'EXECUTION_PROFILE_WORKING_DIRECTORY_INVALID',
                'EXECUTION_PROFILE_TIMEOUT_INVALID',
                'EXECUTION_PROFILE_REQUIRED_SECRETS_INVALID',
                'EXECUTION_PROFILE_POLICY_GRANT_UNKNOWN',
                'EXECUTION_PROFILE_ENVIRONMENT_INVALID',
                'EXECUTION_PROFILE_TARGETS_INVALID',
                'EXECUTION_PROFILE_DESCRIPTION_INVALID',
            ],
        );
    });

    it('loads canonical memory scopes as layer metadata with policy grant requirements', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'memory'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'memory-repo.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'memory-repo',
                authority: 'memory.repository.readWrite',
                approval: 'manual',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'memory', 'repo-decisions.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.memoryScope/v1',
                id: 'repo-decisions',
                scopeType: 'repository',
                storage: 'persistent',
                retention: '180d',
                sharing: 'repository-maintainers',
                readPolicy: 'maintainers-only',
                writePolicy: 'approved-agents',
                policyGrants: ['memory-repo'],
                targets: ['codex', 'github-copilot'],
                description: 'Repository decision memory for repeated engineering work.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].memoryScopes?.length, 1);
        const scope = layers[0].memoryScopes?.[0];
        assert.strictEqual(scope?.id, 'repo-decisions');
        assert.strictEqual(scope?.scopeType, 'repository');
        assert.strictEqual(scope?.storage, 'persistent');
        assert.strictEqual(scope?.retention, '180d');
        assert.strictEqual(scope?.sharing, 'repository-maintainers');
        assert.strictEqual(scope?.readPolicy, 'maintainers-only');
        assert.strictEqual(scope?.writePolicy, 'approved-agents');
        assert.deepStrictEqual(scope?.policyGrants, ['memory-repo']);
        assert.deepStrictEqual(scope?.targets, ['codex', 'github-copilot']);
        assert.strictEqual(scope?.warnings.length, 0);
    });

    it('reports validation diagnostics for invalid canonical memory scopes', () => {
        const scope = parseMemoryScopeContent(
            JSON.stringify({
                schemaVersion: 'metaflow.memoryScope/v0',
                id: 'Invalid ID',
                scopeType: 'global',
                storage: 'forever',
                retention: '',
                sharing: '',
                readPolicy: '',
                writePolicy: '',
                policyGrants: ['missing-grant'],
                targets: ['codex', 42],
                description: '',
                extra: true,
            }),
            'memory.json',
            new Set(['memory-repo']),
        );

        assert.strictEqual(scope.id, 'Invalid ID');
        assert.strictEqual(scope.scopeType, 'task');
        assert.strictEqual(scope.storage, 'ephemeral');
        assert.deepStrictEqual(
            scope.warnings.map((warning) => warning.code),
            [
                'MEMORY_SCOPE_UNKNOWN_FIELD',
                'MEMORY_SCOPE_SCHEMA_VERSION_INVALID',
                'MEMORY_SCOPE_ID_INVALID',
                'MEMORY_SCOPE_TYPE_INVALID',
                'MEMORY_SCOPE_STORAGE_INVALID',
                'MEMORY_SCOPE_RETENTION_INVALID',
                'MEMORY_SCOPE_SHARING_INVALID',
                'MEMORY_SCOPE_READ_POLICY_INVALID',
                'MEMORY_SCOPE_WRITE_POLICY_INVALID',
                'MEMORY_SCOPE_POLICY_GRANT_UNKNOWN',
                'MEMORY_SCOPE_TARGETS_INVALID',
                'MEMORY_SCOPE_DESCRIPTION_INVALID',
            ],
        );
    });

    it('loads canonical evaluation profiles as layer metadata with policy grant requirements', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'evaluation'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'shell-test.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'shell-test',
                authority: 'shell.test.run',
                approval: 'on-request',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'evaluation', 'release-gate.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.evaluationProfile/v1',
                id: 'release-gate',
                evaluationType: 'regressionGate',
                command: 'npm',
                args: ['run', 'gate:quick'],
                successCriteria: 'Gate exits 0 with no failing tests.',
                artifacts: ['doc/ftr/latest.md'],
                policyGrants: ['shell-test'],
                targets: ['codex', 'github-copilot'],
                description: 'Release gate evidence for agent-generated changes.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].evaluationProfiles?.length, 1);
        const profile = layers[0].evaluationProfiles?.[0];
        assert.strictEqual(profile?.id, 'release-gate');
        assert.strictEqual(profile?.evaluationType, 'regressionGate');
        assert.strictEqual(profile?.command, 'npm');
        assert.deepStrictEqual(profile?.args, ['run', 'gate:quick']);
        assert.strictEqual(profile?.successCriteria, 'Gate exits 0 with no failing tests.');
        assert.deepStrictEqual(profile?.artifacts, ['doc/ftr/latest.md']);
        assert.deepStrictEqual(profile?.policyGrants, ['shell-test']);
        assert.deepStrictEqual(profile?.targets, ['codex', 'github-copilot']);
        assert.strictEqual(profile?.warnings.length, 0);
    });

    it('reports validation diagnostics for invalid canonical evaluation profiles', () => {
        const profile = parseEvaluationProfileContent(
            JSON.stringify({
                schemaVersion: 'metaflow.evaluationProfile/v0',
                id: 'Invalid ID',
                evaluationType: 'manual',
                command: '',
                args: ['run', 42],
                successCriteria: '',
                artifacts: ['doc/ftr/latest.md', 42],
                policyGrants: ['missing-grant'],
                targets: ['codex', 42],
                description: '',
                extra: true,
            }),
            'evaluation.json',
            new Set(['shell-test']),
        );

        assert.strictEqual(profile.id, 'Invalid ID');
        assert.strictEqual(profile.evaluationType, 'test');
        assert.deepStrictEqual(
            profile.warnings.map((warning) => warning.code),
            [
                'EVALUATION_PROFILE_UNKNOWN_FIELD',
                'EVALUATION_PROFILE_SCHEMA_VERSION_INVALID',
                'EVALUATION_PROFILE_ID_INVALID',
                'EVALUATION_PROFILE_TYPE_INVALID',
                'EVALUATION_PROFILE_COMMAND_INVALID',
                'EVALUATION_PROFILE_ARGS_INVALID',
                'EVALUATION_PROFILE_SUCCESS_CRITERIA_INVALID',
                'EVALUATION_PROFILE_ARTIFACTS_INVALID',
                'EVALUATION_PROFILE_POLICY_GRANT_UNKNOWN',
                'EVALUATION_PROFILE_TARGETS_INVALID',
                'EVALUATION_PROFILE_DESCRIPTION_INVALID',
            ],
        );
    });

    it('loads canonical target adapter preferences as layer metadata', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'policies'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'targets'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'policies', 'github-pr-read.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.policyGrant/v1',
                id: 'github-pr-read',
                authority: 'github.pullRequest.read',
                approval: 'auto',
                audit: true,
            }),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'targets', 'codex.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.targetAdapter/v1',
                id: 'codex-default',
                target: 'codex',
                enabled: true,
                adapterVersion: 'codex-v0.1',
                materializationMode: 'candidate',
                concepts: {
                    skills: 'managed',
                    instructions: 'candidate',
                    mcpServers: 'report-only',
                },
                requiredPolicyGrants: ['github-pr-read'],
                validationStatus: 'runtimeVerified',
                validationEvidence: ['RUN-030'],
                notes: ['Root instructions stay candidate-only.'],
                description: 'Codex target projection preferences.',
            }),
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].targetAdapters?.length, 1);
        const adapter = layers[0].targetAdapters?.[0];
        assert.strictEqual(adapter?.id, 'codex-default');
        assert.strictEqual(adapter?.target, 'codex');
        assert.strictEqual(adapter?.enabled, true);
        assert.strictEqual(adapter?.adapterVersion, 'codex-v0.1');
        assert.strictEqual(adapter?.materializationMode, 'candidate');
        assert.deepStrictEqual(adapter?.concepts, {
            skills: 'managed',
            instructions: 'candidate',
            mcpServers: 'report-only',
        });
        assert.deepStrictEqual(adapter?.requiredPolicyGrants, ['github-pr-read']);
        assert.strictEqual(adapter?.validationStatus, 'runtimeVerified');
        assert.deepStrictEqual(adapter?.validationEvidence, ['RUN-030']);
        assert.deepStrictEqual(adapter?.notes, ['Root instructions stay candidate-only.']);
        assert.strictEqual(adapter?.warnings.length, 0);
    });

    it('applies target adapter preferences to projection metadata', () => {
        const adapter = parseTargetAdapterContent(
            JSON.stringify({
                schemaVersion: 'metaflow.targetAdapter/v1',
                id: 'codex-default',
                target: 'codex',
                enabled: true,
                adapterVersion: 'codex-v0.1',
                materializationMode: 'candidate',
                concepts: {
                    skills: 'managed',
                    instructions: 'candidate',
                },
                requiredPolicyGrants: ['github-pr-read'],
                validationStatus: 'runtimeVerified',
                validationEvidence: ['RUN-030'],
                notes: ['Root instructions stay candidate-only.'],
            }),
            'codex.json',
            new Set(['github-pr-read']),
        );

        const projection = describeProjectionWithTargetAdapters(
            '.agents/skills/testing/SKILL.md',
            '.metaflow/skills/testing/SKILL.md',
            [adapter],
        );

        assert.strictEqual(projection.target, 'codex');
        assert.strictEqual(projection.targetAdapterConcept, 'skills');
        assert.strictEqual(projection.targetAdapterId, 'codex-default');
        assert.strictEqual(projection.targetAdapterVersion, 'codex-v0.1');
        assert.strictEqual(projection.targetAdapterMaterializationMode, 'managed');
        assert.strictEqual(projection.targetAdapterValidationStatus, 'runtimeVerified');
        assert.deepStrictEqual(projection.targetAdapterValidationEvidence, ['RUN-030']);
        assert.deepStrictEqual(projection.targetAdapterRequiredPolicyGrants, ['github-pr-read']);
        assert.ok(projection.notes.includes('target adapter codex-default selected'));
        assert.ok(projection.notes.includes('target adapter concept skills'));
    });

    it('reports validation diagnostics for invalid canonical target adapters', () => {
        const adapter = parseTargetAdapterContent(
            JSON.stringify({
                schemaVersion: 'metaflow.targetAdapter/v0',
                id: 'Invalid ID',
                target: 'unknown-target',
                enabled: 'yes',
                adapterVersion: '',
                materializationMode: 'automatic',
                concepts: {
                    skills: 'managed',
                    mystery: 'managed',
                    hooks: 'automatic',
                },
                requiredPolicyGrants: ['missing-grant'],
                validationStatus: 'complete',
                validationEvidence: ['RUN-030', 42],
                notes: ['ok', 42],
                description: '',
                extra: true,
            }),
            'target.json',
            new Set(['github-pr-read']),
        );

        assert.strictEqual(adapter.id, 'Invalid ID');
        assert.strictEqual(adapter.target, 'generic');
        assert.strictEqual(adapter.enabled, true);
        assert.strictEqual(adapter.materializationMode, 'report-only');
        assert.deepStrictEqual(adapter.concepts, { skills: 'managed' });
        assert.deepStrictEqual(
            adapter.warnings.map((warning) => warning.code),
            [
                'TARGET_ADAPTER_UNKNOWN_FIELD',
                'TARGET_ADAPTER_SCHEMA_VERSION_INVALID',
                'TARGET_ADAPTER_ID_INVALID',
                'TARGET_ADAPTER_TARGET_INVALID',
                'TARGET_ADAPTER_ENABLED_INVALID',
                'TARGET_ADAPTER_VERSION_INVALID',
                'TARGET_ADAPTER_MATERIALIZATION_MODE_INVALID',
                'TARGET_ADAPTER_CONCEPT_UNKNOWN',
                'TARGET_ADAPTER_CONCEPT_MODE_INVALID',
                'TARGET_ADAPTER_POLICY_GRANT_UNKNOWN',
                'TARGET_ADAPTER_VALIDATION_STATUS_INVALID',
                'TARGET_ADAPTER_VALIDATION_EVIDENCE_INVALID',
                'TARGET_ADAPTER_NOTES_INVALID',
                'TARGET_ADAPTER_DESCRIPTION_INVALID',
            ],
        );
    });
});

describe('Engine package: synchronization', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('apply + preview + clean lifecycle', () => {
        // Set up metadata repo
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'agents', 'review.md'), '# Review Agent');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { agents: 'synchronize' },
        };

        // Build effective files
        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        let files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        // Preview — should show pending add
        const pending = preview(tmpDir, files);
        assert.ok(pending.length > 0);
        assert.strictEqual(pending[0].action, 'add');

        // Apply
        const result = apply({
            workspaceRoot: tmpDir,
            effectiveFiles: files,
            force: false,
        });
        assert.ok(result.written.length > 0);
        const reviewPath = expectedSynchronizedPath('agents/review.md');
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', reviewPath)));

        // Verify provenance header
        const content = fs.readFileSync(path.join(tmpDir, '.github', reviewPath), 'utf-8');
        assert.ok(content.includes('metaflow:provenance'));

        // Clean
        const cleanResult = clean(tmpDir);
        assert.ok(cleanResult.removed.length > 0);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });
});

describe('Engine package: drift detection', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('detects drift after manual edit', () => {
        // Set up and apply
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'skills', 'test.md'), '# Test');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'synchronize' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        let files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        apply({
            workspaceRoot: tmpDir,
            effectiveFiles: files,
            force: false,
        });

        // No drift initially
        const state = loadManagedState(tmpDir);
        const results = checkAllDrift(tmpDir, '.github', state);
        assert.ok(results.every((r) => r.status === 'in-sync'));

        // Manually edit
        const testPath = expectedSynchronizedPath('skills/test.md');
        fs.writeFileSync(path.join(tmpDir, '.github', testPath), 'User modified content');

        // Drift detected
        const results2 = checkAllDrift(tmpDir, '.github', state);
        assert.ok(results2.some((r) => r.status === 'drifted'));
    });
});

describe('Engine package: provenance header', () => {
    it('round-trip generate + parse', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            sourceRepo: 'test-repo',
            scope: 'core',
            layers: ['core'],
            profile: 'default',
            contentHash: computeContentHash('hello'),
        });

        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed);
        assert.strictEqual(parsed!.synced, '2026-01-01T00:00:00.000Z');
        assert.strictEqual(parsed!.sourceRepo, 'test-repo');
        assert.strictEqual(parsed!.profile, 'default');
    });

    it('strip header from content', () => {
        const body = '# Hello World\n';
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            contentHash: computeContentHash(body),
        });
        const full = header + body;
        const stripped = stripProvenanceHeader(full);
        assert.strictEqual(stripped, body);
    });
});

describe('Engine package: glob and filter', () => {
    it('matchesGlob works with patterns', () => {
        assert.ok(matchesGlob('skills/testing/SKILL.md', 'skills/**'));
        assert.ok(matchesGlob('agents/review.md', '**/*.md'));
        assert.ok(!matchesGlob('agents/review.md', 'skills/**'));
    });

    it('matchesAnyGlob checks multiple patterns', () => {
        assert.ok(matchesAnyGlob('skills/a.md', ['skills/**', 'agents/**']));
        assert.ok(!matchesAnyGlob('hooks/pre.sh', ['skills/**', 'agents/**']));
    });

    it('applyFilters excludes matching files', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/a.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'agents/b.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
        ];
        const result = applyFilters(files, { include: ['**'], exclude: ['agents/**'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'skills/a.md');
    });
});

describe('Engine package: managed state', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('save + load round-trip', () => {
        const state = createEmptyState();
        state.files['test.md'] = {
            contentHash: computeContentHash('hello'),
            sourceLayer: 'core',
            sourceRelativePath: 'skills/test.md',
        };
        saveManagedState(tmpDir, state);

        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.ok(loaded.files['test.md']);
        assert.strictEqual(loaded.files['test.md'].sourceLayer, 'core');
        assert.strictEqual(loaded.files['test.md'].sourceRelativePath, 'skills/test.md');
    });

    it('load from empty directory returns empty state', () => {
        const state = loadManagedState(tmpDir);
        assert.strictEqual(state.version, 1);
        assert.deepStrictEqual(state.files, {});
    });
});

// ── Coverage-targeted tests ────────────────────────────────────────

describe('Engine: settings injector', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('computeSettingsEntries maps settings instructions and prompts', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'instructions/coding.md',
                sourcePath: path.join(tmpDir, 'repo', 'core', 'instructions', 'coding.md'),
                sourceLayer: 'core',
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(tmpDir, 'repo', 'core', 'prompts', 'review.prompt.md'),
                sourceLayer: 'core',
                classification: 'settings',
            },
            {
                relativePath: 'skills/test.md',
                sourcePath: path.join(tmpDir, 'repo', 'core', 'skills', 'test.md'),
                sourceLayer: 'core',
                classification: 'synchronized', // not settings — should be ignored
            },
        ];

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
        };

        const entries = computeSettingsEntries(files, tmpDir, config);
        assert.strictEqual(entries.length, 2, `expected 2 entries, got ${entries.length}`);

        const instrEntry = entries.find((e) => e.key === 'chat.instructionsFilesLocations');
        const promptEntry = entries.find((e) => e.key === 'chat.promptFilesLocations');
        assert.ok(instrEntry, 'should have instructions settings entry');
        assert.ok(promptEntry, 'should have prompts settings entry');

        const instrLocations = instrEntry!.value as Record<string, boolean>;
        const promptLocations = promptEntry!.value as Record<string, boolean>;
        assert.ok(instrLocations['repo/core/instructions']);
        assert.ok(promptLocations['repo/core/prompts']);
    });

    it('computeSettingsEntries includes hook file locations when configured', () => {
        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
            hooks: {
                preApply: 'scripts/pre.sh',
                postApply: 'scripts/post.sh',
            },
        };

        const entries = computeSettingsEntries([], tmpDir, config);
        const hookLocations = entries.find((e) => e.key === 'chat.hookFilesLocations');
        assert.ok(hookLocations, 'should have hook file locations');
        const locations = hookLocations!.value as Record<string, boolean>;
        assert.ok(locations['scripts/pre.sh']);
        assert.ok(locations['scripts/post.sh']);
    });

    it('computeSettingsEntries sorts object-map settings paths deterministically', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'instructions/root.md',
                sourcePath: path.join(tmpDir, 'repo', 'team', 'instructions', 'root.md'),
                sourceLayer: 'team',
                classification: 'settings',
            },
            {
                relativePath: 'instructions/deep.md',
                sourcePath: path.join(tmpDir, 'repo', 'team', 'core', 'instructions', 'deep.md'),
                sourceLayer: 'team/core',
                classification: 'settings',
            },
        ];

        const entries = computeSettingsEntries(files, tmpDir, {
            metadataRepo: { localPath: 'repo' },
            layers: ['team', 'team/core'],
        });
        const entry = entries.find(
            (candidate) => candidate.key === 'chat.instructionsFilesLocations',
        );

        assert.deepStrictEqual(Object.keys(entry?.value as Record<string, boolean>), [
            'repo/team/core/instructions',
            'repo/team/instructions',
        ]);
    });

    it('classifySingle treats .github instructions as plugin artifacts by default', () => {
        assert.strictEqual(classifySingle('.github/instructions/coding.md', undefined), 'plugin');
        assert.strictEqual(
            classifySingle('.github/prompts/review.prompt.md', undefined),
            'settings',
        );
    });

    it('computeSettingsEntries strips leading .github path segments', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: '.github/instructions/coding.md',
                sourcePath: path.join(
                    tmpDir,
                    'repo',
                    'core',
                    '.github',
                    'instructions',
                    'coding.md',
                ),
                sourceLayer: 'core',
                classification: 'settings',
            },
            {
                relativePath: '.github/prompts/review.prompt.md',
                sourcePath: path.join(
                    tmpDir,
                    'repo',
                    'core',
                    '.github',
                    'prompts',
                    'review.prompt.md',
                ),
                sourceLayer: 'core',
                classification: 'settings',
            },
            {
                relativePath: '.github/agents/reviewer.agent.md',
                sourcePath: path.join(
                    tmpDir,
                    'repo',
                    'core',
                    '.github',
                    'agents',
                    'reviewer.agent.md',
                ),
                sourceLayer: 'core',
                classification: 'settings',
            },
            {
                relativePath: '.github/skills/testing/SKILL.md',
                sourcePath: path.join(
                    tmpDir,
                    'repo',
                    'core',
                    '.github',
                    'skills',
                    'testing',
                    'SKILL.md',
                ),
                sourceLayer: 'core',
                classification: 'settings',
            },
        ];

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
        };

        const entries = computeSettingsEntries(files, tmpDir, config);

        const instructionsEntry = entries.find(
            (entry) => entry.key === 'chat.instructionsFilesLocations',
        );
        const promptsEntry = entries.find((entry) => entry.key === 'chat.promptFilesLocations');
        const agentsEntry = entries.find((entry) => entry.key === 'chat.agentFilesLocations');
        const skillsEntry = entries.find((entry) => entry.key === 'chat.agentSkillsLocations');

        assert.ok(instructionsEntry);
        assert.ok(promptsEntry);
        assert.ok(agentsEntry);
        assert.ok(skillsEntry);

        assert.ok(
            (instructionsEntry!.value as Record<string, boolean>)['repo/core/.github/instructions'],
        );
        assert.ok((promptsEntry!.value as Record<string, boolean>)['repo/core/.github/prompts']);
        assert.ok((agentsEntry!.value as Record<string, boolean>)['repo/core/.github/agents']);
        assert.ok((skillsEntry!.value as Record<string, boolean>)['repo/core/.github/skills']);
    });

    it('computeSettingsEntries sorts object-valued settings entries deterministically', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'instructions/beta.md',
                sourcePath: path.join(tmpDir, 'repo', 'zeta', 'instructions', 'beta.md'),
                sourceLayer: 'zeta',
                classification: 'settings',
            },
            {
                relativePath: 'instructions/alpha.md',
                sourcePath: path.join(tmpDir, 'repo', 'alpha', 'instructions', 'alpha.md'),
                sourceLayer: 'alpha',
                classification: 'settings',
            },
        ];

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['zeta', 'alpha'],
        };

        const entries = computeSettingsEntries(files, tmpDir, config);
        const instructionsEntry = entries.find(
            (entry) => entry.key === 'chat.instructionsFilesLocations',
        );

        assert.deepStrictEqual(instructionsEntry?.value, {
            'repo/alpha/instructions': true,
            'repo/zeta/instructions': true,
        });
    });

    it('computeSettingsEntries skips hooks when not configured', () => {
        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
        };

        const entries = computeSettingsEntries([], tmpDir, config);
        assert.ok(!entries.some((e) => e.key.includes('hooks')));
    });

    it('computeSettingsKeysToRemove returns all managed keys', () => {
        const keys = computeSettingsKeysToRemove();
        assert.ok(keys.length > 0);
        assert.ok(keys.includes('chat.instructionsFilesLocations'));
        assert.ok(keys.includes('chat.promptFilesLocations'));
        assert.ok(keys.includes('chat.agentFilesLocations'));
        assert.ok(keys.includes('chat.agentSkillsLocations'));
        assert.ok(keys.includes('chat.hookFilesLocations'));
    });
});

describe('Engine: profile engine advanced', () => {
    it('profile with disable patterns excludes matching files', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/a.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'agents/b.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'instructions/c.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'settings',
            },
        ];

        const profile: ProfileConfig = { disable: ['agents/**'] };
        const result = applyProfile(files, profile);
        assert.strictEqual(result.length, 2);
        assert.ok(!result.some((f) => f.relativePath.includes('agents')));
    });

    it('profile with enable patterns only includes matching files', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/a.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'agents/b.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'instructions/c.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'settings',
            },
        ];

        const profile: ProfileConfig = { enable: ['skills/**'] };
        const result = applyProfile(files, profile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'skills/a.md');
    });

    it('disable wins over enable when both match', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/secret.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'skills/public.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
        ];

        const profile: ProfileConfig = {
            enable: ['skills/**'],
            disable: ['skills/secret.md'],
        };
        const result = applyProfile(files, profile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'skills/public.md');
    });

    it('empty profile (no enable/disable) returns all files', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/a.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
        ];

        const result = applyProfile(files, {} as ProfileConfig);
        assert.strictEqual(result.length, 1);
    });

    it('profile with an explicit empty enable list ([]) enables nothing', () => {
        const files: EffectiveFile[] = [
            {
                relativePath: 'skills/a.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'synchronized',
            },
            {
                relativePath: 'instructions/c.md',
                sourcePath: '/x',
                sourceLayer: 'l',
                classification: 'settings',
            },
        ];

        // `enable: []` is an active (match-nothing) allowlist, distinct from an
        // absent enable key which means "no filter / all pass".
        const result = applyProfile(files, { enable: [] });
        assert.strictEqual(result.length, 0);
    });
});

describe('Engine: overlay multi-repo resolution', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('resolves layers from multiple repos', () => {
        // Create two repos
        const repoA = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const repoB = path.join(tmpDir, 'repos', 'team');
        fs.mkdirSync(path.join(repoB, 'team', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(repoB, 'team', 'agents', 'b.md'), '# B');

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company' },
                { id: 'team', localPath: 'repos/team' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core' },
                { repoId: 'team', path: 'team' },
            ],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 2);

        const allFiles = layers.flatMap((l) => l.files);
        assert.strictEqual(allFiles.length, 2);
    });

    it('multi-repo skips disabled layer sources', () => {
        const repoA = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company' }],
            layerSources: [{ repoId: 'company', path: 'core', enabled: false }],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('multi-repo skips layer sources from disabled repos', () => {
        const repoA = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company', enabled: false }],
            layerSources: [{ repoId: 'company', path: 'core', enabled: true }],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('multi-repo skips invalid repoId', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company' }],
            layerSources: [{ repoId: 'nonexistent', path: 'core' }],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('resolveLayers returns empty when no repo config', () => {
        const config = {} as MetaFlowConfig;
        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('resolveLayers omits a single-repo layer whose directory no longer exists', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(repoDir, { recursive: true });

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['nonexistent-layer'],
        };

        const layers = resolveLayers(config, tmpDir);
        // Removed directory — layer must not appear in overlay results
        assert.strictEqual(layers.length, 0);
    });

    it('resolveLayers omits a multi-repo layer whose directory no longer exists', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'org');
        fs.mkdirSync(path.join(repoRoot, 'present', 'chatmodes'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'present', 'chatmodes', 'base.chatmode.md'), '# Base');
        // 'removed-layer' directory intentionally not created

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'org', localPath: 'repos/org' }],
            layerSources: [
                { repoId: 'org', path: 'present' },
                { repoId: 'org', path: 'removed-layer' },
            ],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].layerId, 'org/present');
    });

    it('discovers runtime layers when repo discovery is enabled', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoRoot, 'base', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'dynamic', '.github', 'prompts'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'base', 'chatmodes', 'base.chatmode.md'), '# Base');
        fs.writeFileSync(
            path.join(repoRoot, 'dynamic', '.github', 'prompts', 'new.prompt.md'),
            '# Prompt',
        );

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company', discover: { enabled: true } },
            ],
            layerSources: [{ repoId: 'company', path: 'base' }],
        };

        const layers = resolveLayers(config, tmpDir);
        const layerIds = layers.map((layer) => layer.layerId);
        assert.ok(layerIds.includes('company/base'));
        assert.ok(layerIds.includes('company/dynamic'));
    });

    it('discovers layers when .github is mounted through a directory link', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const backingGithub = path.join(tmpDir, 'mounted', 'company-core', '.github');

        fs.mkdirSync(path.join(repoRoot, 'company', 'core'), { recursive: true });
        fs.mkdirSync(path.join(backingGithub, 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(backingGithub, 'instructions', 'mounted.instructions.md'),
            '# Mounted',
        );
        createDirectoryLink(backingGithub, path.join(repoRoot, 'company', 'core', '.github'));

        const discovered = discoverLayersInRepo(repoRoot);
        assert.ok(discovered.includes('company/core'));
    });

    it('does not discover nested hidden metadata folders as standalone layers', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const capabilityRoot = path.join(
            repoRoot,
            'capabilities',
            'agentic-development',
            'metadata-authoring',
            'codex-metadata-authoring',
        );

        fs.mkdirSync(path.join(capabilityRoot, '.github', 'instructions'), { recursive: true });
        fs.mkdirSync(path.join(capabilityRoot, '.agents', 'skills', 'codex-metadata'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(capabilityRoot, '.codex', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(capabilityRoot, 'CAPABILITY.md'), '# Capability');
        fs.writeFileSync(
            path.join(capabilityRoot, '.github', 'instructions', 'codex.instructions.md'),
            '# Codex',
        );
        fs.writeFileSync(
            path.join(capabilityRoot, '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            '# Skill',
        );
        fs.writeFileSync(
            path.join(capabilityRoot, '.codex', 'agents', 'codex-metadata-authoring-steward.toml'),
            'name = "steward"',
        );

        const discovered = discoverLayersInRepo(repoRoot);

        assert.ok(
            discovered.includes(
                'capabilities/agentic-development/metadata-authoring/codex-metadata-authoring',
            ),
        );
        assert.ok(
            !discovered.includes(
                'capabilities/agentic-development/metadata-authoring/codex-metadata-authoring/.agents',
            ),
        );
        assert.ok(
            !discovered.includes(
                'capabilities/agentic-development/metadata-authoring/codex-metadata-authoring/.codex',
            ),
        );

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company', discover: { enabled: true } },
            ],
            layerSources: [],
        };
        const layers = resolveLayers(config, tmpDir);
        const layer = layers.find((candidate) =>
            candidate.layerId.endsWith(
                'capabilities/agentic-development/metadata-authoring/codex-metadata-authoring',
            ),
        );
        assert.ok(layer, 'capability should be resolved as a layer');
        assert.ok(
            layer!.files.some(
                (file) => file.relativePath === '.agents/skills/codex-metadata/SKILL.md',
            ),
            'Codex repository skill should be retained in the capability file set',
        );
    });

    it('discovers layers that only contain Codex repository skills', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const layerRoot = path.join(repoRoot, 'codex-only');
        fs.mkdirSync(path.join(layerRoot, '.agents', 'skills', 'repo-guidance'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(layerRoot, '.agents', 'skills', 'repo-guidance', 'SKILL.md'),
            '# Repo Guidance',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.ok(discovered.includes('codex-only'));
    });

    it('discovers layers that only contain canonical MetaFlow skills', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const layerRoot = path.join(repoRoot, 'canonical-skill-only');
        fs.mkdirSync(path.join(layerRoot, '.metaflow', 'skills', 'repo-guidance'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(layerRoot, '.metaflow', 'skills', 'repo-guidance', 'SKILL.md'),
            '# Repo Guidance',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.ok(discovered.includes('canonical-skill-only'));
    });

    it('discovers layers that only contain Codex project instructions', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const layerRoot = path.join(repoRoot, 'project-guidance');
        fs.mkdirSync(layerRoot, { recursive: true });
        fs.writeFileSync(path.join(layerRoot, 'AGENTS.md'), '# Repository Guidance');

        const discovered = discoverLayersInRepo(repoRoot);
        assert.ok(discovered.includes('project-guidance'));
    });

    it('discovers layers that only contain Codex project config files', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const layerRoot = path.join(repoRoot, 'codex-policy');
        fs.mkdirSync(path.join(layerRoot, '.codex'), { recursive: true });
        fs.writeFileSync(
            path.join(layerRoot, '.codex', 'config.toml'),
            'sandbox_mode = "workspace-write"\n',
        );

        const discovered = discoverLayersInRepo(repoRoot);
        assert.ok(discovered.includes('codex-policy'));
    });

    it('skips runtime discovery when resolve option disables discovery', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoRoot, 'base', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'dynamic', '.github', 'prompts'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'base', 'chatmodes', 'base.chatmode.md'), '# Base');
        fs.writeFileSync(
            path.join(repoRoot, 'dynamic', '.github', 'prompts', 'new.prompt.md'),
            '# Prompt',
        );

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company', discover: { enabled: true } },
            ],
            layerSources: [{ repoId: 'company', path: 'base' }],
        };

        const layers = resolveLayers(config, tmpDir, { enableDiscovery: false });
        assert.deepStrictEqual(
            layers.map((layer) => layer.layerId),
            ['company/base'],
        );
    });

    it('discovery excludes matching layer paths', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoRoot, 'allowed', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'archive', 'chatmodes'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'allowed', 'chatmodes', 'a.chatmode.md'), '# A');
        fs.writeFileSync(path.join(repoRoot, 'archive', 'chatmodes', 'b.chatmode.md'), '# B');

        const discovered = discoverLayersInRepo(repoRoot, ['archive', 'archive/**']);
        assert.ok(discovered.includes('allowed'));
        assert.ok(!discovered.includes('archive'));
    });

    it('forces discovery for a repo id even when discover.enabled is not set', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoRoot, 'base', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'dynamic', 'chatmodes'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'base', 'chatmodes', 'base.chatmode.md'), '# Base');
        fs.writeFileSync(path.join(repoRoot, 'dynamic', 'chatmodes', 'new.chatmode.md'), '# New');

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company' }],
            layerSources: [{ repoId: 'company', path: 'base' }],
        };

        const layers = resolveLayers(config, tmpDir, {
            enableDiscovery: true,
            forceDiscoveryRepoIds: ['company'],
        });
        const layerIds = layers.map((layer) => layer.layerId);
        assert.ok(layerIds.includes('company/base'));
        assert.ok(layerIds.includes('company/dynamic'));
    });

    it('resolves files from a layer whose .github directory is mounted through a directory link', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'company');
        const layerRoot = path.join(repoRoot, 'company', 'core');
        const backingGithub = path.join(tmpDir, 'mounted', 'company-core', '.github');

        fs.mkdirSync(layerRoot, { recursive: true });
        fs.mkdirSync(path.join(backingGithub, 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(backingGithub, 'instructions', 'mounted.instructions.md'),
            '# Mounted',
        );
        createDirectoryLink(backingGithub, path.join(layerRoot, '.github'));

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company' }],
            layerSources: [{ repoId: 'company', path: 'company/core' }],
        };

        const layers = resolveLayers(config, tmpDir);

        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].layerId, 'company/company/core');
        assert.deepStrictEqual(
            layers[0].files.map((file) => file.relativePath),
            ['instructions/mounted.instructions.md'],
        );
    });

    it('forces discovery in single-repo mode for primary repo id', () => {
        const repoRoot = path.join(tmpDir, 'repos', 'primary');
        fs.mkdirSync(path.join(repoRoot, 'base', 'chatmodes'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'dynamic', 'chatmodes'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'base', 'chatmodes', 'base.chatmode.md'), '# Base');
        fs.writeFileSync(path.join(repoRoot, 'dynamic', 'chatmodes', 'new.chatmode.md'), '# New');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repos/primary' },
            layers: ['base'],
        };

        const layers = resolveLayers(config, tmpDir, {
            enableDiscovery: true,
            forceDiscoveryRepoIds: ['primary'],
        });

        assert.ok(layers.some((layer) => layer.layerId === 'base'));
        assert.ok(layers.some((layer) => layer.layerId === 'dynamic'));
    });
});

describe('Engine: config validation', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    it('loadConfigFromPath handles unreadable file', () => {
        const result = loadConfigFromPath(path.join(tmpDir, 'nonexistent.json'));
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('Failed to read'));
    });

    it('loadConfigFromPath rejects non-object JSON', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '"just a string"', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('must be a JSON object'));
    });

    it('loadConfigFromPath rejects array JSON', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '[1, 2, 3]', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('must be a JSON object'));
    });

    it('loadConfigFromPath catches JSONC parse errors', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{ invalid {{', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
        assert.ok(result.errors[0].message.includes('JSON parse error'));
        // Should have line/column info
        assert.ok(result.errors[0].line !== undefined);
    });

    it('validates single-repo mode requires localPath', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepo: {},
                layers: ['core'],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('localPath')));
    });

    it('accepts single-repo mode without layers as a zero-layer bootstrap config', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepo: { localPath: '.ai/metadata' },
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.deepStrictEqual(result.config.metadataRepos?.[0]?.capabilities, []);
            assert.deepStrictEqual(result.config.layerSources, []);
        }
    });

    it('validates multi-repo unique IDs', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepos: [
                    { id: 'dup', localPath: 'a' },
                    { id: 'dup', localPath: 'b' },
                ],
                layerSources: [{ repoId: 'dup', path: 'core' }],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('unique')));
    });

    it('accepts authored multi-repo config without layerSources', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepos: [{ id: 'r1', localPath: 'a' }],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.deepStrictEqual(result.config.metadataRepos?.[0].capabilities, []);
            assert.deepStrictEqual(result.config.layerSources, []);
            assert.strictEqual(result.migrated, true);
        }
    });

    it('migrates implicit released compatibility version on otherwise modern config', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepos: [
                    {
                        id: 'r1',
                        localPath: 'a',
                        capabilities: [{ path: 'core' }],
                    },
                ],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.strictEqual(result.config.compatibilityVersion, 2);
            assert.strictEqual(result.migrated, true);
            assert.ok(
                result.migrationMessages?.some((message) => message.includes('implicit v1 to v2')),
            );
        }
    });

    it('validates multi-repo repoId references', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepos: [{ id: 'r1', localPath: 'a' }],
                layerSources: [{ repoId: 'wrong', path: 'core' }],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('does not match')));
    });

    it('validates multi-repo missing repo fields', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepos: [{ id: '', localPath: '' }],
                layerSources: [{ repoId: '', path: '' }],
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
    });

    it('treats an activeProfile missing from profiles as non-fatal (loads OK)', () => {
        // A profile typo must not reject the whole config: the overlay layer falls
        // back to surfacing all files and emits an ACTIVE_PROFILE_NOT_FOUND warning,
        // so config loading itself succeeds.
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepo: { localPath: '.ai/metadata' },
                layers: ['core'],
                profiles: { default: { enable: ['**'] } },
                activeProfile: 'nonexistent',
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.strictEqual(result.config.activeProfile, 'nonexistent');
        }
    });

    it('validates config must have at least one repo mode', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, JSON.stringify({}), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('metadataRepo')));
    });
});

describe('Engine: synchronizer advanced', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => cleanupDir(tmpDir));

    function setupAndApply(): EffectiveFile[] {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'skills', 'test.md'), '# Test');
        fs.writeFileSync(path.join(repoDir, 'core', 'agents', 'review.md'), '# Review');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'synchronize', agents: 'synchronize' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);
        return files;
    }

    it('apply with force overwrites drifted files', () => {
        const files = setupAndApply();

        // First apply
        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift a file
        const skillsPath = expectedSynchronizedPath('skills/test.md');
        fs.writeFileSync(path.join(tmpDir, '.github', skillsPath), 'drifted');

        // Apply without force — should skip
        const r1 = apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });
        assert.ok(r1.skipped.includes(skillsPath));

        // Apply with force — should overwrite
        const r2 = apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: true });
        assert.ok(r2.written.includes(skillsPath));
        assert.strictEqual(r2.skipped.length, 0);
    });

    it('apply removes stale tracked files', () => {
        const files = setupAndApply();

        // Apply both files
        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Re-apply with only skills (agents removed from overlay)
        const skillsOnly = files.filter((f) => f.relativePath.includes('skills'));
        const r = apply({ workspaceRoot: tmpDir, effectiveFiles: skillsOnly, force: false });

        const reviewPath = expectedSynchronizedPath('agents/review.md');
        assert.ok(r.removed.includes(reviewPath));
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });

    it('apply records original source-relative path in managed state', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        const state = loadManagedState(tmpDir);
        const skillsPath = toSynchronizedRelativePath(
            files.find((file) => file.relativePath === 'skills/test.md') as EffectiveFile,
        );

        assert.strictEqual(state.files[skillsPath]?.sourceRelativePath, 'skills/test.md');
    });

    it('apply warns about drifted stale files', () => {
        const files = setupAndApply();

        // Apply both
        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift the agents file
        const reviewPath = expectedSynchronizedPath('agents/review.md');
        fs.writeFileSync(path.join(tmpDir, '.github', reviewPath), 'user content');

        // Re-apply with only skills — agents is stale AND drifted
        const skillsOnly = files.filter((f) => f.relativePath.includes('skills'));
        const r = apply({ workspaceRoot: tmpDir, effectiveFiles: skillsOnly, force: false });

        assert.ok(r.warnings.some((w) => w.includes('Drifted file not removed')));
        // Drifted stale file should NOT be removed
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });

    it('preview shows drifted files as skip', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift a file
        const skillsPath = expectedSynchronizedPath('skills/test.md');
        fs.writeFileSync(path.join(tmpDir, '.github', skillsPath), 'drifted');

        const pending = preview(tmpDir, files);
        const drifted = pending.find((p) => p.relativePath === skillsPath);
        assert.strictEqual(drifted?.action, 'skip');
        assert.strictEqual(drifted?.reason, 'drifted');
    });

    it('preview shows stale files as remove', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Preview with only skills — agents should be flagged for removal
        const skillsOnly = files.filter((f) => f.relativePath.includes('skills'));
        const pending = preview(tmpDir, skillsOnly);

        const reviewPath = expectedSynchronizedPath('agents/review.md');
        const stale = pending.find((p) => p.relativePath === reviewPath);
        assert.ok(stale, 'should have stale entry');
        assert.strictEqual(stale!.action, 'remove');
    });

    it('preview shows drifted stale files as skip', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift the agents file
        const reviewPath = expectedSynchronizedPath('agents/review.md');
        fs.writeFileSync(path.join(tmpDir, '.github', reviewPath), 'user stuff');

        // Preview with only skills — drifted agents should be skip
        const skillsOnly = files.filter((f) => f.relativePath.includes('skills'));
        const pending = preview(tmpDir, skillsOnly);

        const stale = pending.find((p) => p.relativePath === reviewPath);
        assert.ok(stale);
        assert.strictEqual(stale!.action, 'skip');
    });

    it('original-unless-conflict preserves nested relative paths in preview and apply', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills', 'nested'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'skills', 'nested', 'guide.md'), '# Guide');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'synchronize' },
            fileNamingStrategy: 'original-unless-conflict',
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const pending = preview(tmpDir, files, undefined, config.fileNamingStrategy);
        assert.ok(
            pending.some((change) => change.relativePath === 'skills/nested/guide.md'),
            'preview should preserve the original nested relative path',
        );

        const result = apply({
            workspaceRoot: tmpDir,
            effectiveFiles: files,
            fileNamingStrategy: config.fileNamingStrategy,
        });
        assert.ok(result.written.includes('skills/nested/guide.md'));
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'skills', 'nested', 'guide.md')));
    });

    it('discovers and synchronizes repo-wide copilot instructions', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'copilot-instructions.md'),
            '# Repo-wide Copilot Instructions',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { instructions: 'settings' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const file = fileMap.get('copilot-instructions.md');
        assert.ok(file, 'repo-wide copilot instructions should be retained');
        assert.strictEqual(file?.classification, 'synchronized');

        const pending = preview(tmpDir, files);
        assert.ok(pending.some((change) => change.relativePath === 'copilot-instructions.md'));

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.written.includes('copilot-instructions.md'));
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md')));

        fs.writeFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'local edit');
        const drift = checkAllDrift(tmpDir, '.github', loadManagedState(tmpDir));
        assert.strictEqual(
            drift.find((entry) => entry.relativePath === 'copilot-instructions.md')?.status,
            'drifted',
        );
    });

    it('discovers and synchronizes Codex project instructions to root AGENTS.md', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'AGENTS.md'), '# Repository Guidance');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { instructions: 'settings' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const file = fileMap.get('AGENTS.md');
        assert.ok(file, 'Codex project instructions should be retained');
        assert.strictEqual(file?.classification, 'synchronized');
        assert.strictEqual(toSynchronizedRelativePath(file as EffectiveFile), 'AGENTS.md');

        const pending = preview(tmpDir, files);
        assert.ok(pending.some((change) => change.relativePath === 'AGENTS.md'));

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.written.includes('AGENTS.md'));
        assert.ok(fs.existsSync(path.join(tmpDir, 'AGENTS.md')));
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', 'AGENTS.md')));

        fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'local edit');
        const drift = checkAllDrift(tmpDir, '.github', loadManagedState(tmpDir));
        assert.strictEqual(
            drift.find((entry) => entry.relativePath === 'AGENTS.md')?.status,
            'drifted',
        );
    });

    it('planSynchronization fails when Codex project instructions would overwrite unmanaged root files', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'AGENTS.md'), '# Managed Guidance', 'utf-8');
        fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# User Guidance', 'utf-8');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const message = captureErrorMessage(() =>
            planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
        assert.ok(message.includes('AGENTS.md'));
    });

    it('target adapter candidate mode reports Codex project instructions without writing', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'targets'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'AGENTS.md'), '# Managed Guidance', 'utf-8');
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'targets', 'codex.json'),
            JSON.stringify({
                schemaVersion: 'metaflow.targetAdapter/v1',
                id: 'codex-default',
                target: 'codex',
                enabled: true,
                materializationMode: 'candidate',
                concepts: { instructions: 'candidate' },
                validationStatus: 'staticVerified',
            }),
            'utf-8',
        );
        fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# User Guidance', 'utf-8');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const planned = planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(
            planned.synchronizedFiles.some(
                (entry) => entry.destinationRelativePath === 'AGENTS.md',
            ),
        );

        const pending = preview(tmpDir, files);
        const agentsChange = pending.find((change) => change.relativePath === 'AGENTS.md');
        assert.strictEqual(agentsChange?.action, 'skip');
        assert.strictEqual(agentsChange?.reason, 'target-adapter-candidate');
        assert.strictEqual(
            agentsChange?.projection.targetAdapterMaterializationMode,
            'candidate',
        );

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.skipped.includes('AGENTS.md'));
        assert.ok(!result.written.includes('AGENTS.md'));
        assert.strictEqual(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8'), '# User Guidance');
    });

    it('discovers and synchronizes Codex project config without inline provenance', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.codex', 'rules'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.codex', 'config.toml'),
            'sandbox_mode = "workspace-write"\n',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', '.codex', 'rules', 'release.rules'),
            'deny command "git push"\n',
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { agents: 'plugin', hooks: 'settings' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const configFile = fileMap.get('.codex/config.toml');
        assert.ok(configFile, 'Codex project config should be retained');
        assert.strictEqual(configFile?.classification, 'synchronized');
        assert.strictEqual(
            toSynchronizedRelativePath(configFile as EffectiveFile),
            '.codex/config.toml',
        );

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.written.includes('.codex/config.toml'));
        assert.ok(result.written.includes('.codex/rules/release.rules'));

        const writtenConfig = fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf-8');
        assert.strictEqual(writtenConfig, 'sandbox_mode = "workspace-write"\n');
        assert.ok(!writtenConfig.includes('metaflow:provenance'));
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', '.codex', 'config.toml')));

        fs.writeFileSync(
            path.join(tmpDir, '.codex', 'config.toml'),
            'sandbox_mode = "read-only"\n',
        );
        const drift = checkAllDrift(tmpDir, '.github', loadManagedState(tmpDir));
        assert.strictEqual(
            drift.find((entry) => entry.relativePath === '.codex/config.toml')?.status,
            'drifted',
        );
    });

    it('planSynchronization fails when Codex project config would overwrite unmanaged root files', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.codex'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.codex', 'config.toml'),
            'sandbox_mode = "workspace-write"\n',
            'utf-8',
        );
        fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, '.codex', 'config.toml'), '# user-owned', 'utf-8');

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const message = captureErrorMessage(() =>
            planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
        assert.ok(message.includes('.codex/config.toml'));
    });

    it('discovers and synchronizes Codex repository skills to root .agents', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        const codexSkillPath = '.agents/skills/codex-metadata/SKILL.md';
        fs.mkdirSync(path.join(repoDir, 'core', '.agents', 'skills', 'codex-metadata'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            '# Codex Metadata',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'settings' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const file = fileMap.get(codexSkillPath);
        assert.ok(file, 'Codex repository skill should be retained');
        assert.strictEqual(file?.classification, 'synchronized');
        assert.strictEqual(toSynchronizedRelativePath(file as EffectiveFile), codexSkillPath);

        const pending = preview(tmpDir, files);
        assert.ok(pending.some((change) => change.relativePath === codexSkillPath));

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.written.includes(codexSkillPath));
        assert.ok(
            fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'codex-metadata', 'SKILL.md')),
        );
        assert.ok(
            !fs.existsSync(
                path.join(tmpDir, '.github', '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            ),
        );

        fs.writeFileSync(
            path.join(tmpDir, '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            'local edit',
        );
        const drift = checkAllDrift(tmpDir, '.github', loadManagedState(tmpDir));
        assert.strictEqual(
            drift.find((entry) => entry.relativePath === codexSkillPath)?.status,
            'drifted',
        );

        const cleanResult = clean(tmpDir);
        assert.ok(cleanResult.skipped.includes(codexSkillPath));
    });

    it('projects canonical MetaFlow skills to Copilot skill and Codex repository skill targets', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        const canonicalSkillPath = '.metaflow/skills/release-readiness/SKILL.md';
        const copilotSkillPath = 'skills/release-readiness/SKILL.md';
        const codexSkillPath = '.agents/skills/release-readiness/SKILL.md';
        fs.mkdirSync(path.join(repoDir, 'core', '.metaflow', 'skills', 'release-readiness'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.metaflow', 'skills', 'release-readiness', 'SKILL.md'),
            '# Release Readiness',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const copilotSkill = fileMap.get(copilotSkillPath);
        const codexSkill = fileMap.get(codexSkillPath);
        assert.ok(copilotSkill, 'canonical skill should project to a Copilot skill artifact');
        assert.ok(
            codexSkill,
            'canonical skill should project to a Codex repository skill artifact',
        );
        assert.strictEqual(copilotSkill?.sourceRelativePath, canonicalSkillPath);
        assert.strictEqual(codexSkill?.sourceRelativePath, canonicalSkillPath);
        assert.strictEqual(copilotSkill?.classification, 'plugin');
        assert.strictEqual(codexSkill?.classification, 'synchronized');
        assert.strictEqual(toSynchronizedRelativePath(codexSkill as EffectiveFile), codexSkillPath);

        const plan = planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files });
        const plannedCodexSkill = plan.synchronizedFiles.find(
            (entry) => entry.destinationRelativePath === codexSkillPath,
        );
        assert.strictEqual(plannedCodexSkill?.projection.target, 'codex');
        assert.strictEqual(plannedCodexSkill?.projection.sourceFormat, 'metaflow');
        assert.strictEqual(plannedCodexSkill?.projection.lossiness, 'none');
        assert.strictEqual(plannedCodexSkill?.projection.pathTransformed, true);

        const pending = preview(tmpDir, files);
        const pendingCodexSkill = pending.find((change) => change.relativePath === codexSkillPath);
        assert.strictEqual(pendingCodexSkill?.projection.target, 'codex');
        assert.strictEqual(pendingCodexSkill?.projection.sourceFormat, 'metaflow');
        assert.strictEqual(pendingCodexSkill?.projection.lossiness, 'none');
        assert.ok(!pending.some((change) => change.relativePath === copilotSkillPath));

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        assert.ok(result.written.includes(codexSkillPath));
        assert.ok(
            fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'release-readiness', 'SKILL.md')),
        );
        assert.ok(
            !fs.existsSync(path.join(tmpDir, '.github', 'skills', 'release-readiness', 'SKILL.md')),
        );

        const state = loadManagedState(tmpDir);
        assert.strictEqual(state.files[codexSkillPath]?.sourceRelativePath, canonicalSkillPath);
    });

    it('planSynchronization fails when Codex repository skills would overwrite unmanaged root files', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        const codexSkillPath = '.agents/skills/codex-metadata/SKILL.md';
        fs.mkdirSync(path.join(repoDir, 'core', '.agents', 'skills', 'codex-metadata'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpDir, '.agents', 'skills', 'codex-metadata'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            '# Managed Skill',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(tmpDir, '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            '# User Skill',
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const message = captureErrorMessage(() =>
            planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
        assert.ok(message.includes(codexSkillPath));
    });

    it('planSynchronization fails when repo-wide copilot instructions would overwrite an unmanaged file', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'copilot-instructions.md'),
            '# Managed Instructions',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(tmpDir, '.github', 'copilot-instructions.md'),
            '# User Instructions',
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { instructions: 'settings' },
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const message = captureErrorMessage(() =>
            planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
        assert.ok(message.includes('copilot-instructions.md'));
    });

    it('preview and apply fail with the same message when strategy change would remap managed files', () => {
        const files = setupAndApply();
        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        const previewMessage = captureErrorMessage(() =>
            preview(tmpDir, files, undefined, 'original-unless-conflict'),
        );
        const applyMessage = captureErrorMessage(() =>
            apply({
                workspaceRoot: tmpDir,
                effectiveFiles: files,
                fileNamingStrategy: 'original-unless-conflict',
                force: false,
            }),
        );

        assert.strictEqual(applyMessage, previewMessage);
        assert.ok(applyMessage.includes('Automatic migration is not supported'));
    });

    it('planSynchronization fails when original-unless-conflict would overwrite an unmanaged file', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills', 'nested'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'core', 'skills', 'nested', 'guide.md'), '# Guide');
        fs.mkdirSync(path.join(tmpDir, '.github', 'skills', 'nested'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpDir, '.github', 'skills', 'nested', 'guide.md'),
            'user-owned file',
            'utf-8',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'synchronize' },
            fileNamingStrategy: 'original-unless-conflict',
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const message = captureErrorMessage(() =>
            planSynchronization({
                workspaceRoot: tmpDir,
                effectiveFiles: files,
                fileNamingStrategy: config.fileNamingStrategy,
            }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
        assert.ok(message.includes('skills/nested/guide.md'));
    });

    it('layerSources fileNamingStrategy overrides the global default for synchronized files', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'base', 'skills', 'nested'), { recursive: true });
        fs.writeFileSync(path.join(repoDir, 'base', 'skills', 'nested', 'guide.md'), '# Guide');

        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'meta',
                    localPath: '.ai/ai-metadata',
                    fileNamingStrategy: 'prefixed',
                    capabilities: [
                        {
                            path: 'base',
                            fileNamingStrategy: 'original-unless-conflict',
                            injection: { skills: 'synchronize' },
                        },
                    ],
                },
            ],
            fileNamingStrategy: 'prefixed',
        };

        const normalized = normalizeConfigShape(config).config;
        const layers = resolveLayers(normalized, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, normalized.injection, normalized.layerSources);

        const pending = preview(
            tmpDir,
            files,
            undefined,
            normalized.fileNamingStrategy,
            normalized.layerSources,
        );

        assert.ok(pending.some((change) => change.relativePath === 'skills/nested/guide.md'));
    });

    it('chatmodes stay on prefixed synchronized paths even when original-unless-conflict is configured', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'chatmodes'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'chatmodes', 'legacy.chatmode.md'),
            '# Legacy chatmode',
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            fileNamingStrategy: 'original-unless-conflict',
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);
        const files = Array.from(fileMap.values());
        classifyFiles(files, config.injection);

        const pending = preview(tmpDir, files, undefined, config.fileNamingStrategy);
        const prefixedPath = expectedSynchronizedPath('chatmodes/legacy.chatmode.md');
        assert.ok(pending.some((change) => change.relativePath === prefixedPath));
        assert.ok(
            !pending.some((change) => change.relativePath === 'chatmodes/legacy.chatmode.md'),
        );

        const result = apply({
            workspaceRoot: tmpDir,
            effectiveFiles: files,
            fileNamingStrategy: config.fileNamingStrategy,
        });
        assert.ok(result.written.includes(prefixedPath));
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', prefixedPath)));
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', 'chatmodes', 'legacy.chatmode.md')));
    });
});

// ── Injection mode hierarchy tests ─────────────────────────────────

describe('Engine: injection mode hierarchy', () => {
    function makeFile(
        relativePath: string,
        sourceLayer: string,
        sourceRepo?: string,
    ): EffectiveFile {
        return {
            relativePath,
            sourcePath: `/tmp/${relativePath}`,
            sourceLayer,
            sourceRepo,
            classification: 'synchronized',
        };
    }

    // ── resolveFileInjection ───────────────────────────────────────

    it('IMH-RF-01: returns global injection when no injection map', () => {
        const file = makeFile('instructions/a.md', 'r1/base');
        const global: InjectionConfig = { instructions: 'synchronize' };
        const result = resolveFileInjection(file, undefined, global);
        assert.deepStrictEqual(result, global);
    });

    it('IMH-RF-02: returns layer-specific injection when file matches', () => {
        const file = makeFile('instructions/a.md', 'r1/base', 'r1');
        const layerInjection: InjectionConfig = { instructions: 'synchronize' };
        const map = new Map<string, InjectionConfig>([['r1/base', layerInjection]]);
        const result = resolveFileInjection(file, map, { instructions: 'settings' });
        assert.deepStrictEqual(result, layerInjection);
    });

    it('IMH-RF-03: falls back to global when file layer not in map', () => {
        const file = makeFile('instructions/a.md', 'r2/other', 'r2');
        const map = new Map<string, InjectionConfig>([
            ['r1/base', { instructions: 'synchronize' }],
        ]);
        const global: InjectionConfig = { instructions: 'settings' };
        const result = resolveFileInjection(file, map, global);
        assert.deepStrictEqual(result, global);
    });

    // ── classifyFiles with layerSources ────────────────────────────

    it('IMH-CF-01: backward compatible — no layerSources uses global injection', () => {
        const files = [
            makeFile('instructions/a.md', 'r1/base'),
            makeFile('prompts/b.md', 'r1/base'),
        ];
        classifyFiles(files, { instructions: 'synchronize', prompts: 'settings' });
        assert.strictEqual(files[0].classification, 'synchronized');
        assert.strictEqual(files[1].classification, 'settings');
    });

    it('IMH-CF-02: per-layer injection overrides global for matching files', () => {
        const layerSources: LayerSource[] = [
            { repoId: 'r1', path: 'base', injection: { instructions: 'synchronize' } },
            { repoId: 'r2', path: 'overlay' },
        ];
        const files = [
            makeFile('instructions/a.md', 'r1/base', 'r1'),
            makeFile('instructions/b.md', 'r2/overlay', 'r2'),
        ];
        classifyFiles(files, { instructions: 'settings' }, layerSources);
        assert.strictEqual(
            files[0].classification,
            'synchronized',
            'r1/base has synchronize override',
        );
        assert.strictEqual(files[1].classification, 'settings', 'r2/overlay uses global');
    });

    it('IMH-CF-03: layer injection merges sparsely over global', () => {
        const layerSources: LayerSource[] = [
            { repoId: 'r1', path: 'cap1', injection: { prompts: 'synchronize' } },
        ];
        const files = [
            makeFile('instructions/a.md', 'r1/cap1', 'r1'),
            makeFile('prompts/b.md', 'r1/cap1', 'r1'),
        ];
        classifyFiles(files, { instructions: 'synchronize', prompts: 'settings' }, layerSources);
        // instructions: layer has no override, global says synchronize
        assert.strictEqual(files[0].classification, 'synchronized');
        // prompts: layer says synchronize, overriding global settings
        assert.strictEqual(files[1].classification, 'synchronized');
    });

    it('IMH-CF-04: layers without injection use global, no regression', () => {
        const layerSources: LayerSource[] = [
            { repoId: 'r1', path: 'base' },
            { repoId: 'r2', path: 'extra' },
        ];
        const files = [
            makeFile('instructions/a.md', 'r1/base', 'r1'),
            makeFile('prompts/b.md', 'r2/extra', 'r2'),
        ];
        classifyFiles(files, { instructions: 'synchronize' }, layerSources);
        assert.strictEqual(files[0].classification, 'synchronized');
        assert.strictEqual(files[1].classification, 'settings'); // default
    });

    // ── normalizeConfigShape injection propagation ─────────────────

    it('IMH-NM-01: normalization flattens capability injection onto layerSources', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: '/repo',
                    capabilities: [
                        { path: 'cap1', injection: { instructions: 'synchronize' } },
                        { path: 'cap2' },
                    ],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const ls = result.config.layerSources ?? [];
        assert.strictEqual(ls.length, 2);
        assert.deepStrictEqual(ls[0].injection, { instructions: 'synchronize' });
        assert.strictEqual(ls[1].injection, undefined);
    });

    it('IMH-NM-02: normalization merges repo injection as fallback onto capability', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: '/repo',
                    injection: { prompts: 'synchronize', agents: 'synchronize' },
                    capabilities: [
                        { path: 'cap1', injection: { prompts: 'settings' } },
                        { path: 'cap2' },
                    ],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const ls = result.config.layerSources ?? [];
        // cap1: capability prompts=settings overrides repo prompts=synchronize, agents inherited from repo
        assert.strictEqual(ls[0].injection?.prompts, 'settings');
        assert.strictEqual(ls[0].injection?.agents, 'synchronize');
        // cap2: inherits repo defaults
        assert.strictEqual(ls[1].injection?.prompts, 'synchronize');
        assert.strictEqual(ls[1].injection?.agents, 'synchronize');
    });

    it('IMH-NM-03: toAuthoredConfig preserves repo and capability injection', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: '/repo',
                    injection: { instructions: 'synchronize' },
                    capabilities: [{ path: 'cap1', injection: { prompts: 'synchronize' } }],
                },
            ],
            injection: { skills: 'synchronize' },
        };
        const authored = toAuthoredConfig(config);
        assert.deepStrictEqual(authored.metadataRepos?.[0].injection, {
            instructions: 'synchronize',
        });
        assert.deepStrictEqual(authored.metadataRepos?.[0].capabilities?.[0].injection, {
            prompts: 'synchronize',
        });
        assert.deepStrictEqual(authored.injection, { skills: 'synchronize' });
    });

    it('IMH-NM-04: normalization without any injection produces no injection fields', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: '/repo',
                    capabilities: [{ path: 'cap1' }],
                },
            ],
        };
        const result = normalizeConfigShape(config);
        const ls = result.config.layerSources ?? [];
        assert.strictEqual(ls[0].injection, undefined);
    });
});
