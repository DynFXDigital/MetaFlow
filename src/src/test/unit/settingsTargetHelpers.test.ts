import * as assert from 'assert';
import type { EffectiveFile } from '@metaflow/engine';
import {
    computeLegacySettingsEntriesFromEffectiveFiles,
    isSettingsInjectionTarget,
    mergeSettingsValue,
    pruneBundledMetaFlowSettingsEntries,
    removeSettingsEntries,
    resolveTarget,
} from '../../commands/settingsTargetHelpers';

suite('settingsTargetHelpers', () => {
    function makeFile(
        relativePath: string,
        classification: 'settings' | 'plugin' | 'synchronized',
        sourcePath: string,
    ): EffectiveFile {
        return {
            relativePath,
            sourcePath,
            sourceLayer: 'test',
            classification,
        };
    }

    // ── isSettingsInjectionTarget ──────────────────────────────────

    suite('isSettingsInjectionTarget', () => {
        test('SIT-TG-01 accepts valid targets', () => {
            assert.strictEqual(isSettingsInjectionTarget('user'), true);
            assert.strictEqual(isSettingsInjectionTarget('workspace'), true);
            assert.strictEqual(isSettingsInjectionTarget('workspaceFolder'), true);
        });

        test('SIT-TG-02 rejects invalid values', () => {
            assert.strictEqual(isSettingsInjectionTarget('global'), false);
            assert.strictEqual(isSettingsInjectionTarget(''), false);
            assert.strictEqual(isSettingsInjectionTarget(null), false);
            assert.strictEqual(isSettingsInjectionTarget(undefined), false);
            assert.strictEqual(isSettingsInjectionTarget(42), false);
        });
    });

    // ── resolveTarget ──────────────────────────────────────────────

    suite('resolveTarget', () => {
        test('SIT-RT-01 local override takes priority', () => {
            const result = resolveTarget('user', 'workspace', 1);
            assert.strictEqual(result.requested, 'user');
            assert.strictEqual(result.effective, 'user');
        });

        test('SIT-RT-02 config default used when no local override', () => {
            const result = resolveTarget(undefined, 'user', 2);
            assert.strictEqual(result.requested, 'user');
            assert.strictEqual(result.effective, 'user');
        });

        test('SIT-RT-03 fallback to workspace when both unset', () => {
            const result = resolveTarget(undefined, undefined, 1);
            assert.strictEqual(result.requested, 'workspace');
            assert.strictEqual(result.effective, 'workspace');
        });

        test('SIT-RT-04 workspaceFolder downgrades to workspace in single-folder', () => {
            const result = resolveTarget('workspaceFolder', undefined, 1);
            assert.strictEqual(result.requested, 'workspaceFolder');
            assert.strictEqual(result.effective, 'workspace');
        });

        test('SIT-RT-05 workspaceFolder preserved in multi-folder', () => {
            const result = resolveTarget('workspaceFolder', undefined, 3);
            assert.strictEqual(result.requested, 'workspaceFolder');
            assert.strictEqual(result.effective, 'workspaceFolder');
        });

        test('SIT-RT-06 invalid local override falls through to config', () => {
            const result = resolveTarget('bogus', 'user', 1);
            assert.strictEqual(result.requested, 'user');
        });

        test('SIT-RT-07 invalid config falls through to workspace default', () => {
            const result = resolveTarget(undefined, 'bogus', 1);
            assert.strictEqual(result.requested, 'workspace');
            assert.strictEqual(result.effective, 'workspace');
        });

        test('SIT-RT-08 zero folders treated as single-folder for downgrade', () => {
            const result = resolveTarget('workspaceFolder', undefined, 0);
            assert.strictEqual(result.effective, 'workspace');
        });
    });

    // ── mergeSettingsValue ─────────────────────────────────────────

    suite('mergeSettingsValue', () => {
        test('SIT-MG-01 object map merge adds new keys', () => {
            const existing = { 'user/path': true };
            const managed = { 'metaflow/path': true };
            const result = mergeSettingsValue(existing, managed);
            assert.deepStrictEqual(result, { 'user/path': true, 'metaflow/path': true });
        });

        test('SIT-MG-02 object map merge overwrites existing keys', () => {
            const existing = { 'shared/path': false };
            const managed = { 'shared/path': true };
            const result = mergeSettingsValue(existing, managed);
            assert.deepStrictEqual(result, { 'shared/path': true });
        });

        test('SIT-MG-03 object map merge onto undefined creates map', () => {
            const managed = { 'metaflow/path': true };
            const result = mergeSettingsValue(undefined, managed);
            assert.deepStrictEqual(result, { 'metaflow/path': true });
        });

        test('SIT-MG-04 array merge appends and deduplicates', () => {
            const existing = ['user/path'];
            const managed = ['metaflow/path', 'user/path'];
            const result = mergeSettingsValue(existing, managed);
            assert.deepStrictEqual(result, ['metaflow/path', 'user/path']);
        });

        test('SIT-MG-05 array merge onto undefined creates array', () => {
            const managed = ['metaflow/path'];
            const result = mergeSettingsValue(undefined, managed);
            assert.deepStrictEqual(result, ['metaflow/path']);
        });

        test('SIT-MG-06 null managed returns existing unchanged', () => {
            const existing = { 'user/path': true };
            assert.deepStrictEqual(mergeSettingsValue(existing, null), existing);
            assert.deepStrictEqual(mergeSettingsValue(existing, undefined), existing);
        });

        test('SIT-MG-07 scalar managed replaces existing', () => {
            assert.strictEqual(mergeSettingsValue('old', 'new'), 'new');
        });

        test('SIT-MG-08 object map preserves unmanaged order and appends managed subset in normalized path order', () => {
            const existing = {
                'user/zeta': true,
                'user/alpha': true,
                'meta/legacy': true,
            };
            const managed = {
                'repo\\team\\instructions': true,
                'repo/alpha/instructions': true,
            };

            const result = mergeSettingsValue(existing, managed) as Record<string, boolean>;

            assert.deepStrictEqual(Object.keys(result), [
                'user/zeta',
                'user/alpha',
                'meta/legacy',
                'repo/alpha/instructions',
                'repo\\team\\instructions',
            ]);
        });

        test('SIT-MG-09 array merge preserves unmanaged remainder and appends sorted unique managed subset', () => {
            const existing = ['user/path', 'repo/zeta/instructions', 'repo/alpha/instructions'];
            const managed = [
                'repo\\zeta\\instructions',
                'repo/alpha/instructions',
                'repo/beta/instructions',
            ];

            const result = mergeSettingsValue(existing, managed);

            assert.deepStrictEqual(result, [
                'user/path',
                'repo/alpha/instructions',
                'repo/beta/instructions',
                'repo\\zeta\\instructions',
            ]);
        });
    });

    // ── removeSettingsEntries ──────────────────────────────────────

    suite('removeSettingsEntries', () => {
        test('SIT-RM-01 object map removes managed keys only', () => {
            const existing = { 'user/path': true, 'metaflow/path': true };
            const managed = { 'metaflow/path': true };
            const result = removeSettingsEntries(existing, managed);
            assert.deepStrictEqual(result, { 'user/path': true });
        });

        test('SIT-RM-02 object map returns undefined when result is empty', () => {
            const existing = { 'metaflow/path': true };
            const managed = { 'metaflow/path': true };
            const result = removeSettingsEntries(existing, managed);
            assert.strictEqual(result, undefined);
        });

        test('SIT-RM-03 array removes managed elements only', () => {
            const existing = ['user/path', 'metaflow/path'];
            const managed = ['metaflow/path'];
            const result = removeSettingsEntries(existing, managed);
            assert.deepStrictEqual(result, ['user/path']);
        });

        test('SIT-RM-04 array returns undefined when result is empty', () => {
            const existing = ['metaflow/path'];
            const managed = ['metaflow/path'];
            const result = removeSettingsEntries(existing, managed);
            assert.strictEqual(result, undefined);
        });

        test('SIT-RM-05 returns undefined for null/undefined existing', () => {
            assert.strictEqual(removeSettingsEntries(null, { key: true }), undefined);
            assert.strictEqual(removeSettingsEntries(undefined, ['path']), undefined);
        });

        test('SIT-RM-06 mismatched types return undefined', () => {
            // managed is object, existing is array
            assert.strictEqual(removeSettingsEntries(['path'], { key: true }), undefined);
            // managed is array, existing is object
            assert.strictEqual(removeSettingsEntries({ key: true }, ['path']), undefined);
        });

        test('SIT-RM-07 removal matches normalized paths for object maps and arrays', () => {
            const objectResult = removeSettingsEntries(
                {
                    'user/path': true,
                    'repo\\team\\instructions': true,
                },
                { 'repo/team/instructions': true },
            );
            const arrayResult = removeSettingsEntries(
                ['user/path', 'repo\\team\\instructions'],
                ['repo/team/instructions'],
            );

            assert.deepStrictEqual(objectResult, { 'user/path': true });
            assert.deepStrictEqual(arrayResult, ['user/path']);
        });
    });

    // ── pruneBundledMetaFlowSettingsEntries ───────────────────────

    suite('computeLegacySettingsEntriesFromEffectiveFiles', () => {
        test('SIT-CL-01 includes plugin-classified instruction, agent, and skill roots for stale cleanup', () => {
            const entries = computeLegacySettingsEntriesFromEffectiveFiles(
                [
                    makeFile(
                        '.github/instructions/a.md',
                        'plugin',
                        '/repo/capabilities/smoke/.github/instructions/a.md',
                    ),
                    makeFile(
                        '.github/agents/reviewer.agent.md',
                        'plugin',
                        '/repo/capabilities/smoke/.github/agents/reviewer.agent.md',
                    ),
                    makeFile(
                        '.github/skills/testing/SKILL.md',
                        'plugin',
                        '/repo/capabilities/smoke/.github/skills/testing/SKILL.md',
                    ),
                ],
                '/workspace',
            );

            assert.deepStrictEqual(entries, [
                {
                    key: 'chat.instructionsFilesLocations',
                    value: { '../repo/capabilities/smoke/.github/instructions': true },
                },
                {
                    key: 'chat.agentFilesLocations',
                    value: { '../repo/capabilities/smoke/.github/agents': true },
                },
                {
                    key: 'chat.agentSkillsLocations',
                    value: { '../repo/capabilities/smoke/.github/skills': true },
                },
            ]);
        });

        test('SIT-CL-02 preserves prompt settings roots and ignores synchronized files', () => {
            const entries = computeLegacySettingsEntriesFromEffectiveFiles(
                [
                    makeFile(
                        '.github/prompts/example.prompt.md',
                        'settings',
                        '/repo/capabilities/smoke/.github/prompts/example.prompt.md',
                    ),
                    makeFile(
                        '.github/prompts/ignored.prompt.md',
                        'synchronized',
                        '/repo/capabilities/smoke/.github/prompts/ignored.prompt.md',
                    ),
                ],
                '/workspace',
            );

            assert.deepStrictEqual(entries, [
                {
                    key: 'chat.promptFilesLocations',
                    value: { '../repo/capabilities/smoke/.github/prompts': true },
                },
            ]);
        });
    });

    suite('pruneBundledMetaFlowSettingsEntries', () => {
        test('SIT-PB-00 prunes stale bundled plugin locations while retaining selected plugin roots', () => {
            const existing = {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata': true,
                '../AI/DFX-AI-Metadata/capabilities/miscelleneous/agent-visibility-smoke-test': true,
            };
            const retained = {
                '../AI/DFX-AI-Metadata/capabilities/miscelleneous/agent-visibility-smoke-test': true,
            };

            const result = pruneBundledMetaFlowSettingsEntries(
                existing,
                'chat.pluginLocations',
                retained,
            );

            assert.deepStrictEqual(result, {
                '../AI/DFX-AI-Metadata/capabilities/miscelleneous/agent-visibility-smoke-test': true,
            });
        });

        test('SIT-PB-01 prunes nested bundled locations for every file-location setting', () => {
            const cases: Array<{ key: string; suffix: string }> = [
                { key: 'chat.instructionsFilesLocations', suffix: '.github/instructions' },
                { key: 'chat.agentFilesLocations', suffix: '.github/agents' },
                { key: 'chat.agentSkillsLocations', suffix: '.github/skills' },
                { key: 'chat.promptFilesLocations', suffix: '.github/prompts' },
            ];

            for (const { key, suffix } of cases) {
                const nonBuiltInPath = `../AI/DFX-AI-Metadata/capabilities/miscelleneous/agent-visibility-smoke-test/${suffix}`;
                const result = pruneBundledMetaFlowSettingsEntries(
                    {
                        [`../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/${suffix}`]: true,
                        [`../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/claude-code-metadata-authoring/${suffix}`]: true,
                        [`../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/codex-metadata-authoring/${suffix}`]: true,
                        [`../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/github-copilot-metadata-authoring/${suffix}`]: true,
                        [nonBuiltInPath]: true,
                    },
                    key,
                    { [nonBuiltInPath]: true },
                );

                assert.deepStrictEqual(result, { [nonBuiltInPath]: true }, key);
            }
        });

        test('SIT-PB-02 prunes stale bundled prompt map entries from other clients', () => {
            const existing = {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '.ai/dfx-ai-metadata/capabilities/planning/.github/prompts': true,
            };
            const retained = {
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
            };

            const result = pruneBundledMetaFlowSettingsEntries(
                existing,
                'chat.promptFilesLocations',
                retained,
            );

            assert.deepStrictEqual(result, {
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '.ai/dfx-ai-metadata/capabilities/planning/.github/prompts': true,
            });
        });

        test('SIT-PB-03 prunes stale bundled skill array entries when no bundled root is retained', () => {
            const existing = [
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/skills',
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/skills',
                '.ai/dfx-ai-metadata/capabilities/metadata-authoring/.github/skills',
            ];

            const result = pruneBundledMetaFlowSettingsEntries(
                existing,
                'chat.agentSkillsLocations',
                undefined,
            );

            assert.deepStrictEqual(result, [
                '.ai/dfx-ai-metadata/capabilities/metadata-authoring/.github/skills',
            ]);
        });

        test('SIT-PB-04 leaves unrelated settings keys unchanged', () => {
            const existing = {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                'user/path': true,
            };

            const result = pruneBundledMetaFlowSettingsEntries(
                existing,
                'chat.hookFilesLocations',
                undefined,
            );

            assert.deepStrictEqual(result, existing);
        });
    });
});
