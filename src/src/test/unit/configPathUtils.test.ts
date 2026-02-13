/**
 * Unit tests for configPathUtils.
 *
 * Tests: config discovery, path resolution, boundary checks.
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { discoverConfigPath, resolvePathFromWorkspace, isWithinBoundary } from '@metaflow/engine';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-workspace');

suite('Config Path Utils', () => {

    suite('discoverConfigPath()', () => {

        test('finds .ai-sync.json at workspace root', () => {
            const result = discoverConfigPath(FIXTURES_ROOT);
            assert.ok(result);
            assert.ok(result!.endsWith('.ai-sync.json'));
            assert.ok(!result!.includes(`${path.sep}.ai${path.sep}`));
        });

        test('finds fallback .ai/.ai-sync.json when root is absent', () => {
            // Create a temp dir with only .ai/.ai-sync.json
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-test-'));
            const aiDir = path.join(tmpDir, '.ai');
            fs.mkdirSync(aiDir, { recursive: true });
            fs.writeFileSync(path.join(aiDir, '.ai-sync.json'), '{}');

            try {
                const result = discoverConfigPath(tmpDir);
                assert.ok(result);
                assert.ok(result!.includes('.ai'));
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });

        test('returns undefined when no config exists', () => {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-test-'));
            try {
                const result = discoverConfigPath(tmpDir);
                assert.strictEqual(result, undefined);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        });
    });

    suite('resolvePathFromWorkspace()', () => {

        test('resolves relative path against workspace root', () => {
            const result = resolvePathFromWorkspace('/workspace', '.ai/metadata');
            assert.ok(result.includes('.ai'));
            assert.ok(path.isAbsolute(result));
        });

        test('returns absolute path unchanged', () => {
            const absPath = path.resolve('/some/absolute/path');
            const result = resolvePathFromWorkspace('/workspace', absPath);
            assert.strictEqual(path.normalize(result), path.normalize(absPath));
        });
    });

    suite('isWithinBoundary()', () => {

        test('path inside boundary returns true', () => {
            assert.strictEqual(
                isWithinBoundary('/repo/metadata/company/core', '/repo/metadata'),
                true
            );
        });

        test('path equal to boundary returns true', () => {
            assert.strictEqual(
                isWithinBoundary('/repo/metadata', '/repo/metadata'),
                true
            );
        });

        test('path outside boundary returns false', () => {
            assert.strictEqual(
                isWithinBoundary('/repo/other/file', '/repo/metadata'),
                false
            );
        });

        test('path traversal escaping boundary returns false', () => {
            assert.strictEqual(
                isWithinBoundary(path.normalize('/repo/metadata/../other'), '/repo/metadata'),
                false
            );
        });
    });
});
