import * as assert from 'assert';
import * as path from 'path';
import {
    computeSettingsEntries,
    computeSettingsKeysToRemove,
    EffectiveFile,
} from '@metaflow/engine';

suite('settingsInjector', () => {
    const workspaceRoot = '/workspace';

    function makeFile(
        relativePath: string,
        classification: 'settings' | 'synchronized',
        sourcePath?: string,
    ): EffectiveFile {
        return {
            relativePath,
            sourcePath: sourcePath ?? path.join('/repo', relativePath),
            sourceLayer: 'test',
            classification,
        };
    }

    test('computes settings for instructions paths', () => {
        const files = [
            makeFile('instructions/coding.md', 'settings', '/repo/instructions/coding.md'),
            makeFile('instructions/testing.md', 'settings', '/repo/instructions/testing.md'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        const instrEntry = entries.find((e) => e.key === 'chat.instructionsFilesLocations');
        assert.ok(instrEntry);
        assert.strictEqual(typeof instrEntry!.value, 'object');
        assert.ok((instrEntry!.value as Record<string, boolean>)['../repo/instructions']);

        const legacyInstrEntry = entries.find(
            (e) => e.key === 'github.copilot.chat.codeGeneration.instructionFiles',
        );
        assert.ok(legacyInstrEntry);
    });

    test('computes settings for prompts paths', () => {
        const files = [
            makeFile('prompts/gen.prompt.md', 'settings', '/repo/prompts/gen.prompt.md'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        const promptEntry = entries.find((e) => e.key === 'chat.promptFilesLocations');
        assert.ok(promptEntry);
        assert.ok((promptEntry!.value as Record<string, boolean>)['../repo/prompts']);

        const legacyPromptEntry = entries.find((e) => e.key === 'github.copilot.chat.promptFiles');
        assert.ok(legacyPromptEntry);
    });

    test('computes settings for agents and skills paths', () => {
        const files = [
            makeFile('agents/reviewer.agent.md', 'settings', '/repo/agents/reviewer.agent.md'),
            makeFile('skills/testing/SKILL.md', 'settings', '/repo/skills/testing/SKILL.md'),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});
        const agentEntry = entries.find((e) => e.key === 'chat.agentFilesLocations');
        const skillEntry = entries.find((e) => e.key === 'chat.agentSkillsLocations');

        assert.ok(agentEntry);
        assert.ok(skillEntry);
        assert.ok((agentEntry!.value as Record<string, boolean>)['../repo/agents']);
        assert.ok((skillEntry!.value as Record<string, boolean>)['../repo/skills']);
    });

    test('computes settings for .github-prefixed artifact paths', () => {
        const files = [
            makeFile(
                '.github/instructions/coding.md',
                'settings',
                '/repo/.github/instructions/coding.md',
            ),
            makeFile(
                '.github/prompts/review.prompt.md',
                'settings',
                '/repo/.github/prompts/review.prompt.md',
            ),
            makeFile(
                '.github/agents/reviewer.agent.md',
                'settings',
                '/repo/.github/agents/reviewer.agent.md',
            ),
            makeFile(
                '.github/skills/testing/SKILL.md',
                'settings',
                '/repo/.github/skills/testing/SKILL.md',
            ),
        ];

        const entries = computeSettingsEntries(files, workspaceRoot, {});

        const instructionsEntry = entries.find((e) => e.key === 'chat.instructionsFilesLocations');
        const promptsEntry = entries.find((e) => e.key === 'chat.promptFilesLocations');
        const agentsEntry = entries.find((e) => e.key === 'chat.agentFilesLocations');
        const skillsEntry = entries.find((e) => e.key === 'chat.agentSkillsLocations');

        assert.ok(
            (instructionsEntry!.value as Record<string, boolean>)['../repo/.github/instructions'],
        );
        assert.ok((promptsEntry!.value as Record<string, boolean>)['../repo/.github/prompts']);
        assert.ok((agentsEntry!.value as Record<string, boolean>)['../repo/.github/agents']);
        assert.ok((skillsEntry!.value as Record<string, boolean>)['../repo/.github/skills']);
    });

    test('ignores Synchronized files', () => {
        const files = [makeFile('agents/coder.agent.md', 'synchronized')];

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

        const hookEntry = entries.find((e) => e.key === 'chat.hookFilesLocations');
        assert.ok(hookEntry);
        const locations = hookEntry!.value as Record<string, boolean>;
        assert.ok(locations['scripts/pre-apply.sh']);
        assert.ok(locations['scripts/post-apply.sh']);
    });

    test('no-op when no settings files and no hooks', () => {
        const entries = computeSettingsEntries([], workspaceRoot, {});
        assert.strictEqual(entries.length, 0);
    });

    test('computeSettingsKeysToRemove returns expected keys', () => {
        const keys = computeSettingsKeysToRemove();
        assert.ok(keys.length >= 4);
        assert.ok(keys.includes('chat.instructionsFilesLocations'));
        assert.ok(keys.includes('chat.promptFilesLocations'));
        assert.ok(keys.includes('chat.agentFilesLocations'));
        assert.ok(keys.includes('chat.agentSkillsLocations'));
        assert.ok(keys.includes('chat.hookFilesLocations'));
        assert.ok(keys.includes('github.copilot.chat.codeGeneration.instructionFiles'));
        assert.ok(keys.includes('github.copilot.chat.promptFiles'));
    });
});
