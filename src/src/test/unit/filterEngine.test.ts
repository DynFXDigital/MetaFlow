import * as assert from 'assert';
import { applyFilters, EffectiveFile } from '@metaflow/engine';

function makeFile(relativePath: string): EffectiveFile {
    return {
        relativePath,
        sourcePath: `/src/${relativePath}`,
        sourceLayer: 'layer1',
        classification: 'synchronized',
    };
}

suite('filterEngine', () => {
    const allFiles: EffectiveFile[] = [
        makeFile('instructions/coding.md'),
        makeFile('instructions/testing.md'),
        makeFile('prompts/generate.prompt.md'),
        makeFile('agents/coder.agent.md'),
        makeFile('skills/build/SKILL.md'),
        makeFile('readme.txt'),
    ];

    test('no filters returns all files', () => {
        const result = applyFilters(allFiles, undefined);
        assert.strictEqual(result.length, allFiles.length);
    });

    test('empty filter config returns all files', () => {
        const result = applyFilters(allFiles, {});
        assert.strictEqual(result.length, allFiles.length);
    });

    test('include-only patterns', () => {
        const result = applyFilters(allFiles, {
            include: ['instructions/**'],
        });
        assert.strictEqual(result.length, 2);
        assert.ok(result.every((f) => f.relativePath.startsWith('instructions/')));
    });

    test('exclude-only patterns', () => {
        const result = applyFilters(allFiles, {
            exclude: ['**/*.txt'],
        });
        assert.strictEqual(result.length, 5);
        assert.ok(result.every((f) => !f.relativePath.endsWith('.txt')));
    });

    test('combined include + exclude — exclude wins', () => {
        const result = applyFilters(allFiles, {
            include: ['instructions/**', 'prompts/**'],
            exclude: ['instructions/testing.md'],
        });
        assert.strictEqual(result.length, 2);
        const paths = result.map((f) => f.relativePath);
        assert.ok(paths.includes('instructions/coding.md'));
        assert.ok(paths.includes('prompts/generate.prompt.md'));
        assert.ok(!paths.includes('instructions/testing.md'));
    });

    test('wildcard patterns', () => {
        const result = applyFilters(allFiles, {
            include: ['**/*.md'],
        });
        assert.strictEqual(result.length, 5);
        assert.ok(result.every((f) => f.relativePath.endsWith('.md')));
    });

    test('exclude everything', () => {
        const result = applyFilters(allFiles, {
            exclude: ['**/*'],
        });
        assert.strictEqual(result.length, 0);
    });
});
