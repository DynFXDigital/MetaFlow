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
        const stateDir = path.join(tmpDir, '.metaflow');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'state.json'), 'not json', 'utf-8');
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(loaded.version, 1);
        assert.deepStrictEqual(loaded.files, {});
    });

    test('state with multiple files', () => {
        const state = createEmptyState();
        state.files['a.md'] = { contentHash: 'sha256:aaa', sourceLayer: 'base' };
        state.files['b.md'] = { contentHash: 'sha256:bbb', sourceLayer: 'team' };
        state.files['c.md'] = {
            contentHash: 'sha256:ccc',
            sourceLayer: 'team',
            sourceRepo: 'standards',
        };
        saveManagedState(tmpDir, state);
        const loaded = loadManagedState(tmpDir);
        assert.strictEqual(Object.keys(loaded.files).length, 3);
        assert.strictEqual(loaded.files['c.md'].sourceRepo, 'standards');
    });

    test('saveManagedState writes a canonical file order', () => {
        const state = createEmptyState();
        state.lastApply = '2026-03-15T00:00:00.000Z';
        state.files['z.md'] = {
            sourceRepo: 'repo-z',
            sourceCommit: 'abc123',
            sourceRelativePath: 'instructions/z.md',
            sourceLayer: 'team/z',
            contentHash: 'sha256:zzz',
        };
        state.files['a.md'] = {
            sourceRelativePath: 'instructions/a.md',
            sourceLayer: 'team/a',
            contentHash: 'sha256:aaa',
        };

        saveManagedState(tmpDir, state);

        const raw = fs.readFileSync(path.join(tmpDir, '.metaflow', 'state.json'), 'utf-8');
        const expected = [
            '{',
            '  "version": 1,',
            '  "lastApply": "2026-03-15T00:00:00.000Z",',
            '  "files": {',
            '    "a.md": {',
            '      "contentHash": "sha256:aaa",',
            '      "sourceLayer": "team/a",',
            '      "sourceRelativePath": "instructions/a.md"',
            '    },',
            '    "z.md": {',
            '      "contentHash": "sha256:zzz",',
            '      "sourceLayer": "team/z",',
            '      "sourceRelativePath": "instructions/z.md",',
            '      "sourceRepo": "repo-z",',
            '      "sourceCommit": "abc123"',
            '    }',
            '  }',
            '}',
            '',
        ].join('\n');

        assert.strictEqual(raw, expected);
    });

    test('saveManagedState preserves canonical view preference ordering', () => {
        const state = createEmptyState();
        state.lastApply = '2026-03-15T00:00:00.000Z';
        state.views = {
            layersViewMode: 'tree',
            filesViewMode: 'unified',
        };

        saveManagedState(tmpDir, state);

        const raw = fs.readFileSync(path.join(tmpDir, '.metaflow', 'state.json'), 'utf-8');
        const expected = [
            '{',
            '  "version": 1,',
            '  "lastApply": "2026-03-15T00:00:00.000Z",',
            '  "files": {},',
            '  "views": {',
            '    "filesViewMode": "unified",',
            '    "layersViewMode": "tree"',
            '  }',
            '}',
            '',
        ].join('\n');

        assert.strictEqual(raw, expected);
    });
});
