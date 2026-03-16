import * as assert from 'assert';
import { classifyFiles, classifySingle, EffectiveFile, LayerSource } from '@metaflow/engine';

function makeFile(relativePath: string): EffectiveFile {
    return {
        relativePath,
        sourcePath: `/src/${relativePath}`,
        sourceLayer: 'layer1',
        classification: 'synchronized', // placeholder
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

        test('skills → settings (default)', () => {
            assert.strictEqual(classifySingle('skills/build/SKILL.md', undefined), 'settings');
        });

        test('agents → settings (default)', () => {
            assert.strictEqual(classifySingle('agents/coder.agent.md', undefined), 'settings');
        });

        test('hooks → settings', () => {
            assert.strictEqual(classifySingle('hooks/pre-apply.sh', undefined), 'settings');
        });

        test('chatmodes → synchronized (deprecated)', () => {
            assert.strictEqual(
                classifySingle('chatmodes/legacy.chatmode.md', undefined),
                'synchronized',
            );
        });

        test('unknown file type → synchronized', () => {
            assert.strictEqual(classifySingle('random/file.txt', undefined), 'synchronized');
        });

        test('root-level file → synchronized', () => {
            assert.strictEqual(classifySingle('README.md', undefined), 'synchronized');
        });

        test('.github settings artifacts normalize to their effective top-level type', () => {
            assert.strictEqual(
                classifySingle('.github/instructions/coding.md', undefined),
                'settings',
            );
            assert.strictEqual(
                classifySingle('.github/skills/build/SKILL.md', undefined),
                'settings',
            );
        });
    });

    suite('injection config override', () => {
        test('skills override to settings → settings', () => {
            assert.strictEqual(
                classifySingle('skills/build/SKILL.md', { skills: 'settings' }),
                'settings',
            );
        });

        test('agents override to settings → settings', () => {
            assert.strictEqual(
                classifySingle('agents/coder.agent.md', { agents: 'settings' }),
                'settings',
            );
        });

        test('instructions override to synchronize → synchronized', () => {
            assert.strictEqual(
                classifySingle('instructions/coding.md', { instructions: 'synchronize' }),
                'synchronized',
            );
        });

        test('non-matching injection key falls to default settings', () => {
            assert.strictEqual(
                classifySingle('prompts/gen.prompt.md', { skills: 'settings' }),
                'settings',
            );
        });

        test('chatmodes ignore settings override and remain synchronized', () => {
            assert.strictEqual(
                classifySingle('chatmodes/legacy.chatmode.md', { chatmodes: 'settings' }),
                'synchronized',
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
            assert.strictEqual(result[1].classification, 'settings');
            assert.strictEqual(result[2].classification, 'synchronized');
        });

        test('backslash paths are normalized', () => {
            const files = [makeFile('instructions\\coding.md')];
            const result = classifyFiles(files, undefined);
            assert.strictEqual(result[0].classification, 'settings');
        });

        test('layer-specific injection matches Windows-style layerSource paths', () => {
            const files = [makeFile('skills/build/SKILL.md')];
            files[0].sourceLayer = 'repo/team/core';

            const layerSources: LayerSource[] = [
                {
                    repoId: 'repo',
                    path: 'team\\core',
                    injection: { skills: 'synchronize' },
                },
            ];

            const result = classifyFiles(files, { skills: 'settings' }, layerSources);
            assert.strictEqual(result[0].classification, 'synchronized');
        });
    });
});
