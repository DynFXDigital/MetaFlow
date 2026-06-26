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
            'const shouldPersistConfig = autoAcceptRefreshUpdates',
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
            'async function confirmConfigUpdate(',
            'interface BuiltInCapabilityStateRepair',
        );
        assert.match(confirmHelper, /'Open Config'/);
        assert.match(confirmHelper, /'Later'/);
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
            'const shouldPersistConfig = autoAcceptRefreshUpdates',
            'if (shouldPersistConfig && capabilityRepairPreview) {'
        );
        assert.match(refreshUpdateBlock, /autoAcceptRefreshUpdates\s+\? true/);
        assert.match(refreshUpdateBlock, /suppressRefreshUpdatePrompts\s+\? false/);

        const builtInRepairBlock = sourceSlice(
            source,
            'const shouldUpdateBuiltInState = autoAcceptRefreshUpdates',
            'if (shouldUpdateBuiltInState) {'
        );
        assert.match(builtInRepairBlock, /autoAcceptRefreshUpdates\s+\? true/);
        assert.match(builtInRepairBlock, /suppressRefreshUpdatePrompts\s+\? false/);
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
            /const autoAcceptRefreshUpdates =\s+autoAcceptRefreshUpdatesInTests \|\|\s+workspaceConfig\.get<boolean>\(AUTO_ACCEPT_REFRESH_UPDATES_SETTING_KEY, false\);/m,
        );
        assert.match(
            refreshOptionsBlock,
            /const suppressRefreshUpdatePrompts =\s+refreshOptions\.nonInteractive === true && !autoAcceptRefreshUpdates;/m,
        );
    });

    test('declining capability repair preserves the previous identity snapshot', () => {
        const source = readCommandHandlersSource();
        const refreshUpdateBlock = sourceSlice(
            source,
            'let shouldAdvanceCapabilityIdentitySnapshot = true;',
            'const gitRepos = resolveGitBackedRepoSources',
        );

        assert.match(refreshUpdateBlock, /if \(pendingRepairCount > 0\) \{\s+shouldAdvanceCapabilityIdentitySnapshot = false;/m);
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
            /const shouldUpdateBuiltInState = autoAcceptRefreshUpdates[\s\S]*await confirmBuiltInCapabilityStateUpdate\(/,
        );
        assert.match(
            builtInRepairBlock,
            /if \(shouldUpdateBuiltInState\) \{\s+state\.builtInCapability = await writeBuiltInCapabilityWorkspaceState\(/m,
        );
        assert.match(
            builtInRepairBlock,
            /shouldAdvanceCapabilityIdentitySnapshot = false;/,
        );
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
});
