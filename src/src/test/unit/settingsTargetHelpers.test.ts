import * as assert from 'assert';
import {
    isSettingsInjectionTarget,
    mergeSettingsValue,
    pruneBundledMetaFlowSettingsEntries,
    removeSettingsEntries,
    resolveTarget,
} from '../../commands/settingsTargetHelpers';

suite('settingsTargetHelpers', () => {
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
            assert.deepStrictEqual(result, ['user/path', 'metaflow/path']);
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
    });

    // ── pruneBundledMetaFlowSettingsEntries ───────────────────────

    suite('pruneBundledMetaFlowSettingsEntries', () => {
        test('SIT-PB-01 prunes stale bundled prompt map entries from other clients', () => {
            const existing = {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '.ai/dfx-ai-metadata/capabilities/planning/.github/prompts': true,
            };
            const retained = {
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
            };

            const result = pruneBundledMetaFlowSettingsEntries(
                existing,
                'chat.promptFilesLocations',
                retained,
            );

            assert.deepStrictEqual(result, {
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                '.ai/dfx-ai-metadata/capabilities/planning/.github/prompts': true,
            });
        });

        test('SIT-PB-02 prunes stale bundled skill array entries when no bundled root is retained', () => {
            const existing = [
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/skills',
                '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/skills',
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

        test('SIT-PB-03 leaves unrelated settings keys unchanged', () => {
            const existing = {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
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
