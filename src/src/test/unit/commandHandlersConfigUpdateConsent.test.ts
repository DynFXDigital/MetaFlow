import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const COMMAND_HANDLERS_PATH = path.resolve(__dirname, '../../../src/commands/commandHandlers.ts');

function readCommandHandlersSource(): string {
    return fs.readFileSync(COMMAND_HANDLERS_PATH, 'utf-8');
}

function sourceSlice(source: string, start: string, end: string): string {
    const startIndex = source.indexOf(start);
    assert.ok(startIndex >= 0, `Expected to find source marker: ${start}`);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.ok(endIndex > startIndex, `Expected to find source marker after ${start}: ${end}`);
    return source.slice(startIndex, endIndex);
}

suite('Command handler config update consent', () => {
    test('refresh asks before persisting automatic config updates', () => {
        const source = readCommandHandlersSource();
        const refreshUpdateBlock = sourceSlice(
            source,
            'const configUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates',
            'state.config = result.config;',
        );

        assert.match(
            refreshUpdateBlock,
            /if \(shouldPersistConfig\) \{\s+await persistConfig\(result\.configPath, result\.config, state\);/m,
        );
        assert.ok(
            !/await persistConfig\(result\.configPath, result\.config, state\);[\s\S]*const shouldPersistConfig/.test(
                refreshUpdateBlock,
            ),
            'Refresh must not write config before the update prompt resolves.',
        );

        const confirmHelper = sourceSlice(
            source,
            'async function decideConfigUpdate(',
            'interface BuiltInCapabilityStateRepair',
        );
        assert.match(confirmHelper, /AUTO_ACCEPT_REFRESH_UPDATES_ACTION/);
        assert.match(confirmHelper, /'Open Config'/);
        assert.match(confirmHelper, /'Later'/);
    });

    test('persistence removes the obsolete top-level filters property', () => {
        const source = readCommandHandlersSource();
        const persistenceBlock = sourceSlice(
            source,
            'const topLevelKeys = [',
            'let existing: string | undefined;',
        );

        assert.match(persistenceBlock, /'filters',/);
    });

    test('test-mode refresh accepts pending updates without opening modal dialogs', () => {
        const source = readCommandHandlersSource();
        const refreshOptionsBlock = sourceSlice(
            source,
            'const refreshOptions = extractRefreshCommandOptions(arg);',
            'const pendingCapabilityPluginMetadataDirtyVersion',
        );

        assert.match(refreshOptionsBlock, /context\.extensionMode === vscode\.ExtensionMode\.Test/);
        assert.match(
            refreshOptionsBlock,
            /workspaceConfig\.get<boolean>\(AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY, false\)/,
        );
        assert.match(refreshOptionsBlock, /refreshOptions\.nonInteractive === true/);

        const refreshUpdateBlock = sourceSlice(
            source,
            'const configUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates',
            'if (shouldPersistConfig && capabilityRepairPreview) {',
        );
        assert.match(
            refreshUpdateBlock,
            /autoAcceptRefreshUpdates\s*\?\s*\{ shouldPersist: true, rememberPreference: false \}/,
        );
        assert.match(
            refreshUpdateBlock,
            /suppressRefreshUpdatePrompts\s*\?\s*\{ shouldPersist: false, rememberPreference: false \}/,
        );

        const builtInRepairBlock = sourceSlice(
            source,
            'const builtInUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates',
            'if (shouldUpdateBuiltInState) {',
        );
        assert.match(
            builtInRepairBlock,
            /autoAcceptRefreshUpdates\s*\?\s*\{ shouldPersist: true, rememberPreference: false \}/,
        );
        assert.match(
            builtInRepairBlock,
            /suppressRefreshUpdatePrompts\s*\?\s*\{ shouldPersist: false, rememberPreference: false \}/,
        );
    });

    test('workspace setting can auto-accept refresh updates outside test mode', () => {
        const source = readCommandHandlersSource();
        const refreshOptionsBlock = sourceSlice(
            source,
            'const refreshOptions = extractRefreshCommandOptions(arg);',
            'const pendingCapabilityPluginMetadataDirtyVersion',
        );

        assert.match(
            refreshOptionsBlock,
            /let autoAcceptRefreshUpdates =\s+autoAcceptRefreshUpdatesInTests \|\|\s+workspaceConfig\.get<boolean>\(AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY, false\);/m,
        );
        assert.match(
            refreshOptionsBlock,
            /const suppressRefreshUpdatePrompts =\s+refreshOptions\.nonInteractive === true && !autoAcceptRefreshUpdates;/m,
        );
    });

    test('refresh can skip config maintenance for MetaFlow-originated state updates', () => {
        const source = readCommandHandlersSource();
        const maintenanceBlock = sourceSlice(
            source,
            'let shouldAdvanceCapabilityIdentitySnapshot = true;',
            'state.config = result.config;',
        );

        assert.match(maintenanceBlock, /if \(!refreshOptions\.skipConfigMaintenance\) \{/);
        assert.match(maintenanceBlock, /normalizeAndDeduplicateLayerPaths\(result\.config\)/);
        assert.match(maintenanceBlock, /discoverAndPersistConfiguredRepoLayers\(/);
        assert.match(maintenanceBlock, /previewCapabilityIdentityDriftRepair\(/);
        assert.match(
            maintenanceBlock,
            /await persistConfig\(result\.configPath, result\.config, state\)/,
        );
    });

    test('popup can persist auto-accept preference for future refreshes', () => {
        const source = readCommandHandlersSource();
        const refreshUpdateBlock = sourceSlice(
            source,
            'const configUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates',
            'if (shouldPersistConfig && capabilityRepairPreview) {',
        );

        assert.match(
            refreshUpdateBlock,
            /await decideConfigUpdate\(\s*result\.configPath\s*,?\s*pendingConfigUpdateReasons\s*,?\s*\)/m,
        );
        assert.match(
            refreshUpdateBlock,
            /if \(configUpdateDecision\.rememberPreference\) \{\s+await persistAutoAcceptRefreshUpdatesPreference\(workspaceConfig\);\s+autoAcceptRefreshUpdates = true;/m,
        );

        const builtInRepairBlock = sourceSlice(
            source,
            'const builtInUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates',
            'if (shouldUpdateBuiltInState) {',
        );
        assert.match(
            builtInRepairBlock,
            /await decideBuiltInCapabilityStateUpdate\(\s*builtInRepairPreview\.repairs\s*\)/m,
        );
        assert.match(
            builtInRepairBlock,
            /if \(builtInUpdateDecision\.rememberPreference\) \{\s+await persistAutoAcceptRefreshUpdatesPreference\(workspaceConfig\);\s+autoAcceptRefreshUpdates = true;/m,
        );
    });

    test('declining capability repair preserves the previous identity snapshot', () => {
        const source = readCommandHandlersSource();
        const refreshUpdateBlock = sourceSlice(
            source,
            'let shouldAdvanceCapabilityIdentitySnapshot = true;',
            'const gitRepos = resolveGitBackedRepoSources',
        );

        assert.match(
            refreshUpdateBlock,
            /if \(pendingRepairCount > 0\) \{\s+shouldAdvanceCapabilityIdentitySnapshot = false;/m,
        );
        assert.match(
            source,
            /if \(shouldAdvanceCapabilityIdentitySnapshot\) \{\s+saveCapabilityIdentitySnapshot\(projectedConfig, ws\.uri\.fsPath\);/m,
        );
    });

    test('built-in capability state repair is prompted separately from config writes', () => {
        const source = readCommandHandlersSource();
        const builtInRepairBlock = sourceSlice(
            source,
            'const builtInRepairPreview = previewBuiltInCapabilityStateDriftRepair(',
            'const gitRepos = resolveGitBackedRepoSources',
        );

        assert.match(
            builtInRepairBlock,
            /const builtInUpdateDecision: RefreshUpdateDecision = autoAcceptRefreshUpdates[\s\S]*await decideBuiltInCapabilityStateUpdate\(/,
        );
        assert.match(
            builtInRepairBlock,
            /const shouldUpdateBuiltInState = builtInUpdateDecision\.shouldPersist;[\s\S]*if \(shouldUpdateBuiltInState\) \{\s+state\.builtInCapability = await writeBuiltInCapabilityWorkspaceState\(/m,
        );
        assert.match(builtInRepairBlock, /shouldAdvanceCapabilityIdentitySnapshot = false;/);
    });

    test('capability repair preview does not mutate loaded config before consent', () => {
        const source = readCommandHandlersSource();
        const previewHelper = sourceSlice(
            source,
            'function previewCapabilityIdentityDriftRepair(',
            'function applyCapabilityIdentityDriftRepair(',
        );

        assert.match(
            previewHelper,
            /const repairResult = applyCapabilityReferenceRepairs\(cloneConfig\(config\), resolutions\);/,
        );
        assert.doesNotMatch(previewHelper, /saveManagedState\(/);
    });

    test('plugin injection upgrade is consented and one-time only', () => {
        const source = readCommandHandlersSource();
        const upgradeHelper = sourceSlice(
            source,
            'async function offerPluginInjectionUpgrade(',
            'async function pickRemoteForPromotion(',
        );

        assert.match(upgradeHelper, /PLUGIN_INJECTION_UPGRADE_SUPPRESSIONS_STATE_KEY/);
        assert.match(upgradeHelper, /PLUGIN_INJECTION_UPGRADE_ACTION/);
        assert.match(upgradeHelper, /PLUGIN_INJECTION_UPGRADE_REVIEW_ACTION/);
        assert.match(upgradeHelper, /PLUGIN_INJECTION_UPGRADE_DISMISS_ACTION/);
        assert.match(
            upgradeHelper,
            /suppressions\[suppressionKey\] === PLUGIN_INJECTION_UPGRADE_DISABLED_SIGNATURE/,
        );
        assert.match(upgradeHelper, /suppressions\[suppressionKey\] === signature/);
        assert.match(upgradeHelper, /const configPath = state\.configPath/);
        assert.match(upgradeHelper, /await persistConfig\(configPath, candidateConfig, state\)/);
    });

    test('plugin injection upgrade only rewrites plugin-capable settings entries', () => {
        const source = readCommandHandlersSource();
        const candidateHelper = sourceSlice(
            source,
            'function hasSettingsBackedPluginInjectionCandidate(',
            'function applyPluginInjectionUpgrade(',
        );
        const applyHelper = sourceSlice(
            source,
            'function applyPluginInjectionUpgrade(',
            'async function offerPluginInjectionUpgrade(',
        );

        assert.match(
            source,
            /const PLUGIN_INJECTION_RECOMMENDED_KEYS: readonly InjectionKey\[\] = \[\s+'instructions',\s+'skills',\s+'agents',\s+'hooks',\s+\];/m,
        );
        assert.match(candidateHelper, /injection\?\.\[key\] === 'settings'/);
        assert.match(
            applyHelper,
            /if \(injection\[key\] === 'settings'\) \{\s+injection\[key\] = 'plugin';/m,
        );
        assert.doesNotMatch(applyHelper, /prompts/);
    });

    test('refresh does not show plugin upgrade prompts in non-interactive or test mode', () => {
        const source = readCommandHandlersSource();
        const refreshEndBlock = sourceSlice(
            source,
            'await offerPluginInjectionUpgrade({',
            '} catch (err: unknown) {',
        );

        assert.match(refreshEndBlock, /refreshOptions\.nonInteractive === true/);
        assert.match(refreshEndBlock, /context\.extensionMode === vscode\.ExtensionMode\.Test/);
    });
});
