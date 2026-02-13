import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    checkDrift,
    checkAllDrift,
    ManagedState,
    computeContentHash,
    createEmptyState,
    generateProvenanceHeader,
    ProvenanceData,
} from '@metaflow/engine';

suite('driftDetector', () => {
    let tmpDir: string;
    const outputDir = '.github';

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-drift-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function writeFile(relPath: string, content: string): void {
        const fullPath = path.join(tmpDir, outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
    }

    function makeState(files: Record<string, string>): ManagedState {
        const state = createEmptyState();
        for (const [relPath, hash] of Object.entries(files)) {
            state.files[relPath] = { contentHash: hash, sourceLayer: 'test' };
        }
        return state;
    }

    test('in-sync file', () => {
        const body = '# Coding instructions';
        const hash = computeContentHash(body);
        const provenance: ProvenanceData = {
            synced: new Date().toISOString(),
            contentHash: hash,
        };
        const content = generateProvenanceHeader(provenance) + body;
        writeFile('instructions/coding.md', content);
        const state = makeState({ 'instructions/coding.md': hash });

        const result = checkDrift(tmpDir, outputDir, 'instructions/coding.md', state);
        assert.strictEqual(result.status, 'in-sync');
    });

    test('drifted file', () => {
        const originalBody = '# Original';
        const hash = computeContentHash(originalBody);
        // Write with different body
        writeFile('instructions/coding.md', '# Modified by user');
        const state = makeState({ 'instructions/coding.md': hash });

        const result = checkDrift(tmpDir, outputDir, 'instructions/coding.md', state);
        assert.strictEqual(result.status, 'drifted');
    });

    test('missing file', () => {
        const state = makeState({ 'instructions/gone.md': 'sha256:abc' });
        const result = checkDrift(tmpDir, outputDir, 'instructions/gone.md', state);
        assert.strictEqual(result.status, 'missing');
    });

    test('untracked file', () => {
        writeFile('instructions/new.md', '# New file');
        const state = createEmptyState();
        const result = checkDrift(tmpDir, outputDir, 'instructions/new.md', state);
        assert.strictEqual(result.status, 'untracked');
    });

    test('checkAllDrift returns results for all tracked files', () => {
        const hash = computeContentHash('body');
        writeFile('a.md', 'body');
        const state = makeState({
            'a.md': hash, // but file on disk won't have provenance, so it'll be content 'body' -> strip returns 'body' -> hash matches? Actually strip without header returns the same content.
            'b.md': 'sha256:xxx', // missing
        });

        const results = checkAllDrift(tmpDir, outputDir, state);
        assert.strictEqual(results.length, 2);
    });
});
