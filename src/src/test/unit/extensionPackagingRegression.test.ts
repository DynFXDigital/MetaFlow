import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type ExtensionPackageJson = {
    main?: string;
    activationEvents?: string[];
    scripts?: Record<string, string>;
    contributes?: {
        commands?: Array<{
            command: string;
            title?: string;
            category?: string;
            icon?: string;
        }>;
        menus?: {
            'view/title'?: Array<{
                command: string;
                when?: string;
                group?: string;
            }>;
            'view/item/context'?: Array<{
                command: string;
                when?: string;
                group?: string;
            }>;
        };
        keybindings?: Array<{
            command: string;
            key?: string;
            mac?: string;
            when?: string;
        }>;
        configuration?: {
            properties?: Record<
                string,
                {
                    default?: unknown;
                    enum?: string[];
                }
            >;
        };
    };
};

const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

suite('Extension Packaging Regression Guards', () => {
    test('multi-client VSIX install tasks pass a single comma-separated CLI list', () => {
        const tasksJsonPath = path.join(EXTENSION_ROOT, '..', '.vscode', 'tasks.json');
        const tasksJson = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf-8')) as {
            tasks?: Array<{
                label?: string;
                command?: string;
                args?: string[];
                windows?: {
                    command?: string;
                };
            }>;
        };

        const expectedLabels = [
            'MetaFlow: Install Latest VSIX (Both: VS Code + Insiders)',
            'MetaFlow: Install Latest VSIX (All Profiles: VS Code + Insiders)',
        ];

        for (const label of expectedLabels) {
            const task = tasksJson.tasks?.find((entry) => entry.label === label);
            assert.ok(task, `Expected task '${label}' to exist`);

            const cliIndex = task?.args?.indexOf('-Cli') ?? -1;
            assert.ok(cliIndex >= 0, `Expected task '${label}' to pass -Cli`);
            assert.strictEqual(task?.args?.[cliIndex + 1], 'code,code-insiders');
            assert.notStrictEqual(task?.args?.[cliIndex + 2], 'code-insiders');
        }
    });

    test('windows VSIX install tasks fall back to Windows PowerShell', () => {
        const tasksJsonPath = path.join(EXTENSION_ROOT, '..', '.vscode', 'tasks.json');
        const tasksJson = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf-8')) as {
            tasks?: Array<{
                label?: string;
                command?: string;
                windows?: {
                    command?: string;
                };
            }>;
        };

        const expectedLabels = [
            'MetaFlow: Install Latest VSIX',
            'MetaFlow: Install Latest VSIX (Both: VS Code + Insiders)',
            'MetaFlow: Install Latest VSIX (All Profiles: Current VS Code)',
            'MetaFlow: Install Latest VSIX (All Profiles: VS Code + Insiders)',
        ];

        for (const label of expectedLabels) {
            const task = tasksJson.tasks?.find((entry) => entry.label === label);
            assert.ok(task, `Expected task '${label}' to exist`);
            assert.strictEqual(task?.command, 'pwsh');
            assert.strictEqual(task?.windows?.command, 'powershell');
        }
    });

    test('install-vsix script avoids PowerShell 7-only JSON parsing flags and VSIX-only Expand-Archive usage', () => {
        const installScriptPath = path.join(EXTENSION_ROOT, 'scripts', 'install-vsix.ps1');
        const installScriptSource = fs.readFileSync(installScriptPath, 'utf-8');

        assert.ok(installScriptSource.includes('function ConvertFrom-JsonCompat'));
        assert.ok(installScriptSource.includes('function Expand-ZipArchiveCompat'));
        assert.ok(!installScriptSource.includes('-AsHashtable'));
        assert.ok(!installScriptSource.includes('Expand-Archive -LiteralPath $ResolvedVsixPath'));
    });

    test('package.json points extension main to dist bundle', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        assert.strictEqual(packageJson.main, './dist/extension.js');
    });

    test('activation events only include the unified config location', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const activationEvents = packageJson.activationEvents ?? [];
        assert.ok(activationEvents.includes('workspaceContains:**/.metaflow/config.jsonc'));
        assert.strictEqual(
            activationEvents.includes('onStartupFinished'),
            false,
            'Expected activation to stay scoped to MetaFlow workspaces instead of all startup sessions',
        );
    });

    test('config schema accepts profile layerOverrides', () => {
        const schemaPath = path.join(EXTENSION_ROOT, 'schemas', 'metaflow-config.schema.json');
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as {
            definitions?: Record<
                string,
                {
                    properties?: Record<string, unknown>;
                    required?: string[];
                }
            >;
        };

        const profileConfig = schema.definitions?.profileConfig;
        const profileLayerOverride = schema.definitions?.profileLayerOverride;

        assert.ok(profileConfig?.properties?.layerOverrides);
        assert.ok(profileLayerOverride);
        assert.deepStrictEqual(profileLayerOverride?.required, ['repoId', 'path']);
    });

    test('vscode prepublish uses bundle script', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        assert.strictEqual(packageJson.scripts?.['vscode:prepublish'], 'npm run bundle');
    });

    test('esbuild config prefers ESM module entrypoints', () => {
        const esbuildConfigPath = path.join(EXTENSION_ROOT, 'esbuild.js');
        const esbuildConfigSource = fs.readFileSync(esbuildConfigPath, 'utf-8');

        assert.ok(
            esbuildConfigSource.includes("mainFields: ['module', 'main']"),
            'Expected esbuild config to contain mainFields preferring module over main',
        );
    });

    test('initConfig uses vscode workspace.fs API', () => {
        const initConfigPath = path.join(EXTENSION_ROOT, 'src', 'commands', 'initConfig.ts');
        const initConfigSource = fs.readFileSync(initConfigPath, 'utf-8');

        assert.ok(initConfigSource.includes('vscode.workspace.fs.writeFile'));
        assert.ok(initConfigSource.includes('vscode.workspace.fs.stat'));
        assert.ok(!initConfigSource.includes('fs.writeFileSync('));
    });

    test('repo update interval setting exposes expected preset values', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const intervalSetting =
            packageJson.contributes?.configuration?.properties?.[
                'metaflow.repoUpdateCheckInterval'
            ];
        assert.ok(
            intervalSetting,
            'Expected metaflow.repoUpdateCheckInterval setting to be contributed',
        );
        assert.strictEqual(intervalSetting?.default, 'daily');
        assert.deepStrictEqual(intervalSetting?.enum, ['hourly', 'daily', 'weekly', 'monthly']);
    });

    test('repo update commands are contributed for the command palette', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const checkUpdatesCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.checkRepoUpdates',
        );
        assert.ok(checkUpdatesCommand, 'Expected metaflow.checkRepoUpdates command contribution');
        assert.strictEqual(checkUpdatesCommand?.icon, '$(repo-fetch)');

        const pullCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.pullRepository',
        );
        assert.ok(pullCommand, 'Expected metaflow.pullRepository command contribution');

        const pushCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.pushRepository',
        );
        assert.ok(pushCommand, 'Expected metaflow.pushRepository command contribution');
        assert.strictEqual(pushCommand?.icon, '$(repo-push)');
    });

    test('Create CAPABILITY.md is contributed for the command palette and Capabilities menus', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const createCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.createCapabilityManifest',
        );
        assert.ok(createCommand, 'Expected metaflow.createCapabilityManifest command contribution');
        assert.strictEqual(createCommand?.icon, '$(new-file)');

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        const titleEntry = titleMenuEntries.find(
            (entry) => entry.command === 'metaflow.createCapabilityManifest',
        );
        assert.ok(titleEntry, 'Expected Create CAPABILITY.md in the Capabilities view title menu');
        assert.strictEqual(
            titleEntry?.when,
            'view == metaflow-layers && metaflow.layersViewMode == flat',
        );

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        const contextEntry = contextMenuEntries.find(
            (entry) =>
                entry.command === 'metaflow.createCapabilityManifest' &&
                entry.when ===
                    'view == metaflow-layers && (viewItem == layerRepo || viewItem == layerFolder || viewItem == layer)',
        );
        assert.ok(
            contextEntry,
            'Expected Create CAPABILITY.md in the Capabilities item context menu',
        );
    });

    test('Maintain Capability Plugin Metadata is contributed for the command palette only', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const maintainCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.maintainCapabilityPluginMetadata',
        );
        assert.ok(
            maintainCommand,
            'Expected metaflow.maintainCapabilityPluginMetadata command contribution',
        );
        assert.strictEqual(maintainCommand?.icon, '$(package)');

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        assert.ok(
            !contextMenuEntries.some(
                (entry) => entry.command === 'metaflow.maintainCapabilityPluginMetadata',
            ),
            'Expected single-capability plugin metadata maintenance to stay out of tree item menus',
        );
    });

    test('Maintain All Capability Plugin Metadata is contributed for the command palette and repo item menus', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const maintainAllCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.maintainAllCapabilityPluginMetadata',
        );
        assert.ok(
            maintainAllCommand,
            'Expected metaflow.maintainAllCapabilityPluginMetadata command contribution',
        );
        assert.strictEqual(maintainAllCommand?.icon, '$(repo)');

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        assert.ok(
            contextMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.maintainAllCapabilityPluginMetadata' &&
                    entry.when ===
                        'view == metaflow-config && (viewItem == configRepoSourceRescannable || viewItem == configRepoSourceLocalGit || viewItem == configRepoSourceGit || viewItem == configRepoSourceGitBehind || viewItem == configRepoSourceGitAhead)',
            ),
            'Expected Maintain All Capability Plugin Metadata in the AI Metadata repo context menu',
        );
        assert.ok(
            !contextMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.maintainAllCapabilityPluginMetadata' &&
                    entry.when === 'view == metaflow-layers && viewItem == layerRepo',
            ),
            'Expected Maintain All Capability Plugin Metadata to stay off the Capabilities repo inline menu',
        );
    });

    test('Capabilities and Effective Files contribute native filter commands and focused keybindings', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const commands = packageJson.contributes?.commands ?? [];
        const layersFilterCommand = commands.find(
            (entry) => entry.command === 'metaflow.openLayersFilter',
        );
        const layersClearFilterCommand = commands.find(
            (entry) => entry.command === 'metaflow.clearLayersFilter',
        );
        const filesFilterCommand = commands.find(
            (entry) => entry.command === 'metaflow.openFilesFilter',
        );

        assert.ok(layersFilterCommand, 'Expected metaflow.openLayersFilter command contribution');
        assert.strictEqual(layersFilterCommand?.icon, '$(search)');
        assert.ok(
            layersClearFilterCommand,
            'Expected metaflow.clearLayersFilter command contribution',
        );
        assert.strictEqual(layersClearFilterCommand?.icon, '$(clear-all)');
        assert.ok(filesFilterCommand, 'Expected metaflow.openFilesFilter command contribution');
        assert.strictEqual(filesFilterCommand?.icon, '$(search)');

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        assert.ok(
            titleMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.openLayersFilter' &&
                    entry.when === 'view == metaflow-layers && !metaflow.layersNativeFilterActive',
            ),
            'Expected filter action in the Capabilities view title menu',
        );
        assert.ok(
            titleMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.clearLayersFilter' &&
                    entry.when === 'view == metaflow-layers && metaflow.layersNativeFilterActive',
            ),
            'Expected clear filter action in the Capabilities view title menu',
        );
        assert.ok(
            titleMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.openFilesFilter' &&
                    entry.when === 'view == metaflow-files',
            ),
            'Expected filter action in the Effective Files view title menu',
        );

        const keybindings = packageJson.contributes?.keybindings ?? [];
        assert.ok(
            keybindings.some(
                (entry) =>
                    entry.command === 'metaflow.openLayersFilter' &&
                    entry.key === 'ctrl+f' &&
                    entry.mac === 'cmd+f' &&
                    entry.when === "sideBarFocus && focusedView == 'metaflow-layers'",
            ),
            'Expected focused Ctrl+F binding for the Capabilities filter',
        );
        assert.ok(
            keybindings.some(
                (entry) =>
                    entry.command === 'metaflow.openFilesFilter' &&
                    entry.key === 'ctrl+f' &&
                    entry.mac === 'cmd+f' &&
                    entry.when === "sideBarFocus && focusedView == 'metaflow-files'",
            ),
            'Expected focused Ctrl+F binding for the Effective Files filter',
        );
    });

    test('built-in capability removal uses trash icon and row-level context action', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const removeCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.removeMetaFlowCapability',
        );
        assert.ok(removeCommand, 'Expected metaflow.removeMetaFlowCapability command contribution');
        assert.strictEqual(removeCommand?.icon, '$(trash)');

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        assert.strictEqual(
            titleMenuEntries.some((entry) => entry.command === 'metaflow.removeMetaFlowCapability'),
            false,
            'Expected remove command to be absent from view/title',
        );

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        const rowRemoveEntry = contextMenuEntries.find(
            (entry) =>
                entry.command === 'metaflow.removeMetaFlowCapability' &&
                entry.when === 'view == metaflow-config && viewItem == configRepoSourceBuiltin',
        );

        assert.ok(rowRemoveEntry, 'Expected remove command in built-in repo row context menu');
        assert.strictEqual(rowRemoveEntry?.group, 'inline@3');
    });

    test('bulk layer commands are palette-discoverable under the MetaFlow namespace', () => {
        // Regression guard: selectAllLayers / deselectAllLayers previously had a
        // bare title ("Select All") with no category, so they were NOT invokable
        // as "MetaFlow: Select All" from the command palette — only from tree
        // context menus. A category (or a "MetaFlow:"-prefixed title) is required
        // for palette discoverability under the product namespace.
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const commands = packageJson.contributes?.commands ?? [];
        for (const id of ['metaflow.selectAllLayers', 'metaflow.deselectAllLayers']) {
            const entry = commands.find((c) => c.command === id);
            assert.ok(entry, `Expected ${id} command contribution`);
            const paletteDiscoverable =
                entry?.category === 'MetaFlow' || (entry?.title ?? '').startsWith('MetaFlow:');
            assert.ok(
                paletteDiscoverable,
                `Expected ${id} to be palette-discoverable as "MetaFlow: …" ` +
                    `(needs category "MetaFlow" or a "MetaFlow:"-prefixed title), ` +
                    `got category=${entry?.category} title=${entry?.title}`,
            );
        }
    });

    test('commands surfaced in context menus keep a clean (un-prefixed) title', () => {
        // Complements the palette-discoverability guard: context-menu commands
        // must read cleanly (e.g. "Select All"), so the MetaFlow namespace must
        // come from `category`, never a "MetaFlow:"-prefixed title.
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const commands = packageJson.contributes?.commands ?? [];
        for (const id of ['metaflow.selectAllLayers', 'metaflow.deselectAllLayers']) {
            const entry = commands.find((c) => c.command === id);
            assert.ok(entry, `Expected ${id} command contribution`);
            assert.ok(
                !(entry?.title ?? '').startsWith('MetaFlow:'),
                `Expected ${id} to keep a clean title for context menus, got "${entry?.title}"`,
            );
            assert.strictEqual(
                entry?.category,
                'MetaFlow',
                `Expected ${id} to namespace via category, not a prefixed title`,
            );
        }

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        assert.ok(
            contextMenuEntries.some((e) => e.command === 'metaflow.selectAllLayers'),
            'Expected Select All to remain available in the Capabilities item context menu',
        );
        assert.ok(
            contextMenuEntries.some((e) => e.command === 'metaflow.deselectAllLayers'),
            'Expected Deselect All to remain available in the Capabilities item context menu',
        );
    });

    test('Capabilities view title actions use the same ordering as Effective Files view', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        const filesEntries = new Map(
            titleMenuEntries
                .filter((entry) =>
                    [
                        'metaflow.toggleFilesViewMode',
                        'metaflow.collapseAllFiles',
                        'metaflow.expandAllFiles',
                    ].includes(entry.command),
                )
                .map((entry) => [entry.command, entry.group]),
        );
        const layersEntries = new Map(
            titleMenuEntries
                .filter((entry) =>
                    [
                        'metaflow.toggleLayersViewMode',
                        'metaflow.collapseAllLayers',
                        'metaflow.expandAllLayers',
                    ].includes(entry.command),
                )
                .map((entry) => [entry.command, entry.group]),
        );

        assert.strictEqual(
            layersEntries.get('metaflow.collapseAllLayers'),
            filesEntries.get('metaflow.collapseAllFiles'),
        );
        assert.strictEqual(
            layersEntries.get('metaflow.expandAllLayers'),
            filesEntries.get('metaflow.expandAllFiles'),
        );
        assert.strictEqual(
            layersEntries.get('metaflow.toggleLayersViewMode'),
            filesEntries.get('metaflow.toggleFilesViewMode'),
        );
    });
});
