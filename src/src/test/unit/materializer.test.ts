import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    apply,
    clean,
    preview,
    EffectiveFile,
    loadManagedState,
    parseProvenanceHeader,
} from '@metaflow/engine';

suite('materializer', () => {
    let tmpDir: string;
    let sourceDir: string;
    const outputDir = '.github';

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-mat-'));
        sourceDir = path.join(tmpDir, 'source');
        fs.mkdirSync(sourceDir, { recursive: true });
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function createSourceFile(name: string, content: string): string {
        const filePath = path.join(sourceDir, name);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }

    function makeEffectiveFile(relativePath: string, content: string): EffectiveFile {
        const sourcePath = createSourceFile(relativePath, content);
        return {
            relativePath,
            sourcePath,
            sourceLayer: 'test-layer',
            classification: 'materialized',
        };
    }

    function expectedMaterializedPath(relativePath: string): string {
        const normalized = relativePath.replace(/\\/g, '/');
        const dir = path.posix.dirname(normalized);
        const base = path.posix.basename(normalized);
        const prefixed = `_default-test-layer__${base}`;
        return dir === '.' ? prefixed : `${dir}/${prefixed}`;
    }

    test('apply with no conflicts writes files and creates state', () => {
        const files = [
            makeEffectiveFile('instructions/coding.md', '# Coding'),
            makeEffectiveFile('agents/coder.agent.md', '# Coder Agent'),
        ];

        const result = apply({
            workspaceRoot: tmpDir,
            outputDir,
            effectiveFiles: files,
        });

        assert.strictEqual(result.written.length, 2);
        assert.strictEqual(result.skipped.length, 0);

        // Verify file on disk has provenance
        const codingPath = expectedMaterializedPath('instructions/coding.md');
        const outPath = path.join(tmpDir, outputDir, codingPath);
        const content = fs.readFileSync(outPath, 'utf-8');
        const prov = parseProvenanceHeader(content);
        assert.ok(prov, 'Provenance header should be present');
        assert.ok(prov!.contentHash.startsWith('sha256:'));

        // Verify managed state
        const state = loadManagedState(tmpDir);
        assert.ok(state.files[expectedMaterializedPath('instructions/coding.md')]);
        assert.ok(state.files[expectedMaterializedPath('agents/coder.agent.md')]);
    });

    test('apply skips drifted files', () => {
        // Apply once
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Simulate drift by rewriting the file
        const outPath = path.join(tmpDir, outputDir, expectedMaterializedPath('instructions/coding.md'));
        fs.writeFileSync(outPath, '# Modified by user\nLocal edits here.', 'utf-8');

        // Apply again
        const result = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        assert.strictEqual(result.skipped.length, 1);
        assert.ok(result.warnings.some(w => w.includes('drifted')));
    });

    test('apply is deterministic (same result on repeat)', () => {
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];

        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        loadManagedState(tmpDir);

        // Apply again — content doesn't drift (provenance header differs in timestamp but body hash is the same)
        const result2 = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        assert.strictEqual(result2.written.length, 1);
        assert.strictEqual(result2.skipped.length, 0);
    });

    test('apply removes files no longer in overlay', () => {
        const file1 = makeEffectiveFile('instructions/a.md', '# A');
        const file2 = makeEffectiveFile('instructions/b.md', '# B');

        // Apply both
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: [file1, file2] });

        // Apply with only file1 — file2 should be removed
        const result = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: [file1] });
        assert.ok(result.removed.includes(expectedMaterializedPath('instructions/b.md')));

        const outPath = path.join(tmpDir, outputDir, expectedMaterializedPath('instructions/b.md'));
        assert.ok(!fs.existsSync(outPath));
    });

    test('clean removes only in-sync files', () => {
        const files = [
            makeEffectiveFile('instructions/a.md', '# A'),
            makeEffectiveFile('instructions/b.md', '# B'),
        ];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Drift file b
        const aRelPath = expectedMaterializedPath('instructions/a.md');
        const bRelPath = expectedMaterializedPath('instructions/b.md');
        const bPath = path.join(tmpDir, outputDir, bRelPath);
        fs.writeFileSync(bPath, '# Drifted B', 'utf-8');

        const result = clean(tmpDir, outputDir);
        assert.ok(result.removed.includes(aRelPath));
        assert.ok(result.skipped.includes(bRelPath));
        assert.ok(result.warnings.some(w => w.includes('drifted')));

        // a.md should be gone, b.md should remain
        assert.ok(!fs.existsSync(path.join(tmpDir, outputDir, aRelPath)));
        assert.ok(fs.existsSync(bPath));
    });

    test('preview returns correct pending changes', () => {
        const files = [makeEffectiveFile('instructions/new.md', '# New')];

        const changes = preview(tmpDir, files, outputDir);
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].action, 'add');
        assert.strictEqual(changes[0].relativePath, expectedMaterializedPath('instructions/new.md'));
    });

    test('preview detects drifted files as skip', () => {
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Drift
        const relPath = expectedMaterializedPath('instructions/coding.md');
        const outPath = path.join(tmpDir, outputDir, relPath);
        fs.writeFileSync(outPath, '# Drifted', 'utf-8');

        const changes = preview(tmpDir, files, outputDir);
        const change = changes.find(c => c.relativePath === relPath);
        assert.ok(change);
        assert.strictEqual(change!.action, 'skip');
        assert.strictEqual(change!.reason, 'drifted');
    });

    test('settings files are not materialized', () => {
        const file: EffectiveFile = {
            relativePath: 'prompts/gen.prompt.md',
            sourcePath: createSourceFile('prompts/gen.prompt.md', '# Prompt'),
            sourceLayer: 'test',
            classification: 'settings',
        };

        const result = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: [file] });
        assert.strictEqual(result.written.length, 0);
        assert.ok(!fs.existsSync(path.join(tmpDir, outputDir, 'prompts/gen.prompt.md')));
    });
});
