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
    preview,
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    toSynchronizedRelativePath,
    toAuthoredConfig,
    normalizeConfigShape,
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
                            excludedTypes: ['instructions'],
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
                excludedTypes: ['instructions'],
            },
        ]);
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
        assert.ok(entries.length >= 4, `expected >=4 entries, got ${entries.length}`);

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

    it('classifySingle treats .github instructions as settings artifacts', () => {
        assert.strictEqual(classifySingle('.github/instructions/coding.md', undefined), 'settings');
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

    it('computeSettingsEntries sorts legacy array-valued settings entries deterministically', () => {
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
        const legacyInstructionsEntry = entries.find(
            (entry) => entry.key === 'github.copilot.chat.codeGeneration.instructionFiles',
        );

        assert.deepStrictEqual(legacyInstructionsEntry?.value, [
            'repo/alpha/instructions',
            'repo/zeta/instructions',
        ]);
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
        assert.ok(keys.includes('github.copilot.chat.codeGeneration.instructionFiles'));
        assert.ok(keys.includes('github.copilot.chat.promptFiles'));
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

    it('validates single-repo mode requires layers', () => {
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                metadataRepo: { localPath: '.ai/metadata' },
            }),
            'utf-8',
        );

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('layers')));
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

    it('validates active profile must exist in profiles', () => {
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
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some((e) => e.message.includes('not found in "profiles"')));
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
