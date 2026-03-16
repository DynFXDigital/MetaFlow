/**
 * Coverage gap tests — miscellaneous uncovered branches.
 *
 * Targets:
 *   - managedState: incompatible version, corrupted file, getStateDirPath
 *   - driftDetector: 'untracked' and 'missing (tracked)' status
 *   - configLoader: duplicate localPath validation, JSONC parse error after newline,
 *                   parseAndValidate with non-standard config path
 *   - synchronizer: cannot read source file (sourcePath doesn't exist)
 *   - settingsInjector: absolute hook paths
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    // managedState
    loadManagedState,
    saveManagedState,
    createEmptyState,
    getStateDirPath,
    computeContentHash,
    // driftDetector
    checkDrift,
    checkAllDrift,
    // configLoader
    validateConfig,
    parseAndValidate,
    loadConfigFromPath,
    // synchronizer
    apply,
    // settingsInjector
    computeSettingsEntries,
} from '../src/index';
import type { EffectiveFile, MetaFlowConfig, ManagedState } from '../src/index';

// ── Helpers ────────────────────────────────────────────────────────

function createTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-gaps-'));
    fs.mkdirSync(path.join(dir, '.metaflow'), { recursive: true });
    return dir;
}

function cleanupDir(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

const STATE_DIR = '.metaflow';
const STATE_FILE = 'state.json';

// ── managedState ───────────────────────────────────────────────────

describe('Engine gaps: managedState', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => {
        cleanupDir(tmpDir);
    });

    it('returns empty state when state.json has incompatible version', () => {
        const stateDir = path.join(tmpDir, STATE_DIR);
        const statePath = path.join(stateDir, STATE_FILE);
        fs.writeFileSync(
            statePath,
            JSON.stringify({
                version: 99, // version !== CURRENT_VERSION (1)
                lastApply: new Date().toISOString(),
                files: { 'some/file.md': { contentHash: 'sha256:abc', sourceLayer: 'core' } },
            }),
            'utf-8',
        );

        const state = loadManagedState(tmpDir);
        // Should return empty state due to incompatible version
        assert.deepStrictEqual(state.files, {});
        assert.strictEqual(state.version, 1);
    });

    it('returns empty state when state.json is corrupted (invalid JSON)', () => {
        const stateDir = path.join(tmpDir, STATE_DIR);
        const statePath = path.join(stateDir, STATE_FILE);
        fs.writeFileSync(statePath, '{not valid json!!!', 'utf-8');

        const state = loadManagedState(tmpDir);
        assert.deepStrictEqual(state.files, {});
        assert.strictEqual(state.version, 1);
    });

    it('returns empty state when state.json is null/non-object JSON', () => {
        const stateDir = path.join(tmpDir, STATE_DIR);
        const statePath = path.join(stateDir, STATE_FILE);
        fs.writeFileSync(statePath, 'null', 'utf-8');

        const state = loadManagedState(tmpDir);
        assert.deepStrictEqual(state.files, {});
    });

    it('getStateDirPath returns .metaflow directory under workspace root', () => {
        const result = getStateDirPath(tmpDir);
        assert.strictEqual(
            result,
            path.join(tmpDir, '.metaflow'),
            'must return exact path.join(workspaceRoot, .metaflow)',
        );
    });

    it('getStateDirPath is consistent with save/load operations', () => {
        const stateDir = getStateDirPath(tmpDir);
        const state = createEmptyState();
        state.files['hello.md'] = { contentHash: 'sha256:abc', sourceLayer: 'core' };
        saveManagedState(tmpDir, state);

        // The state file should be at getStateDirPath/state.json
        assert.ok(fs.existsSync(path.join(stateDir, 'state.json')));

        const loaded = loadManagedState(tmpDir);
        assert.ok(loaded.files['hello.md']);
    });
});

// ── driftDetector ─────────────────────────────────────────────────

describe('Engine gaps: driftDetector', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => {
        cleanupDir(tmpDir);
    });

    it('returns untracked when file exists on disk but has no state entry', () => {
        // File exists, but state.files has no entry for it
        const outputDir = '.github';
        const relPath = 'instructions/untracked.md';
        const fullPath = path.join(tmpDir, outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, '# Untracked file\n', 'utf-8');

        const state = createEmptyState(); // no files in state
        const result = checkDrift(tmpDir, outputDir, relPath, state);
        assert.strictEqual(result.status, 'untracked');
        assert.strictEqual(result.relativePath, relPath);
    });

    it('returns missing with expectedHash when file was tracked but no longer exists on disk', () => {
        const outputDir = '.github';
        const relPath = 'skills/removed.md';

        const state = createEmptyState();
        const expectedHash = computeContentHash('# Removed file\n');
        state.files[relPath] = { contentHash: expectedHash, sourceLayer: 'core' };
        // No file on disk — should report missing

        const result = checkDrift(tmpDir, outputDir, relPath, state);
        assert.strictEqual(result.status, 'missing');
        assert.strictEqual(result.expectedHash, expectedHash);
        assert.strictEqual(result.relativePath, relPath);
    });

    it('returns missing (no expectedHash) when not tracked and file does not exist', () => {
        const state = createEmptyState();
        const result = checkDrift(tmpDir, '.github', 'nonexistent/file.md', state);
        assert.strictEqual(result.status, 'missing');
        assert.strictEqual(result.expectedHash, undefined);
    });

    it('returns in-sync with matching hashes when file exists and content matches state', () => {
        const outputDir = '.github';
        const relPath = 'instructions/in-sync.md';
        const body = '# In-sync file\nContent.\n';
        const hash = computeContentHash(body);
        const fullPath = path.join(tmpDir, outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, body, 'utf-8');

        const state = createEmptyState();
        state.files[relPath] = { contentHash: hash, sourceLayer: 'core' };

        const result = checkDrift(tmpDir, outputDir, relPath, state);
        assert.strictEqual(result.status, 'in-sync');
        assert.strictEqual(result.relativePath, relPath);
        assert.strictEqual(result.currentHash, hash);
        assert.strictEqual(result.expectedHash, hash);
    });

    it('returns drifted with both hashes when file exists but content was modified', () => {
        const outputDir = '.github';
        const relPath = 'instructions/drifted.md';
        const originalBody = '# Original content\n';
        const expectedHash = computeContentHash(originalBody);

        // Write different content to disk (simulating a user edit)
        const modifiedBody = '# MODIFIED by user\n';
        const fullPath = path.join(tmpDir, outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, modifiedBody, 'utf-8');

        const state = createEmptyState();
        state.files[relPath] = { contentHash: expectedHash, sourceLayer: 'core' };

        const result = checkDrift(tmpDir, outputDir, relPath, state);
        assert.strictEqual(result.status, 'drifted');
        assert.strictEqual(result.relativePath, relPath);
        assert.strictEqual(result.expectedHash, expectedHash);
        assert.strictEqual(result.currentHash, computeContentHash(modifiedBody));
        assert.notStrictEqual(result.currentHash, result.expectedHash);
    });

    it('checkAllDrift with mix of missing and in-sync entries — exact assertions', () => {
        const outputDir = '.github';

        const state = createEmptyState();
        const trackedPath = 'skills/tracked.md';
        const fullPath = path.join(tmpDir, outputDir, trackedPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const body = '# Tracked file\n';
        const hash = computeContentHash(body);
        fs.writeFileSync(fullPath, body, 'utf-8');
        state.files[trackedPath] = { contentHash: hash, sourceLayer: 'core' };

        // Also add a missing-tracked file (state entry, no file on disk)
        const missingPath = 'skills/missing.md';
        const missingHash = computeContentHash('# Missing file content\n');
        state.files[missingPath] = { contentHash: missingHash, sourceLayer: 'core' };

        const results = checkAllDrift(tmpDir, outputDir, state);
        assert.strictEqual(
            results.length,
            2,
            'should have exactly two results (one per state entry)',
        );

        const inSyncResult = results.find((r) => r.relativePath === trackedPath);
        assert.ok(inSyncResult, 'tracked file result must be present');
        assert.strictEqual(inSyncResult!.status, 'in-sync');
        assert.strictEqual(inSyncResult!.currentHash, hash);
        assert.strictEqual(inSyncResult!.expectedHash, hash);

        const missingResult = results.find((r) => r.relativePath === missingPath);
        assert.ok(missingResult, 'missing file result must be present');
        assert.strictEqual(missingResult!.status, 'missing');
        assert.strictEqual(missingResult!.expectedHash, missingHash);
    });
});

// ── configLoader ──────────────────────────────────────────────────

describe('Engine gaps: configLoader', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => {
        cleanupDir(tmpDir);
    });

    it('validateConfig reports error for two enabled repos with same resolved localPath', () => {
        // workspaceRoot is needed to canonicalize paths for duplicate detection
        const errors = validateConfig(
            {
                metadataRepos: [
                    { id: 'r1', localPath: 'repos/shared' },
                    { id: 'r2', localPath: 'repos/shared' },
                ],
            } as MetaFlowConfig,
            tmpDir, // workspaceRoot enables the duplicate-path check
        );
        assert.ok(errors.some((e) => e.message.includes('same localPath')));
    });

    it('validateConfig skips duplicate-path check when workspaceRoot is undefined', () => {
        // Without workspaceRoot, the canonicalization step is skipped
        const errors = validateConfig(
            {
                metadataRepos: [
                    { id: 'r1', localPath: 'repos/shared' },
                    { id: 'r2', localPath: 'repos/shared' },
                ],
            } as MetaFlowConfig,
            // no workspaceRoot
        );
        // Must not report duplicate path error when workspace root is absent
        assert.ok(!errors.some((e) => e.message.includes('same localPath')));
    });

    it('validateConfig skips disabled repos in duplicate-path check', () => {
        const errors = validateConfig(
            {
                metadataRepos: [
                    { id: 'r1', localPath: 'repos/shared', enabled: true },
                    { id: 'r2', localPath: 'repos/shared', enabled: false }, // disabled → skip
                ],
            } as MetaFlowConfig,
            tmpDir,
        );
        assert.ok(!errors.some((e) => e.message.includes('same localPath')));
    });

    it('parseAndValidate works with non-standard config path (inferWorkspaceRoot returns undefined)', () => {
        // Non-standard path: workspaceRoot will be undefined → duplicate-path check is skipped
        const rawConfig = JSON.stringify({
            metadataRepo: { localPath: '.ai/metadata' },
            layers: ['core'],
        });
        const result = parseAndValidate(rawConfig, '/non-standard/config.json');
        assert.strictEqual(result.ok, true);
    });

    it('JSONC parse error includes line/column for error after a newline', () => {
        // Error on second line: offset > 0 after first newline → line > 0
        const configPath = path.join(tmpDir, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{\n  !!invalid\n}', 'utf-8');

        const result = loadConfigFromPath(configPath);
        assert.strictEqual(result.ok, false);
        assert.ok(result.errors.length > 0);
        assert.ok(result.errors[0].message.includes('JSON parse error'));
        // At least one error should have line > 0 due to the newline
        assert.ok(result.errors[0].line !== undefined);
        assert.ok(result.errors[0].line! >= 1);
    });

    it('validateConfig reports error for layerSource missing path', () => {
        const errors = validateConfig({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            layerSources: [{ repoId: 'r1', path: '' }],
        } as MetaFlowConfig);
        assert.ok(errors.some((e) => e.message.includes('path')));
    });

    it('validateConfig reports error for layerSource missing repoId', () => {
        const errors = validateConfig({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            layerSources: [{ repoId: '', path: 'core' }],
        } as MetaFlowConfig);
        assert.ok(errors.some((e) => e.message.includes('repoId')));
    });

    it('validateConfig reports error for invalid discover.exclude in metadataRepos', () => {
        const errors = validateConfig({
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    discover: { exclude: ['valid', 42 as unknown as string] },
                },
            ],
        } as MetaFlowConfig);
        assert.ok(errors.some((e) => e.message.includes('discover.exclude')));
    });

    it('validateConfig reports error for invalid capabilities entries', () => {
        const errors = validateConfig({
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [{ path: 123 } as unknown as { path: string }],
                },
            ],
        } as MetaFlowConfig);
        assert.ok(errors.some((e) => e.message.includes('capabilities')));
    });

    it('validateConfig reports error for invalid excludedTypes in layerSources', () => {
        const errors = validateConfig({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            layerSources: [
                {
                    repoId: 'r1',
                    path: 'core',
                    excludedTypes: [1 as unknown as string],
                },
            ],
        } as MetaFlowConfig);
        assert.ok(errors.some((e) => e.message.includes('excludedTypes')));
    });
});

// ── synchronizer ──────────────────────────────────────────────────

describe('Engine gaps: synchronizer', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => {
        cleanupDir(tmpDir);
    });

    it('apply warns and skips when source file cannot be read', () => {
        const file: EffectiveFile = {
            relativePath: 'instructions/coded.md',
            sourcePath: path.join(tmpDir, 'nonexistent', 'definitely-not-there.md'),
            sourceLayer: 'core',
            classification: 'synchronized',
        };

        const result = apply({
            workspaceRoot: tmpDir,
            effectiveFiles: [file],
            force: false,
        });

        assert.strictEqual(result.written.length, 0);
        assert.ok(result.warnings.some((w) => w.includes('Cannot read source')));
    });

    it('apply skips non-synchronized (settings) files entirely', () => {
        // settings-classified files should not be written by apply()
        const file: EffectiveFile = {
            relativePath: 'instructions/some.md',
            sourcePath: path.join(tmpDir, 'nonexistent.md'), // won't be read
            sourceLayer: 'core',
            classification: 'settings', // not 'synchronized'
        };

        const result = apply({
            workspaceRoot: tmpDir,
            effectiveFiles: [file],
            force: false,
        });

        assert.strictEqual(result.written.length, 0);
        assert.strictEqual(result.warnings.length, 0);
    });
});

// ── settingsInjector ──────────────────────────────────────────────

describe('Engine gaps: settingsInjector absolute hooks', () => {
    let tmpDir: string;
    beforeEach(() => {
        tmpDir = createTmpDir();
    });
    afterEach(() => {
        cleanupDir(tmpDir);
    });

    it('computeSettingsEntries handles absolute hook paths', () => {
        // When hooks.preApply and postApply are absolute paths
        const config: MetaFlowConfig = {
            metadataRepo: { localPath: 'repo' },
            layers: ['core'],
            hooks: {
                preApply: path.isAbsolute('/absolute/pre.sh')
                    ? '/absolute/pre.sh'
                    : path.resolve(tmpDir, 'pre.sh'),
                postApply: path.isAbsolute('/absolute/post.sh')
                    ? '/absolute/post.sh'
                    : path.resolve(tmpDir, 'post.sh'),
            },
        };

        const entries = computeSettingsEntries([], tmpDir, config);
        const hookLocations = entries.find((e) => e.key === 'chat.hookFilesLocations');
        assert.ok(hookLocations, 'should have hook file locations');
    });
});
