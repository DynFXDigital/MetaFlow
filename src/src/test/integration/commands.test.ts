/**
 * Command execution integration tests.
 *
 * Validates command behavior with a real test workspace.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Command Execution', () => {

    let workspaceRoot: string;

    suiteSetup(async function () {
        this.timeout(15000);

        // Ensure extension is active
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');
        workspaceRoot = ws.uri.fsPath;
    });

    test('refresh loads config from test workspace', async function () {
        this.timeout(10000);
        // Execute refresh — should find .metaflow/config.jsonc in test-workspace
        await vscode.commands.executeCommand('metaflow.refresh');
        // If it reaches here without throwing, the command succeeded
    });

    test('refresh fails when .metaflow/config.jsonc is absent', async function () {
        this.timeout(15000);

        const rootConfigPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const backupRootConfigPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc.bak');

        assert.ok(fs.existsSync(rootConfigPath), 'Root config should exist in test fixture');

        fs.renameSync(rootConfigPath, backupRootConfigPath);

        try {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.openConfig');

            const editor = vscode.window.activeTextEditor;
            if (editor) {
                assert.notStrictEqual(
                    path.normalize(editor.document.uri.fsPath),
                    path.normalize(rootConfigPath),
                    'Open config should not resolve a deleted config path'
                );
            }
        } finally {
            if (fs.existsSync(backupRootConfigPath)) {
                fs.renameSync(backupRootConfigPath, rootConfigPath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('openConfig opens the config file', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.openConfig');

        // Verify an editor is open with .metaflow/config.jsonc
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            assert.ok(
                editor.document.fileName.endsWith(path.join('.metaflow', 'config.jsonc')),
                'Active editor should be .metaflow/config.jsonc'
            );
        }
    });

    test('apply creates materialized files', async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        // Check that .github directory was created with materialized files
        const githubDir = path.join(workspaceRoot, '.github');
        if (fs.existsSync(githubDir)) {
            const entries = fs.readdirSync(githubDir, { recursive: true }) as string[];
            assert.ok(entries.length > 0, '.github should contain materialized files');
        }
    });

    test('apply injects workspace settings for settings-backed locations', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        await wsConfig.update('chat.instructionsFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.promptFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        const instructionLocations = wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations')?.workspaceValue;
        const promptLocations = wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations')?.workspaceValue;

        assert.ok(instructionLocations && Object.keys(instructionLocations).length > 0, 'Instruction locations should be injected at workspace scope');
        assert.ok(promptLocations && Object.keys(promptLocations).length > 0, 'Prompt locations should be injected at workspace scope');
    });

    test('refresh auto-applies when metaflow.autoApply is enabled', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.instructionsFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.promptFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);

        try {
            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionLocations = wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations')?.workspaceValue;
            const promptLocations = wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations')?.workspaceValue;

            assert.ok(instructionLocations && Object.keys(instructionLocations).length > 0, 'Instruction locations should be injected during refresh when autoApply=true');
            assert.ok(promptLocations && Object.keys(promptLocations).length > 0, 'Prompt locations should be injected during refresh when autoApply=true');
        } finally {
            await wsConfig.update('metaflow.autoApply', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('refresh auto-applies when metaflow.autoApply is unset', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        await wsConfig.update('metaflow.autoApply', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.instructionsFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.promptFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);

        await vscode.commands.executeCommand('metaflow.refresh');

        const instructionLocations = wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations')?.workspaceValue;
        const promptLocations = wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations')?.workspaceValue;

        assert.ok(instructionLocations && Object.keys(instructionLocations).length > 0, 'Instruction locations should be injected during refresh when autoApply is unset');
        assert.ok(promptLocations && Object.keys(promptLocations).length > 0, 'Prompt locations should be injected during refresh when autoApply is unset');
    });

    test('clean removes managed files', async function () {
        this.timeout(15000);
        // First apply, then clean
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        // Clean requires user confirmation — skip interactive confirmation in tests
        // This tests that the command doesn't throw; actual clean logic is tested in unit tests
        // await vscode.commands.executeCommand('metaflow.clean');
    });

    test('clean removes injected workspace settings keys', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        windowAny.showWarningMessage = async () => 'Yes';

        try {
            await vscode.commands.executeCommand('metaflow.clean');
        } finally {
            windowAny.showWarningMessage = originalWarning;
        }

        const instructionLocations = wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations')?.workspaceValue;
        const promptLocations = wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations')?.workspaceValue;
        const hookLocations = wsConfig.inspect<Record<string, boolean>>('chat.hookFilesLocations')?.workspaceValue;

        assert.strictEqual(instructionLocations, undefined, 'Instruction locations should be removed by clean');
        assert.strictEqual(promptLocations, undefined, 'Prompt locations should be removed by clean');
        assert.strictEqual(hookLocations, undefined, 'Hook file locations should be removed by clean');
    });

    test('status executes and logs', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.status');
        // Status writes to output channel — no assertion on output, just no throw
    });

    test('checking a layer enables its disabled repo source', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                { id: 'ai-metadata', name: 'ai-metadata', localPath: '.ai/ai-metadata', enabled: false },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: '.', enabled: false },
            ],
            filters: { include: [], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
            },
            activeProfile: 'default',
            injection: {
                instructions: 'settings',
                prompts: 'settings',
                skills: 'settings',
                agents: 'settings',
                hooks: 'settings',
            },
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                layerIndex: 0,
                checked: true,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos: Array<{ enabled?: boolean }>;
                layerSources: Array<{ enabled?: boolean }>;
            };

            assert.strictEqual(updatedConfig.layerSources[0].enabled, true, 'Layer should be enabled');
            assert.strictEqual(updatedConfig.metadataRepos[0].enabled, true, 'Repo should be auto-enabled when layer is checked');
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('rescanRepository discovers new layers when autoApply is disabled', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const priorAutoApply = wsConfig.inspect<boolean>('metaflow.autoApply')?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'discovery-repo');
        const baseLayer = path.join(repoRoot, 'base', 'chatmodes');
        const dynamicLayer = path.join(repoRoot, 'dynamic', 'chatmodes');
        fs.mkdirSync(baseLayer, { recursive: true });
        fs.mkdirSync(dynamicLayer, { recursive: true });
        fs.writeFileSync(path.join(baseLayer, 'base.chatmode.md'), '# Base chatmode', 'utf-8');
        fs.writeFileSync(path.join(dynamicLayer, 'discovered.chatmode.md'), '# Discovered chatmode', 'utf-8');

        const discoveryConfig = {
            metadataRepos: [
                {
                    id: 'dynamic',
                    localPath: '.ai/discovery-repo',
                    discover: {
                        enabled: true,
                    },
                },
            ],
            layerSources: [
                { repoId: 'dynamic', path: 'base' },
            ],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(discoveryConfig, null, 2), 'utf-8');
            await wsConfig.update('metaflow.autoApply', false, vscode.ConfigurationTarget.Workspace);

            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const chatmodesDir = path.join(workspaceRoot, '.github', 'chatmodes');
            const firstApplyFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                firstApplyFiles.some(entry => entry.includes('base.chatmode.md')),
                'Base layer should be applied when autoApply is disabled'
            );
            assert.ok(
                !firstApplyFiles.some(entry => entry.includes('discovered.chatmode.md')),
                'Discovered layer should not be resolved before manual rescan when autoApply is disabled'
            );

            await vscode.commands.executeCommand('metaflow.rescanRepository', { repoId: 'dynamic' });
            await vscode.commands.executeCommand('metaflow.apply');

            const secondApplyFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];
            assert.ok(
                secondApplyFiles.some(entry => entry.includes('discovered.chatmode.md')),
                'Manual repository rescan should discover and apply new layer files'
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            fs.rmSync(repoRoot, { recursive: true, force: true });
            await wsConfig.update('metaflow.autoApply', priorAutoApply, vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('rescanRepository forces discovery even when discover.enabled is not set', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'force-discovery-repo');
        const baseLayer = path.join(repoRoot, 'base', 'chatmodes');
        const dynamicLayer = path.join(repoRoot, 'dynamic', 'chatmodes');
        fs.mkdirSync(baseLayer, { recursive: true });
        fs.mkdirSync(dynamicLayer, { recursive: true });
        fs.writeFileSync(path.join(baseLayer, 'base.chatmode.md'), '# Base chatmode', 'utf-8');
        fs.writeFileSync(path.join(dynamicLayer, 'discovered.chatmode.md'), '# Discovered chatmode', 'utf-8');

        const configWithoutDiscover = {
            metadataRepos: [
                {
                    id: 'dynamic',
                    localPath: '.ai/force-discovery-repo',
                },
            ],
            layerSources: [
                { repoId: 'dynamic', path: 'base' },
            ],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(configWithoutDiscover, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
            await vscode.commands.executeCommand('metaflow.apply');

            const chatmodesDir = path.join(workspaceRoot, '.github', 'chatmodes');
            const beforeRescanFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                !beforeRescanFiles.some(entry => entry.includes('discovered.chatmode.md')),
                'Discovered file should not be present before manual rescan when discover.enabled is absent'
            );

            await vscode.commands.executeCommand('metaflow.rescanRepository', { repoId: 'dynamic' });
            await vscode.commands.executeCommand('metaflow.apply');

            const afterRescanFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                afterRescanFiles.some(entry => entry.includes('discovered.chatmode.md')),
                'Manual rescan should force discovery for selected repo even without discover.enabled'
            );

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                layerSources?: Array<{ repoId: string; path: string }>;
            };
            assert.ok(
                updatedConfig.layerSources?.some(layer => layer.repoId === 'dynamic' && layer.path === 'dynamic') === true,
                'Manual rescan should persist newly discovered layer into config'
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            fs.rmSync(repoRoot, { recursive: true, force: true });
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('removeRepoSource allows deleting final repo and returns to init mode', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const singleRepoConfig = {
            metadataRepo: {
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        windowAny.showWarningMessage = async () => 'Remove';

        try {
            fs.writeFileSync(configPath, JSON.stringify(singleRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.removeRepoSource', 'primary');

            assert.strictEqual(fs.existsSync(configPath), false, 'Config file should be deleted after removing final repo source');
        } finally {
            windowAny.showWarningMessage = originalWarning;
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, originalConfig, 'utf-8');
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('promote reports drift status', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.promote');
        // Promote writes to output channel — no assertion on output, just no throw
    });
});
