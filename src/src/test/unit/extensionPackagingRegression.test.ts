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

    test('Capabilities view title actions use the same ordering as Effective Files view', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8'),
        ) as ExtensionPackageJson;

        const titleMenuEntries = packageJson.contributes?.menus?.['view/title'] ?? [];
        const filesEntries = new Map(
            titleMenuEntries
                .filter((entry) =>
                    ['metaflow.toggleFilesViewMode', 'metaflow.collapseAllFiles', 'metaflow.expandAllFiles'].includes(
                        entry.command,
                    ),
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

        assert.strictEqual(layersEntries.get('metaflow.collapseAllLayers'), filesEntries.get('metaflow.collapseAllFiles'));
        assert.strictEqual(layersEntries.get('metaflow.expandAllLayers'), filesEntries.get('metaflow.expandAllFiles'));
        assert.strictEqual(layersEntries.get('metaflow.toggleLayersViewMode'), filesEntries.get('metaflow.toggleFilesViewMode'));
    });
});
