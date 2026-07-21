import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ensureMetaFlowAiMetadataCache,
    scaffoldMetaFlowAiMetadata,
} from '../../commands/starterMetadata';

const CACHE_VERSION = 'test-version-1';
const UPDATED_CACHE_VERSION = 'test-version-2';

suite('metaFlowAiMetadata', () => {
    test('returns undefined when starter assets are missing', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-missing-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        fs.mkdirSync(workspaceRoot, { recursive: true });
        fs.mkdirSync(extensionPath, { recursive: true });

        const result = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.strictEqual(result, undefined);

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('copies starter files and skips existing files unless overwrite is enabled', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-copy-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        const sourceInstruction = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            '.github',
            'instructions',
            'starter.instructions.md',
        );
        const sourceManifest = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            'CAPABILITY.md',
        );
        fs.mkdirSync(path.dirname(sourceInstruction), { recursive: true });
        fs.writeFileSync(sourceInstruction, '# starter\n', 'utf-8');
        fs.writeFileSync(sourceManifest, '# capability\n', 'utf-8');

        fs.mkdirSync(workspaceRoot, { recursive: true });

        const first = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.ok(first);
        assert.strictEqual(first?.writtenFiles.length, 1);
        assert.strictEqual(first?.skippedFiles.length, 0);
        assert.ok(!fs.existsSync(path.join(workspaceRoot, 'CAPABILITY.md')));

        const targetInstruction = path.join(
            workspaceRoot,
            '.github',
            'instructions',
            'starter.instructions.md',
        );
        fs.writeFileSync(targetInstruction, '# custom\n', 'utf-8');

        const second = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.ok(second);
        assert.strictEqual(second?.writtenFiles.length, 0);
        assert.strictEqual(second?.skippedFiles.length, 1);
        assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# custom\n');

        const third = await scaffoldMetaFlowAiMetadata({
            workspaceRoot,
            extensionPath,
            overwriteExisting: true,
        });
        assert.ok(third);
        assert.strictEqual(third?.writtenFiles.length, 1);
        assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# starter\n');
        assert.ok(!fs.existsSync(path.join(workspaceRoot, 'CAPABILITY.md')));

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('skips file when copy reports ENOENT', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-enoent-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        const sourceSkill = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            '.github',
            'skills',
            'metaflow-capability-review',
            'SKILL.md',
        );
        fs.mkdirSync(path.dirname(sourceSkill), { recursive: true });
        fs.writeFileSync(sourceSkill, '# skill\n', 'utf-8');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        try {
            const result = await scaffoldMetaFlowAiMetadata({
                workspaceRoot,
                extensionPath,
                overwriteExisting: true,
                copyFile: async () => {
                    const err = Object.assign(new Error('simulated missing source'), {
                        code: 'ENOENT',
                    });
                    throw err;
                },
            });
            assert.ok(result, 'Expected scaffold result when source root exists');
            assert.strictEqual(
                result?.writtenFiles.length,
                0,
                'ENOENT copy failure should not produce written files',
            );
            assert.strictEqual(
                result?.skippedFiles.length,
                1,
                'ENOENT copy failure should be tracked as skipped',
            );
            assert.strictEqual(
                result?.skippedFiles[0],
                '.github/skills/metaflow-capability-review/SKILL.md',
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('flattens nested bundled capability .github assets when scaffolding into a workspace', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-nested-cap-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        const nestedInstruction = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            'capabilities',
            'metadata-authoring',
            'github-copilot-metadata-authoring',
            '.github',
            'instructions',
            'ai-metadata-agent.instructions.md',
        );
        const nestedManifest = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            'capabilities',
            'metadata-authoring',
            'github-copilot-metadata-authoring',
            'CAPABILITY.md',
        );

        fs.mkdirSync(path.dirname(nestedInstruction), { recursive: true });
        fs.writeFileSync(nestedInstruction, '# nested authoring\n', 'utf-8');
        fs.writeFileSync(nestedManifest, '# nested capability\n', 'utf-8');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        try {
            const result = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
            assert.ok(result, 'Expected scaffold result for nested capability assets');
            assert.deepStrictEqual(result?.writtenFiles, [
                '.github/instructions/ai-metadata-agent.instructions.md',
            ]);
            assert.strictEqual(
                fs.readFileSync(
                    path.join(
                        workspaceRoot,
                        '.github',
                        'instructions',
                        'ai-metadata-agent.instructions.md',
                    ),
                    'utf-8',
                ),
                '# nested authoring\n',
            );
            assert.ok(
                !fs.existsSync(
                    path.join(
                        workspaceRoot,
                        'capabilities',
                        'metadata-authoring',
                        'github-copilot-metadata-authoring',
                        'CAPABILITY.md',
                    ),
                ),
                'Workspace scaffolding should not materialize nested bundled capability manifests.',
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('mirrors bundled metadata into a stable cache root outside the extension install directory', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-cache-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const storageRoot = path.join(tempRoot, 'storage');

        const sourceInstruction = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            '.github',
            'instructions',
            'starter.instructions.md',
        );
        const sourceManifest = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            'CAPABILITY.md',
        );
        fs.mkdirSync(path.dirname(sourceInstruction), { recursive: true });
        fs.writeFileSync(sourceInstruction, '# starter\n', 'utf-8');
        fs.writeFileSync(sourceManifest, '# capability\n', 'utf-8');

        try {
            const cached = await ensureMetaFlowAiMetadataCache({
                storageRoot,
                extensionPath,
                version: CACHE_VERSION,
            });

            assert.ok(cached, 'Expected bundled metadata cache to be created');
            assert.ok(
                cached?.targetRoot.startsWith(storageRoot),
                'Cache should live under the provided storage root',
            );
            assert.ok(
                !cached?.targetRoot.startsWith(extensionPath),
                'Cache root should not be the extension install directory',
            );

            const targetInstruction = path.join(
                cached!.targetRoot,
                '.github',
                'instructions',
                'starter.instructions.md',
            );
            const targetManifest = path.join(cached!.targetRoot, 'CAPABILITY.md');
            assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# starter\n');
            assert.strictEqual(fs.readFileSync(targetManifest, 'utf-8'), '# capability\n');

            const unchanged = await ensureMetaFlowAiMetadataCache({
                storageRoot,
                extensionPath,
                version: CACHE_VERSION,
            });
            assert.strictEqual(
                unchanged?.writtenFiles.length,
                0,
                'Same-version cache refresh should be a no-op',
            );
            assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# starter\n');

            fs.writeFileSync(sourceInstruction, '# updated\n', 'utf-8');
            const refreshed = await ensureMetaFlowAiMetadataCache({
                storageRoot,
                extensionPath,
                version: CACHE_VERSION,
            });
            assert.ok(refreshed, 'Expected same-version content change to refresh the cache');
            assert.strictEqual(
                fs.readFileSync(
                    path.join(
                        refreshed!.targetRoot,
                        '.github',
                        'instructions',
                        'starter.instructions.md',
                    ),
                    'utf-8',
                ),
                '# updated\n',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(refreshed!.targetRoot, 'CAPABILITY.md'), 'utf-8'),
                '# capability\n',
            );

            const updated = await ensureMetaFlowAiMetadataCache({
                storageRoot,
                extensionPath,
                version: UPDATED_CACHE_VERSION,
            });
            assert.ok(updated, 'Expected version change to refresh the cache');
            assert.strictEqual(
                fs.readFileSync(
                    path.join(
                        updated!.targetRoot,
                        '.github',
                        'instructions',
                        'starter.instructions.md',
                    ),
                    'utf-8',
                ),
                '# updated\n',
            );
            assert.strictEqual(
                fs.readFileSync(path.join(updated!.targetRoot, 'CAPABILITY.md'), 'utf-8'),
                '# capability\n',
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('refreshes stale legacy cache markers created before fingerprinting', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-legacy-cache-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const storageRoot = path.join(tempRoot, 'storage');
        const legacyTargetRoot = path.join(storageRoot, 'bundled-metadata', 'metaflow-ai-metadata');

        const sourceInstruction = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            '.github',
            'instructions',
            'starter.instructions.md',
        );
        fs.mkdirSync(path.dirname(sourceInstruction), { recursive: true });
        fs.writeFileSync(sourceInstruction, '# starter\n', 'utf-8');
        fs.mkdirSync(path.join(legacyTargetRoot, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(legacyTargetRoot, '.github', 'instructions', 'starter.instructions.md'),
            '# stale\n',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(legacyTargetRoot, '.metaflow-bundle-version'),
            `${CACHE_VERSION}\n`,
            'utf-8',
        );

        try {
            const cached = await ensureMetaFlowAiMetadataCache({
                storageRoot,
                extensionPath,
                version: CACHE_VERSION,
            });

            assert.ok(cached, 'Expected legacy cache marker to be refreshed');
            assert.strictEqual(
                fs.readFileSync(
                    path.join(
                        cached!.targetRoot,
                        '.github',
                        'instructions',
                        'starter.instructions.md',
                    ),
                    'utf-8',
                ),
                '# starter\n',
            );
            assert.ok(
                !fs.existsSync(legacyTargetRoot),
                'Refresh should remove the obsolete fixed cache root when it is not in use',
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('serializes concurrent cache refreshes and publishes one complete cache', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-concurrent-cache-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const storageRoot = path.join(tempRoot, 'storage');
        const sourceRoot = path.join(extensionPath, 'assets', 'metaflow-ai-metadata');
        const sourceInstruction = path.join(
            sourceRoot,
            '.github',
            'instructions',
            'starter.instructions.md',
        );
        const sourceHook = path.join(sourceRoot, 'hooks', 'hooks.json');
        fs.mkdirSync(path.dirname(sourceInstruction), { recursive: true });
        fs.mkdirSync(path.dirname(sourceHook), { recursive: true });
        fs.writeFileSync(sourceInstruction, '# starter\n', 'utf-8');
        fs.writeFileSync(sourceHook, '{"hooks":{}}\n', 'utf-8');

        let copyCount = 0;
        const delayedCopy = async (sourceFile: string, destinationFile: string): Promise<void> => {
            copyCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            await fs.promises.copyFile(sourceFile, destinationFile);
        };

        try {
            const [first, second] = await Promise.all([
                ensureMetaFlowAiMetadataCache({
                    storageRoot,
                    extensionPath,
                    version: CACHE_VERSION,
                    copyFile: delayedCopy,
                }),
                ensureMetaFlowAiMetadataCache({
                    storageRoot,
                    extensionPath,
                    version: CACHE_VERSION,
                    copyFile: delayedCopy,
                }),
            ]);

            assert.ok(first && second, 'Both concurrent callers should resolve a cache root');
            assert.strictEqual(copyCount, 2, 'Only one caller should copy the two source files');
            assert.strictEqual(
                fs.readFileSync(path.join(first!.targetRoot, 'hooks', 'hooks.json'), 'utf-8'),
                '{"hooks":{}}\n',
            );
            assert.ok(
                fs.existsSync(path.join(first!.targetRoot, '.metaflow-bundle-version')),
                'Published cache should include its version marker',
            );
            assert.deepStrictEqual(
                fs.readdirSync(path.join(storageRoot, 'bundled-metadata')).sort(),
                [path.basename(first!.targetRoot)],
                'Refresh should not leave staging, backup, or lock directories behind',
            );
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
