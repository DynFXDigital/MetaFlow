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
        intervalMs = 100
    ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await predicate()) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        assert.fail(`Condition not met within ${timeoutMs}ms`);
    }

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

    test('config watcher triggers auto refresh and settings injection on config change', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await wsConfig.update('metaflow.autoApply', true, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.instructionsFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.promptFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);

        try {
            // Mutate a valid config value to trigger file watcher refresh.
            const parsed = JSON.parse(originalConfig) as {
                injection?: { prompts?: 'settings' | 'materialize' };
            };
            if (!parsed.injection) {
                parsed.injection = {};
            }
            parsed.injection.prompts = parsed.injection.prompts === 'settings' ? 'materialize' : 'settings';
            fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8');

            await waitFor(() => {
                const instructionLocations = wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations')?.workspaceValue;
                const promptLocations = wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations')?.workspaceValue;
                return !!instructionLocations && Object.keys(instructionLocations).length > 0
                    && !!promptLocations && Object.keys(promptLocations).length > 0;
            }, 10000);
        } finally {
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

            const noConfigOutcome = await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                silent: true,
            }) as { executed?: boolean; reason?: string };
            assert.strictEqual(noConfigOutcome.executed, false, 'Expected no-config run to be skipped');
            assert.strictEqual(noConfigOutcome.reason, 'no-config', 'Expected no-config outcome after config deletion');

            fs.writeFileSync(configPath, JSON.stringify(gitBackedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            let restoredOutcome: { executed?: boolean; reason?: string } = { executed: false, reason: 'no-config' };
            await waitFor(async () => {
                restoredOutcome = await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                    repoId: 'repo-that-does-not-exist',
                    silent: true,
                }) as { executed?: boolean; reason?: string };

                return restoredOutcome.reason !== 'no-config';
            }, 12000);

            assert.strictEqual(restoredOutcome.executed, false, 'Expected unknown repo run to be skipped');
            assert.strictEqual(restoredOutcome.reason, 'repo-not-found', 'Expected repo-not-found outcome after config recreation');
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

        await wsConfig.update('chat.agentFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);
        await wsConfig.update('chat.agentSkillsLocations', undefined, vscode.ConfigurationTarget.Workspace);

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const agentLocations = wsConfig.inspect<Record<string, boolean>>('chat.agentFilesLocations')?.workspaceValue;
            const skillLocations = wsConfig.inspect<Record<string, boolean>>('chat.agentSkillsLocations')?.workspaceValue;

            assert.ok(agentLocations && Object.keys(agentLocations).length > 0, 'Agent locations should be injected at workspace scope');
            assert.ok(skillLocations && Object.keys(skillLocations).length > 0, 'Skill locations should be injected at workspace scope');
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
        await wsConfig.update('chat.hookFilesLocations', undefined, vscode.ConfigurationTarget.Workspace);

        try {
            fs.writeFileSync(configPath, JSON.stringify(parsedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const hookLocations = wsConfig.inspect<Record<string, boolean>>('chat.hookFilesLocations')?.workspaceValue;
            assert.strictEqual(hookLocations, undefined, 'Hook locations should not be injected when metaflow.hooksEnabled is false');
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await wsConfig.update('metaflow.hooksEnabled', undefined, vscode.ConfigurationTarget.Workspace);
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
        windowAny.showWarningMessage = async () => 'Yes';

        const infoMessages: string[] = [];
        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            const result = await vscode.commands.executeCommand('metaflow.clean') as {
                removed?: unknown[];
            } | undefined;

            if (!result) {
                assert.fail('Clean should return an ApplyResult when confirmed');
            }
            if (!Array.isArray(result.removed)) {
                assert.fail('Clean result should include removed[]');
            }

            const removedCount = result.removed.length;
            assert.ok(
                infoMessages.some(m => m.includes(`MetaFlow: Cleaned ${removedCount} files.`)),
                'Clean should emit a user-facing completion message with removal count'
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

    test('status logs key metrics to output channel', async function () {
        this.timeout(15000);

        const lines = await vscode.commands.executeCommand('metaflow.status') as string[] | undefined;
        assert.ok(Array.isArray(lines), 'Status should return the emitted log lines');

        assert.ok(lines.some(line => line.includes('=== MetaFlow Status ===')), 'Status should include a header line');
        assert.ok(lines.some(line => line.includes('Config:')), 'Status should include config path line');
        assert.ok(lines.some(line => line.includes('Active Profile:')), 'Status should include active profile line');
        assert.ok(lines.some(line => line.includes('Effective Files:')), 'Status should include effective file count line');
        assert.ok(lines.some(line => line.includes('Managed Files:')), 'Status should include managed file count line');
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
            'CAPABILITY.md'
        );

        const originalCapability = fs.readFileSync(capabilityPath, 'utf-8');

        try {
            fs.writeFileSync(capabilityPath, '# malformed manifest without frontmatter\n', 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            const lines = await vscode.commands.executeCommand('metaflow.status') as string[] | undefined;
            assert.ok(Array.isArray(lines), 'Status should return emitted log lines');

            const warningLine = lines.find(
                line => line.includes('CAPABILITY_FRONTMATTER_MISSING') || line.includes('CAPABILITY_NO_FRONTMATTER')
            );
            assert.ok(warningLine, 'Status should include capability warning code for malformed manifest');
            const normalizedWarningLine = warningLine?.replace(/\\/g, '/');
            assert.ok(
                normalizedWarningLine?.includes('standards/sdlc/CAPABILITY.md'),
                `Expected warning to include manifest path, got: ${warningLine}`
            );
        } finally {
            fs.writeFileSync(capabilityPath, originalCapability, 'utf-8');
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
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

    test('toggleLayerArtifactType persists excludedTypes updates', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const multiRepoConfig = {
            metadataRepos: [
                { id: 'ai-metadata', localPath: '.ai/ai-metadata', enabled: true },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: '.', enabled: true },
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

            await vscode.commands.executeCommand(
                'metaflow.toggleLayerArtifactType',
                { layerIndex: 0, artifactType: 'instructions' },
                vscode.TreeItemCheckboxState.Unchecked
            );

            const afterExclude = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                layerSources?: Array<{ excludedTypes?: string[] }>;
            };

            assert.ok(afterExclude.layerSources && afterExclude.layerSources.length > 0, 'Config should contain layerSources');
            assert.ok(
                afterExclude.layerSources?.[0].excludedTypes?.includes('instructions'),
                'instructions should be persisted in excludedTypes when unchecked'
            );

            await vscode.commands.executeCommand(
                'metaflow.toggleLayerArtifactType',
                { layerIndex: 0, artifactType: 'instructions' },
                vscode.TreeItemCheckboxState.Checked
            );

            const afterInclude = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                layerSources?: Array<{ excludedTypes?: string[] }>;
            };

            assert.ok(
                !afterInclude.layerSources?.[0].excludedTypes?.includes('instructions'),
                'instructions should be removed from excludedTypes when checked'
            );
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

    test('checkRepoUpdates reports no git-backed sources when config has local-only repos', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const localOnlyConfig = {
            metadataRepos: [
                { id: 'local', localPath: '.ai/ai-metadata', enabled: true },
            ],
            layerSources: [
                { repoId: 'local', path: '.', enabled: true },
            ],
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
                infoMessages.some(message => message.includes('No git-backed repository sources are configured')),
                'checkRepoUpdates should report when no git-backed repos exist'
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('offerGitRemotePromotion promotes local repo with a single remote URL', async function () {
        this.timeout(20000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-single');
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.mkdirSync(repoPath, { recursive: true });

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/meta-single.git'], { cwd: repoPath, windowsHide: true });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                { id: 'local-single', localPath: path.relative(workspaceRoot, repoPath), enabled: true },
            ],
            layerSources: [
                { repoId: 'local-single', path: '.', enabled: true },
            ],
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
            if (typeof message === 'string' && message.includes('Promote it to a git-backed source?')) {
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
            const repo = updatedConfig.metadataRepos?.find(candidate => candidate.id === 'local-single');
            assert.strictEqual(
                repo?.url,
                'https://example.com/meta-single.git',
                'Promotion should persist the single available git remote URL'
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            fs.rmSync(repoPath, { recursive: true, force: true });
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('offerGitRemotePromotion lets user pick which remote URL to track', async function () {
        this.timeout(20000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-multi');
        fs.rmSync(repoPath, { recursive: true, force: true });
        fs.mkdirSync(repoPath, { recursive: true });

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'origin', 'https://example.com/meta-origin.git'], { cwd: repoPath, windowsHide: true });
        execFileSync('git', ['remote', 'add', 'upstream', 'https://example.com/meta-upstream.git'], { cwd: repoPath, windowsHide: true });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                { id: 'local-multi', localPath: path.relative(workspaceRoot, repoPath), enabled: true },
            ],
            layerSources: [
                { repoId: 'local-multi', path: '.', enabled: true },
            ],
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
            showQuickPick: (...items: unknown[]) => Thenable<{ remote?: { name: string; url: string } } | undefined>;
        };
        const originalInfo = windowAny.showInformationMessage;
        const originalQuickPick = windowAny.showQuickPick;

        windowAny.showInformationMessage = async (message: unknown) => {
            if (typeof message === 'string' && message.includes('Promote it to a git-backed source?')) {
                return 'Promote';
            }
            return undefined;
        };

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const candidates = items as Array<{ remote?: { name: string; url: string } }>;
            return candidates.find(candidate => candidate.remote?.name === 'upstream');
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; url?: string }>;
            };
            const repo = updatedConfig.metadataRepos?.find(candidate => candidate.id === 'local-multi');
            assert.strictEqual(
                repo?.url,
                'https://example.com/meta-upstream.git',
                'Promotion should persist the user-selected remote URL when multiple remotes exist'
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            windowAny.showQuickPick = originalQuickPick;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            fs.rmSync(repoPath, { recursive: true, force: true });
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates silent mode returns no-git-repos outcome when no git-backed sources exist', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const localOnlyConfig = {
            metadataRepos: [
                { id: 'local', localPath: '.ai/ai-metadata', enabled: true },
            ],
            layerSources: [
                { repoId: 'local', path: '.', enabled: true },
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
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            const outcome = await vscode.commands.executeCommand('metaflow.checkRepoUpdates', { silent: true }) as { executed?: boolean; reason?: string };

            assert.strictEqual(outcome.executed, false, 'Expected silent check to report skipped execution');
            assert.strictEqual(outcome.reason, 'no-git-repos', 'Expected no-git-repos outcome reason');
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('checkRepoUpdates silent mode returns no-config outcome when config is absent', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const backupConfigPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc.bak.no-config-outcome');
        assert.ok(fs.existsSync(configPath), 'Expected fixture config to exist before test');

        fs.renameSync(configPath, backupConfigPath);

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            const outcome = await vscode.commands.executeCommand('metaflow.checkRepoUpdates', { silent: true }) as { executed?: boolean; reason?: string };

            assert.strictEqual(outcome.executed, false, 'Expected silent check to report skipped execution');
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
            const outcome = await vscode.commands.executeCommand('metaflow.checkRepoUpdates', {
                repoId: 'repo-that-does-not-exist',
                silent: true,
            }) as { executed?: boolean; reason?: string };

            assert.strictEqual(outcome.executed, false, 'Expected silent check to report skipped execution');
            assert.strictEqual(outcome.reason, 'repo-not-found', 'Expected repo-not-found outcome reason');
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
            metadataRepos: [
                { id: 'local', localPath: '.ai/ai-metadata', enabled: true },
            ],
            layerSources: [
                { repoId: 'local', path: '.', enabled: true },
            ],
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
                task: (...args: unknown[]) => Thenable<T> | Promise<T> | T
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

            assert.strictEqual(withProgressCallCount, 0, 'silent checks should not invoke notification progress UI');
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
            await vscode.commands.executeCommand('metaflow.pullRepository', { repoId: 'missing-repo-id' });
            assert.ok(
                warningMessages.some(message => message.includes('not git-backed or not found')),
                'pullRepository should warn when a non-git or unknown repo is requested'
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
                infoMessages.some(message => message.includes('No drifted files detected')),
                'Promote should explicitly report when no drift is detected'
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
        }
    });

    test('initMetaFlowAiMetadata materialize mode overwrites managed files', async function () {
        this.timeout(20000);

        const instructionPath = path.join(workspaceRoot, '.github', 'instructions', 'metaflow-constructs.instructions.md');
        const originalInstruction = fs.existsSync(instructionPath)
            ? fs.readFileSync(instructionPath, 'utf-8')
            : undefined;

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        windowAny.showQuickPick = async (items: unknown) => {
            const picks = items as Array<{ mode?: string }>;
            return picks.find(pick => pick.mode === 'materialize') ?? picks[0];
        };

        if (fs.existsSync(instructionPath)) {
            fs.rmSync(instructionPath, { force: true });
        }

        try {
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');
            assert.ok(fs.existsSync(instructionPath), 'Starter metadata command should scaffold instruction templates');

            fs.writeFileSync(instructionPath, '# local customization\n', 'utf-8');
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');

            const after = fs.readFileSync(instructionPath, 'utf-8');
            assert.ok(!after.includes('# local customization'), 'Materialize mode should overwrite managed files deterministically');
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            if (originalInstruction === undefined) {
                fs.rmSync(instructionPath, { force: true });
            } else {
                fs.writeFileSync(instructionPath, originalInstruction, 'utf-8');
            }
        }
    });

    test('initMetaFlowAiMetadata built-in mode leaves config unchanged and remove disables built-in mode', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
        };
        const originalQuickPick = windowAny.showQuickPick;

        let builtInEnabledPickCount = 0;
        windowAny.showQuickPick = async (items: unknown) => {
            const picks = items as Array<{ mode?: string }>;
            if (picks.some(pick => pick.mode === 'builtin')) {
                builtInEnabledPickCount += 1;
                return picks.find(pick => pick.mode === 'builtin') ?? picks[0];
            }
            if (picks.some(pick => pick.mode === 'disableBuiltin')) {
                return picks.find(pick => pick.mode === 'disableBuiltin') ?? picks[0];
            }
            return picks[0];
        };

        try {
            await vscode.commands.executeCommand('metaflow.initMetaFlowAiMetadata');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterInitConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(afterInitConfig, originalConfig, 'Built-in mode should not mutate .metaflow/config.jsonc');

            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterRemoveConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(afterRemoveConfig, originalConfig, 'Removing built-in mode should not mutate .metaflow/config.jsonc');
            assert.ok(builtInEnabledPickCount > 0, 'Test should exercise built-in initialization mode');
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

});
