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
        test('instructions → plugin', () => {
            assert.strictEqual(classifySingle('instructions/coding.md', undefined), 'plugin');
        });

        test('prompts → settings', () => {
            assert.strictEqual(classifySingle('prompts/gen.prompt.md', undefined), 'settings');
        });

        test('skills → plugin (default)', () => {
            assert.strictEqual(classifySingle('skills/build/SKILL.md', undefined), 'plugin');
        });

        test('agents → plugin (default)', () => {
            assert.strictEqual(classifySingle('agents/coder.agent.md', undefined), 'plugin');
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
                'plugin',
            );
            assert.strictEqual(
                classifySingle('.github/skills/build/SKILL.md', undefined),
                'plugin',
            );
        });

        test('Codex repository skills remain synchronized', () => {
            assert.strictEqual(
                classifySingle('.agents/skills/codex-metadata/SKILL.md', undefined),
                'synchronized',
            );
        });

        test('Codex project instructions remain synchronized', () => {
            assert.strictEqual(classifySingle('AGENTS.md', undefined), 'synchronized');
            assert.strictEqual(classifySingle('AGENTS.override.md', undefined), 'synchronized');
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

        test('instructions override to plugin → plugin', () => {
            assert.strictEqual(
                classifySingle('instructions/coding.md', { instructions: 'plugin' }),
                'plugin',
            );
        });

        test('skills override to plugin → plugin', () => {
            assert.strictEqual(
                classifySingle('skills/build/SKILL.md', { skills: 'plugin' }),
                'plugin',
            );
        });

        test('agents override to plugin → plugin', () => {
            assert.strictEqual(
                classifySingle('agents/coder.agent.md', { agents: 'plugin' }),
                'plugin',
            );
        });

        test('instructions override to synchronize → synchronized', () => {
            assert.strictEqual(
                classifySingle('instructions/coding.md', { instructions: 'synchronize' }),
                'synchronized',
            );
        });

        test('prompts ignore plugin override and remain settings', () => {
            assert.strictEqual(
                classifySingle('prompts/gen.prompt.md', { prompts: 'plugin' }),
                'settings',
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

        test('Codex repository skills ignore skills injection overrides', () => {
            assert.strictEqual(
                classifySingle('.agents/skills/codex-metadata/SKILL.md', { skills: 'plugin' }),
                'synchronized',
            );
            assert.strictEqual(
                classifySingle('.agents/skills/codex-metadata/SKILL.md', { skills: 'settings' }),
                'synchronized',
            );
        });

        test('Codex project instructions ignore instructions injection overrides', () => {
            assert.strictEqual(
                classifySingle('AGENTS.md', { instructions: 'plugin' }),
                'synchronized',
            );
            assert.strictEqual(
                classifySingle('AGENTS.override.md', { instructions: 'settings' }),
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
            assert.strictEqual(result[0].classification, 'plugin');
            assert.strictEqual(result[1].classification, 'plugin');
            assert.strictEqual(result[2].classification, 'synchronized');
        });

        test('backslash paths are normalized', () => {
            const files = [makeFile('instructions\\coding.md')];
            const result = classifyFiles(files, undefined);
            assert.strictEqual(result[0].classification, 'plugin');
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

        test('layer-specific plugin injection matches Windows-style layerSource paths', () => {
            const files = [makeFile('agents/coder.agent.md')];
            files[0].sourceLayer = 'repo/team/core';

            const layerSources: LayerSource[] = [
                {
                    repoId: 'repo',
                    path: 'team\\core',
                    injection: { agents: 'plugin' },
                },
            ];

            const result = classifyFiles(files, { agents: 'settings' }, layerSources);
            assert.strictEqual(result[0].classification, 'plugin');
        });
    });
});
