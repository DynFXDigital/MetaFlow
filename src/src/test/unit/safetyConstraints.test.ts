/**
 * Safety constraint tests (TC-0601: No auto-commit — REQ-0601).
 *
 * Verifies the extension and engine never create git commits or push changes.
 * Uses structural code scanning (no child_process imports in hot-path modules)
 * and runtime verification (apply/clean only write to expected locations).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { apply, clean, EffectiveFile } from '@metaflow/engine';

suite('TC-0601: No auto-commit after operations (REQ-0601)', () => {
    const ENGINE_SRC = path.resolve(__dirname, '../../../../packages/engine/src');

    test('synchronizer module does not import child_process', () => {
        const src = fs.readFileSync(path.join(ENGINE_SRC, 'engine', 'synchronizer.ts'), 'utf-8');
        assert.strictEqual(
            src.includes('child_process'),
            false,
            'synchronizer.ts must not import child_process',
        );
    });

    test('overlayEngine module does not import child_process', () => {
        const src = fs.readFileSync(path.join(ENGINE_SRC, 'engine', 'overlayEngine.ts'), 'utf-8');
        assert.strictEqual(
            src.includes('child_process'),
            false,
            'overlayEngine.ts must not import child_process',
        );
    });

    test('configLoader module does not import child_process', () => {
        const src = fs.readFileSync(path.join(ENGINE_SRC, 'config', 'configLoader.ts'), 'utf-8');
        assert.strictEqual(
            src.includes('child_process'),
            false,
            'configLoader.ts must not import child_process',
        );
    });

    test('apply + clean only modify output dir and state dir', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-nocommit-'));
        const sourceDir = path.join(tmpDir, 'source');
        fs.mkdirSync(sourceDir, { recursive: true });
        const srcPath = path.join(sourceDir, 'a.md');
        fs.writeFileSync(srcPath, '# File A');

        // Snapshot the workspace before apply
        const filesBefore = new Set(walkAll(tmpDir));

        const files: EffectiveFile[] = [
            {
                relativePath: 'instructions/a.md',
                sourcePath: srcPath,
                sourceLayer: 'test-layer',
                classification: 'synchronized',
            },
        ];

        apply({ workspaceRoot: tmpDir, outputDir: '.github', effectiveFiles: files });

        // Check that new files are only in .github/ or .metaflow-state/
        const filesAfter = walkAll(tmpDir);
        const newFiles = filesAfter.filter((f) => !filesBefore.has(f));

        for (const f of newFiles) {
            const rel = path.relative(tmpDir, f).replace(/\\/g, '/');
            const allowed = rel.startsWith('.github/') || rel.startsWith('.metaflow/');
            assert.ok(allowed, `Unexpected file outside output/state dirs: ${rel}`);
        }

        // No .git directory should have been created
        assert.strictEqual(
            fs.existsSync(path.join(tmpDir, '.git')),
            false,
            'apply must not create a .git directory',
        );

        // Clean and verify same constraint
        clean(tmpDir, '.github');
        assert.strictEqual(
            fs.existsSync(path.join(tmpDir, '.git')),
            false,
            'clean must not create a .git directory',
        );

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});

/** Recursively list all files under a directory. */
function walkAll(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkAll(full));
        } else {
            results.push(full);
        }
    }
    return results;
}
