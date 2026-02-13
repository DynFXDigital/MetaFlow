import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    loadManagedState,
    saveManagedState,
    computeContentHash,
    createEmptyState,
} from '@metaflow/engine';

suite('managedState', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-state-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('computeContentHash returns sha256 prefixed hash', () => {
        const hash = computeContentHash('hello world');
        assert.ok(hash.startsWith('sha256:'));
        assert.strictEqual(hash.length, 7 + 64); // "sha256:" + 64 hex chars
    });

    test('computeContentHash is deterministic', () => {
        const h1 = computeContentHash('test content');
        const h2 = computeContentHash('test content');
        assert.strictEqual(h1, h2);
    });

    test('save and load round-trip', () => {
        const state = createEmptyState();
        state.files['instructions/coding.md'] = {
            contentHash: 'sha256:abc123',
            sourceLayer: 'company/core',
        };
        saveManagedState(tmpDir, state);
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.ok(loaded.files['instructions/coding.md']);
        assert.strictEqual(loaded.files['instructions/coding.md'].contentHash, 'sha256:abc123');
    });

    test('load from non-existent state returns empty', () => {
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.deepStrictEqual(loaded.files, {});
    });

    test('load from corrupted state returns empty', () => {
        const stateDir = path.join(tmpDir, '.ai', '.sync-state');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'overlay_managed.json'), 'not json', 'utf-8');
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.deepStrictEqual(loaded.files, {});
    });

    test('state with multiple files', () => {
        const state = createEmptyState();
        state.files['a.md'] = { contentHash: 'sha256:aaa', sourceLayer: 'base' };
        state.files['b.md'] = { contentHash: 'sha256:bbb', sourceLayer: 'team' };
        state.files['c.md'] = { contentHash: 'sha256:ccc', sourceLayer: 'team', sourceRepo: 'standards' };
        saveManagedState(tmpDir, state);
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(Object.keys(loaded.files).length, 3);
        assert.strictEqual(loaded.files['c.md'].sourceRepo, 'standards');
    });
});
