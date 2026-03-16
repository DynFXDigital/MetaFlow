import * as assert from 'assert';
import { applyProfile, EffectiveFile } from '@metaflow/engine';

function makeFile(relativePath: string): EffectiveFile {
    return {
        relativePath,
        sourcePath: `/src/${relativePath}`,
        sourceLayer: 'layer1',
        classification: 'synchronized',
    };
}

suite('profileEngine', () => {
    const allFiles: EffectiveFile[] = [
        makeFile('instructions/coding.md'),
        makeFile('instructions/testing.md'),
        makeFile('prompts/generate.prompt.md'),
        makeFile('agents/coder.agent.md'),
        makeFile('skills/build/SKILL.md'),
    ];

    test('no profile returns all files', () => {
        const result = applyProfile(allFiles, undefined);
        assert.strictEqual(result.length, allFiles.length);
    });

    test('empty profile returns all files', () => {
        const result = applyProfile(allFiles, {});
        assert.strictEqual(result.length, allFiles.length);
    });

    test('baseline profile with enable all', () => {
        const result = applyProfile(allFiles, { enable: ['**/*'] });
        assert.strictEqual(result.length, allFiles.length);
    });

    test('selective disable', () => {
        const result = applyProfile(allFiles, {
            disable: ['agents/**'],
        });
        assert.strictEqual(result.length, 4);
        assert.ok(result.every((f) => !f.relativePath.startsWith('agents/')));
    });

    test('selective enable', () => {
        const result = applyProfile(allFiles, {
            enable: ['instructions/**'],
        });
        assert.strictEqual(result.length, 2);
        assert.ok(result.every((f) => f.relativePath.startsWith('instructions/')));
    });

    test('conflicting enable and disable — disable wins', () => {
        const result = applyProfile(allFiles, {
            enable: ['instructions/**'],
            disable: ['instructions/testing.md'],
        });
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].relativePath, 'instructions/coding.md');
    });

    test('disable everything', () => {
        const result = applyProfile(allFiles, {
            disable: ['**/*'],
        });
        assert.strictEqual(result.length, 0);
    });
});
