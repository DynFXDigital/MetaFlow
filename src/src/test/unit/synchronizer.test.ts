import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    apply,
    clean,
    planSynchronization,
    preview,
    EffectiveFile,
    loadManagedState,
    parseProvenanceHeader,
    stripProvenanceHeader,
    resolveLayers,
    buildEffectiveFileMap,
} from '@metaflow/engine';

suite('synchronization engine', () => {
    let tmpDir: string;
    let sourceDir: string;
    const outputDir = '.github';

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-sync-'));
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
            classification: 'synchronized',
        };
    }

    function expectedSynchronizedPath(relativePath: string): string {
        const normalized = relativePath.replace(/\\/g, '/');
        const dir = path.posix.dirname(normalized);
        const base = path.posix.basename(normalized);
        const prefixed = `_default-test-layer__${base}`;
        return dir === '.' ? prefixed : `${dir}/${prefixed}`;
    }

    function captureErrorMessage(fn: () => unknown): string {
        try {
            fn();
            assert.fail('Expected function to throw');
        } catch (err: unknown) {
            return err instanceof Error ? err.message : String(err);
        }
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
        const codingPath = expectedSynchronizedPath('instructions/coding.md');
        const outPath = path.join(tmpDir, outputDir, codingPath);
        const content = fs.readFileSync(outPath, 'utf-8');
        const prov = parseProvenanceHeader(content);
        assert.ok(prov, 'Provenance header should be present');
        assert.ok(prov!.contentHash.startsWith('sha256:'));

        // Verify managed state
        const state = loadManagedState(tmpDir);
        assert.ok(state.files[expectedSynchronizedPath('instructions/coding.md')]);
        assert.ok(state.files[expectedSynchronizedPath('agents/coder.agent.md')]);
    });

    test('apply skips drifted files', () => {
        // Apply once
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Simulate drift by rewriting the file
        const outPath = path.join(
            tmpDir,
            outputDir,
            expectedSynchronizedPath('instructions/coding.md'),
        );
        fs.writeFileSync(outPath, '# Modified by user\nLocal edits here.', 'utf-8');

        // Apply again
        const result = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        assert.strictEqual(result.skipped.length, 1);
        assert.ok(result.warnings.some((w) => w.includes('drifted')));
    });

    test('apply skips identical synchronized output on repeat', () => {
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];

        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        const outputPath = path.join(
            tmpDir,
            outputDir,
            expectedSynchronizedPath('instructions/coding.md'),
        );
        const firstMtime = fs.statSync(outputPath).mtimeMs;
        const firstState = fs.readFileSync(path.join(tmpDir, '.metaflow', 'state.json'), 'utf-8');

        const result2 = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });
        assert.strictEqual(result2.written.length, 0);
        assert.strictEqual(result2.skipped.length, 1);
        assert.strictEqual(fs.statSync(outputPath).mtimeMs, firstMtime);
        assert.strictEqual(
            fs.readFileSync(path.join(tmpDir, '.metaflow', 'state.json'), 'utf-8'),
            firstState,
        );
    });

    test('apply removes files no longer in overlay', () => {
        const file1 = makeEffectiveFile('instructions/a.md', '# A');
        const file2 = makeEffectiveFile('instructions/b.md', '# B');

        // Apply both
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: [file1, file2] });

        // Apply with only file1 — file2 should be removed
        const result = apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: [file1] });
        assert.ok(result.removed.includes(expectedSynchronizedPath('instructions/b.md')));

        const outPath = path.join(tmpDir, outputDir, expectedSynchronizedPath('instructions/b.md'));
        assert.ok(!fs.existsSync(outPath));
    });

    test('clean removes only in-sync files', () => {
        const files = [
            makeEffectiveFile('instructions/a.md', '# A'),
            makeEffectiveFile('instructions/b.md', '# B'),
        ];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Drift file b
        const aRelPath = expectedSynchronizedPath('instructions/a.md');
        const bRelPath = expectedSynchronizedPath('instructions/b.md');
        const bPath = path.join(tmpDir, outputDir, bRelPath);
        fs.writeFileSync(bPath, '# Drifted B', 'utf-8');

        const result = clean(tmpDir, outputDir);
        assert.ok(result.removed.includes(aRelPath));
        assert.ok(result.skipped.includes(bRelPath));
        assert.ok(result.warnings.some((w) => w.includes('drifted')));

        // a.md should be gone, b.md should remain
        assert.ok(!fs.existsSync(path.join(tmpDir, outputDir, aRelPath)));
        assert.ok(fs.existsSync(bPath));
    });

    test('preview returns correct pending changes', () => {
        const files = [makeEffectiveFile('instructions/new.md', '# New')];

        const changes = preview(tmpDir, files, outputDir);
        assert.strictEqual(changes.length, 1);
        assert.strictEqual(changes[0].action, 'add');
        assert.strictEqual(
            changes[0].relativePath,
            expectedSynchronizedPath('instructions/new.md'),
        );
    });

    test('preview detects drifted files as skip', () => {
        const files = [makeEffectiveFile('instructions/coding.md', '# Coding')];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        // Drift
        const relPath = expectedSynchronizedPath('instructions/coding.md');
        const outPath = path.join(tmpDir, outputDir, relPath);
        fs.writeFileSync(outPath, '# Drifted', 'utf-8');

        const changes = preview(tmpDir, files, outputDir);
        const change = changes.find((c) => c.relativePath === relPath);
        assert.ok(change);
        assert.strictEqual(change!.action, 'skip');
        assert.strictEqual(change!.reason, 'drifted');
    });

    test('original-unless-conflict preserves original nested paths in preview and apply', () => {
        const files = [makeEffectiveFile('skills/nested/guide.md', '# Guide')];

        const changes = preview(tmpDir, files, outputDir, 'original-unless-conflict');
        assert.strictEqual(changes[0].relativePath, 'skills/nested/guide.md');

        const result = apply({
            workspaceRoot: tmpDir,
            outputDir,
            effectiveFiles: files,
            fileNamingStrategy: 'original-unless-conflict',
        });
        assert.ok(result.written.includes('skills/nested/guide.md'));
        assert.ok(fs.existsSync(path.join(tmpDir, outputDir, 'skills', 'nested', 'guide.md')));
    });

    test('repo-wide copilot instructions always synchronize to canonical root path', () => {
        const files = [makeEffectiveFile('copilot-instructions.md', '# Repo Instructions')];

        const prefixedChanges = preview(tmpDir, files, outputDir);
        assert.strictEqual(prefixedChanges[0].relativePath, 'copilot-instructions.md');

        const result = apply({
            workspaceRoot: tmpDir,
            outputDir,
            effectiveFiles: files,
        });
        assert.ok(result.written.includes('copilot-instructions.md'));
        assert.ok(fs.existsSync(path.join(tmpDir, outputDir, 'copilot-instructions.md')));

        const state = loadManagedState(tmpDir);
        assert.strictEqual(
            state.files['copilot-instructions.md']?.sourceRelativePath,
            'copilot-instructions.md',
        );
    });

    test('preview and apply report the same remap conflict when changing strategies', () => {
        const files = [makeEffectiveFile('skills/nested/guide.md', '# Guide')];
        apply({ workspaceRoot: tmpDir, outputDir, effectiveFiles: files });

        const previewMessage = captureErrorMessage(() =>
            preview(tmpDir, files, outputDir, 'original-unless-conflict'),
        );
        const applyMessage = captureErrorMessage(() =>
            apply({
                workspaceRoot: tmpDir,
                outputDir,
                effectiveFiles: files,
                fileNamingStrategy: 'original-unless-conflict',
            }),
        );

        assert.strictEqual(applyMessage, previewMessage);
        assert.ok(applyMessage.includes('Automatic migration is not supported'));
    });

    test('chatmodes ignore original-unless-conflict and stay on prefixed synchronized paths', () => {
        const files = [makeEffectiveFile('chatmodes/legacy.chatmode.md', '# Legacy')];

        const changes = preview(tmpDir, files, outputDir, 'original-unless-conflict');
        assert.strictEqual(
            changes[0].relativePath,
            expectedSynchronizedPath('chatmodes/legacy.chatmode.md'),
        );

        const result = apply({
            workspaceRoot: tmpDir,
            outputDir,
            effectiveFiles: files,
            fileNamingStrategy: 'original-unless-conflict',
        });
        assert.ok(result.written.includes(expectedSynchronizedPath('chatmodes/legacy.chatmode.md')));
        assert.ok(
            fs.existsSync(
                path.join(
                    tmpDir,
                    outputDir,
                    expectedSynchronizedPath('chatmodes/legacy.chatmode.md'),
                ),
            ),
        );
    });

    test('planSynchronization rejects unmanaged destinations for original-unless-conflict', () => {
        const files = [makeEffectiveFile('skills/nested/guide.md', '# Guide')];
        fs.mkdirSync(path.join(tmpDir, outputDir, 'skills', 'nested'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpDir, outputDir, 'skills', 'nested', 'guide.md'),
            'user-owned file',
            'utf-8',
        );

        const message = captureErrorMessage(() =>
            planSynchronization({
                workspaceRoot: tmpDir,
                outputDir,
                effectiveFiles: files,
                fileNamingStrategy: 'original-unless-conflict',
            }),
        );

        assert.ok(message.includes('Unmanaged destination already exists'));
    });

    test('settings files are not synchronized', () => {
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

    // ── TC-0600: Deterministic output across identical runs (REQ-0600) ──

    test('TC-0600: identical inputs produce byte-identical body content', () => {
        // Run 1 — fresh temp workspace
        const ws1 = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-det1-'));
        const src1 = path.join(ws1, 'source');
        fs.mkdirSync(src1, { recursive: true });
        const srcPath1 = path.join(src1, 'coding.md');
        fs.writeFileSync(srcPath1, '# Coding Standards\nRule 1\n', 'utf-8');

        const files1: EffectiveFile[] = [
            {
                relativePath: 'instructions/coding.md',
                sourcePath: srcPath1,
                sourceLayer: 'test-layer',
                classification: 'synchronized',
            },
        ];
        apply({ workspaceRoot: ws1, outputDir, effectiveFiles: files1 });

        // Run 2 — independent temp workspace, identical source content
        const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-det2-'));
        const src2 = path.join(ws2, 'source');
        fs.mkdirSync(src2, { recursive: true });
        const srcPath2 = path.join(src2, 'coding.md');
        fs.writeFileSync(srcPath2, '# Coding Standards\nRule 1\n', 'utf-8');

        const files2: EffectiveFile[] = [
            {
                relativePath: 'instructions/coding.md',
                sourcePath: srcPath2,
                sourceLayer: 'test-layer',
                classification: 'synchronized',
            },
        ];
        apply({ workspaceRoot: ws2, outputDir, effectiveFiles: files2 });

        // Compare: strip provenance (timestamp varies) then assert body equality
        const relPath = expectedSynchronizedPath('instructions/coding.md');
        const out1 = fs.readFileSync(path.join(ws1, outputDir, relPath), 'utf-8');
        const out2 = fs.readFileSync(path.join(ws2, outputDir, relPath), 'utf-8');

        const body1 = stripProvenanceHeader(out1);
        const body2 = stripProvenanceHeader(out2);
        assert.strictEqual(
            body1,
            body2,
            'Synchronized body content must be identical for same input',
        );

        // Cleanup
        fs.rmSync(ws1, { recursive: true, force: true });
        fs.rmSync(ws2, { recursive: true, force: true });
    });

    // ── TC-0603: Path traversal outside repo root is rejected (REQ-0603) ──

    test('TC-0603: layer path escaping repo boundary produces no output', () => {
        const repoDir = path.join(tmpDir, 'repo');
        const outsideDir = path.join(tmpDir, 'outside');
        fs.mkdirSync(path.join(repoDir, 'safe-layer', 'instructions'), { recursive: true });
        fs.mkdirSync(path.join(outsideDir, 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoDir, 'safe-layer', 'instructions', 'safe.md'),
            '# Safe file',
        );
        fs.writeFileSync(
            path.join(outsideDir, 'instructions', 'escaped.md'),
            '# Escaped file — should not appear',
        );

        const config = {
            metadataRepo: { localPath: repoDir },
            layers: ['safe-layer', '../../outside'],
        };

        const layers = resolveLayers(config, tmpDir);
        const fileMap = buildEffectiveFileMap(layers);

        // The safe layer should produce files
        assert.ok(fileMap.has('instructions/safe.md'), 'Safe layer file should be present');

        // The traversal layer must NOT produce the escaped file
        const hasEscaped = Array.from(fileMap.values()).some((f) =>
            f.sourcePath.includes('outside'),
        );
        assert.strictEqual(
            hasEscaped,
            false,
            'Path traversal must not produce files from outside repo',
        );
    });
});
