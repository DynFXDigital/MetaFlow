import * as assert from 'assert';
import * as path from 'path';
import {
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    EffectiveFile,
} from '@metaflow/engine';

suite('settingsInjector', () => {
    const workspaceRoot = '/workspace';

    function makeFile(relativePath: string, classification: 'live-ref' | 'materialized', sourcePath?: string): EffectiveFile {
        return {
            relativePath,
            sourcePath: sourcePath ?? path.join('/repo', relativePath),
            sourceLayer: 'test',
            classification,
        };
    }

    test('computes settings for instructions paths', () => {
        const files = [
            makeFile('instructions/coding.md', 'live-ref', '/repo/instructions/coding.md'),
            makeFile('instructions/testing.md', 'live-ref', '/repo/instructions/testing.md'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        const instrEntry = entries.find(e => e.key.includes('instructionFiles'));
        assert.ok(instrEntry);
        assert.ok(Array.isArray(instrEntry!.value));
    });

    test('computes settings for prompts paths', () => {
        const files = [
            makeFile('prompts/gen.prompt.md', 'live-ref', '/repo/prompts/gen.prompt.md'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        const promptEntry = entries.find(e => e.key.includes('promptFiles'));
        assert.ok(promptEntry);
    });

    test('ignores materialized files', () => {
        const files = [
            makeFile('agents/coder.agent.md', 'materialized'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        assert.strictEqual(entries.length, 0);
    });

    test('includes hook paths from config', () => {
        const entries = computeSettingsEntries([], workspaceRoot, {
            hooks: {
                preApply: 'scripts/pre-apply.sh',
                postApply: 'scripts/post-apply.sh',
            },
        });

        assert.ok(entries.some(e => e.key === 'metaflow.hooks.preApply'));
        assert.ok(entries.some(e => e.key === 'metaflow.hooks.postApply'));
    });

    test('no-op when no live-ref files and no hooks', () => {
        const entries = computeSettingsEntries([], workspaceRoot, {});
        assert.strictEqual(entries.length, 0);
    });

    test('computeSettingsKeysToRemove returns expected keys', () => {
        const keys = computeSettingsKeysToRemove();
        assert.ok(keys.length >= 4);
        assert.ok(keys.includes('github.copilot.chat.codeGeneration.instructionFiles'));
        assert.ok(keys.includes('github.copilot.chat.promptFiles'));
    });
});
