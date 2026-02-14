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
        test('instructions → settings', () => {
              assert.strictEqual(classifySingle('instructions/coding.md', undefined), 'settings');
        });

        test('prompts → settings', () => {
              assert.strictEqual(classifySingle('prompts/gen.prompt.md', undefined), 'settings');
        });

        test('skills → materialized (default)', () => {
            assert.strictEqual(classifySingle('skills/build/SKILL.md', undefined), 'materialized');
        });

        test('agents → materialized (default)', () => {
            assert.strictEqual(classifySingle('agents/coder.agent.md', undefined), 'materialized');
        });

        test('hooks → settings', () => {
              assert.strictEqual(classifySingle('hooks/pre-apply.sh', undefined), 'settings');
        });

        test('unknown file type → materialized', () => {
            assert.strictEqual(classifySingle('random/file.txt', undefined), 'materialized');
        });

        test('root-level file → materialized', () => {
            assert.strictEqual(classifySingle('README.md', undefined), 'materialized');
        });
    });

    suite('injection config override', () => {
        test('skills override to settings → settings', () => {
            assert.strictEqual(
                classifySingle('skills/build/SKILL.md', { skills: 'settings' }),
                'settings'
            );
        });

        test('agents override to settings → settings', () => {
            assert.strictEqual(
                classifySingle('agents/coder.agent.md', { agents: 'settings' }),
                'settings'
            );
        });

        test('instructions override to materialize → materialized', () => {
            assert.strictEqual(
                classifySingle('instructions/coding.md', { instructions: 'materialize' }),
                'materialized'
            );
        });

        test('non-matching injection key falls to default settings', () => {
            assert.strictEqual(
                classifySingle('prompts/gen.prompt.md', { skills: 'settings' }),
                'settings'
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
                assert.strictEqual(result[0].classification, 'settings');
            assert.strictEqual(result[1].classification, 'materialized');
            assert.strictEqual(result[2].classification, 'materialized');
        });

        test('backslash paths are normalized', () => {
            const files = [makeFile('instructions\\coding.md')];
            const result = classifyFiles(files, undefined);
                assert.strictEqual(result[0].classification, 'settings');
        });
    });
});
