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
                    scope?: string;
                    type?: string;
                    description?: string;
                }
            >;
        };
    };
};

const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

suite('Extension Packaging Regression Guards', () => {
    test('workspace build refreshes the runtime bundle declared by the extension manifest', () => {
        const extensionPackageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const extensionPackageJson = JSON.parse(
            fs.readFileSync(extensionPackageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;
        const workspacePackageJsonPath = path.join(EXTENSION_ROOT, '..', 'package.json');
        const workspacePackageJson = JSON.parse(
            fs.readFileSync(workspacePackageJsonPath, 'utf-8'),
        ) as { scripts?: Record<string, string> };

        assert.strictEqual(extensionPackageJson.main, './dist/extension.js');
        assert.match(
            extensionPackageJson.scripts?.build ?? '',
            /node esbuild\.js/,
            'Extension build must regenerate the bundled JavaScript entrypoint that VS Code runs',
        );
        assert.match(
            workspacePackageJson.scripts?.build ?? '',
            /npm -w metaflow-ai run build/,
            'Workspace build must invoke the extension build rather than compile-only output',
        );
    });

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

    test('install-vsix script preserves one-entry extension registry arrays', () => {
        const installScriptPath = path.join(EXTENSION_ROOT, 'scripts', 'install-vsix.ps1');
        const installScriptSource = fs.readFileSync(installScriptPath, 'utf-8');

        assert.match(
            installScriptSource,
            /ConvertTo-Json -InputObject \(\[object\[\]\]\$Value\) -Depth 50/,
            'Expected registry writes to preserve a one-entry extensions.json array',
        );
    });

    test('package.json points extension main to dist bundle', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        assert.strictEqual(packageJson.main, './dist/extension.js');
    });

    test('package ignore rules retain runtime icons and exclude unused artwork', () => {
        const ignorePath = path.join(EXTENSION_ROOT, '.vscodeignore');
        const ignoreSource = fs.readFileSync(ignorePath, 'utf-8');
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
            icon?: string;
            contributes?: { viewsContainers?: { activitybar?: Array<{ icon?: string }> } };
        };

        assert.strictEqual(packageJson.icon, 'images/icon.png');
        assert.ok(
            packageJson.contributes?.viewsContainers?.activitybar?.some(
                (entry) => entry.icon === 'images/metaflow-activity.svg',
            ),
        );
        for (const excluded of [
            'images/MetaFlow-*',
            'images/metaflow-sidebar-overview.png',
            'images/metaflow.png',
            'images/icon.svg',
            'images/metaflow.svg',
        ]) {
            assert.ok(ignoreSource.includes(excluded), `Expected ${excluded} to stay excluded`);
        }
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

    test('GUI runner opens the test workspace in the initial VS Code process', () => {
        const runnerPath = path.join(EXTENSION_ROOT, 'scripts', 'run-gui-batched.mjs');
        const runnerSource = fs.readFileSync(runnerPath, 'utf-8');
        const launchHookPath = path.join(EXTENSION_ROOT, 'scripts', 'extest-workspace-launch.cjs');
        const launchHookSource = fs.readFileSync(launchHookPath, 'utf-8');
        const guiSettingsPath = path.join(EXTENSION_ROOT, '.vscode-test-gui-settings.json');
        const guiSettings = JSON.parse(fs.readFileSync(guiSettingsPath, 'utf-8')) as Record<
            string,
            unknown
        >;
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;
        const extensionSource = fs.readFileSync(
            path.join(EXTENSION_ROOT, 'src', 'extension.ts'),
            'utf-8',
        );

        assert.ok(
            runnerSource.includes("const testWorkspace = path.join(srcRoot, 'test-workspace');"),
        );
        assert.ok(runnerSource.includes('METAFLOW_GUI_WORKSPACE: testWorkspace'));
        assert.ok(runnerSource.includes('extest-workspace-launch.cjs'));
        assert.ok(runnerSource.includes("process.env.GUI_BATCH_SIZE ?? '1'"));
        assert.ok(
            runnerSource.includes(
                'parseTimeoutMs(process.env.GUI_BATCH_TIMEOUT_MS, 10 * 60 * 1_000)',
            ),
        );
        assert.doesNotMatch(runnerSource, /'-r',\s+(?:testWorkspace|'test-workspace'),/);
        assert.ok(launchHookSource.includes('chrome.Options.prototype.addArguments'));
        assert.ok(launchHookSource.includes('--folder-uri='));
        assert.ok(launchHookSource.includes('pathToFileURL(workspacePath).href'));
        assert.strictEqual(guiSettings['metaflow.guiTestMode'], true);
        assert.strictEqual(guiSettings['metaflow.autoAcceptRefreshUpdates'], true);
        assert.strictEqual(
            packageJson.contributes?.configuration?.properties?.['metaflow.guiTestMode']?.default,
            false,
        );
        assert.ok(extensionSource.includes("get<boolean>('guiTestMode', false)"));
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

    test('config schema exposes the closed skills-only Pi target at v6', () => {
        const schemaPath = path.join(EXTENSION_ROOT, 'schemas', 'metaflow-config.schema.json');
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as {
            properties?: Record<string, { maximum?: number }>;
            allOf?: Array<{
                then?: {
                    properties?: Record<string, { const?: number }>;
                };
            }>;
            definitions?: Record<
                string,
                {
                    additionalProperties?: boolean;
                    properties?: Record<string, { default?: boolean }>;
                }
            >;
        };

        assert.strictEqual(schema.properties?.compatibilityVersion.maximum, 6);
        assert.ok(schema.properties?.targets);
        assert.strictEqual(schema.definitions?.targetsConfig?.additionalProperties, false);
        assert.strictEqual(schema.definitions?.piTargetConfig?.additionalProperties, false);
        assert.strictEqual(schema.allOf?.[0]?.then?.properties?.compatibilityVersion.const, 6);
        assert.deepStrictEqual(Object.keys(schema.definitions?.piTargetConfig?.properties ?? {}), [
            'enabled',
        ]);
        assert.strictEqual(schema.definitions?.piTargetConfig?.properties?.enabled.default, false);
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

    test('refresh update auto-accept setting stays explicit and default-off', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const setting =
            packageJson.contributes?.configuration?.properties?.[
                'metaflow.autoAcceptRefreshUpdates'
            ];
        assert.ok(setting, 'Expected metaflow.autoAcceptRefreshUpdates setting to be contributed');
        assert.strictEqual(setting?.type, 'boolean');
        assert.strictEqual(setting?.default, false);
        assert.match(
            setting?.description ?? '',
            /enabled from the refresh prompt itself/i,
            'Expected refresh update auto-accept setting description to explain popup opt-in behavior',
        );
    });

    test('repository-wide Copilot synchronization setting keeps its concise description', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const setting =
            packageJson.contributes?.configuration?.properties?.[
                'metaflow.synchronization.repoWideCopilotInstructions'
            ];
        assert.ok(
            setting,
            'Expected the repository-wide Copilot synchronization setting to be contributed',
        );
        assert.strictEqual(setting?.type, 'boolean');
        assert.strictEqual(setting?.default, false);
        assert.strictEqual(setting?.scope, 'resource');
        assert.strictEqual(
            setting?.description,
            'Allow MetaFlow to synchronize the repository-wide .github/copilot-instructions.md file.',
        );
    });

    test('built-in capability setting is a boolean extension-owned toggle', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const setting =
            packageJson.contributes?.configuration?.properties?.[
                'metaflow.aiMetadataAutoApplyMode'
            ];
        assert.ok(setting, 'Expected built-in capability setting to be contributed');
        assert.strictEqual(setting?.type, 'boolean');
        assert.strictEqual(setting?.default, false);
        assert.ok(!setting?.enum, 'Built-in capability setting should not expose delivery modes');
        assert.match(setting?.description ?? '', /extension/i);
        assert.match(setting?.description ?? '', /removes/i);
    });

    test('injection settings expose plugin mode for commands and hooks', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const injectionModes =
            packageJson.contributes?.configuration?.properties?.['metaflow.injection.modes'];
        assert.strictEqual(injectionModes?.scope, 'resource');
        assert.deepStrictEqual(injectionModes?.default, {
            instructions: 'plugin',
            prompts: 'settings',
            commands: 'plugin',
            skills: 'plugin',
            agents: 'plugin',
            hooks: 'plugin',
        });
        const hooks = (
            injectionModes as
                | {
                      properties?: Record<string, { enum?: string[]; default?: unknown }>;
                  }
                | undefined
        )?.properties?.hooks;
        assert.ok(hooks, 'Expected hooks injection mode setting to be contributed');
        assert.deepStrictEqual(hooks?.enum, ['settings', 'synchronize', 'plugin']);
        assert.strictEqual(hooks?.default, 'plugin');
        const commands = (
            injectionModes as
                | {
                      properties?: Record<string, { enum?: string[]; default?: unknown }>;
                  }
                | undefined
        )?.properties?.commands;
        assert.ok(commands, 'Expected commands injection mode setting to be contributed');
        assert.deepStrictEqual(commands?.enum, ['synchronize', 'plugin']);
        assert.strictEqual(commands?.default, 'plugin');
        const injectionTarget =
            packageJson.contributes?.configuration?.properties?.['metaflow.injection.target'];
        assert.strictEqual(injectionTarget?.scope, 'resource');
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

    test('Create README Descriptor is contributed for the command palette and Capabilities menus', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const createCommand = packageJson.contributes?.commands?.find(
            (entry) => entry.command === 'metaflow.createCapabilityManifest',
        );
        assert.ok(createCommand, 'Expected metaflow.createCapabilityManifest command contribution');
        assert.strictEqual(createCommand?.title, 'MetaFlow: Create README Descriptor');
        assert.strictEqual(createCommand?.icon, '$(new-file)');

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        const titleEntry = titleMenuEntries.find(
            (entry) => entry.command === 'metaflow.createCapabilityManifest',
        );
        assert.ok(
            titleEntry,
            'Expected Create README Descriptor in the Capabilities view title menu',
        );
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
            'Expected Create README Descriptor in the Capabilities item context menu',
        );
    });

    test('Maintain Plugin Manifest is contributed for the command palette only', () => {
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
        assert.strictEqual(
            maintainCommand?.title,
            'MetaFlow: Maintain Plugin Manifest (plugin.json)',
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

    test('Maintain All Plugin Manifests is contributed for the command palette and repo item menus', () => {
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

    test('capability plugin metadata auto-maintenance defaults to opt-in', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const autoMaintain =
            packageJson.contributes?.configuration?.properties?.[
                'metaflow.pluginMetadata.autoMaintain'
            ];
        assert.ok(autoMaintain, 'Expected plugin metadata auto-maintenance setting');
        assert.strictEqual(autoMaintain?.type, 'boolean');
        assert.strictEqual(autoMaintain?.default, false);

        const contextMenuEntries = packageJson.contributes?.menus?.['view/item/context'] ?? [];
        assert.ok(
            contextMenuEntries.some(
                (entry) =>
                    entry.command === 'metaflow.maintainAllCapabilityPluginMetadata' &&
                    entry.when ===
                        'view == metaflow-config && (viewItem == configRepoSourceRescannable || viewItem == configRepoSourceLocalGit || viewItem == configRepoSourceGit || viewItem == configRepoSourceGitBehind || viewItem == configRepoSourceGitAhead)',
            ),
            'Expected manual repository maintenance to remain available',
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
        const clearLayersFilterCommand = commands.find(
            (entry) => entry.command === 'metaflow.clearLayersFilter',
        );
        const filesFilterCommand = commands.find(
            (entry) => entry.command === 'metaflow.openFilesFilter',
        );

        assert.ok(layersFilterCommand, 'Expected metaflow.openLayersFilter command contribution');
        assert.strictEqual(layersFilterCommand?.icon, '$(search)');
        assert.ok(
            clearLayersFilterCommand,
            'Expected metaflow.clearLayersFilter command contribution',
        );
        assert.strictEqual(clearLayersFilterCommand?.icon, '$(clear-all)');
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
            'Expected clear action in the active Capabilities filter title menu',
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
                    entry.command === 'metaflow.clearLayersFilter' &&
                    entry.key === 'escape' &&
                    entry.when ===
                        "focusedView == 'metaflow-layers' && metaflow.layersNativeFilterActive && treeFindOpen",
            ),
            'Expected Escape binding to restore the Capabilities view after filtering',
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
                        'metaflow.showLayersFlatMode',
                        'metaflow.showLayersTreeMode',
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
            layersEntries.get('metaflow.showLayersFlatMode'),
            filesEntries.get('metaflow.toggleFilesViewMode'),
        );
        assert.strictEqual(
            layersEntries.get('metaflow.showLayersTreeMode'),
            filesEntries.get('metaflow.toggleFilesViewMode'),
        );
    });
});
