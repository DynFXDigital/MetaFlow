import * as assert from 'assert';
import { classifyFiles, classifySingle, EffectiveFile } from '@metaflow/engine';

function makeFile(relativePath: string): EffectiveFile {
    return {
        relativePath,
        sourcePath: `/src/${relativePath}`,
        sourceLayer: 'layer1',
        classification: 'materialized', // placeholder
    };
}

suite('classifier', () => {
    suite('classifySingle', () => {
        test('instructions → live-ref', () => {
            assert.strictEqual(classifySingle('instructions/coding.md', undefined), 'live-ref');
        });

        test('prompts → live-ref', () => {
            assert.strictEqual(classifySingle('prompts/gen.prompt.md', undefined), 'live-ref');
        });

        test('skills → materialized (default)', () => {
            assert.strictEqual(classifySingle('skills/build/SKILL.md', undefined), 'materialized');
        });

        test('agents → materialized (default)', () => {
            assert.strictEqual(classifySingle('agents/coder.agent.md', undefined), 'materialized');
        });

        test('hooks → live-ref', () => {
            assert.strictEqual(classifySingle('hooks/pre-apply.sh', undefined), 'live-ref');
        });

        test('unknown file type → materialized', () => {
            assert.strictEqual(classifySingle('random/file.txt', undefined), 'materialized');
        });

        test('root-level file → materialized', () => {
            assert.strictEqual(classifySingle('README.md', undefined), 'materialized');
        });
    });

    suite('injection config override', () => {
        test('skills override to settings → live-ref', () => {
            assert.strictEqual(
                classifySingle('skills/build/SKILL.md', { skills: 'settings' }),
                'live-ref'
            );
        });

        test('agents override to settings → live-ref', () => {
            assert.strictEqual(
                classifySingle('agents/coder.agent.md', { agents: 'settings' }),
                'live-ref'
            );
        });

        test('instructions override to materialize → materialized', () => {
            assert.strictEqual(
                classifySingle('instructions/coding.md', { instructions: 'materialize' }),
                'materialized'
            );
        });

        test('non-matching injection key falls to default', () => {
            assert.strictEqual(
                classifySingle('prompts/gen.prompt.md', { skills: 'settings' }),
                'live-ref'
            );
        });
    });

    suite('classifyFiles batch', () => {
        test('classifies multiple files', () => {
            const files = [
                makeFile('instructions/a.md'),
                makeFile('skills/b/SKILL.md'),
                makeFile('random/c.txt'),
            ];
            const result = classifyFiles(files, undefined);
            assert.strictEqual(result[0].classification, 'live-ref');
            assert.strictEqual(result[1].classification, 'materialized');
            assert.strictEqual(result[2].classification, 'materialized');
        });

        test('backslash paths are normalized', () => {
            const files = [makeFile('instructions\\coding.md')];
            const result = classifyFiles(files, undefined);
            assert.strictEqual(result[0].classification, 'live-ref');
        });
    });
});
