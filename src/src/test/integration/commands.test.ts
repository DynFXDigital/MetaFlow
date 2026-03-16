/**
 * Command execution integration tests.
 *
 * Validates command behavior with a real test workspace.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

suite('Command Execution', () => {
    let workspaceRoot: string;

    async function waitFor(
        predicate: () => boolean | Promise<boolean>,
        timeoutMs = 5000,
        intervalMs = 100,
    ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await predicate()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        assert.fail(`Condition not met within ${timeoutMs}ms`);
    }

    function removeDirectoryRecursive(targetPath: string): void {
        fs.rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: 20,
            retryDelay: 100,
        });
    }

    function getInjectedLocationValue<T>(
        inspection: { workspaceValue?: T; workspaceFolderValue?: T } | undefined,
    ): T | undefined {
        return inspection?.workspaceValue ?? inspection?.workspaceFolderValue;
    }

    function createSettingsBackedWorkspaceConfig() {
        return {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
                lean: {
                    enable: ['**/*'],
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
    }

    function hasBuiltInInstructionPath(locations: Record<string, boolean> | undefined): boolean {
        if (!locations) {
            return false;
        }

        return Object.keys(locations).some((location) =>
            location.replace(/\\/g, '/').includes('metaflow-ai-metadata/.github/instructions'),
        );
    }

    function hasExtensionInstallInstructionPath(
        locations: Record<string, boolean> | undefined,
    ): boolean {
        if (!locations) {
            return false;
        }

        return Object.keys(locations).some((location) => {
            const normalized = location.replace(/\\/g, '/').toLowerCase();
            return (
                normalized.includes('/extensions/dynfxdigital.metaflow-ai-') &&
                normalized.includes('assets/metaflow-ai-metadata/.github/instructions')
            );
        });
    }

    async function resetBuiltInCapabilityState(): Promise<void> {
        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalWarning = windowAny.showWarningMessage;
        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            return (
                picks.find((pick) => pick.mode === 'disableBuiltin') ??
                picks.find((pick) => pick.mode === 'removeSynchronized') ??
                picks[0]
            );
        };
        windowAny.showWarningMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.startsWith('Remove ')) {
                return 'Remove';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showWarningMessage = originalWarning;
        }
    }

    suiteSetup(async function () {
        this.timeout(15000);

        // Ensure extension is active
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
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
                    'Open config should not resolve a deleted config path',
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
                'Active editor should be .metaflow/config.jsonc',
            );
        }
    });

    test('apply creates synchronized files', async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        // Check that .github directory was created with synchronized files
        const githubDir = path.join(workspaceRoot, '.github');
        if (fs.existsSync(githubDir)) {
            const entries = fs.readdirSync(githubDir, { recursive: true }) as string[];
            assert.ok(entries.length > 0, '.github should contain synchronized files');
        }
    });

    test('apply shows completion toast when synchronized files are written', async function () {
        this.timeout(20000);

        await resetBuiltInCapabilityState();

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'synchronized-only-repo');
        const layerChatmodesDir = path.join(repoRoot, 'synchronized-only', 'chatmodes');
        removeDirectoryRecursive(repoRoot);
        fs.mkdirSync(layerChatmodesDir, { recursive: true });
        fs.writeFileSync(
            path.join(layerChatmodesDir, 'synchronized-only.chatmode.md'),
            '# synchronized-only\n',
            'utf-8',
        );

        const synchronizedOnlyConfig = {
            metadataRepos: [
                { id: 'synchronized', localPath: '.ai/synchronized-only-repo', enabled: true },
            ],
            layerSources: [{ repoId: 'synchronized', path: 'synchronized-only', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const applyMessages: string[] = [];

        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.startsWith('MetaFlow: Applied ')) {
                applyMessages.push(message);
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(synchronizedOnlyConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
            await vscode.commands.executeCommand('metaflow.apply');

            const appliedCounts = applyMessages
                .map((message) => message.match(/^MetaFlow: Applied (\d+) files/))
                .filter((match): match is RegExpMatchArray => match !== null)
                .map((match) => Number(match[1]));

            assert.ok(
                appliedCounts.some((count) => count > 0),
                'Apply should notify when Synchronized files are written',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('apply suppresses completion toast when no Synchronized files are written', async function () {
        this.timeout(20000);

        await resetBuiltInCapabilityState();

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const metaflowConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const priorAutoApply = metaflowConfig.inspect<boolean>('autoApply')?.workspaceValue;
        const priorAiMetadataAutoApplyMode =
            metaflowConfig.inspect<string>('aiMetadataAutoApplyMode')?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'settings-only-repo');
        const layerInstructionsDir = path.join(repoRoot, 'settings-only', 'instructions');
        removeDirectoryRecursive(repoRoot);
        fs.mkdirSync(layerInstructionsDir, { recursive: true });
        fs.writeFileSync(
            path.join(layerInstructionsDir, 'settings-only.instructions.md'),
            '# settings-only\n',
            'utf-8',
        );

        const settingsOnlyConfig = {
            metadataRepos: [{ id: 'settings', localPath: '.ai/settings-only-repo', enabled: true }],
            layerSources: [{ repoId: 'settings', path: 'settings-only', enabled: true }],
            filters: { include: ['instructions/**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const applyMessages: string[] = [];

        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.startsWith('MetaFlow: Applied ')) {
                applyMessages.push(message);
            }
            return undefined;
        };

        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await metaflowConfig.update('autoApply', false, vscode.ConfigurationTarget.Workspace);
        await metaflowConfig.update(
            'aiMetadataAutoApplyMode',
            'off',
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            fs.writeFileSync(configPath, JSON.stringify(settingsOnlyConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
            applyMessages.length = 0;
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            assert.strictEqual(
                applyMessages.length,
                0,
                'Apply should not show a completion toast when no Synchronized files are written',
            );

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            assert.ok(
                instructionLocations && Object.keys(instructionLocations).length > 0,
                'Apply should still inject settings-backed locations when zero Synchronized files are written',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            await metaflowConfig.update(
                'autoApply',
                priorAutoApply,
                vscode.ConfigurationTarget.Workspace,
            );
            await metaflowConfig.update(
                'aiMetadataAutoApplyMode',
                priorAiMetadataAutoApplyMode,
                vscode.ConfigurationTarget.Workspace,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('apply injects workspace settings for settings-backed locations', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.promptFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            fs.writeFileSync(
                configPath,
                JSON.stringify(createSettingsBackedWorkspaceConfig(), null, 2),
                'utf-8',
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            const promptLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations'),
            );

            assert.ok(
                instructionLocations && Object.keys(instructionLocations).length > 0,
                'Instruction locations should be injected for enabled settings-backed capabilities',
            );
            assert.ok(
                promptLocations && Object.keys(promptLocations).length > 0,
                'Prompt locations should be injected for enabled settings-backed capabilities',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh auto-applies when metaflow.autoApply is enabled', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.promptFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            fs.writeFileSync(
                configPath,
                JSON.stringify(createSettingsBackedWorkspaceConfig(), null, 2),
                'utf-8',
            );
            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            const promptLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations'),
            );

            assert.ok(
                instructionLocations && Object.keys(instructionLocations).length > 0,
                'Instruction locations should be injected during refresh when autoApply=true',
            );
            assert.ok(
                promptLocations && Object.keys(promptLocations).length > 0,
                'Prompt locations should be injected during refresh when autoApply=true',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await wsConfig.update(
                'metaflow.autoApply',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh auto-applies when metaflow.autoApply is unset', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update(
            'metaflow.autoApply',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.promptFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            fs.writeFileSync(
                configPath,
                JSON.stringify(createSettingsBackedWorkspaceConfig(), null, 2),
                'utf-8',
            );
            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            const promptLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations'),
            );

            assert.ok(
                instructionLocations && Object.keys(instructionLocations).length > 0,
                'Instruction locations should be injected during refresh when autoApply is unset',
            );
            assert.ok(
                promptLocations && Object.keys(promptLocations).length > 0,
                'Prompt locations should be injected during refresh when autoApply is unset',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('config watcher triggers auto refresh and settings injection on config change', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.promptFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            const parsed = createSettingsBackedWorkspaceConfig();
            parsed.activeProfile = 'lean';
            fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8');

            const hasInstructionLocations = (): boolean => {
                const instructionLocations = getInjectedLocationValue(
                    wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
                );
                return !!instructionLocations && Object.keys(instructionLocations).length > 0;
            };

            try {
                await waitFor(() => hasInstructionLocations(), 4000);
            } catch {
                await vscode.commands.executeCommand('metaflow.refresh');
                await waitFor(() => hasInstructionLocations(), 10000);
            }
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh migration rewrites config without triggering repeated auto-apply', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const managedStatePath = path.join(workspaceRoot, '.metaflow', 'state.json');

        const legacyConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
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

        const readLastApply = (): string | undefined => {
            if (!fs.existsSync(managedStatePath)) {
                return undefined;
            }
            const parsed = JSON.parse(fs.readFileSync(managedStatePath, 'utf-8')) as {
                lastApply?: string;
            };
            return parsed.lastApply;
        };

        const baselineLastApply = readLastApply();

        await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);

        try {
            fs.writeFileSync(configPath, JSON.stringify(legacyConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            await waitFor(() => {
                const lastApply = readLastApply();
                return typeof lastApply === 'string' && lastApply !== baselineLastApply;
            }, 10000);

            const firstApplyTimestamp = readLastApply();
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const secondApplyTimestamp = readLastApply();

            assert.strictEqual(
                secondApplyTimestamp,
                firstApplyTimestamp,
                'Auto-apply should run once for a migration-triggered refresh',
            );

            const migratedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; capabilities?: Array<{ path: string }> }>;
            };

            assert.ok(
                migratedConfig.metadataRepos?.length,
                'Legacy config should be migrated to metadataRepos',
            );
            assert.ok(
                migratedConfig.metadataRepos?.[0]?.capabilities?.some(
                    (capability) => capability.path === 'company/core',
                ),
                'Migrated config should persist capability entries',
            );
        } finally {
            await wsConfig.update(
                'metaflow.autoApply',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('config delete and recreate transitions checkRepoUpdates outcomes', async function () {
        this.timeout(25000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        assert.ok(fs.existsSync(configPath), 'Config file should exist before lifecycle test');

        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const gitBackedConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.unlinkSync(configPath);
            await vscode.commands.executeCommand('metaflow.refresh');

            const noConfigOutcome = (await vscode.commands.executeCommand(
                'metaflow.checkRepoUpdates',
                {
                    silent: true,
                },
            )) as { executed?: boolean; reason?: string };
            assert.strictEqual(
                noConfigOutcome.executed,
                false,
                'Expected no-config run to be skipped',
            );
            assert.strictEqual(
                noConfigOutcome.reason,
                'no-config',
                'Expected no-config outcome after config deletion',
            );

            fs.writeFileSync(configPath, JSON.stringify(gitBackedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            let restoredOutcome: { executed?: boolean; reason?: string } = {
                executed: false,
                reason: 'no-config',
            };
            await waitFor(async () => {
                restoredOutcome = (await vscode.commands.executeCommand(
                    'metaflow.checkRepoUpdates',
                    {
                        repoId: 'repo-that-does-not-exist',
                        silent: true,
                    },
                )) as { executed?: boolean; reason?: string };

                // Integration runs can briefly observe stale no-config state during
                // config delete/recreate transitions. Force a refresh and retry.
                if (restoredOutcome.reason === 'no-config') {
                    await vscode.commands.executeCommand('metaflow.refresh');
                    restoredOutcome = (await vscode.commands.executeCommand(
                        'metaflow.checkRepoUpdates',
                        {
                            repoId: 'repo-that-does-not-exist',
                            silent: true,
                        },
                    )) as { executed?: boolean; reason?: string };
                }

                return restoredOutcome.reason !== 'no-config';
            }, 12000);

            assert.strictEqual(
                restoredOutcome.executed,
                false,
                'Expected unknown repo run to be skipped',
            );
            assert.strictEqual(
                restoredOutcome.reason,
                'repo-not-found',
                'Expected repo-not-found outcome after config recreation',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('apply injects agent and skill locations when settings-classified', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const settingsInjectionConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
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
        fs.writeFileSync(configPath, JSON.stringify(settingsInjectionConfig, null, 2), 'utf-8');

        await wsConfig.update(
            'chat.agentFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.agentSkillsLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const agentLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.agentFilesLocations'),
            );
            const skillLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.agentSkillsLocations'),
            );

            assert.ok(
                agentLocations && Object.keys(agentLocations).length > 0,
                'Agent locations should be injected at workspace scope',
            );
            assert.ok(
                skillLocations && Object.keys(skillLocations).length > 0,
                'Skill locations should be injected at workspace scope',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh with hooks disabled omits hook settings injection', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const parsedConfig = JSON.parse(originalConfig) as {
            hooks?: { preApply?: string; postApply?: string };
        };
        parsedConfig.hooks = {
            preApply: 'scripts/pre-apply.sh',
            postApply: 'scripts/post-apply.sh',
        };

        await wsConfig.update('metaflow.hooksEnabled', false, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update(
            'chat.hookFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            fs.writeFileSync(configPath, JSON.stringify(parsedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const hookLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.hookFilesLocations'),
            );
            assert.strictEqual(
                hookLocations,
                undefined,
                'Hook locations should not be injected when metaflow.hooksEnabled is false',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await wsConfig.update(
                'metaflow.hooksEnabled',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('clean removes managed files', async function () {
        this.timeout(15000);
        // First apply (sets up workspace settings and any managed state), then clean.
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        const originalInfo = windowAny.showInformationMessage;
        windowAny.showWarningMessage = async () => 'Remove';

        const infoMessages: string[] = [];
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            const result = (await vscode.commands.executeCommand('metaflow.clean')) as
                | {
                      removed?: unknown[];
                  }
                | undefined;

            if (!result) {
                assert.fail('Clean should return an ApplyResult when confirmed');
            }
            if (!Array.isArray(result.removed)) {
                assert.fail('Clean result should include removed[]');
            }

            const removedCount = result.removed.length;
            assert.ok(
                infoMessages.some((m) => m.includes(`MetaFlow: Cleaned ${removedCount} files.`)),
                'Clean should emit a user-facing completion message with removal count',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            windowAny.showInformationMessage = originalInfo;
        }
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
        windowAny.showWarningMessage = async () => 'Remove';

        try {
            await vscode.commands.executeCommand('metaflow.clean');
        } finally {
            windowAny.showWarningMessage = originalWarning;
        }

        const instructionLocations = getInjectedLocationValue(
            wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
        );
        const promptLocations = getInjectedLocationValue(
            wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations'),
        );
        const hookLocations = getInjectedLocationValue(
            wsConfig.inspect<Record<string, boolean>>('chat.hookFilesLocations'),
        );

        assert.strictEqual(
            instructionLocations,
            undefined,
            'Instruction locations should be removed by clean',
        );
        assert.strictEqual(
            promptLocations,
            undefined,
            'Prompt locations should be removed by clean',
        );
        assert.strictEqual(
            hookLocations,
            undefined,
            'Hook file locations should be removed by clean',
        );
    });

    test('status logs key metrics to output channel', async function () {
        this.timeout(15000);

        const lines = (await vscode.commands.executeCommand('metaflow.status')) as
            | string[]
            | undefined;
        assert.ok(Array.isArray(lines), 'Status should return the emitted log lines');

        assert.ok(
            lines.some((line) => line.includes('=== MetaFlow Status ===')),
            'Status should include a header line',
        );
        assert.ok(
            lines.some((line) => line.includes('Config:')),
            'Status should include config path line',
        );
        assert.ok(
            lines.some((line) => line.includes('Active Profile:')),
            'Status should include active profile line',
        );
        assert.ok(
            lines.some((line) => line.includes('Effective Files:')),
            'Status should include effective file count line',
        );
        assert.ok(
            lines.some((line) => line.includes('Synchronized Files:')),
            'Status should include synchronized file count line',
        );
        assert.ok(
            lines.some((line) => line.includes('Settings Injection Target:')),
            'Status should include settings injection target line',
        );
        assert.ok(
            lines.some((line) => line.includes('Settings Injection Keys:')),
            'Status should include settings injection keys line',
        );
        assert.ok(
            lines.some((line) => line.includes('Injection Modes:')),
            'Status should include injection mode summary line',
        );
    });

    test('status reports capability warning file path when manifest is malformed', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const capabilityConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };
        fs.writeFileSync(configPath, JSON.stringify(capabilityConfig, null, 2), 'utf-8');

        const capabilityPath = path.join(
            workspaceRoot,
            '.ai',
            'ai-metadata',
            'standards',
            'sdlc',
            'CAPABILITY.md',
        );

        const originalCapability = fs.readFileSync(capabilityPath, 'utf-8');

        try {
            fs.writeFileSync(capabilityPath, '# malformed manifest without frontmatter\n', 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            const lines = (await vscode.commands.executeCommand('metaflow.status')) as
                | string[]
                | undefined;
            assert.ok(Array.isArray(lines), 'Status should return emitted log lines');

            const warningLine = lines.find(
                (line) =>
                    line.includes('CAPABILITY_FRONTMATTER_MISSING') ||
                    line.includes('CAPABILITY_NO_FRONTMATTER'),
            );
            assert.ok(
                warningLine,
                'Status should include capability warning code for malformed manifest',
            );
            const normalizedWarningLine = warningLine?.replace(/\\/g, '/');
            assert.ok(
                normalizedWarningLine?.includes('standards/sdlc/CAPABILITY.md'),
                `Expected warning to include manifest path, got: ${warningLine}`,
            );
        } finally {
            fs.writeFileSync(capabilityPath, originalCapability, 'utf-8');
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0317: openCapabilityDetails reuses a capability details webview panel in the current editor group (Verifies: REQ-0311, REQ-0412)', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.openConfig');

        const initialEditor = vscode.window.activeTextEditor;
        assert.ok(
            initialEditor,
            'Expected a current editor group before opening capability details',
        );

        const initialGroupCount = vscode.window.tabGroups.all.length;

        try {
            await vscode.commands.executeCommand('metaflow.openCapabilityDetails', {
                layerIndex: 0,
            });
            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                initialGroupCount,
                'Capability details should not create a split editor group',
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                layerIndex: 0,
                checked: false,
            });

            await vscode.commands.executeCommand('metaflow.openCapabilityDetails', {
                layerIndex: 0,
            });
            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                initialGroupCount,
                'Reopening the same capability should stay in the current editor group',
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                layerIndex: 0,
                checked: true,
            });

            await vscode.commands.executeCommand('metaflow.openCapabilityDetails', {
                layerIndex: 1,
            });
            assert.strictEqual(
                vscode.window.tabGroups.all.length,
                initialGroupCount,
                'Reused panel should not create a split editor group',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });

    test('checking a layer enables its disabled repo source', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: false,
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: '.', enabled: false }],
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
                metadataRepos: Array<{
                    enabled?: boolean;
                    capabilities?: Array<{ enabled?: boolean }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.ok(
                updatedConfig.metadataRepos[0]?.capabilities?.length,
                'Config should contain persisted capabilities',
            );
            assert.strictEqual(
                updatedConfig.metadataRepos[0]?.capabilities?.[0]?.enabled,
                false,
                'Profile-scoped toggles should not rewrite the global capability baseline',
            );
            assert.strictEqual(
                updatedConfig.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === '.',
                )?.enabled,
                true,
                'Layer should be enabled for the active default profile',
            );
            assert.strictEqual(
                updatedConfig.metadataRepos[0].enabled,
                true,
                'Repo should be auto-enabled when layer is checked',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayer resolves the current layer by repo and path when the supplied index is stale', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: 'company/core', enabled: true },
                { repoId: 'ai-metadata', path: 'standards/sdlc', enabled: true },
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
                repoId: 'ai-metadata',
                layerPath: 'standards/sdlc',
                checked: false,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos: Array<{
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.ok(
                updatedConfig.metadataRepos[0]?.capabilities?.length,
                'Config should contain persisted capabilities',
            );
            assert.strictEqual(
                updatedConfig.metadataRepos[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.enabled,
                true,
                'A stale index should not toggle the wrong layer',
            );
            assert.strictEqual(
                updatedConfig.metadataRepos[0]?.capabilities?.find(
                    (capability) => capability.path === 'standards/sdlc',
                )?.enabled,
                true,
                'Profile-scoped toggles should not rewrite the global capability baseline',
            );
            assert.strictEqual(
                updatedConfig.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'standards/sdlc',
                )?.enabled,
                false,
                'The layer identified by repoId and layerPath should be toggled for the active profile even when the supplied index is stale',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayerBranch applies to folder branch items', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'company/core', enabled: true },
                        { path: 'company/standards/sdlc', enabled: true },
                    ],
                },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: 'company/core', enabled: true },
                { repoId: 'ai-metadata', path: 'company/standards/sdlc', enabled: true },
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

            const folderItem = {
                contextValue: 'layerFolder',
                repoId: 'ai-metadata',
                pathKey: 'company',
                checked: false,
            };

            await vscode.commands.executeCommand('metaflow.toggleLayerBranch', folderItem);

            const afterDeselect = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.strictEqual(
                afterDeselect.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.enabled,
                true,
                'Profile-scoped branch toggles should not rewrite the global capability baseline',
            );
            assert.strictEqual(
                afterDeselect.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/standards/sdlc',
                )?.enabled,
                true,
                'Profile-scoped branch toggles should not rewrite nested global capability state',
            );
            assert.strictEqual(
                afterDeselect.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/core',
                )?.enabled,
                false,
                'Deselecting a folder branch should disable the first descendant capability for the active profile',
            );
            assert.strictEqual(
                afterDeselect.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/standards/sdlc',
                )?.enabled,
                false,
                'Deselecting a folder branch should disable the nested descendant capability for the active profile',
            );

            await vscode.commands.executeCommand('metaflow.toggleLayerBranch', {
                ...folderItem,
                checked: true,
            });

            const afterSelect = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.strictEqual(
                afterSelect.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.enabled,
                true,
                'Selecting a folder branch should leave the global baseline enabled',
            );
            assert.strictEqual(
                afterSelect.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/standards/sdlc',
                )?.enabled,
                true,
                'Selecting a folder branch should leave the nested global baseline enabled',
            );
            assert.strictEqual(
                afterSelect.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/core',
                )?.enabled,
                true,
                'Selecting a folder branch should re-enable the first descendant capability for the active profile',
            );
            assert.strictEqual(
                afterSelect.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/standards/sdlc',
                )?.enabled,
                true,
                'Selecting a folder branch should re-enable the nested descendant capability for the active profile',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayer resolves layer identity from a tree item id when checkbox events omit custom fields', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const profileScopedConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'standards/sdlc', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
            filters: { include: ['**'], exclude: [] },
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
            fs.writeFileSync(configPath, JSON.stringify(profileScopedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                id: 'tree:layer:primary:standards/sdlc',
                contextValue: 'layer',
                checked: false,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.strictEqual(
                updatedConfig.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'standards/sdlc',
                )?.enabled,
                false,
                'Tree item ids should be enough to toggle a layer when VS Code omits custom event fields',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayerBranch resolves branch identity from a tree item id when checkbox events omit custom fields', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'company/core', enabled: true },
                        { path: 'company/standards/sdlc', enabled: true },
                    ],
                },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: 'company/core', enabled: true },
                { repoId: 'ai-metadata', path: 'company/standards/sdlc', enabled: true },
            ],
            filters: { include: ['**'], exclude: [] },
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

            await vscode.commands.executeCommand('metaflow.toggleLayerBranch', {
                id: 'tree:folder:ai-metadata:company',
                contextValue: 'layerFolder',
                checked: false,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.strictEqual(
                updatedConfig.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/core',
                )?.enabled,
                false,
                'Tree item ids should be enough to toggle branch descendants when VS Code omits custom event fields',
            );
            assert.strictEqual(
                updatedConfig.profiles?.default?.layerOverrides?.find(
                    (override) => override.path === 'company/standards/sdlc',
                )?.enabled,
                false,
                'Branch toggles should still affect nested descendants when only the tree item id is available',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayer persists layer state to the active profile without overwriting other profiles', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const profileScopedConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'company/core', enabled: true },
                        { path: 'standards/sdlc', enabled: true },
                    ],
                },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'primary', path: 'standards/sdlc', enabled: true },
            ],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
                focused: {
                    displayName: 'Focused',
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
            fs.writeFileSync(configPath, JSON.stringify(profileScopedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'focused',
            });
            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                repoId: 'primary',
                layerPath: 'standards/sdlc',
                checked: false,
            });

            const afterFocusedToggle = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            repoId: string;
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
                activeProfile?: string;
            };

            assert.strictEqual(
                afterFocusedToggle.activeProfile,
                'focused',
                'Toggle should keep the focused profile active',
            );
            assert.strictEqual(
                afterFocusedToggle.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'standards/sdlc',
                )?.enabled,
                true,
                'Profile-scoped layer changes should not overwrite the global capability baseline',
            );
            assert.strictEqual(
                afterFocusedToggle.profiles?.default?.layerOverrides,
                undefined,
                'The default profile should remain unchanged while another profile is edited',
            );
            assert.strictEqual(
                afterFocusedToggle.profiles?.focused?.layerOverrides?.find(
                    (override) => override.path === 'standards/sdlc',
                )?.enabled,
                false,
                'Focused profile should persist its own disabled layer override',
            );

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'default',
            });

            const afterSwitchBack = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            repoId: string;
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
                activeProfile?: string;
            };

            assert.strictEqual(
                afterSwitchBack.activeProfile,
                'default',
                'Switching back should restore the default active profile',
            );
            assert.strictEqual(
                afterSwitchBack.profiles?.default?.layerOverrides,
                undefined,
                'Switching back should not invent overrides for the original profile',
            );
            assert.strictEqual(
                afterSwitchBack.profiles?.focused?.layerOverrides?.find(
                    (override) => override.path === 'standards/sdlc',
                )?.enabled,
                false,
                'Focused profile override should survive switching away and back',
            );

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'focused',
            });

            const afterSwitchForward = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                activeProfile?: string;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            repoId: string;
                            path: string;
                            enabled?: boolean;
                        }>;
                    }
                >;
            };

            assert.strictEqual(
                afterSwitchForward.activeProfile,
                'focused',
                'Switching forward should reactivate the edited profile',
            );
            assert.strictEqual(
                afterSwitchForward.profiles?.focused?.layerOverrides?.find(
                    (override) => override.path === 'standards/sdlc',
                )?.enabled,
                false,
                'Edited profile should retain its layer override after being reselected',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayerArtifactType persists excludedTypes updates', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [{ id: 'ai-metadata', localPath: '.ai/ai-metadata', enabled: true }],
            layerSources: [{ repoId: 'ai-metadata', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
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

            await vscode.commands.executeCommand(
                'metaflow.toggleLayerArtifactType',
                { layerIndex: 0, artifactType: 'instructions' },
                vscode.TreeItemCheckboxState.Unchecked,
            );

            const afterExclude = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ excludedTypes?: string[] }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            excludedTypes?: string[];
                        }>;
                    }
                >;
            };

            assert.ok(
                afterExclude.metadataRepos?.[0]?.capabilities?.length,
                'Config should contain persisted capabilities',
            );
            assert.ok(
                afterExclude.profiles?.default?.layerOverrides
                    ?.find((override) => override.path === '.')
                    ?.excludedTypes?.includes('instructions'),
                'instructions should be persisted in the active profile override when unchecked',
            );

            await vscode.commands.executeCommand(
                'metaflow.toggleLayerArtifactType',
                { layerIndex: 0, artifactType: 'instructions' },
                vscode.TreeItemCheckboxState.Checked,
            );

            const afterInclude = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ excludedTypes?: string[] }>;
                }>;
                profiles?: Record<
                    string,
                    {
                        layerOverrides?: Array<{
                            path: string;
                            excludedTypes?: string[];
                        }>;
                    }
                >;
            };

            assert.ok(
                !afterInclude.profiles?.default?.layerOverrides
                    ?.find((override) => override.path === '.')
                    ?.excludedTypes?.includes('instructions'),
                'instructions should be removed from the active profile override when checked',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('deleteProfile uses the selected profile row without prompting for another selection', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const configWithProfiles = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [],
                },
            ],
            layerSources: [],
            filters: { include: ['**/*'], exclude: [] },
            profiles: {
                default: {
                    displayName: 'Default',
                    enable: ['**/*'],
                },
                review: {
                    displayName: 'Review',
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalWarning = windowAny.showWarningMessage;
        let quickPickInvoked = false;

        windowAny.showQuickPick = async () => {
            quickPickInvoked = true;
            return undefined;
        };
        windowAny.showWarningMessage = async (
            _message: unknown,
            options: unknown,
            ...items: unknown[]
        ) => {
            if (options && typeof options === 'object') {
                return 'Delete';
            }
            return (items.find((item) => item === 'Delete') as string | undefined) ?? 'Delete';
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(configWithProfiles, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.deleteProfile', {
                profileId: 'review',
            });

            assert.strictEqual(
                quickPickInvoked,
                false,
                'Inline delete should not prompt for a second profile selection',
            );

            await waitFor(() => {
                const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    profiles?: Record<string, unknown>;
                };
                return Boolean(currentConfig.profiles?.default) && !currentConfig.profiles?.review;
            }, 8000);

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, unknown>;
            };
            assert.ok(updatedConfig.profiles?.default, 'Default profile should remain');
            assert.ok(!updatedConfig.profiles?.review, 'Selected profile should be deleted');
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showWarningMessage = originalWarning;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('configureCapabilityInjection persists capability overrides and can clear them', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
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

            await vscode.commands.executeCommand('metaflow.configureCapabilityInjection', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
                artifactType: 'prompts',
                mode: 'synchronize',
            });

            let updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; injection?: Record<string, string> }>;
                }>;
            };

            assert.strictEqual(
                updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection?.prompts,
                'synchronize',
                'Capability prompt injection override should persist',
            );
            test('configureCapabilityInjection inherit option shows the effective fallback value', async function () {
                this.timeout(15000);

                const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
                const originalConfig = fs.readFileSync(configPath, 'utf-8');

                const multiRepoConfig = {
                    metadataRepos: [
                        {
                            id: 'ai-metadata',
                            localPath: '.ai/ai-metadata',
                            enabled: true,
                            injection: {
                                prompts: 'synchronize',
                            },
                            capabilities: [{ path: 'company/core', enabled: true }],
                        },
                    ],
                    layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
                    filters: { include: ['**'], exclude: [] },
                    profiles: {
                        default: {
                            enable: ['**/*'],
                            disable: [],
                        },
                    },
                    activeProfile: 'default',
                };

                const windowAny = vscode.window as unknown as {
                    showQuickPick: (...items: unknown[]) => Thenable<unknown>;
                };
                const originalQuickPick = windowAny.showQuickPick;
                let inheritDescription: string | undefined;

                windowAny.showQuickPick = async (items: unknown) => {
                    if (!Array.isArray(items)) {
                        return undefined;
                    }

                    const picks = items as Array<{
                        artifactType?: string;
                        mode?: string;
                        description?: string;
                    }>;

                    if (picks.some((pick) => pick.artifactType === 'prompts')) {
                        return picks.find((pick) => pick.artifactType === 'prompts') ?? picks[0];
                    }

                    if (picks.some((pick) => pick.mode === 'inherit')) {
                        inheritDescription = picks.find(
                            (pick) => pick.mode === 'inherit',
                        )?.description;
                        return picks.find((pick) => pick.mode === 'inherit') ?? picks[0];
                    }

                    return picks[0];
                };

                try {
                    fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
                    await vscode.commands.executeCommand('metaflow.refresh');

                    await vscode.commands.executeCommand('metaflow.configureCapabilityInjection', {
                        layerIndex: 0,
                        repoId: 'ai-metadata',
                        layerPath: 'company/core',
                    });

                    assert.strictEqual(
                        inheritDescription,
                        'Remove the explicit override. Effective value: Synchronize (repo default)',
                        'Inherit option should disclose the resolved fallback mode and source',
                    );
                } finally {
                    windowAny.showQuickPick = originalQuickPick;
                    fs.writeFileSync(configPath, originalConfig, 'utf-8');
                    await vscode.commands.executeCommand('metaflow.refresh');
                }
            });

            await vscode.commands.executeCommand('metaflow.configureCapabilityInjection', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
                artifactType: 'prompts',
                mode: 'inherit',
            });

            updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            assert.ok(
                !updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection?.prompts,
                'Capability prompt injection override should be removed when inherited',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('configureRepoInjectionDefaults persists repository defaults', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.configureRepoInjectionDefaults', {
                repoId: 'ai-metadata',
                artifactType: 'agents',
                mode: 'synchronize',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; injection?: Record<string, string> }>;
            };

            assert.strictEqual(
                updatedConfig.metadataRepos?.find((repo) => repo.id === 'ai-metadata')?.injection
                    ?.agents,
                'synchronize',
                'Repository agent injection default should persist',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('direct settings command persists repository defaults', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.synchronization.agents.settings', {
                repoId: 'ai-metadata',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; injection?: Record<string, string> }>;
            };

            assert.strictEqual(
                updatedConfig.metadataRepos?.find((repo) => repo.id === 'ai-metadata')?.injection
                    ?.agents,
                'settings',
                'Repository agent settings-backed injection default should persist',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('direct synchronization command persists capability overrides', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
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

            await vscode.commands.executeCommand('metaflow.synchronization.prompts.synchronize', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
            });

            let updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; injection?: Record<string, string> }>;
                }>;
            };

            assert.strictEqual(
                updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection?.prompts,
                'synchronize',
                'Capability prompt synchronization override should persist',
            );

            await vscode.commands.executeCommand('metaflow.synchronization.prompts.inherit', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
            });

            updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            assert.ok(
                !updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection?.prompts,
                'Capability prompt synchronization override should be removed when inherited',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('global injection policy command persists repository defaults across all artifact types', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.injectionPolicy.global.synchronize', {
                repoId: 'ai-metadata',
            });

            let updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; injection?: Record<string, string> }>;
            };

            assert.deepStrictEqual(
                updatedConfig.metadataRepos?.find((repo) => repo.id === 'ai-metadata')?.injection,
                {
                    instructions: 'synchronize',
                    prompts: 'synchronize',
                    skills: 'synchronize',
                    agents: 'synchronize',
                    hooks: 'synchronize',
                },
                'Global repo injection policy should persist for every artifact type',
            );

            await vscode.commands.executeCommand('metaflow.injectionPolicy.global.inherit', {
                repoId: 'ai-metadata',
            });

            updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            assert.strictEqual(
                updatedConfig.metadataRepos?.find((repo) => repo.id === 'ai-metadata')?.injection,
                undefined,
                'Global repo injection policy should clear all explicit defaults when inherited',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('global injection policy command persists capability overrides across all artifact types', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
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

            await vscode.commands.executeCommand('metaflow.injectionPolicy.global.synchronize', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
            });

            let updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; injection?: Record<string, string> }>;
                }>;
            };

            assert.deepStrictEqual(
                updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection,
                {
                    instructions: 'synchronize',
                    prompts: 'synchronize',
                    skills: 'synchronize',
                    agents: 'synchronize',
                    hooks: 'synchronize',
                },
                'Global capability injection policy should persist for every artifact type',
            );

            await vscode.commands.executeCommand('metaflow.injectionPolicy.global.settings', {
                layerIndex: 0,
                repoId: 'ai-metadata',
                layerPath: 'company/core',
            });

            updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            assert.deepStrictEqual(
                updatedConfig.metadataRepos?.[0]?.capabilities?.find(
                    (capability) => capability.path === 'company/core',
                )?.injection,
                {
                    instructions: 'settings',
                    prompts: 'settings',
                    skills: 'settings',
                    agents: 'settings',
                    hooks: 'settings',
                },
                'Global capability injection policy should switch the entire capability to settings-backed injection',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('configureGlobalInjectionDefaults persists global defaults', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: 'company/core', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                    disable: [],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(multiRepoConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.configureGlobalInjectionDefaults', {
                artifactType: 'skills',
                mode: 'synchronize',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                injection?: Record<string, string>;
            };

            assert.strictEqual(
                updatedConfig.injection?.skills,
                'synchronize',
                'Global skills injection default should persist',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh rescans all configured repos and discovers new layers when autoApply is disabled', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const priorAutoApply = wsConfig.inspect<boolean>('metaflow.autoApply')?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const firstRepoRoot = path.join(workspaceRoot, '.ai', 'discovery-repo-a');
        const firstBaseLayer = path.join(firstRepoRoot, 'base', 'chatmodes');
        const firstDynamicLayer = path.join(firstRepoRoot, 'dynamic-a', 'chatmodes');
        fs.mkdirSync(firstBaseLayer, { recursive: true });
        fs.mkdirSync(firstDynamicLayer, { recursive: true });
        fs.writeFileSync(
            path.join(firstBaseLayer, 'base-a.chatmode.md'),
            '# Base chatmode A',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(firstDynamicLayer, 'discovered-a.chatmode.md'),
            '# Discovered chatmode A',
            'utf-8',
        );

        const secondRepoRoot = path.join(workspaceRoot, '.ai', 'discovery-repo-b');
        const secondBaseLayer = path.join(secondRepoRoot, 'base', 'chatmodes');
        const secondDynamicLayer = path.join(secondRepoRoot, 'dynamic-b', 'chatmodes');
        fs.mkdirSync(secondBaseLayer, { recursive: true });
        fs.mkdirSync(secondDynamicLayer, { recursive: true });
        fs.writeFileSync(
            path.join(secondBaseLayer, 'base-b.chatmode.md'),
            '# Base chatmode B',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(secondDynamicLayer, 'discovered-b.chatmode.md'),
            '# Discovered chatmode B',
            'utf-8',
        );

        const discoveryConfig = {
            metadataRepos: [
                {
                    id: 'dynamic-a',
                    localPath: '.ai/discovery-repo-a',
                    discover: {
                        enabled: true,
                    },
                },
                {
                    id: 'dynamic-b',
                    localPath: '.ai/discovery-repo-b',
                    discover: {
                        enabled: true,
                    },
                },
            ],
            layerSources: [
                { repoId: 'dynamic-a', path: 'base' },
                { repoId: 'dynamic-b', path: 'base' },
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
            await wsConfig.update(
                'metaflow.autoApply',
                false,
                vscode.ConfigurationTarget.Workspace,
            );

            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const chatmodesDir = path.join(workspaceRoot, '.github', 'chatmodes');
            const firstApplyFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                firstApplyFiles.some((entry) => entry.includes('base-a.chatmode.md')),
                'Base layer from the first repo should be applied when autoApply is disabled',
            );
            assert.ok(
                firstApplyFiles.some((entry) => entry.includes('base-b.chatmode.md')),
                'Base layer from the second repo should be applied when autoApply is disabled',
            );
            assert.ok(
                !firstApplyFiles.some((entry) => entry.includes('discovered-a.chatmode.md')),
                'Global refresh should keep newly discovered layers from the first repo inactive until enabled',
            );
            assert.ok(
                !firstApplyFiles.some((entry) => entry.includes('discovered-b.chatmode.md')),
                'Global refresh should keep newly discovered layers from the second repo inactive until enabled',
            );

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    id: string;
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
            };
            assert.ok(
                updatedConfig.metadataRepos?.some(
                    (repo) =>
                        repo.id === 'dynamic-a' &&
                        repo.capabilities?.some(
                            (capability) =>
                                capability.path === 'dynamic-a' && capability.enabled === false,
                        ),
                ) === true,
                'Refresh should persist discovered layers for the first repo as disabled by default',
            );
            assert.ok(
                updatedConfig.metadataRepos?.some(
                    (repo) =>
                        repo.id === 'dynamic-b' &&
                        repo.capabilities?.some(
                            (capability) =>
                                capability.path === 'dynamic-b' && capability.enabled === false,
                        ),
                ) === true,
                'Refresh should persist discovered layers for the second repo as disabled by default',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(firstRepoRoot);
            removeDirectoryRecursive(secondRepoRoot);
            await wsConfig.update(
                'metaflow.autoApply',
                priorAutoApply,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('refresh discovers new capabilities for all configured repos even when discover.enabled is not set', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const priorAutoApply = wsConfig.inspect<boolean>('metaflow.autoApply')?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const firstRepoRoot = path.join(workspaceRoot, '.ai', 'refresh-discovery-repo-a');
        const firstBaseLayer = path.join(firstRepoRoot, 'base', 'chatmodes');
        const firstDynamicLayer = path.join(firstRepoRoot, 'dynamic-a', 'chatmodes');
        fs.mkdirSync(firstBaseLayer, { recursive: true });
        fs.mkdirSync(firstDynamicLayer, { recursive: true });
        fs.writeFileSync(
            path.join(firstBaseLayer, 'base-a.chatmode.md'),
            '# Base chatmode A',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(firstDynamicLayer, 'discovered-a.chatmode.md'),
            '# Discovered chatmode A',
            'utf-8',
        );

        const secondRepoRoot = path.join(workspaceRoot, '.ai', 'refresh-discovery-repo-b');
        const secondBaseLayer = path.join(secondRepoRoot, 'base', 'chatmodes');
        const secondDynamicLayer = path.join(secondRepoRoot, 'dynamic-b', 'chatmodes');
        fs.mkdirSync(secondBaseLayer, { recursive: true });
        fs.mkdirSync(secondDynamicLayer, { recursive: true });
        fs.writeFileSync(
            path.join(secondBaseLayer, 'base-b.chatmode.md'),
            '# Base chatmode B',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(secondDynamicLayer, 'discovered-b.chatmode.md'),
            '# Discovered chatmode B',
            'utf-8',
        );

        const discoveryConfig = {
            metadataRepos: [
                {
                    id: 'refresh-dynamic-a',
                    localPath: '.ai/refresh-discovery-repo-a',
                },
                {
                    id: 'refresh-dynamic-b',
                    localPath: '.ai/refresh-discovery-repo-b',
                },
            ],
            layerSources: [
                { repoId: 'refresh-dynamic-a', path: 'base' },
                { repoId: 'refresh-dynamic-b', path: 'base' },
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
            await wsConfig.update(
                'metaflow.autoApply',
                false,
                vscode.ConfigurationTarget.Workspace,
            );

            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    id: string;
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
            };

            assert.ok(
                updatedConfig.metadataRepos?.some(
                    (repo) =>
                        repo.id === 'refresh-dynamic-a' &&
                        repo.capabilities?.some(
                            (capability) =>
                                capability.path === 'dynamic-a' && capability.enabled === false,
                        ),
                ) === true,
                'Global refresh should persist newly discovered capabilities for the first repo even without discover.enabled',
            );
            assert.ok(
                updatedConfig.metadataRepos?.some(
                    (repo) =>
                        repo.id === 'refresh-dynamic-b' &&
                        repo.capabilities?.some(
                            (capability) =>
                                capability.path === 'dynamic-b' && capability.enabled === false,
                        ),
                ) === true,
                'Global refresh should persist newly discovered capabilities for the second repo even without discover.enabled',
            );

            const chatmodesDir = path.join(workspaceRoot, '.github', 'chatmodes');
            const appliedFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                appliedFiles.some((entry) => entry.includes('base-a.chatmode.md')),
                'Global refresh should still preserve existing explicit capabilities for the first repo',
            );
            assert.ok(
                appliedFiles.some((entry) => entry.includes('base-b.chatmode.md')),
                'Global refresh should still preserve existing explicit capabilities for the second repo',
            );
            assert.ok(
                !appliedFiles.some((entry) => entry.includes('discovered-a.chatmode.md')),
                'Global refresh should not auto-activate newly discovered capabilities for the first repo',
            );
            assert.ok(
                !appliedFiles.some((entry) => entry.includes('discovered-b.chatmode.md')),
                'Global refresh should not auto-activate newly discovered capabilities for the second repo',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(firstRepoRoot);
            removeDirectoryRecursive(secondRepoRoot);
            await wsConfig.update(
                'metaflow.autoApply',
                priorAutoApply,
                vscode.ConfigurationTarget.Workspace,
            );
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
        fs.writeFileSync(
            path.join(dynamicLayer, 'discovered.chatmode.md'),
            '# Discovered chatmode',
            'utf-8',
        );

        const configWithoutDiscover = {
            metadataRepos: [
                {
                    id: 'dynamic',
                    localPath: '.ai/force-discovery-repo',
                },
            ],
            layerSources: [{ repoId: 'dynamic', path: 'base' }],
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
                !beforeRescanFiles.some((entry) => entry.includes('discovered.chatmode.md')),
                'Discovered file should not be present before manual rescan when discover.enabled is absent',
            );

            await vscode.commands.executeCommand('metaflow.rescanRepository', {
                repoId: 'dynamic',
            });
            await vscode.commands.executeCommand('metaflow.apply');

            const afterRescanFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                !afterRescanFiles.some((entry) => entry.includes('discovered.chatmode.md')),
                'Manual rescan should discover the selected repo without activating the new capability',
            );

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    id: string;
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
            };
            assert.ok(
                updatedConfig.metadataRepos?.some(
                    (repo) =>
                        repo.id === 'dynamic' &&
                        repo.capabilities?.some(
                            (capability) =>
                                capability.path === 'dynamic' && capability.enabled === false,
                        ),
                ) === true,
                'Manual rescan should persist newly discovered capability into config as disabled by default',
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                layerIndex: 1,
                repoId: 'dynamic',
            });
            await vscode.commands.executeCommand('metaflow.apply');

            const afterEnableFiles = fs.existsSync(chatmodesDir)
                ? (fs.readdirSync(chatmodesDir, { recursive: true }) as string[])
                : [];

            assert.ok(
                afterEnableFiles.some((entry) => entry.includes('discovered.chatmode.md')),
                'The discovered capability should only contribute files after the user explicitly enables it',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('removeRepoSource deleting final repo removes known .metaflow files and prunes empty directory', async function () {
        this.timeout(15000);

        const metaflowDir = path.join(workspaceRoot, '.metaflow');
        const configPath = path.join(metaflowDir, 'config.jsonc');
        const statePath = path.join(metaflowDir, 'state.json');
        const backupDir = path.join(workspaceRoot, '.metaflow-test-backup-remove-final');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const hadOriginalState = fs.existsSync(statePath);
        const originalState = hadOriginalState ? fs.readFileSync(statePath, 'utf-8') : undefined;
        const movedEntries: string[] = [];

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
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        const originalInfo = windowAny.showInformationMessage;
        const infoMessages: string[] = [];
        windowAny.showWarningMessage = async () => 'Remove';
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            await resetBuiltInCapabilityState();
            if (fs.existsSync(backupDir)) {
                removeDirectoryRecursive(backupDir);
            }
            fs.mkdirSync(backupDir, { recursive: true });
            for (const entry of fs.readdirSync(metaflowDir)) {
                if (entry === 'config.jsonc' || entry === 'state.json') {
                    continue;
                }
                fs.renameSync(path.join(metaflowDir, entry), path.join(backupDir, entry));
                movedEntries.push(entry);
            }

            fs.writeFileSync(configPath, JSON.stringify(singleRepoConfig, null, 2), 'utf-8');
            fs.writeFileSync(
                statePath,
                JSON.stringify(
                    { version: 1, files: {}, lastApply: new Date(0).toISOString() },
                    null,
                    2,
                ),
                'utf-8',
            );
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.removeRepoSource', 'primary');

            assert.strictEqual(
                fs.existsSync(configPath),
                false,
                'Config file should be deleted after removing final repo source',
            );
            assert.strictEqual(
                fs.existsSync(statePath),
                false,
                'Managed state file should be deleted after removing final repo source',
            );
            assert.strictEqual(
                fs.existsSync(metaflowDir),
                false,
                '.metaflow directory should be pruned when empty',
            );
            assert.ok(
                infoMessages.some((message) =>
                    message.includes('removed empty .metaflow directory'),
                ),
                'Expected informational message describing empty .metaflow directory cleanup',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            windowAny.showInformationMessage = originalInfo;
            if (!fs.existsSync(metaflowDir)) {
                fs.mkdirSync(metaflowDir, { recursive: true });
            }
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, originalConfig, 'utf-8');
            }
            if (hadOriginalState) {
                fs.writeFileSync(statePath, originalState ?? '', 'utf-8');
            } else if (fs.existsSync(statePath)) {
                fs.rmSync(statePath);
            }
            if (fs.existsSync(backupDir)) {
                if (!fs.existsSync(metaflowDir)) {
                    fs.mkdirSync(metaflowDir, { recursive: true });
                }
                for (const entry of movedEntries) {
                    const movedPath = path.join(backupDir, entry);
                    if (fs.existsSync(movedPath)) {
                        fs.renameSync(movedPath, path.join(metaflowDir, entry));
                    }
                }
                removeDirectoryRecursive(backupDir);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('removeRepoSource keeps .metaflow when unknown files remain after final repo removal', async function () {
        this.timeout(15000);

        const metaflowDir = path.join(workspaceRoot, '.metaflow');
        const configPath = path.join(metaflowDir, 'config.jsonc');
        const statePath = path.join(metaflowDir, 'state.json');
        const customPath = path.join(metaflowDir, 'custom.note');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const hadOriginalState = fs.existsSync(statePath);
        const originalState = hadOriginalState ? fs.readFileSync(statePath, 'utf-8') : undefined;
        const hadCustom = fs.existsSync(customPath);
        const originalCustom = hadCustom ? fs.readFileSync(customPath, 'utf-8') : undefined;

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
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        const originalInfo = windowAny.showInformationMessage;
        const infoMessages: string[] = [];
        windowAny.showWarningMessage = async () => 'Remove';
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            await resetBuiltInCapabilityState();
            fs.writeFileSync(configPath, JSON.stringify(singleRepoConfig, null, 2), 'utf-8');
            fs.writeFileSync(
                statePath,
                JSON.stringify(
                    { version: 1, files: {}, lastApply: new Date(0).toISOString() },
                    null,
                    2,
                ),
                'utf-8',
            );
            fs.writeFileSync(customPath, 'keep me', 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.removeRepoSource', 'primary');

            assert.strictEqual(
                fs.existsSync(configPath),
                false,
                'Config file should be deleted after removing final repo source',
            );
            assert.strictEqual(
                fs.existsSync(statePath),
                false,
                'Managed state file should be deleted after removing final repo source',
            );
            assert.strictEqual(
                fs.existsSync(metaflowDir),
                true,
                '.metaflow directory should be retained when unknown files remain',
            );
            assert.strictEqual(
                fs.existsSync(customPath),
                true,
                'Unknown .metaflow file should be preserved',
            );
            assert.ok(
                infoMessages.some((message) =>
                    message.includes('kept .metaflow because it still contains'),
                ),
                'Expected informational message describing why .metaflow was kept',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            windowAny.showInformationMessage = originalInfo;
            if (!fs.existsSync(metaflowDir)) {
                fs.mkdirSync(metaflowDir, { recursive: true });
            }
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, originalConfig, 'utf-8');
            }
            if (hadOriginalState) {
                fs.writeFileSync(statePath, originalState ?? '', 'utf-8');
            } else if (fs.existsSync(statePath)) {
                fs.rmSync(statePath);
            }
            if (hadCustom) {
                fs.writeFileSync(customPath, originalCustom ?? '', 'utf-8');
            } else if (fs.existsSync(customPath)) {
                fs.rmSync(customPath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('removeRepoSource final repo cleanup is tolerant when state.json is already absent', async function () {
        this.timeout(15000);

        const metaflowDir = path.join(workspaceRoot, '.metaflow');
        const configPath = path.join(metaflowDir, 'config.jsonc');
        const statePath = path.join(metaflowDir, 'state.json');
        const backupDir = path.join(workspaceRoot, '.metaflow-test-backup-remove-final-no-state');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const hadOriginalState = fs.existsSync(statePath);
        const originalState = hadOriginalState ? fs.readFileSync(statePath, 'utf-8') : undefined;
        const movedEntries: string[] = [];

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
            await resetBuiltInCapabilityState();
            if (fs.existsSync(backupDir)) {
                removeDirectoryRecursive(backupDir);
            }
            fs.mkdirSync(backupDir, { recursive: true });
            for (const entry of fs.readdirSync(metaflowDir)) {
                if (entry === 'config.jsonc' || entry === 'state.json') {
                    continue;
                }
                fs.renameSync(path.join(metaflowDir, entry), path.join(backupDir, entry));
                movedEntries.push(entry);
            }

            fs.writeFileSync(configPath, JSON.stringify(singleRepoConfig, null, 2), 'utf-8');
            if (fs.existsSync(statePath)) {
                fs.rmSync(statePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.removeRepoSource', 'primary');

            assert.strictEqual(
                fs.existsSync(configPath),
                false,
                'Config file should be deleted after removing final repo source',
            );
            assert.strictEqual(
                fs.existsSync(metaflowDir),
                false,
                '.metaflow directory should still be pruned when known state file is absent',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            if (!fs.existsSync(metaflowDir)) {
                fs.mkdirSync(metaflowDir, { recursive: true });
            }
            if (!fs.existsSync(configPath)) {
                fs.writeFileSync(configPath, originalConfig, 'utf-8');
            }
            if (hadOriginalState) {
                fs.writeFileSync(statePath, originalState ?? '', 'utf-8');
            } else if (fs.existsSync(statePath)) {
                fs.rmSync(statePath);
            }
            if (fs.existsSync(backupDir)) {
                if (!fs.existsSync(metaflowDir)) {
                    fs.mkdirSync(metaflowDir, { recursive: true });
                }
                for (const entry of movedEntries) {
                    const movedPath = path.join(backupDir, entry);
                    if (fs.existsSync(movedPath)) {
                        fs.renameSync(movedPath, path.join(metaflowDir, entry));
                    }
                }
                removeDirectoryRecursive(backupDir);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates reports no git-backed sources when config has local-only repos', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const localOnlyConfig = {
            metadataRepos: [{ id: 'local', localPath: '.ai/ai-metadata', enabled: true }],
            layerSources: [{ repoId: 'local', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const infoMessages: string[] = [];
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.checkRepoUpdates');

            assert.ok(
                infoMessages.some((message) =>
                    message.includes('No git-backed repository sources are configured'),
                ),
                'checkRepoUpdates should report when no git-backed repos exist',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('addRepoSource immediately offers promotion for existing local git repositories', async function () {
        this.timeout(25000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-add-repo-source');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(path.join(repoPath, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, '.github', 'instructions', 'example.instructions.md'),
            '# example\n',
            'utf-8',
        );

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/meta-add-repo.git'], {
            cwd: repoPath,
            windowsHide: true,
        });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalInfo = windowAny.showInformationMessage;
        let promotionPromptCount = 0;

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'existing')) {
                return picks.find((pick) => pick.mode === 'existing') ?? picks[0];
            }

            return picks[0];
        };

        windowAny.showOpenDialog = async () => [vscode.Uri.file(repoPath)];

        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                promotionPromptCount += 1;
                return 'Promote';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.addRepoSource');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; localPath: string; url?: string }>;
            };

            const addedRepo = updatedConfig.metadataRepos?.find(
                (candidate) =>
                    path.normalize(candidate.localPath) ===
                        path.normalize(path.relative(workspaceRoot, repoPath)) ||
                    path.normalize(candidate.localPath) ===
                        path.normalize(path.relative(workspaceRoot, repoPath)).replace(/\\/g, '/'),
            );

            assert.ok(addedRepo, 'Add repo source should add the selected existing directory');
            assert.strictEqual(
                addedRepo?.url,
                'https://example.com/meta-add-repo.git',
                'Add repo source should immediately promote local git repositories with remotes',
            );
            assert.ok(
                promotionPromptCount > 0,
                'Promotion prompt should appear during add repo source flow',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await waitFor(
                () => {
                    try {
                        if (!fs.existsSync(repoPath)) {
                            return true;
                        }
                        removeDirectoryRecursive(repoPath);
                        return !fs.existsSync(repoPath);
                    } catch {
                        return false;
                    }
                },
                5000,
                100,
            );
        }
    });

    test('initConfig immediately offers promotion for existing local git repositories', async function () {
        this.timeout(30000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-init-config');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(path.join(repoPath, '.github', 'prompts'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, '.github', 'prompts', 'example.prompt.md'),
            '# prompt\n',
            'utf-8',
        );

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync(
            'git',
            ['remote', 'add', 'origin', 'https://example.com/meta-init-config.git'],
            { cwd: repoPath, windowsHide: true },
        );

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalWarning = windowAny.showWarningMessage;
        const originalInfo = windowAny.showInformationMessage;
        let builtInPromptCount = 0;
        let promotionPromptCount = 0;

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'existing')) {
                return picks.find((pick) => pick.mode === 'existing') ?? picks[0];
            }

            return picks[0];
        };

        windowAny.showOpenDialog = async () => [vscode.Uri.file(repoPath)];

        windowAny.showWarningMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.includes('already exists. Overwrite?')) {
                return 'Overwrite';
            }
            return undefined;
        };

        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('Enable the bundled AI metadata capabilities now?')
            ) {
                builtInPromptCount += 1;
                return 'Not Now';
            }
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                promotionPromptCount += 1;
                return 'Promote';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.initConfig');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepo?: { localPath: string; url?: string };
                metadataRepos?: Array<{ id: string; localPath: string; url?: string }>;
            };

            const promotedPrimaryUrl = updatedConfig.metadataRepo?.url;
            const promotedMultiRepoUrl = updatedConfig.metadataRepos?.find(
                (candidate) =>
                    path.normalize(candidate.localPath) ===
                        path.normalize(path.relative(workspaceRoot, repoPath)) ||
                    path.normalize(candidate.localPath) ===
                        path.normalize(path.relative(workspaceRoot, repoPath)).replace(/\\/g, '/'),
            )?.url;

            assert.strictEqual(
                promotedPrimaryUrl ?? promotedMultiRepoUrl,
                'https://example.com/meta-init-config.git',
                'Initialize configuration should immediately promote local git repositories with remotes',
            );
            assert.ok(
                builtInPromptCount > 0,
                'Built-in capability onboarding prompt should appear during init configuration flow',
            );
            assert.ok(
                promotionPromptCount > 0,
                'Promotion prompt should appear during init configuration flow',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showWarningMessage = originalWarning;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoPath);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('offerGitRemotePromotion promotes local repo with a single remote URL', async function () {
        this.timeout(20000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-single');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(repoPath, { recursive: true });

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/meta-single.git'], {
            cwd: repoPath,
            windowsHide: true,
        });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                {
                    id: 'local-single',
                    localPath: path.relative(workspaceRoot, repoPath),
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'local-single', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                return 'Promote';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; url?: string }>;
            };
            const repo = updatedConfig.metadataRepos?.find(
                (candidate) => candidate.id === 'local-single',
            );
            assert.strictEqual(
                repo?.url,
                'https://example.com/meta-single.git',
                'Promotion should persist the single available git remote URL',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoPath);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('offerGitRemotePromotion remembers Skip until git remote set changes', async function () {
        this.timeout(25000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-skip-cache');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(repoPath, { recursive: true });

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync(
            'git',
            ['remote', 'add', 'origin', 'https://example.com/meta-skip-origin.git'],
            { cwd: repoPath, windowsHide: true },
        );

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                {
                    id: 'local-skip-cache',
                    localPath: path.relative(workspaceRoot, repoPath),
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'local-skip-cache', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        let promotionPromptCount = 0;

        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                promotionPromptCount += 1;
                return 'Skip';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            execFileSync(
                'git',
                ['remote', 'add', 'upstream', 'https://example.com/meta-skip-upstream.git'],
                {
                    cwd: repoPath,
                    windowsHide: true,
                },
            );

            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            assert.strictEqual(
                promotionPromptCount,
                2,
                'Promotion prompt should be suppressed after Skip until the remote set changes',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoPath);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('offerGitRemotePromotion lets user pick which remote URL to track', async function () {
        this.timeout(20000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-multi');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(repoPath, { recursive: true });

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/meta-origin.git'], {
            cwd: repoPath,
            windowsHide: true,
        });
        execFileSync(
            'git',
            ['remote', 'add', 'upstream', 'https://example.com/meta-upstream.git'],
            { cwd: repoPath, windowsHide: true },
        );

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                {
                    id: 'local-multi',
                    localPath: path.relative(workspaceRoot, repoPath),
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'local-multi', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showQuickPick: (
                ...items: unknown[]
            ) => Thenable<{ remote?: { name: string; url: string } } | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const originalQuickPick = windowAny.showQuickPick;

        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                return 'Promote';
            }
            return undefined;
        };

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const candidates = items as Array<{ remote?: { name: string; url: string } }>;
            return candidates.find((candidate) => candidate.remote?.name === 'upstream');
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; url?: string }>;
            };
            const repo = updatedConfig.metadataRepos?.find(
                (candidate) => candidate.id === 'local-multi',
            );
            assert.strictEqual(
                repo?.url,
                'https://example.com/meta-upstream.git',
                'Promotion should persist the user-selected remote URL when multiple remotes exist',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            windowAny.showQuickPick = originalQuickPick;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoPath);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates silent mode returns no-git-repos outcome when no git-backed sources exist', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const localOnlyConfig = {
            metadataRepos: [{ id: 'local', localPath: '.ai/ai-metadata', enabled: true }],
            layerSources: [{ repoId: 'local', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            const outcome = (await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                silent: true,
            })) as { executed?: boolean; reason?: string };

            assert.strictEqual(
                outcome.executed,
                false,
                'Expected silent check to report skipped execution',
            );
            assert.strictEqual(
                outcome.reason,
                'no-git-repos',
                'Expected no-git-repos outcome reason',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates silent mode returns no-config outcome when config is absent', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const backupConfigPath = path.join(
            workspaceRoot,
            '.metaflow',
            'config.jsonc.bak.no-config-outcome',
        );
        assert.ok(fs.existsSync(configPath), 'Expected fixture config to exist before test');

        fs.renameSync(configPath, backupConfigPath);

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            const outcome = (await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                silent: true,
            })) as { executed?: boolean; reason?: string };

            assert.strictEqual(
                outcome.executed,
                false,
                'Expected silent check to report skipped execution',
            );
            assert.strictEqual(outcome.reason, 'no-config', 'Expected no-config outcome reason');
        } finally {
            if (fs.existsSync(backupConfigPath)) {
                fs.renameSync(backupConfigPath, configPath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates returns repo-not-found outcome for unknown repo id in silent mode', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const gitBackedConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        fs.writeFileSync(configPath, JSON.stringify(gitBackedConfig, null, 2), 'utf-8');

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            let outcome = (await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                repoId: 'repo-that-does-not-exist',
                silent: true,
            })) as { executed?: boolean; reason?: string };

            // Integration runs can briefly observe a stale no-config state right after
            // config restore/refresh transitions from earlier tests.
            if (outcome.reason === 'no-config') {
                await vscode.commands.executeCommand('metaflow.refresh');
                outcome = (await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                    repoId: 'repo-that-does-not-exist',
                    silent: true,
                })) as { executed?: boolean; reason?: string };
            }

            assert.strictEqual(
                outcome.executed,
                false,
                'Expected silent check to report skipped execution',
            );
            assert.strictEqual(
                outcome.reason,
                'repo-not-found',
                'Expected repo-not-found outcome reason',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates silent mode does not use progress notification UI', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const localOnlyConfig = {
            metadataRepos: [{ id: 'local', localPath: '.ai/ai-metadata', enabled: true }],
            layerSources: [{ repoId: 'local', path: '.', enabled: true }],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            withProgress: <T>(
                options: unknown,
                task: (...args: unknown[]) => Thenable<T> | Promise<T> | T,
            ) => Thenable<T>;
        };
        const originalWithProgress = windowAny.withProgress;
        let withProgressCallCount = 0;

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            windowAny.withProgress = async (_options, task) => {
                withProgressCallCount += 1;
                return await task();
            };

            await vscode.commands.executeCommand('metaflow.checkRepoUpdates', { silent: true });

            assert.strictEqual(
                withProgressCallCount,
                0,
                'silent checks should not invoke notification progress UI',
            );
        } finally {
            windowAny.withProgress = originalWithProgress;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('pullRepository warns when requested repo is not git-backed', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const gitBackedConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            filters: { include: ['**'], exclude: [] },
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        fs.writeFileSync(configPath, JSON.stringify(gitBackedConfig, null, 2), 'utf-8');

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        const warningMessages: string[] = [];
        windowAny.showWarningMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                warningMessages.push(message);
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.pullRepository', {
                repoId: 'missing-repo-id',
            });
            assert.ok(
                warningMessages.some((message) => message.includes('not git-backed or not found')),
                'pullRepository should warn when a non-git or unknown repo is requested',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('promote reports drift status', async function () {
        this.timeout(15000);

        const windowAny = vscode.window as unknown as {
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const infoMessages: string[] = [];
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.promote');

            assert.ok(
                infoMessages.some((message) => message.includes('No drifted files detected')),
                'Promote should explicitly report when no drift is detected',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
        }
    });

    test('initMetaFlowAiMetadata synchronize mode overwrites managed files', async function () {
        this.timeout(20000);

        const instructionPath = path.join(
            workspaceRoot,
            '.github',
            'instructions',
            'metaflow-constructs.instructions.md',
        );
        const originalInstruction = fs.existsSync(instructionPath)
            ? fs.readFileSync(instructionPath, 'utf-8')
            : undefined;

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        windowAny.showQuickPick = async (items: unknown) => {
            const picks = items as Array<{ mode?: string }>;
            return picks.find((pick) => pick.mode === 'synchronize') ?? picks[0];
        };

        if (fs.existsSync(instructionPath)) {
            fs.rmSync(instructionPath, { force: true });
        }

        try {
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');
            assert.ok(
                fs.existsSync(instructionPath),
                'Starter metadata command should scaffold instruction templates',
            );

            fs.writeFileSync(instructionPath, '# local customization\n', 'utf-8');
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');

            const after = fs.readFileSync(instructionPath, 'utf-8');
            assert.ok(
                !after.includes('# local customization'),
                'Synchronize mode should overwrite managed files deterministically',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            if (originalInstruction === undefined) {
                fs.rmSync(instructionPath, { force: true });
            } else {
                fs.writeFileSync(instructionPath, originalInstruction, 'utf-8');
            }
        }
    });

    test('initMetaFlowAiMetadata synchronize mode stays active for refresh re-synchronization', async function () {
        this.timeout(25000);

        const instructionPath = path.join(
            workspaceRoot,
            '.github',
            'instructions',
            'metaflow-constructs.instructions.md',
        );
        const originalInstruction = fs.existsSync(instructionPath)
            ? fs.readFileSync(instructionPath, 'utf-8')
            : undefined;

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousAutoApply = wsConfig.inspect<boolean>('metaflow.autoApply')?.workspaceValue;

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        windowAny.showQuickPick = async (items: unknown) => {
            const picks = items as Array<{ mode?: string }>;
            return picks.find((pick) => pick.mode === 'synchronize') ?? picks[0];
        };

        try {
            await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');

            assert.ok(
                fs.existsSync(instructionPath),
                'Synchronize mode should scaffold built-in instruction metadata',
            );
            const canonicalInstruction = fs.readFileSync(instructionPath, 'utf-8');

            fs.writeFileSync(instructionPath, '# local customization\n', 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const refreshedInstruction = fs.readFileSync(instructionPath, 'utf-8');
            assert.strictEqual(
                refreshedInstruction,
                canonicalInstruction,
                'Refresh should auto-apply and restore built-in synchronized metadata after local drift',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            await wsConfig.update(
                'metaflow.autoApply',
                previousAutoApply,
                vscode.ConfigurationTarget.Workspace,
            );
            if (originalInstruction === undefined) {
                fs.rmSync(instructionPath, { force: true });
            } else {
                fs.writeFileSync(instructionPath, originalInstruction, 'utf-8');
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('initMetaFlowAiMetadata built-in mode leaves config unchanged and remove disables built-in mode', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalWarning = windowAny.showWarningMessage;

        let builtInEnabledPickCount = 0;
        windowAny.showQuickPick = async (items: unknown) => {
            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'builtin')) {
                builtInEnabledPickCount += 1;
                return picks.find((pick) => pick.mode === 'builtin') ?? picks[0];
            }
            return picks[0];
        };
        windowAny.showWarningMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.startsWith('Remove built-in MetaFlow capability source')
            ) {
                return 'Remove';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterInitConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterInitConfig,
                originalConfig,
                'Built-in mode should not mutate .metaflow/config.jsonc',
            );

            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterRemoveConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterRemoveConfig,
                originalConfig,
                'Removing built-in mode should not mutate .metaflow/config.jsonc',
            );
            assert.ok(
                builtInEnabledPickCount > 0,
                'Test should exercise built-in initialization mode',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showWarningMessage = originalWarning;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0338: synchronize mode uninstall fully clears tracked capability state', async function () {
        this.timeout(25000);

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalWarning = windowAny.showWarningMessage;
        const originalInfo = windowAny.showInformationMessage;
        const infoMessages: string[] = [];

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'synchronize')) {
                return picks.find((pick) => pick.mode === 'synchronize') ?? picks[0];
            }
            if (picks.some((pick) => pick.mode === 'removeSynchronized')) {
                return picks.find((pick) => pick.mode === 'removeSynchronized') ?? picks[0];
            }
            return picks[0];
        };

        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };
        windowAny.showWarningMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.startsWith('Remove ')) {
                return 'Remove';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');

            assert.ok(
                infoMessages.some((message) =>
                    message.includes(
                        'No built-in mode or synchronized MetaFlow capability files are currently tracked.',
                    ),
                ),
                'Removing synchronize mode should leave no tracked capability state for a follow-up remove call',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showWarningMessage = originalWarning;
            windowAny.showInformationMessage = originalInfo;
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0335: aiMetadataAutoApplyMode=off does not auto-enable built-in capability paths', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        await wsConfig.update(
            'metaflow.aiMetadataAutoApplyMode',
            'off',
            vscode.ConfigurationTarget.Workspace,
        );
        await resetBuiltInCapabilityState();
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            assert.strictEqual(
                hasBuiltInInstructionPath(instructionLocations),
                false,
                'off mode should not inject built-in capability instruction paths',
            );
        } finally {
            await wsConfig.update(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0336: aiMetadataAutoApplyMode=synchronize scaffolds built-in capability files on refresh', async function () {
        this.timeout(25000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        const instructionPath = path.join(
            workspaceRoot,
            '.github',
            'instructions',
            'metaflow-constructs.instructions.md',
        );
        const originalInstruction = fs.existsSync(instructionPath)
            ? fs.readFileSync(instructionPath, 'utf-8')
            : undefined;

        await wsConfig.update(
            'metaflow.aiMetadataAutoApplyMode',
            'off',
            vscode.ConfigurationTarget.Workspace,
        );
        await resetBuiltInCapabilityState();
        if (fs.existsSync(instructionPath)) {
            fs.rmSync(instructionPath, { force: true });
        }

        try {
            await wsConfig.update(
                'metaflow.aiMetadataAutoApplyMode',
                'synchronize',
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            assert.ok(
                fs.existsSync(instructionPath),
                'synchronize mode should scaffold built-in capability files during refresh',
            );
        } finally {
            await wsConfig.update(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
            );
            if (originalInstruction === undefined) {
                fs.rmSync(instructionPath, { force: true });
            } else {
                fs.writeFileSync(instructionPath, originalInstruction, 'utf-8');
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0337: aiMetadataAutoApplyMode=builtinLayer enables built-in capability projection without mutating config', async function () {
        this.timeout(25000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update(
            'metaflow.aiMetadataAutoApplyMode',
            'off',
            vscode.ConfigurationTarget.Workspace,
        );
        await resetBuiltInCapabilityState();
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await wsConfig.update(
                'metaflow.aiMetadataAutoApplyMode',
                'builtinLayer',
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            assert.strictEqual(
                hasBuiltInInstructionPath(instructionLocations),
                true,
                'builtinLayer mode should inject built-in capability instruction paths',
            );
            assert.strictEqual(
                hasExtensionInstallInstructionPath(instructionLocations),
                false,
                'builtinLayer mode should not inject paths from the installed extension directory',
            );

            const afterRefreshConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterRefreshConfig,
                originalConfig,
                'builtinLayer mode should not mutate .metaflow/config.jsonc',
            );
        } finally {
            await wsConfig.update(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });
});
