/**
 * Engine package integration tests.
 *
 * Verifies the public API of @metaflow/engine works correctly
 * as a standalone package. These complement the 111 unit tests
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
    // Engine
    resolveLayers,
    buildEffectiveFileMap,
    applyFilters,
    applyProfile,
    classifyFiles,
    classifySingle,
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
    // Types
    MetaFlowConfig,
    EffectiveFile,
    ConfigLoadResult,
    ProfileConfig,
} from '../src/index';

// ── Helpers ────────────────────────────────────────────────────────

function createTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
}

function cleanupDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function expectedMaterializedPath(
    relativePath: string,
    sourceLayer = 'core',
    sourceRepo = 'default'
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
        assert.strictEqual(typeof resolvePathFromWorkspace, 'function');
        assert.strictEqual(typeof isWithinBoundary, 'function');

        // Engine exports
        assert.strictEqual(typeof resolveLayers, 'function');
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

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('loadConfig finds and parses .metaflow.json', () => {
        const config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core'],
        };
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow.json'),
            JSON.stringify(config),
            'utf-8'
        );

        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, true);
        if (result.ok) {
            assert.strictEqual(result.config.metadataRepo?.localPath, '.ai/ai-metadata');
            assert.deepStrictEqual(result.config.layers, ['company/core']);
        }
    });

    it('loadConfig returns errors for missing config', () => {
        const result = loadConfig(tmpDir);
        assert.strictEqual(result.ok, false);
    });

    it('discoverConfigPath finds root config', () => {
        fs.writeFileSync(
            path.join(tmpDir, '.metaflow.json'),
            '{}',
            'utf-8'
        );
        const found = discoverConfigPath(tmpDir);
        assert.ok(found);
        assert.ok(found!.endsWith('.metaflow.json'));
    });

    it('discoverConfigPath finds .ai/ fallback', () => {
        const aiDir = path.join(tmpDir, '.ai');
        fs.mkdirSync(aiDir, { recursive: true });
        fs.writeFileSync(
            path.join(aiDir, '.metaflow.json'),
            '{}',
            'utf-8'
        );
        const found = discoverConfigPath(tmpDir);
        assert.ok(found);
        assert.ok(found!.includes('.ai'));
    });
});

describe('Engine package: overlay pipeline', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('full pipeline: resolve → build → filter → profile → classify', () => {
        // Set up metadata repo with a layer
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills'), { recursive: true });
        fs.mkdirSync(path.join(repoDir, 'core', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', 'skills', 'test.md'),
            '# Test skill'
        );
        fs.writeFileSync(
            path.join(repoDir, 'core', 'instructions', 'coding.md'),
            '# Coding'
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            filters: { include: ['**'], exclude: [] },
            injection: {
                instructions: 'settings',
                skills: 'materialize',
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
        const skill = files.find(f => f.relativePath.includes('skills'));
        const instr = files.find(f => f.relativePath.includes('instructions'));
        assert.strictEqual(skill?.classification, 'materialized');
        assert.strictEqual(instr?.classification, 'settings');
    });

    it('normalizes .github-prefixed paths before classification', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'instructions', 'test.instructions.md'),
            '# Test instruction'
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

        assert.ok(files.some(f => f.relativePath === 'instructions/test.instructions.md'));

        classifyFiles(files, config.injection);
        const instruction = files.find(f => f.relativePath === 'instructions/test.instructions.md');
        assert.strictEqual(instruction?.classification, 'settings');
    });

    it('classifies deprecated chatmodes as materialized-only', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', '.github', 'chatmodes'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', '.github', 'chatmodes', 'legacy.chatmode.md'),
            '# Legacy chatmode'
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

        assert.ok(files.some(f => f.relativePath === 'chatmodes/legacy.chatmode.md'));

        classifyFiles(files, config.injection);
        const chatmode = files.find(f => f.relativePath === 'chatmodes/legacy.chatmode.md');
        assert.strictEqual(chatmode?.classification, 'materialized');
    });
});

describe('Engine package: materialization', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('apply + preview + clean lifecycle', () => {
        // Set up metadata repo
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'agents'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', 'agents', 'review.md'),
            '# Review Agent'
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { agents: 'materialize' },
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
        const reviewPath = expectedMaterializedPath('agents/review.md');
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', reviewPath)));

        // Verify provenance header
        const content = fs.readFileSync(
            path.join(tmpDir, '.github', reviewPath),
            'utf-8'
        );
        assert.ok(content.includes('metaflow:provenance'));

        // Clean
        const cleanResult = clean(tmpDir);
        assert.ok(cleanResult.removed.length > 0);
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });
});

describe('Engine package: drift detection', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('detects drift after manual edit', () => {
        // Set up and apply
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(path.join(repoDir, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'core', 'skills', 'test.md'),
            '# Test'
        );

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['core'],
            injection: { skills: 'materialize' },
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
        assert.ok(results.every(r => r.status === 'in-sync'));

        // Manually edit
        const testPath = expectedMaterializedPath('skills/test.md');
        fs.writeFileSync(
            path.join(tmpDir, '.github', testPath),
            'User modified content'
        );

        // Drift detected
        const results2 = checkAllDrift(tmpDir, '.github', state);
        assert.ok(results2.some(r => r.status === 'drifted'));
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
            { relativePath: 'skills/a.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'agents/b.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
        ];
        const result = applyFilters(files, { include: ['**'], exclude: ['agents/**'] });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'skills/a.md');
    });
});

describe('Engine package: managed state', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('save + load round-trip', () => {
        const state = createEmptyState();
        state.files['test.md'] = {
            contentHash: computeContentHash('hello'),
            sourceLayer: 'core',
        };
        saveManagedState(tmpDir, state);

        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.ok(loaded.files['test.md']);
        assert.strictEqual(loaded.files['test.md'].sourceLayer, 'core');
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

    beforeEach(() => { tmpDir = createTmpDir(); });
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
                classification: 'materialized', // not settings — should be ignored
            },
        ];

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
        };

        const entries = computeSettingsEntries(files, tmpDir, config);
        assert.ok(entries.length >= 4, `expected >=4 entries, got ${entries.length}`);

        const instrEntry = entries.find(e => e.key === 'chat.instructionsFilesLocations');
        const promptEntry = entries.find(e => e.key === 'chat.promptFilesLocations');
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
        const hookLocations = entries.find(e => e.key === 'chat.hookFilesLocations');
        assert.ok(hookLocations, 'should have hook file locations');
        const locations = hookLocations!.value as Record<string, boolean>;
        assert.ok(locations['scripts/pre.sh']);
        assert.ok(locations['scripts/post.sh']);
    });

    it('computeSettingsEntries skips hooks when not configured', () => {
        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
        };

        const entries = computeSettingsEntries([], tmpDir, config);
        assert.ok(!entries.some(e => e.key.includes('hooks')));
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
            { relativePath: 'skills/a.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'agents/b.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'instructions/c.md', sourcePath: '/x', sourceLayer: 'l', classification: 'settings' },
        ];

        const profile: ProfileConfig = { disable: ['agents/**'] };
        const result = applyProfile(files, profile);
        assert.strictEqual(result.length, 2);
        assert.ok(!result.some(f => f.relativePath.includes('agents')));
    });

    it('profile with enable patterns only includes matching files', () => {
        const files: EffectiveFile[] = [
            { relativePath: 'skills/a.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'agents/b.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'instructions/c.md', sourcePath: '/x', sourceLayer: 'l', classification: 'settings' },
        ];

        const profile: ProfileConfig = { enable: ['skills/**'] };
        const result = applyProfile(files, profile);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'skills/a.md');
    });

    it('disable wins over enable when both match', () => {
        const files: EffectiveFile[] = [
            { relativePath: 'skills/secret.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
            { relativePath: 'skills/public.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
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
            { relativePath: 'skills/a.md', sourcePath: '/x', sourceLayer: 'l', classification: 'materialized' },
        ];

        const result = applyProfile(files, {} as ProfileConfig);
        assert.strictEqual(result.length, 1);
    });
});

describe('Engine: overlay multi-repo resolution', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
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

        const allFiles = layers.flatMap(l => l.files);
        assert.strictEqual(allFiles.length, 2);
    });

    it('multi-repo skips disabled layer sources', () => {
        const repoA = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core', enabled: false },
            ],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('multi-repo skips layer sources from disabled repos', () => {
        const repoA = path.join(tmpDir, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company', enabled: false },
            ],
            layerSources: [
                { repoId: 'company', path: 'core', enabled: true },
            ],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('multi-repo skips invalid repoId', () => {
        const config: MetaFlowConfig = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company' },
            ],
            layerSources: [
                { repoId: 'nonexistent', path: 'core' },
            ],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('resolveLayers returns empty when no repo config', () => {
        const config = {} as MetaFlowConfig;
        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 0);
    });

    it('resolveLayers handles missing layer directory gracefully', () => {
        const repoDir = path.join(tmpDir, '.ai', 'ai-metadata');
        fs.mkdirSync(repoDir, { recursive: true });

        const config: MetaFlowConfig = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['nonexistent-layer'],
        };

        const layers = resolveLayers(config, tmpDir);
        assert.strictEqual(layers.length, 1);
        assert.strictEqual(layers[0].files.length, 0);
    });
});

describe('Engine: config validation', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
    afterEach(() => cleanupDir(tmpDir));

    it('loadConfigFromPath handles unreadable file', () => {
        const result = loadConfigFromPath(path.join(tmpDir, 'nonexistent.json'));
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('Failed to read'));
    });

    it('loadConfigFromPath rejects non-object JSON', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, '"just a string"', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('must be a JSON object'));
    });

    it('loadConfigFromPath rejects array JSON', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, '[1, 2, 3]', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors[0].message.includes('must be a JSON object'));
    });

    it('loadConfigFromPath catches JSONC parse errors', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, '{ invalid {{', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
        assert.ok(result.errors[0].message.includes('JSON parse error'));
        // Should have line/column info
        assert.ok(result.errors[0].line !== undefined);
    });

    it('validates single-repo mode requires localPath', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepo: {},
            layers: ['core'],
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('localPath')));
    });

    it('validates single-repo mode requires layers', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepo: { localPath: '.ai/metadata' },
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('layers')));
    });

    it('validates multi-repo unique IDs', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepos: [
                { id: 'dup', localPath: 'a' },
                { id: 'dup', localPath: 'b' },
            ],
            layerSources: [
                { repoId: 'dup', path: 'core' },
            ],
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('unique')));
    });

    it('validates multi-repo requires layerSources', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepos: [
                { id: 'r1', localPath: 'a' },
            ],
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('layerSources')));
    });

    it('validates multi-repo repoId references', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepos: [
                { id: 'r1', localPath: 'a' },
            ],
            layerSources: [
                { repoId: 'wrong', path: 'core' },
            ],
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('does not match')));
    });

    it('validates multi-repo missing repo fields', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepos: [
                { id: '', localPath: '' },
            ],
            layerSources: [
                { repoId: '', path: '' },
            ],
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
    });

    it('validates active profile must exist in profiles', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({
            metadataRepo: { localPath: '.ai/metadata' },
            layers: ['core'],
            profiles: { default: { enable: ['**'] } },
            activeProfile: 'nonexistent',
        }), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('not found in "profiles"')));
    });

    it('validates config must have at least one repo mode', () => {
        const configPath = path.join(tmpDir, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify({}), 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.some(e => e.message.includes('metadataRepo')));
    });
});

describe('Engine: materializer advanced', () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTmpDir(); });
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
            injection: { skills: 'materialize', agents: 'materialize' },
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
        const skillsPath = expectedMaterializedPath('skills/test.md');
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
        const skillsOnly = files.filter(f => f.relativePath.includes('skills'));
        const r = apply({ workspaceRoot: tmpDir, effectiveFiles: skillsOnly, force: false });

        const reviewPath = expectedMaterializedPath('agents/review.md');
        assert.ok(r.removed.includes(reviewPath));
        assert.ok(!fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });

    it('apply warns about drifted stale files', () => {
        const files = setupAndApply();

        // Apply both
        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift the agents file
        const reviewPath = expectedMaterializedPath('agents/review.md');
        fs.writeFileSync(path.join(tmpDir, '.github', reviewPath), 'user content');

        // Re-apply with only skills — agents is stale AND drifted
        const skillsOnly = files.filter(f => f.relativePath.includes('skills'));
        const r = apply({ workspaceRoot: tmpDir, effectiveFiles: skillsOnly, force: false });

        assert.ok(r.warnings.some(w => w.includes('Drifted file not removed')));
        // Drifted stale file should NOT be removed
        assert.ok(fs.existsSync(path.join(tmpDir, '.github', reviewPath)));
    });

    it('preview shows drifted files as skip', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift a file
        const skillsPath = expectedMaterializedPath('skills/test.md');
        fs.writeFileSync(path.join(tmpDir, '.github', skillsPath), 'drifted');

        const pending = preview(tmpDir, files);
        const drifted = pending.find(p => p.relativePath === skillsPath);
        assert.strictEqual(drifted?.action, 'skip');
        assert.strictEqual(drifted?.reason, 'drifted');
    });

    it('preview shows stale files as remove', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Preview with only skills — agents should be flagged for removal
        const skillsOnly = files.filter(f => f.relativePath.includes('skills'));
        const pending = preview(tmpDir, skillsOnly);

        const reviewPath = expectedMaterializedPath('agents/review.md');
        const stale = pending.find(p => p.relativePath === reviewPath);
        assert.ok(stale, 'should have stale entry');
        assert.strictEqual(stale!.action, 'remove');
    });

    it('preview shows drifted stale files as skip', () => {
        const files = setupAndApply();

        apply({ workspaceRoot: tmpDir, effectiveFiles: files, force: false });

        // Drift the agents file
        const reviewPath = expectedMaterializedPath('agents/review.md');
        fs.writeFileSync(path.join(tmpDir, '.github', reviewPath), 'user stuff');

        // Preview with only skills — drifted agents should be skip
        const skillsOnly = files.filter(f => f.relativePath.includes('skills'));
        const pending = preview(tmpDir, skillsOnly);

        const stale = pending.find(p => p.relativePath === reviewPath);
        assert.ok(stale);
        assert.strictEqual(stale!.action, 'skip');
    });
});
