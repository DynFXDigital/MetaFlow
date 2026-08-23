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
import { BUILT_IN_CAPABILITY_REPO_ID } from '../../builtInCapability';

const INTEGRATION_STARTUP_TIMEOUT_MS = 90000;
const COMPLEX_COMMAND_TEST_TIMEOUT_MS = process.env.CI ? 60000 : 30000;
const DEFAULT_WAIT_FOR_TIMEOUT_MS = process.env.CI ? 30000 : 10000;

suite('Command Execution', function () {
    this.timeout(COMPLEX_COMMAND_TEST_TIMEOUT_MS);

    let workspaceRoot: string;
    let originalWorkspaceConfig = '';

    function getWorkspaceConfigPath(): string {
        return path.join(workspaceRoot, '.metaflow', 'config.jsonc');
    }

    function restoreWorkspaceConfig(): void {
        const configPath = getWorkspaceConfigPath();
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, originalWorkspaceConfig, 'utf-8');
    }

    function removeKnownCommandTestArtifacts(): void {
        const tempRoots = fs
            .readdirSync(workspaceRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('.tmp-'));

        for (const entry of tempRoots) {
            removeDirectoryRecursive(path.join(workspaceRoot, entry.name));
        }

        removeDirectoryRecursive(path.join(workspaceRoot, '.ai', 'manifest-open-repo'));
        removeDirectoryRecursive(path.join(workspaceRoot, '.github', 'skills', 'naming-strategy'));
    }

    async function restoreCommandTestWorkspace(): Promise<void> {
        restoreWorkspaceConfig();
        removeKnownCommandTestArtifacts();
        await vscode.commands.executeCommand('metaflow.refresh');
    }

    async function waitFor(
        predicate: () => boolean | Promise<boolean>,
        timeoutMs = DEFAULT_WAIT_FOR_TIMEOUT_MS,
        intervalMs = 100,
        getState?: () => unknown,
    ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await predicate()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        let state = 'unavailable';
        if (getState) {
            try {
                state = JSON.stringify(getState()) ?? 'undefined';
            } catch {
                state = 'unserializable';
            }
        }
        assert.fail(
            `Condition not met within ${timeoutMs}ms (predicate=${predicate.name || 'anonymous'}; state=${state})`,
        );
    }

    function summarizeCapabilityDetailsHtml(html: string | undefined): string {
        if (!html) {
            return 'no html';
        }

        const status = html.match(/<span class="status-pill[^"]*">[^<]+/)?.[0] ?? 'no status pill';
        const action = html.match(/>Enable<\/a>|>Disable<\/a>/)?.[0] ?? 'no toggle action';
        return `${status}; ${action}`;
    }

    async function updateConfigAndWait(
        section: string,
        value: unknown,
        target: vscode.ConfigurationTarget,
        wsFolder?: vscode.WorkspaceFolder,
    ): Promise<void> {
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder?.uri);
        await wsConfig.update(section, value, target);
        // In a clean Extension Host sandbox, configuration writes may not
        // propagate synchronously.  Poll until a fresh getConfiguration()
        // read returns the expected value.
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const fresh = vscode.workspace.getConfiguration(undefined, wsFolder?.uri);
            const inspected = fresh.inspect(section);
            const scoped =
                target === vscode.ConfigurationTarget.Workspace
                    ? inspected?.workspaceValue
                    : target === vscode.ConfigurationTarget.WorkspaceFolder
                      ? inspected?.workspaceFolderValue
                      : inspected?.globalValue;
            if (JSON.stringify(scoped) === JSON.stringify(value)) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const inspected = vscode.workspace
            .getConfiguration(undefined, wsFolder?.uri)
            .inspect(section);
        const scoped =
            target === vscode.ConfigurationTarget.Workspace
                ? inspected?.workspaceValue
                : target === vscode.ConfigurationTarget.WorkspaceFolder
                  ? inspected?.workspaceFolderValue
                  : inspected?.globalValue;
        assert.deepStrictEqual(
            scoped,
            value,
            `Timed out persisting ${section} to VS Code configuration target ${target}`,
        );
    }

    function getScopedSettingValue<T>(
        wsConfig: vscode.WorkspaceConfiguration,
        section: string,
    ): T | undefined {
        const inspected = wsConfig.inspect<T>(section);
        return (inspected?.workspaceValue ?? inspected?.workspaceFolderValue) as T | undefined;
    }

    function cloneJson<T>(value: T): T {
        if (value === undefined) {
            return value;
        }

        return JSON.parse(JSON.stringify(value)) as T;
    }

    function isIgnorableCleanupError(error: unknown): boolean {
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        return code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'ENOENT';
    }

    function chmodRecursive(targetPath: string): void {
        try {
            if (!fs.existsSync(targetPath)) {
                return;
            }

            const stat = fs.lstatSync(targetPath);
            if (stat.isDirectory()) {
                for (const entry of fs.readdirSync(targetPath)) {
                    chmodRecursive(path.join(targetPath, entry));
                }
            }

            fs.chmodSync(targetPath, 0o777);
        } catch {
            // Best-effort cleanup support for transient Windows file locks.
        }
    }

    function removeDirectoryRecursive(targetPath: string): void {
        if (!fs.existsSync(targetPath)) {
            return;
        }

        const remove = (pathToRemove: string) => {
            chmodRecursive(pathToRemove);
            fs.rmSync(pathToRemove, {
                recursive: true,
                force: true,
                maxRetries: 60,
                retryDelay: 250,
            });
        };

        try {
            remove(targetPath);
        } catch (error: unknown) {
            if (!isIgnorableCleanupError(error)) {
                throw error;
            }

            const movedPath = `${targetPath}.stale-${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}`;
            try {
                fs.renameSync(targetPath, movedPath);
            } catch (renameError: unknown) {
                if (!isIgnorableCleanupError(renameError)) {
                    throw renameError;
                }
                return;
            }
            try {
                remove(movedPath);
            } catch (secondError: unknown) {
                if (!isIgnorableCleanupError(secondError)) {
                    throw secondError;
                }
            }
        }
    }

    function getInjectedLocationValue<T>(
        inspection: { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined,
    ): T | undefined {
        return (
            inspection?.workspaceValue ??
            inspection?.workspaceFolderValue ??
            inspection?.globalValue
        );
    }

    function createSettingsBackedWorkspaceConfig() {
        return {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            profiles: {
                default: {
                    enabledCapabilities: ['primary:company/core', 'primary:standards/sdlc'],
                },
                lean: {
                    enabledCapabilities: ['primary:company/core', 'primary:standards/sdlc'],
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

    function createPluginBackedWorkspaceConfig(repoLocalPath: string, capabilityPath: string) {
        return {
            compatibilityVersion: 2,
            metadataRepos: [
                {
                    id: 'plugin-enable',
                    localPath: repoLocalPath,
                    enabled: true,
                    capabilities: [
                        {
                            path: capabilityPath,
                            enabled: true,
                        },
                    ],
                },
            ],
            profiles: {
                default: {
                    enabledCapabilities: [`plugin-enable:${capabilityPath}`],
                },
            },
            activeProfile: 'default',
            injection: {
                instructions: 'plugin',
                prompts: 'settings',
                skills: 'plugin',
                agents: 'plugin',
                hooks: 'settings',
            },
        };
    }

    function hasBuiltInInstructionPath(
        locations: Record<string, boolean> | string[] | undefined,
    ): boolean {
        return hasBundledMetaFlowPath(locations, '/.github/instructions');
    }

    function hasBundledMetaFlowPath(
        locations: Record<string, boolean> | string[] | undefined,
        suffix?: string,
    ): boolean {
        if (!locations) {
            return false;
        }

        const candidates = Array.isArray(locations) ? locations : Object.keys(locations);
        return candidates.some((location) => {
            const normalized = location.replace(/\\/g, '/').toLowerCase();
            const bundledRootMarker =
                '/globalstorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata';
            const markerIndex = normalized.indexOf(bundledRootMarker);
            const markerEnd = markerIndex + bundledRootMarker.length;
            const nextCharacter = markerIndex >= 0 ? normalized[markerEnd] : undefined;
            return (
                markerIndex >= 0 &&
                (nextCharacter === undefined || nextCharacter === '/' || nextCharacter === '-') &&
                (!suffix || normalized.endsWith(suffix))
            );
        });
    }

    function hasExtensionInstallInstructionPath(
        locations: Record<string, boolean> | string[] | undefined,
    ): boolean {
        if (!locations) {
            return false;
        }

        const candidates = Array.isArray(locations) ? locations : Object.keys(locations);
        return candidates.some((location) => {
            const normalized = location.replace(/\\/g, '/').toLowerCase();
            return (
                normalized.includes('/extensions/dynfxdigital.metaflow-ai-') &&
                normalized.includes('assets/metaflow-ai-metadata/.github/instructions')
            );
        });
    }

    function getBuiltInInstructionSettingsPresence(wsConfig: vscode.WorkspaceConfiguration): {
        hasBuiltIn: boolean;
        hasExtensionInstall: boolean;
    } {
        const instructionLocations = getInjectedLocationValue(
            wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
        );

        return {
            hasBuiltIn: hasBuiltInInstructionPath(instructionLocations),
            hasExtensionInstall: hasExtensionInstallInstructionPath(instructionLocations),
        };
    }

    interface InstructionSettingsSnapshot {
        instructionLocations?: Record<string, boolean>;
    }

    function getInstructionSettingsSnapshot(
        wsConfig: vscode.WorkspaceConfiguration,
    ): InstructionSettingsSnapshot {
        return {
            instructionLocations: cloneJson(
                getScopedSettingValue<Record<string, boolean>>(
                    wsConfig,
                    'chat.instructionsFilesLocations',
                ),
            ),
        };
    }

    function snapshotHasBuiltInInstructions(snapshot: InstructionSettingsSnapshot): boolean {
        return hasBuiltInInstructionPath(snapshot.instructionLocations);
    }

    function getUnmanagedInstructionLocationKeys(snapshot: InstructionSettingsSnapshot): string[] {
        return Object.keys(snapshot.instructionLocations ?? {}).filter(
            (location) => !hasBuiltInInstructionPath([location]),
        );
    }

    function getWorkspaceInjectionModes(
        wsConfig: vscode.WorkspaceConfiguration,
    ): Record<string, unknown> | undefined {
        return cloneJson(
            wsConfig.inspect<Record<string, unknown>>('metaflow.injection.modes')?.workspaceValue,
        );
    }

    async function useSettingsBackedInstructions(
        wsFolder: vscode.WorkspaceFolder,
    ): Promise<Record<string, unknown> | undefined> {
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder.uri);
        const previousModes = getWorkspaceInjectionModes(wsConfig);
        await updateConfigAndWait(
            'metaflow.injection.modes',
            { ...(previousModes ?? {}), instructions: 'settings' },
            vscode.ConfigurationTarget.Workspace,
            wsFolder,
        );
        await waitFor(
            () => {
                try {
                    const config = JSON.parse(
                        fs.readFileSync(getWorkspaceConfigPath(), 'utf-8'),
                    ) as {
                        injection?: { instructions?: unknown };
                    };
                    return config.injection?.instructions === 'settings';
                } catch {
                    return false;
                }
            },
            DEFAULT_WAIT_FOR_TIMEOUT_MS,
            100,
        );
        return previousModes;
    }

    async function restoreInjectionModes(
        wsFolder: vscode.WorkspaceFolder,
        previousModes: Record<string, unknown> | undefined,
    ): Promise<void> {
        await updateConfigAndWait(
            'metaflow.injection.modes',
            previousModes,
            vscode.ConfigurationTarget.Workspace,
            wsFolder,
        );
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
        this.timeout(INTEGRATION_STARTUP_TIMEOUT_MS);

        // Ensure extension is active
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');
        workspaceRoot = ws.uri.fsPath;
        originalWorkspaceConfig = fs.readFileSync(getWorkspaceConfigPath(), 'utf-8');
    });

    teardown(async function () {
        this.timeout(COMPLEX_COMMAND_TEST_TIMEOUT_MS);
        await restoreCommandTestWorkspace();
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
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
            injection: {
                instructions: 'settings',
            },
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

    test('apply honors original-unless-conflict except for prefixed chatmodes outputs', async function () {
        this.timeout(COMPLEX_COMMAND_TEST_TIMEOUT_MS);

        await resetBuiltInCapabilityState();

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'sync-naming-repo');
        const nestedSkillDir = path.join(repoRoot, 'core', 'skills', 'naming-strategy', 'nested');
        const layerChatmodesDir = path.join(repoRoot, 'core', '.github', 'chatmodes');
        const originalSkillPath = path.join(
            workspaceRoot,
            '.github',
            'skills',
            'naming-strategy',
            'nested',
            'guide.md',
        );
        const prefixedChatmodePath = path.join(
            workspaceRoot,
            '.github',
            'chatmodes',
            '_default-core__sync-naming-legacy.chatmode.md',
        );
        const unprefixedChatmodePath = path.join(
            workspaceRoot,
            '.github',
            'chatmodes',
            'sync-naming-legacy.chatmode.md',
        );

        removeDirectoryRecursive(repoRoot);
        removeDirectoryRecursive(path.join(workspaceRoot, '.github', 'skills', 'naming-strategy'));
        fs.rmSync(prefixedChatmodePath, { force: true });
        fs.rmSync(unprefixedChatmodePath, { force: true });

        fs.mkdirSync(nestedSkillDir, { recursive: true });
        fs.mkdirSync(layerChatmodesDir, { recursive: true });
        fs.writeFileSync(path.join(nestedSkillDir, 'guide.md'), '# Guide\n', 'utf-8');
        fs.writeFileSync(
            path.join(layerChatmodesDir, 'sync-naming-legacy.chatmode.md'),
            '# Legacy\n',
            'utf-8',
        );

        const namingStrategyConfig = {
            metadataRepo: {
                localPath: '.ai/sync-naming-repo',
            },
            layers: ['core'],
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
            injection: {
                skills: 'synchronize',
            },
            fileNamingStrategy: 'original-unless-conflict',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(namingStrategyConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            assert.ok(
                fs.existsSync(originalSkillPath),
                'Skills should preserve their original nested path under original-unless-conflict',
            );
            assert.ok(
                fs.existsSync(prefixedChatmodePath),
                'Deprecated chatmodes should remain on the prefixed synchronized path',
            );
            assert.ok(
                !fs.existsSync(unprefixedChatmodePath),
                'Deprecated chatmodes should not be written to the original relative path',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            removeDirectoryRecursive(
                path.join(workspaceRoot, '.github', 'skills', 'naming-strategy'),
            );
            fs.rmSync(prefixedChatmodePath, { force: true });
            fs.rmSync(unprefixedChatmodePath, { force: true });
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('apply suppresses completion toast when no Synchronized files are written', async function () {
        this.timeout(process.env.CI ? 45000 : 20000);

        await resetBuiltInCapabilityState();

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const metaflowConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const priorAutoApply = metaflowConfig.inspect<boolean>('autoApply')?.workspaceValue;
        const priorAiMetadataAutoApplyMode =
            metaflowConfig.inspect<boolean>('aiMetadataAutoApplyMode')?.workspaceValue;

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
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
            injection: {
                instructions: 'settings',
            },
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
            fs.writeFileSync(configPath, JSON.stringify(settingsOnlyConfig, null, 2), 'utf-8');
            await updateConfigAndWait(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder,
            );
            await metaflowConfig.update('autoApply', false, vscode.ConfigurationTarget.Workspace);
            await metaflowConfig.update(
                'aiMetadataAutoApplyMode',
                false,
                vscode.ConfigurationTarget.Workspace,
            );

            await vscode.commands.executeCommand('metaflow.refresh', { skipAutoApply: true });
            applyMessages.length = 0;
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            assert.strictEqual(
                applyMessages.length,
                0,
                'Apply should not show a completion toast when no Synchronized files are written',
            );

            await waitFor(() => {
                const freshConfig = vscode.workspace.getConfiguration(undefined, wsFolder.uri);
                const instructionLocations = getInjectedLocationValue(
                    freshConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
                );
                return !!instructionLocations && Object.keys(instructionLocations).length > 0;
            });

            const freshConfig = vscode.workspace.getConfiguration(undefined, wsFolder.uri);
            const instructionLocations = getInjectedLocationValue(
                freshConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
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

    test('refresh clears stale built-in instruction settings when no capabilities are effective', async function () {
        this.timeout(15000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const metaflowConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const disabledConfig = {
            compatibilityVersion: 2,
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    capabilities: [{ path: 'company/core', enabled: false }],
                },
            ],
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

        await metaflowConfig.update('autoApply', false, vscode.ConfigurationTarget.Workspace);
        await metaflowConfig.update(
            'aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
        );
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            {
                '../../AppData/Roaming/Code/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/instructions': true,
            },
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await resetBuiltInCapabilityState();
            fs.writeFileSync(configPath, JSON.stringify(disabledConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );

            assert.ok(
                !hasBuiltInInstructionPath(instructionLocations),
                'Refresh should clear stale built-in instruction paths when no capabilities are effective',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await metaflowConfig.update(
                'autoApply',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            await metaflowConfig.update(
                'aiMetadataAutoApplyMode',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
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
                compatibilityVersion?: number;
                metadataRepos?: Array<{ id: string; capabilities?: Array<{ path: string }> }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(migratedConfig.compatibilityVersion, 5);
            assert.ok(
                migratedConfig.metadataRepos?.length,
                'Legacy config should be migrated to metadataRepos',
            );
            assert.strictEqual(migratedConfig.metadataRepos?.[0]?.capabilities, undefined);
            assert.deepStrictEqual(
                migratedConfig.profiles?.default?.enabledCapabilities,
                ['primary:company/core', 'primary:standards/sdlc'],
                'Migrated config should persist selected capability references',
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

    test('refresh rewrites modern released config with compatibilityVersion and generic migration notice', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

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

        const unversionedModernConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    name: 'Primary',
                },
            ],
            profiles: {
                default: {
                    enabledCapabilities: ['primary:company/core'],
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

        await wsConfig.update('metaflow.autoApply', false, vscode.ConfigurationTarget.Workspace);

        try {
            fs.writeFileSync(configPath, JSON.stringify(unversionedModernConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            await waitFor(() => {
                const migratedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    compatibilityVersion?: number;
                };
                return migratedConfig.compatibilityVersion === 5;
            }, 10000);

            const migratedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                compatibilityVersion?: number;
                metadataRepos?: Array<{ capabilities?: Array<{ path: string }> }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(
                migratedConfig.compatibilityVersion,
                5,
                'Refresh should persist the current compatibilityVersion for released configs',
            );
            assert.strictEqual(migratedConfig.metadataRepos?.[0]?.capabilities, undefined);
            assert.deepStrictEqual(migratedConfig.profiles?.default?.enabledCapabilities, [
                'primary:company/core',
            ]);
            assert.ok(
                infoMessages.includes(
                    'MetaFlow: Configuration was automatically migrated. Check the output channel for details.',
                ),
                'Refresh should surface a generic migration notice for release-aware config upgrades',
            );
            assert.ok(
                !infoMessages.some((message) => message.includes('metadataRepos[*].capabilities')),
                'Release-aware migration notice should not claim a legacy metadataRepos[*].capabilities rewrite',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
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

    test('refresh always injects hook settings', async function () {
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
            assert.ok(hookLocations && Object.keys(hookLocations).length > 0);
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
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

    test('apply manages one non-built-in plugin capability without retaining disabled built-in registrations', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const repoRoot = path.join(workspaceRoot, '.tmp-plugin-enable-repo');
        const capabilityPath = 'capabilities/plugin-smoke';
        const capabilityRoot = path.join(repoRoot, 'capabilities', 'plugin-smoke');
        const copilotSettingsPath = path.join(
            workspaceRoot,
            '.github',
            'copilot',
            'settings.local.json',
        );
        const originalCopilotSettings = fs.existsSync(copilotSettingsPath)
            ? fs.readFileSync(copilotSettingsPath, 'utf-8')
            : undefined;
        const staleBundledPluginUri = vscode.Uri.file(
            path.join(
                workspaceRoot,
                '..',
                '..',
                '..',
                'AppData',
                'Roaming',
                'Code - Insiders',
                'User',
                'globalStorage',
                'dynfxdigital.metaflow-ai',
                'bundled-metadata',
                'metaflow-ai-metadata',
            ),
        ).toString();
        const unrelatedPluginUri = 'file:///unrelated-plugin-root';

        removeDirectoryRecursive(repoRoot);
        fs.mkdirSync(path.join(capabilityRoot, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(capabilityRoot, 'CAPABILITY.md'),
            [
                '---',
                'name: Plugin Smoke',
                'description: Plugin-backed capability for enablement testing.',
                'agentPlugin: true',
                '---',
            ].join('\n'),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(capabilityRoot, 'plugin.json'),
            JSON.stringify(
                {
                    name: 'plugin-smoke',
                    version: '0.1.0',
                    description: 'Plugin enablement smoke test.',
                    rules: '.github/instructions',
                    metaflow: {
                        pluginHosts: ['github-copilot'],
                        minimumMetaflowVersion: '^0.1.0-preview.0',
                    },
                },
                null,
                2,
            ) + '\n',
            'utf-8',
        );
        fs.writeFileSync(
            path.join(capabilityRoot, '.github', 'instructions', 'plugin-smoke.instructions.md'),
            '# Plugin Smoke\n',
            'utf-8',
        );

        fs.mkdirSync(path.dirname(copilotSettingsPath), { recursive: true });
        fs.writeFileSync(
            copilotSettingsPath,
            JSON.stringify(
                {
                    enabledPlugins: {
                        [unrelatedPluginUri]: true,
                        [staleBundledPluginUri]: true,
                    },
                    extraKnownMarketplaces: {
                        sample: {
                            source: 'github',
                            repo: 'owner/repo',
                        },
                    },
                },
                null,
                2,
            ) + '\n',
            'utf-8',
        );

        const expectedPluginUri = vscode.Uri.file(capabilityRoot).toString();

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;

        try {
            fs.writeFileSync(
                configPath,
                JSON.stringify(
                    createPluginBackedWorkspaceConfig('.tmp-plugin-enable-repo', capabilityPath),
                    null,
                    2,
                ),
                'utf-8',
            );
            await resetBuiltInCapabilityState();
            await vscode.workspace
                .getConfiguration('metaflow', vscode.workspace.workspaceFolders?.[0]?.uri)
                .update('aiMetadataAutoApplyMode', false, vscode.ConfigurationTarget.Workspace);
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                {
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/instructions': true,
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/instructions': true,
                },
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.agentFilesLocations',
                {
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/agents': true,
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/agents': true,
                },
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.agentSkillsLocations',
                {
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/skills': true,
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/skills': true,
                },
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.promptFilesLocations',
                {
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/.github/prompts': true,
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata/capabilities/metadata-authoring/github-copilot-metadata-authoring/.github/prompts': true,
                },
                vscode.ConfigurationTarget.Workspace,
            );
            await wsConfig.update(
                'chat.pluginLocations',
                {
                    '../../AppData/Roaming/Code - Insiders/User/globalStorage/dynfxdigital.metaflow-ai/bundled-metadata/metaflow-ai-metadata': true,
                },
                vscode.ConfigurationTarget.Global,
            );

            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply');

            const instructionLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
            );
            const agentLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.agentFilesLocations'),
            );
            const skillLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.agentSkillsLocations'),
            );
            const promptLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.promptFilesLocations'),
            );
            const pluginLocations = getInjectedLocationValue(
                wsConfig.inspect<Record<string, boolean>>('chat.pluginLocations'),
            );

            assert.ok(
                !hasBundledMetaFlowPath(instructionLocations, '/.github/instructions'),
                'Non-built-in plugin enablement should prune disabled built-in instruction locations',
            );
            assert.ok(
                !hasBundledMetaFlowPath(agentLocations, '/.github/agents'),
                'Non-built-in plugin enablement should prune disabled built-in agent locations',
            );
            assert.ok(
                !hasBundledMetaFlowPath(skillLocations, '/.github/skills'),
                'Non-built-in plugin enablement should prune disabled built-in skill locations',
            );
            assert.ok(
                !hasBundledMetaFlowPath(promptLocations, '/.github/prompts'),
                'Non-built-in plugin enablement should prune disabled built-in prompt locations',
            );
            assert.ok(
                !hasBundledMetaFlowPath(pluginLocations),
                'Non-built-in plugin enablement should prune disabled built-in plugin locations',
            );
            const expectedPluginLocation = path
                .relative(workspaceRoot, capabilityRoot)
                .replace(/\\/g, '/');
            assert.strictEqual(pluginLocations?.[expectedPluginLocation], true);

            const appliedSettings = JSON.parse(fs.readFileSync(copilotSettingsPath, 'utf-8')) as {
                enabledPlugins?: Record<string, boolean>;
                extraKnownMarketplaces?: Record<string, unknown>;
            };

            assert.strictEqual(appliedSettings.enabledPlugins?.[unrelatedPluginUri], true);
            assert.strictEqual(appliedSettings.enabledPlugins?.[expectedPluginUri], true);
            assert.strictEqual(appliedSettings.enabledPlugins?.[staleBundledPluginUri], undefined);
            assert.ok(appliedSettings.extraKnownMarketplaces?.sample);

            windowAny.showWarningMessage = async () => 'Remove';
            await vscode.commands.executeCommand('metaflow.clean');

            const cleanedSettings = JSON.parse(fs.readFileSync(copilotSettingsPath, 'utf-8')) as {
                enabledPlugins?: Record<string, boolean>;
                extraKnownMarketplaces?: Record<string, unknown>;
            };

            assert.strictEqual(cleanedSettings.enabledPlugins?.[expectedPluginUri], undefined);
            assert.strictEqual(cleanedSettings.enabledPlugins?.[unrelatedPluginUri], true);
            assert.strictEqual(cleanedSettings.enabledPlugins?.[staleBundledPluginUri], undefined);
            assert.ok(cleanedSettings.extraKnownMarketplaces?.sample);
        } finally {
            windowAny.showWarningMessage = originalWarning;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.workspace
                .getConfiguration('metaflow', vscode.workspace.workspaceFolders?.[0]?.uri)
                .update('aiMetadataAutoApplyMode', undefined, vscode.ConfigurationTarget.Workspace);
            if (originalCopilotSettings !== undefined) {
                fs.mkdirSync(path.dirname(copilotSettingsPath), { recursive: true });
                fs.writeFileSync(copilotSettingsPath, originalCopilotSettings, 'utf-8');
            } else if (fs.existsSync(copilotSettingsPath)) {
                fs.unlinkSync(copilotSettingsPath);
            }
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('status logs key metrics to output channel', async function () {
        this.timeout(15000);

        const lines = (await vscode.commands.executeCommand('metaflow.status')) as
            string[] | undefined;
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

    test('status reports malformed README descriptor warning file path', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const capabilityConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };
        fs.writeFileSync(configPath, JSON.stringify(capabilityConfig, null, 2), 'utf-8');

        const descriptorPath = path.join(
            workspaceRoot,
            '.ai',
            'ai-metadata',
            'standards',
            'sdlc',
            'README.md',
        );

        const originalDescriptor = fs.readFileSync(descriptorPath, 'utf-8');

        try {
            fs.writeFileSync(
                descriptorPath,
                '---\nname: malformed\ndescription: missing closing delimiter\n',
                'utf-8',
            );

            await vscode.commands.executeCommand('metaflow.refresh');
            const lines = (await vscode.commands.executeCommand('metaflow.status')) as
                string[] | undefined;
            assert.ok(Array.isArray(lines), 'Status should return emitted log lines');

            const warningLine = lines.find((line) =>
                line.includes('README_DESCRIPTOR_FRONTMATTER_MALFORMED'),
            );
            assert.ok(
                warningLine,
                'Status should include README descriptor warning code for malformed README',
            );
            const normalizedWarningLine = warningLine?.replace(/\\/g, '/');
            assert.ok(
                normalizedWarningLine?.includes('standards/sdlc/README.md'),
                `Expected warning to include README descriptor path, got: ${warningLine}`,
            );
        } finally {
            fs.writeFileSync(descriptorPath, originalDescriptor, 'utf-8');
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('status reports missing metadata repo paths when effective files resolve empty', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const missingRepoConfig = {
            metadataRepos: [
                {
                    id: 'missing-meta',
                    localPath: '.ai/missing-mounted-metadata',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'missing-meta', path: '.', enabled: true }],
            profiles: {
                default: {
                    enable: ['**/*'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(missingRepoConfig, null, 2), 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            const lines = (await vscode.commands.executeCommand('metaflow.status')) as
                string[] | undefined;
            assert.ok(Array.isArray(lines), 'Status should return emitted log lines');

            const warningLine = lines.find((line) => line.includes('REPO_PATH_MISSING'));
            assert.ok(
                warningLine,
                'Status should include a warning when a configured metadata repo path is missing',
            );
            assert.ok(
                warningLine?.includes('.ai/missing-mounted-metadata'),
                `Expected missing repo warning to include configured localPath, got: ${warningLine}`,
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('top-level refresh exposes user-facing capability names for newly discovered capabilities', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const priorAutoApply = wsConfig.inspect<boolean>('metaflow.autoApply')?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        const repoRoot = path.join(workspaceRoot, '.ai', 'refresh-name-repo');
        const baseLayerRoot = path.join(repoRoot, 'base', 'chatmodes');
        const discoveredLayerRoot = path.join(repoRoot, 'named-capability');
        const discoveredChatmodesRoot = path.join(discoveredLayerRoot, 'chatmodes');
        fs.mkdirSync(baseLayerRoot, { recursive: true });
        fs.mkdirSync(discoveredChatmodesRoot, { recursive: true });
        fs.writeFileSync(path.join(baseLayerRoot, 'base.chatmode.md'), '# Base chatmode', 'utf-8');
        fs.writeFileSync(
            path.join(discoveredLayerRoot, 'CAPABILITY.md'),
            ['---', 'name: Named Capability', 'description: Friendly display name.', '---'].join(
                '\n',
            ),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(discoveredChatmodesRoot, 'named.chatmode.md'),
            '# Named chatmode',
            'utf-8',
        );

        const discoveryConfig = {
            metadataRepos: [
                {
                    id: 'refresh-name-repo',
                    localPath: '.ai/refresh-name-repo',
                },
            ],
            layerSources: [{ repoId: 'refresh-name-repo', path: 'base' }],
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

            const snapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'refresh-name-repo',
                    layerPath: 'named-capability',
                },
            )) as { title?: string; html?: string } | undefined;

            assert.ok(snapshot, 'Expected capability details snapshot for discovered capability');
            assert.strictEqual(snapshot?.title, 'Capability Details: Named Capability');
            assert.ok(
                snapshot?.html?.includes('Named Capability'),
                'Capability details HTML should use the user-facing name after top-level refresh',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await wsConfig.update(
                'metaflow.autoApply',
                priorAutoApply,
                vscode.ConfigurationTarget.Workspace,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0349: openCapabilityDetails renders governance notice in live runtime (Verifies: REQ-0311, REQ-0412)', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const governancePath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;

        const governedConfig = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata' }],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: false }],
            profiles: {
                default: {
                    enabledCapabilities: [],
                },
            },
            activeProfile: 'default',
        };
        const governanceContract = {
            severity: 'error',
            requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(governedConfig, null, 2), 'utf-8');
            fs.writeFileSync(governancePath, JSON.stringify(governanceContract, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const snapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'primary',
                    layerPath: 'standards/sdlc',
                },
            )) as { title?: string; html?: string } | undefined;

            assert.ok(snapshot, 'Expected capability details snapshot for governed capability');
            assert.ok(snapshot?.html?.includes('<h2>Governance</h2>'));
            assert.ok(snapshot?.html?.includes('governance-notice-error'));
            assert.ok(snapshot?.html?.includes('Governance: non-compliant (severity: error)'));
            assert.ok(snapshot?.html?.includes('Governance Rule: required capability'));
            assert.ok(snapshot?.html?.includes('Governance Violations: 1'));
            assert.ok(
                snapshot?.html?.includes(
                    '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc]',
                ),
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });

    test('openCapabilityDetails renders experimental status in live runtime', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const repoRoot = path.join(workspaceRoot, '.ai', 'experimental-details-repo');
        const layerRoot = path.join(repoRoot, 'review', 'experimental-capability');
        removeDirectoryRecursive(repoRoot);
        fs.mkdirSync(layerRoot, { recursive: true });
        fs.writeFileSync(
            path.join(layerRoot, 'CAPABILITY.md'),
            [
                '---',
                'name: Experimental Capability',
                'description: Preview metadata experience.',
                'experimental: true',
                '---',
                '',
                '# Experimental Capability',
            ].join('\n'),
            'utf-8',
        );

        const config = {
            metadataRepos: [
                {
                    id: 'experimental-details',
                    localPath: '.ai/experimental-details-repo',
                    enabled: true,
                },
            ],
            layerSources: [
                {
                    repoId: 'experimental-details',
                    path: 'review/experimental-capability',
                },
            ],
            profiles: {
                default: {
                    enabledCapabilities: ['experimental-details:review/experimental-capability'],
                },
            },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const snapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'experimental-details',
                    layerPath: 'review/experimental-capability',
                },
            )) as { html?: string } | undefined;

            assert.ok(snapshot?.html?.includes('status-pill-warning">Experimental'));
            assert.ok(snapshot?.html?.includes('Experimental Capability'));
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
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

    test('openCapabilityDetails refreshes enable state after details toggle', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const governancePath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const config = {
            metadataRepos: [{ id: 'details-toggle', localPath: '.ai/ai-metadata' }],
            layerSources: [{ repoId: 'details-toggle', path: 'standards/sdlc', enabled: false }],
            profiles: {
                default: {
                    enabledCapabilities: [],
                },
            },
            activeProfile: 'default',
        };
        const originalGovernance = fs.readFileSync(governancePath, 'utf-8');

        try {
            fs.writeFileSync(
                governancePath,
                JSON.stringify({ severity: 'error', allowedProfiles: ['default'] }, null, 2),
                'utf-8',
            );
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await vscode.commands.executeCommand('metaflow.refresh');

            const initialSnapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'details-toggle',
                    layerPath: 'standards/sdlc',
                },
            )) as { html?: string } | undefined;

            assert.ok(
                initialSnapshot?.html?.includes(
                    '<span class="status-pill status-pill-disabled">Disabled',
                ),
            );
            assert.ok(initialSnapshot?.html?.includes('>Enable</a>'));
            assert.ok(
                initialSnapshot?.html?.includes(
                    'Excluded from the active MetaFlow capability set.',
                ),
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                repoId: 'details-toggle',
                layerPath: 'standards/sdlc',
                checked: true,
            });

            const enabledSnapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'details-toggle',
                    layerPath: 'standards/sdlc',
                },
            )) as { html?: string } | undefined;

            assert.ok(
                enabledSnapshot?.html?.includes(
                    '<span class="status-pill status-pill-enabled">Enabled',
                ),
                `Expected enabled status pill, got: ${summarizeCapabilityDetailsHtml(enabledSnapshot?.html)}`,
            );
            assert.ok(
                enabledSnapshot?.html?.includes('>Disable</a>'),
                `Expected Disable action, got: ${summarizeCapabilityDetailsHtml(enabledSnapshot?.html)}`,
            );
            assert.ok(
                enabledSnapshot?.html?.includes('Included in the active MetaFlow capability set.'),
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                repoId: 'details-toggle',
                layerPath: 'standards/sdlc',
                checked: false,
            });

            const disabledSnapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'details-toggle',
                    layerPath: 'standards/sdlc',
                },
            )) as { html?: string } | undefined;

            assert.ok(
                disabledSnapshot?.html?.includes(
                    '<span class="status-pill status-pill-disabled">Disabled',
                ),
            );
            assert.ok(disabledSnapshot?.html?.includes('>Enable</a>'));
            assert.ok(
                disabledSnapshot?.html?.includes(
                    'Excluded from the active MetaFlow capability set.',
                ),
            );
        } finally {
            fs.writeFileSync(governancePath, originalGovernance, 'utf-8');
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });

    test('openCapabilityDescriptor opens the selected README descriptor and reports duplicates', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const repoRoot = path.join(workspaceRoot, '.ai', 'manifest-open-repo');
        const layerRoot = path.join(repoRoot, 'review', 'capability-open');
        fs.mkdirSync(layerRoot, { recursive: true });
        fs.writeFileSync(
            path.join(layerRoot, 'README.md'),
            [
                '---',
                'name: Capability Open',
                'description: Open raw manifest.',
                '---',
                '',
                '# Capability Open',
            ].join('\n'),
            'utf-8',
        );
        fs.writeFileSync(
            path.join(layerRoot, 'CAPABILITY.md'),
            [
                '---',
                'name: Legacy Capability Open',
                'description: Legacy fallback descriptor.',
                '---',
                '',
                '# Legacy Capability Open',
            ].join('\n'),
            'utf-8',
        );

        const config = {
            metadataRepos: [
                { id: 'manifest-open', localPath: '.ai/manifest-open-repo', enabled: true },
            ],
            layerSources: [
                { repoId: 'manifest-open', path: 'review/capability-open', enabled: true },
            ],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const snapshot = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDetails',
                {
                    repoId: 'manifest-open',
                    layerPath: 'review/capability-open',
                },
            )) as { html?: string } | undefined;

            assert.ok(
                snapshot?.html?.includes('Open README.md'),
                'details view should render the open-manifest action',
            );
            assert.ok(
                snapshot?.html?.includes('command:metaflow.openCapabilityDescriptor?'),
                'details view should expose the open-manifest command uri',
            );
            assert.ok(
                snapshot?.html?.includes('CAPABILITY_DESCRIPTOR_DUPLICATE'),
                'details view should expose the duplicate descriptor warning',
            );

            const openedPath = (await vscode.commands.executeCommand(
                'metaflow.openCapabilityDescriptor',
                {
                    descriptorPath: path.join(layerRoot, 'README.md'),
                },
            )) as string | undefined;

            assert.strictEqual(openedPath, path.join(layerRoot, 'README.md'));
            assert.ok(
                vscode.window.activeTextEditor,
                'opening the manifest should reveal a text editor',
            );
            assert.strictEqual(
                path.normalize(vscode.window.activeTextEditor!.document.uri.fsPath),
                path.normalize(path.join(layerRoot, 'README.md')),
                'openCapabilityDescriptor should open the selected README descriptor',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });

    test('openWarningSource opens the backing warning source file and copyWarningMessage copies full text', async function () {
        this.timeout(15000);

        const warningRoot = path.join(workspaceRoot, '.tmp-warning-source-command');
        const sourcePath = path.join(
            warningRoot,
            'capabilities',
            'sample',
            '.github',
            'agents',
            'plugin.json',
        );
        const warningMessage = `[CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID] Sample warning [${sourcePath.replace(/\\/g, '/')}]`;

        removeDirectoryRecursive(warningRoot);
        fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
        fs.writeFileSync(sourcePath, '{"name":"sample"}\n', 'utf-8');

        try {
            const openedPath = (await vscode.commands.executeCommand('metaflow.openWarningSource', {
                sourcePath,
                sourceLine: 0,
                sourceColumn: 8,
                warningMessage,
            })) as string | undefined;

            assert.strictEqual(openedPath, sourcePath);
            assert.ok(
                vscode.window.activeTextEditor,
                'opening a warning source should reveal a text editor',
            );
            assert.strictEqual(
                path.normalize(vscode.window.activeTextEditor!.document.uri.fsPath),
                path.normalize(sourcePath),
                'openWarningSource should open the exact warning source file',
            );
            assert.strictEqual(vscode.window.activeTextEditor!.selection.active.line, 0);
            assert.strictEqual(vscode.window.activeTextEditor!.selection.active.character, 8);

            const copied = (await vscode.commands.executeCommand('metaflow.copyWarningMessage', {
                warningMessage,
            })) as string | undefined;

            assert.strictEqual(copied, warningMessage);
            assert.strictEqual(await vscode.env.clipboard.readText(), warningMessage);
        } finally {
            removeDirectoryRecursive(warningRoot);
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }
    });

    test('openWarningSource reveals backing warning directories in Explorer', async function () {
        this.timeout(15000);

        const warningRoot = path.join(workspaceRoot, '.tmp-warning-source-directory');
        const sourcePath = path.join(warningRoot, 'capabilities', 'sample');

        removeDirectoryRecursive(warningRoot);
        fs.mkdirSync(sourcePath, { recursive: true });

        const originalExecuteCommand = vscode.commands.executeCommand;
        const calls: Array<{ command: string; args: unknown[] }> = [];
        (
            vscode.commands as unknown as { executeCommand: typeof vscode.commands.executeCommand }
        ).executeCommand = (async (command: string, ...args: unknown[]) => {
            calls.push({ command, args });
            if (command === 'revealInExplorer') {
                return;
            }

            return originalExecuteCommand(command as never, ...(args as []));
        }) as typeof vscode.commands.executeCommand;

        try {
            const openedPath = (await vscode.commands.executeCommand('metaflow.openWarningSource', {
                sourcePath,
                sourceKind: 'directory',
                warningMessage: `[CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING] Missing capability manifest [${sourcePath.replace(/\\/g, '/')}]`,
            })) as string | undefined;

            assert.strictEqual(openedPath, sourcePath);
            assert.ok(
                calls.some(
                    (call) =>
                        call.command === 'revealInExplorer' &&
                        call.args[0] instanceof vscode.Uri &&
                        path.normalize((call.args[0] as vscode.Uri).fsPath) ===
                            path.normalize(sourcePath),
                ),
                'openWarningSource should reveal the exact warning directory in Explorer',
            );
        } finally {
            (
                vscode.commands as unknown as {
                    executeCommand: typeof vscode.commands.executeCommand;
                }
            ).executeCommand = originalExecuteCommand;
            removeDirectoryRecursive(warningRoot);
        }
    });

    test('createCapabilityManifest prompts for capability naming and creates a child directory under the selected parent', async function () {
        this.timeout(15000);

        await vscode.commands.executeCommand('workbench.action.closeAllEditors');

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const repoRoot = path.join(workspaceRoot, '.tmp-capability-create-context');
        const layerPath = 'capabilities/context-target';
        const layerRoot = path.join(repoRoot, 'capabilities', 'context-target');
        removeDirectoryRecursive(repoRoot);
        fs.mkdirSync(layerRoot, { recursive: true });

        const config = {
            metadataRepos: [
                {
                    id: 'context-repo',
                    localPath: '.tmp-capability-create-context',
                    enabled: true,
                },
            ],
            layerSources: [
                {
                    repoId: 'context-repo',
                    path: layerPath,
                    enabled: true,
                },
            ],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showInputBox: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalInputBox = windowAny.showInputBox;

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'suggested')) {
                return picks.find((pick) => pick.mode === 'suggested') ?? picks[0];
            }

            return picks[0];
        };

        windowAny.showOpenDialog = async () => undefined;

        let inputPromptCount = 0;
        windowAny.showInputBox = async () => {
            inputPromptCount += 1;
            if (inputPromptCount === 1) {
                return 'Context Capability';
            }
            if (inputPromptCount === 2) {
                return 'context-capability';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const result = (await vscode.commands.executeCommand(
                'metaflow.createCapabilityManifest',
                {
                    repoId: 'context-repo',
                    layerPath,
                },
            )) as
                | {
                      guidancePath?: string;
                      examplePath?: string;
                      draftUri?: string;
                      descriptorPath?: string;
                      manifestPath?: string;
                      pluginJsonPath?: string;
                      targetDirectory?: string;
                      capabilityDirectoryPath?: string;
                      capabilityGithubDirectoryPath?: string;
                      capabilityName?: string;
                      capabilityDirectoryName?: string;
                  }
                | undefined;

            assert.ok(
                result?.guidancePath,
                'guided create should return the bundled guidance path',
            );
            assert.ok(result?.examplePath, 'guided create should return the bundled example path');

            const expectedCapabilityDirectoryPath = path.join(layerRoot, 'context-capability');
            const expectedCapabilityGithubDirectoryPath = path.join(
                expectedCapabilityDirectoryPath,
                '.github',
            );
            const expectedDescriptorPath = path.join(expectedCapabilityDirectoryPath, 'README.md');
            assert.strictEqual(
                path.normalize(result?.descriptorPath ?? ''),
                path.normalize(expectedDescriptorPath),
                'guided create should write README.md in the child package directory',
            );
            assert.strictEqual(
                path.normalize(result?.manifestPath ?? ''),
                path.normalize(expectedDescriptorPath),
                'guided create should retain the descriptor path compatibility alias',
            );
            assert.strictEqual(
                path.normalize(result?.targetDirectory ?? ''),
                path.normalize(layerRoot),
                'guided create should return the selected parent destination directory',
            );
            assert.strictEqual(
                path.normalize(result?.capabilityDirectoryPath ?? ''),
                path.normalize(expectedCapabilityDirectoryPath),
                'guided create should return the created child capability directory path',
            );
            assert.strictEqual(
                path.normalize(result?.capabilityGithubDirectoryPath ?? ''),
                path.normalize(expectedCapabilityGithubDirectoryPath),
                'guided create should return the created .github directory path',
            );
            assert.strictEqual(
                result?.capabilityName,
                'Context Capability',
                'guided create should return the entered capability name',
            );
            assert.strictEqual(
                result?.capabilityDirectoryName,
                'context-capability',
                'guided create should return the entered capability directory name',
            );
            assert.strictEqual(
                result?.draftUri,
                vscode.Uri.file(expectedDescriptorPath).toString(),
                'guided create should return the created README.md uri',
            );
            assert.ok(
                fs.existsSync(expectedCapabilityGithubDirectoryPath),
                'guided create should create an empty .github directory for the new capability',
            );
            assert.strictEqual(result?.pluginJsonPath, undefined);
            assert.ok(
                !fs.existsSync(path.join(expectedCapabilityDirectoryPath, 'plugin.json')),
                'guided create should leave plugin.json to the separate maintenance flow',
            );

            assert.ok(
                vscode.workspace.textDocuments.some(
                    (doc) =>
                        path.normalize(doc.uri.fsPath) === path.normalize(result!.guidancePath!),
                ),
                'guided create should open the bundled capability-contract guidance',
            );
            assert.ok(
                vscode.workspace.textDocuments.some(
                    (doc) =>
                        path.normalize(doc.uri.fsPath) === path.normalize(result!.examplePath!),
                ),
                'guided create should open the bundled example README.md',
            );

            const descriptorContent = fs.readFileSync(expectedDescriptorPath, 'utf-8');
            assert.ok(descriptorContent.includes('name: Context Capability'));
            assert.ok(!descriptorContent.includes('agentPlugin'));

            assert.ok(
                vscode.window.activeTextEditor,
                'guided create should leave README.md active',
            );
            assert.strictEqual(
                path.normalize(vscode.window.activeTextEditor!.document.uri.fsPath),
                path.normalize(expectedDescriptorPath),
                'guided create should open the created README.md file',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInputBox = originalInputBox;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(repoRoot);
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
                metadataRepos: Array<{ enabled?: boolean; capabilities?: unknown }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(updatedConfig.metadataRepos[0]?.capabilities, undefined);
            assert.deepStrictEqual(updatedConfig.profiles?.default?.enabledCapabilities, [
                'ai-metadata:.',
            ]);
            assert.strictEqual(updatedConfig.metadataRepos[0]?.enabled, undefined);
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
                metadataRepos: Array<{ capabilities?: unknown }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(updatedConfig.metadataRepos[0]?.capabilities, undefined);
            assert.deepStrictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities,
                ['ai-metadata:company/core'],
                'A stale index should not toggle the wrong layer',
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
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.deepStrictEqual(
                afterDeselect.profiles?.default?.enabledCapabilities,
                [],
                'Deselecting a folder branch should clear all descendant capability selections',
            );

            await vscode.commands.executeCommand('metaflow.toggleLayerBranch', {
                ...folderItem,
                checked: true,
            });

            const afterSelect = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.deepStrictEqual(
                afterSelect.profiles?.default?.enabledCapabilities,
                ['ai-metadata:company/core', 'ai-metadata:company/standards/sdlc'],
                'Selecting a folder branch should select all descendant capabilities',
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
                        enabledCapabilities?: string[];
                    }
                >;
            };

            assert.deepStrictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities,
                [],
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
                        enabledCapabilities?: string[];
                    }
                >;
            };

            assert.deepStrictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities,
                [],
                'Tree item ids should be enough to toggle branch descendants when VS Code omits custom event fields',
            );
        } finally {
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('toggleLayer persists capability state to the active profile without overwriting other profiles', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const governancePath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernance = fs.readFileSync(governancePath, 'utf-8');

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
            fs.writeFileSync(
                governancePath,
                JSON.stringify(
                    { severity: 'error', allowedProfiles: ['default', 'focused'] },
                    null,
                    2,
                ),
                'utf-8',
            );
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
                metadataRepos?: Array<{ capabilities?: unknown }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
                activeProfile?: string;
            };

            assert.strictEqual(
                afterFocusedToggle.activeProfile,
                'focused',
                'Toggle should keep the focused profile active',
            );
            assert.strictEqual(afterFocusedToggle.metadataRepos?.[0]?.capabilities, undefined);
            assert.deepStrictEqual(afterFocusedToggle.profiles?.default?.enabledCapabilities, [
                'primary:company/core',
                'primary:standards/sdlc',
            ]);
            assert.deepStrictEqual(afterFocusedToggle.profiles?.focused?.enabledCapabilities, [
                'primary:company/core',
            ]);

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'default',
            });

            const afterSwitchBack = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
                activeProfile?: string;
            };

            assert.strictEqual(
                afterSwitchBack.activeProfile,
                'default',
                'Switching back should restore the default active profile',
            );
            assert.deepStrictEqual(afterSwitchBack.profiles?.default?.enabledCapabilities, [
                'primary:company/core',
                'primary:standards/sdlc',
            ]);
            assert.deepStrictEqual(afterSwitchBack.profiles?.focused?.enabledCapabilities, [
                'primary:company/core',
            ]);

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'focused',
            });

            const afterSwitchForward = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                activeProfile?: string;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(
                afterSwitchForward.activeProfile,
                'focused',
                'Switching forward should reactivate the edited profile',
            );
            assert.deepStrictEqual(afterSwitchForward.profiles?.focused?.enabledCapabilities, [
                'primary:company/core',
            ]);
        } finally {
            fs.writeFileSync(governancePath, originalGovernance, 'utf-8');
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
                capabilityOverrides?: Record<string, { injection?: Record<string, string> }>;
            };

            assert.strictEqual(
                updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection?.prompts,
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
                !updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection
                    ?.prompts,
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
                capabilityOverrides?: Record<string, { injection?: Record<string, string> }>;
            };

            assert.strictEqual(
                updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection?.prompts,
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
                !updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection
                    ?.prompts,
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
                    commands: 'synchronize',
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
                capabilityOverrides?: Record<string, { injection?: Record<string, string> }>;
            };

            assert.deepStrictEqual(
                updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection,
                {
                    instructions: 'synchronize',
                    prompts: 'synchronize',
                    commands: 'synchronize',
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
                updatedConfig.capabilityOverrides?.['ai-metadata:company/core']?.injection,
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
                'Global refresh should keep newly discovered capabilities from the first repo inactive until enabled',
            );
            assert.ok(
                !firstApplyFiles.some((entry) => entry.includes('discovered-b.chatmode.md')),
                'Global refresh should keep newly discovered capabilities from the second repo inactive until enabled',
            );

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{
                    id: string;
                    capabilities?: Array<{ path: string; enabled?: boolean }>;
                }>;
            };
            assert.ok(updatedConfig.metadataRepos?.every((repo) => !repo.capabilities));
            const catalog = JSON.parse(
                fs.readFileSync(path.join(workspaceRoot, '.metaflow', 'state.json'), 'utf-8'),
            ) as { capabilityCatalog?: { entries?: Array<{ repoId: string; path: string }> } };
            assert.ok(
                catalog.capabilityCatalog?.entries?.some(
                    (entry) => entry.repoId === 'dynamic-a' && entry.path === 'dynamic-a',
                ),
                'Refresh should persist the discovered first-repo capability in state',
            );
            assert.ok(
                catalog.capabilityCatalog?.entries?.some(
                    (entry) => entry.repoId === 'dynamic-b' && entry.path === 'dynamic-b',
                ),
                'Refresh should persist the discovered second-repo capability in state',
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
            profiles: {
                default: {
                    enabledCapabilities: ['refresh-dynamic-a:base', 'refresh-dynamic-b:base'],
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
            assert.ok(updatedConfig.metadataRepos?.every((repo) => !repo.capabilities));
            const catalog = JSON.parse(
                fs.readFileSync(path.join(workspaceRoot, '.metaflow', 'state.json'), 'utf-8'),
            ) as { capabilityCatalog?: { entries?: Array<{ repoId: string; path: string }> } };
            assert.ok(
                catalog.capabilityCatalog?.entries?.some(
                    (entry) => entry.repoId === 'refresh-dynamic-a' && entry.path === 'dynamic-a',
                ),
                'Global refresh should persist the first discovered capability in state',
            );
            assert.ok(
                catalog.capabilityCatalog?.entries?.some(
                    (entry) => entry.repoId === 'refresh-dynamic-b' && entry.path === 'dynamic-b',
                ),
                'Global refresh should persist the second discovered capability in state',
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
            profiles: {
                default: {
                    enabledCapabilities: ['dynamic:base'],
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
            assert.ok(updatedConfig.metadataRepos?.every((repo) => !repo.capabilities));
            const catalog = JSON.parse(
                fs.readFileSync(path.join(workspaceRoot, '.metaflow', 'state.json'), 'utf-8'),
            ) as { capabilityCatalog?: { entries?: Array<{ repoId: string; path: string }> } };
            assert.ok(
                catalog.capabilityCatalog?.entries?.some(
                    (entry) => entry.repoId === 'dynamic' && entry.path === 'dynamic',
                ),
                'Manual rescan should persist the newly discovered capability in state',
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

        const repoPath = path.join(
            path.dirname(workspaceRoot),
            '.tmp-git-promotion-add-repo-source',
        );
        const expectedLocalPath = path.relative(workspaceRoot, repoPath).replace(/\\/g, '/');
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
                addedRepo?.localPath,
                expectedLocalPath,
                'Add repo source should persist sibling repositories relative to the workspace',
            );
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
                15000,
                100,
            );
        }
    });

    test('addRepoSource uses dot for the workspace root without deriving a dot repo id', async function () {
        this.timeout(25000);

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

        windowAny.showOpenDialog = async () => [vscode.Uri.file(workspaceRoot)];
        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('is not a git repository. Initialize it')
            ) {
                return 'Skip';
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.addRepoSource');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                metadataRepos?: Array<{ id: string; localPath: string }>;
            };
            const addedRepo = updatedConfig.metadataRepos?.find(
                (candidate) => candidate.localPath === '.',
            );

            assert.ok(addedRepo, 'Add repo source should serialize the workspace root as dot');
            assert.strictEqual(
                addedRepo?.id,
                path.basename(workspaceRoot).toLowerCase(),
                'Repository id should be derived from the selected directory, not the dot path',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('addRepoSource recognizes local git repositories without remotes as local promotion-ready repos', async function () {
        this.timeout(25000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-local-only');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(path.join(repoPath, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, '.github', 'instructions', 'example.instructions.md'),
            '# example\n',
            'utf-8',
        );

        execFileSync('git', ['init'], { cwd: repoPath, windowsHide: true });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const isolatedConfig = {
            metadataRepos: [
                {
                    id: 'tracked-primary',
                    localPath: '.ai/ai-metadata',
                    url: 'https://example.com/tracked-primary.git',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'tracked-primary', path: 'company/core', enabled: true }],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalInfo = windowAny.showInformationMessage;
        let localGitInfoCount = 0;
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
                message.includes('local git repository with no configured remotes yet')
            ) {
                localGitInfoCount += 1;
            }
            if (
                typeof message === 'string' &&
                message.includes('Promote it to a git-backed source?')
            ) {
                promotionPromptCount += 1;
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(isolatedConfig, null, 2), 'utf-8');
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

            assert.ok(addedRepo, 'Add repo source should add the selected local git directory');
            assert.strictEqual(
                addedRepo?.url,
                undefined,
                'Local git repo without remote should remain untracked',
            );
            assert.ok(
                localGitInfoCount > 0,
                'Local git info message should appear during add repo source flow',
            );
            assert.strictEqual(
                promotionPromptCount,
                0,
                'Remote promotion prompt should not appear when no remotes exist',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            removeDirectoryRecursive(repoPath);
        }
    });

    test('addRepoSource offers to initialize non-git metadata directories and creates an empty initial commit only', async function () {
        this.timeout(30000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-init-local');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(path.join(repoPath, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, '.github', 'instructions', 'example.instructions.md'),
            '# example\n',
            'utf-8',
        );

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const isolatedConfig = {
            metadataRepos: [
                {
                    id: 'tracked-primary',
                    localPath: '.ai/ai-metadata',
                    url: 'https://example.com/tracked-primary.git',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'tracked-primary', path: 'company/core', enabled: true }],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalInfo = windowAny.showInformationMessage;
        let initPromptCount = 0;

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
                message.includes(
                    'is not a git repository. Initialize it for local promotion workflows?',
                )
            ) {
                initPromptCount += 1;
                return 'Initialize Git';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(isolatedConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.addRepoSource');

            assert.ok(
                initPromptCount > 0,
                'Git initialization prompt should appear for non-git metadata directories',
            );
            assert.ok(
                fs.existsSync(path.join(repoPath, '.git')),
                'Accepted init flow should create a git repository',
            );

            const head = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd: repoPath,
                windowsHide: true,
                encoding: 'utf-8',
            }).trim();
            assert.ok(head.length > 0, 'Accepted init flow should create an initial HEAD commit');

            const committedFiles = execFileSync('git', ['ls-tree', '--name-only', '-r', 'HEAD'], {
                cwd: repoPath,
                windowsHide: true,
                encoding: 'utf-8',
            }).trim();
            assert.strictEqual(
                committedFiles,
                '',
                "Accepted init flow should not stage or commit the directory's pre-existing files",
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            removeDirectoryRecursive(repoPath);
        }
    });

    test('addRepoSource keeps non-git metadata directories local-only when git initialization is declined', async function () {
        this.timeout(25000);

        const repoPath = path.join(workspaceRoot, '.tmp-git-promotion-decline-init');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(path.join(repoPath, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, '.github', 'instructions', 'example.instructions.md'),
            '# example\n',
            'utf-8',
        );

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const isolatedConfig = {
            metadataRepos: [
                {
                    id: 'tracked-primary',
                    localPath: '.ai/ai-metadata',
                    url: 'https://example.com/tracked-primary.git',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'tracked-primary', path: 'company/core', enabled: true }],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        };

        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showOpenDialog: (...items: unknown[]) => Thenable<vscode.Uri[] | undefined>;
            showInformationMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalOpenDialog = windowAny.showOpenDialog;
        const originalInfo = windowAny.showInformationMessage;
        let initPromptCount = 0;

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
                message.includes(
                    'is not a git repository. Initialize it for local promotion workflows?',
                )
            ) {
                initPromptCount += 1;
                return 'Skip';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(isolatedConfig, null, 2), 'utf-8');
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

            assert.ok(
                initPromptCount > 0,
                'Git initialization prompt should appear for non-git metadata directories',
            );
            assert.ok(
                addedRepo,
                'Declining init should still keep the new repository source configured',
            );
            assert.strictEqual(
                addedRepo?.url,
                undefined,
                'Declining init should keep the repo source local-only',
            );
            assert.strictEqual(
                fs.existsSync(path.join(repoPath, '.git')),
                false,
                'Declining init should not create a git repository',
            );
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showOpenDialog = originalOpenDialog;
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            removeDirectoryRecursive(repoPath);
        }
    });

    test('initConfig immediately offers promotion for existing local git repositories', async function () {
        this.timeout(30000);

        const repoPath = path.join(path.dirname(workspaceRoot), '.tmp-git-promotion-init-config');
        const expectedLocalPath = path.relative(workspaceRoot, repoPath).replace(/\\/g, '/');
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

            const promotedRepo =
                updatedConfig.metadataRepo ??
                updatedConfig.metadataRepos?.find(
                    (candidate) =>
                        path.normalize(candidate.localPath) ===
                            path.normalize(path.relative(workspaceRoot, repoPath)) ||
                        path.normalize(candidate.localPath) ===
                            path
                                .normalize(path.relative(workspaceRoot, repoPath))
                                .replace(/\\/g, '/'),
                );

            assert.strictEqual(
                promotedRepo?.localPath,
                expectedLocalPath,
                'Initialize configuration should persist sibling repositories relative to the workspace',
            );

            assert.strictEqual(
                promotedRepo?.url,
                'https://example.com/meta-init-config.git',
                'Initialize configuration should immediately promote local git repositories with remotes',
            );
            assert.strictEqual(
                builtInPromptCount,
                0,
                'Built-in capability onboarding prompt should not appear during init configuration flow',
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

    test('initConfig accepts an empty existing metadata directory as zero-capability bootstrap config', async function () {
        this.timeout(30000);

        const repoPath = path.join(workspaceRoot, '.tmp-empty-existing-init-config');
        removeDirectoryRecursive(repoPath);
        fs.mkdirSync(repoPath, { recursive: true });

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
        const infoMessages: string[] = [];

        windowAny.showQuickPick = async (items: unknown) => {
            if (!Array.isArray(items)) {
                return undefined;
            }

            const picks = items as Array<{ mode?: string }>;
            if (picks.some((pick) => pick.mode === 'existing')) {
                return picks.find((pick) => pick.mode === 'existing') ?? picks[0];
            }
            if (picks.some((pick) => pick.mode === 'later')) {
                return picks.find((pick) => pick.mode === 'later') ?? picks[0];
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
            if (typeof message === 'string') {
                infoMessages.push(message);
            }
            return undefined;
        };

        try {
            await vscode.commands.executeCommand('metaflow.initConfig');

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                compatibilityVersion?: number;
                metadataRepos?: Array<{
                    localPath: string;
                    capabilities?: Array<{ path: string }>;
                }>;
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };

            assert.strictEqual(updatedConfig.compatibilityVersion, 5);
            assert.strictEqual(
                path.normalize(updatedConfig.metadataRepos?.[0]?.localPath ?? ''),
                path.normalize(path.relative(workspaceRoot, repoPath)),
            );
            assert.deepStrictEqual(updatedConfig.profiles?.default?.enabledCapabilities, []);
            assert.ok(
                infoMessages.some((message) => message.includes('0 discovered capabilities')),
                'Initialize configuration should report a zero-layer bootstrap config',
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

    test('offerGitRemotePromotion excludes built-in metadata from git initialization suggestions', async function () {
        this.timeout(20000);

        const builtInRepoPath = path.join(workspaceRoot, '.tmp-builtin-git-promotion');
        const localRepoPath = path.join(workspaceRoot, '.tmp-local-git-promotion');
        removeDirectoryRecursive(builtInRepoPath);
        removeDirectoryRecursive(localRepoPath);
        fs.mkdirSync(builtInRepoPath, { recursive: true });
        fs.mkdirSync(localRepoPath, { recursive: true });

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const localOnlyConfig = {
            metadataRepos: [
                {
                    id: '__metaflow_builtin__',
                    localPath: path.relative(workspaceRoot, builtInRepoPath),
                    enabled: true,
                },
                {
                    id: 'local-user-owned',
                    localPath: path.relative(workspaceRoot, localRepoPath),
                    enabled: true,
                },
            ],
            layerSources: [
                { repoId: '__metaflow_builtin__', path: '.', enabled: true },
                { repoId: 'local-user-owned', path: '.', enabled: true },
            ],
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
        const gitInitializationPrompts: string[] = [];

        windowAny.showInformationMessage = async (message: unknown) => {
            if (
                typeof message === 'string' &&
                message.includes('is not a git repository. Initialize it')
            ) {
                gitInitializationPrompts.push(message);
                return 'Skip';
            }
            return undefined;
        };

        try {
            fs.writeFileSync(configPath, JSON.stringify(localOnlyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.offerGitRemotePromotion');

            assert.deepStrictEqual(
                gitInitializationPrompts,
                [
                    'MetaFlow: Repository source "local-user-owned" is not a git repository. Initialize it for local promotion workflows?',
                ],
                'Only user-owned local metadata should be offered for git initialization',
            );
        } finally {
            windowAny.showInformationMessage = originalInfo;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(builtInRepoPath);
            removeDirectoryRecursive(localRepoPath);
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

    test('pushRepository warns when requested repo is not git-backed', async function () {
        this.timeout(15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const gitBackedConfig = {
            metadataRepo: {
                url: 'git@github.com:org/ai-metadata.git',
                localPath: '.ai/ai-metadata',
            },
            layers: ['company/core', 'standards/sdlc'],
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
            await vscode.commands.executeCommand('metaflow.pushRepository', {
                repoId: 'missing-repo-id',
            });
            assert.ok(
                warningMessages.some((message) => message.includes('not git-backed or not found')),
                'pushRepository should warn when a non-git or unknown repo is requested',
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

    test('workspace Copilot synchronization setting persists the canonical config policy', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousSetting = getScopedSettingValue<boolean>(
            wsConfig,
            'synchronization.repoWideCopilotInstructions',
        );
        const originalConfig = fs.readFileSync(getWorkspaceConfigPath(), 'utf-8');

        try {
            // Establish an explicit opposite-value baseline so this test still emits a
            // configuration event when an ignored test-workspace setting already exists.
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                false,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(getWorkspaceConfigPath(), 'utf-8')) as {
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return parsed.synchronization?.repoWideCopilotInstructions === false;
            });
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(getWorkspaceConfigPath(), 'utf-8')) as {
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return parsed.synchronization?.repoWideCopilotInstructions === true;
            });
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                false,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(getWorkspaceConfigPath(), 'utf-8')) as {
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return parsed.synchronization?.repoWideCopilotInstructions === false;
            });
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(getWorkspaceConfigPath(), 'utf-8')) as {
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return parsed.synchronization?.repoWideCopilotInstructions === false;
            });
        } finally {
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                false,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(getWorkspaceConfigPath(), originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                previousSetting,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('user Copilot synchronization setting persists the canonical config policy', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousGlobalSetting = wsConfig.inspect<boolean>(
            'synchronization.repoWideCopilotInstructions',
        )?.globalValue;
        const originalConfig = fs.readFileSync(getWorkspaceConfigPath(), 'utf-8');

        try {
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                true,
                vscode.ConfigurationTarget.Global,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(getWorkspaceConfigPath(), 'utf-8')) as {
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return parsed.synchronization?.repoWideCopilotInstructions === true;
            });
        } finally {
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                undefined,
                vscode.ConfigurationTarget.Global,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(getWorkspaceConfigPath(), originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                previousGlobalSetting,
                vscode.ConfigurationTarget.Global,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('workspace Copilot synchronization setting persists while config migration is required', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousSetting = getScopedSettingValue<boolean>(
            wsConfig,
            'synchronization.repoWideCopilotInstructions',
        );
        const previousAutoApply = wsConfig.inspect<boolean>('autoApply')?.workspaceValue;
        const configPath = getWorkspaceConfigPath();
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const legacyConfig = JSON.parse(originalConfig) as Record<string, unknown>;
        delete legacyConfig.compatibilityVersion;

        try {
            await updateConfigAndWait(
                'metaflow.autoApply',
                false,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(configPath, JSON.stringify(legacyConfig, null, 2), 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh', {
                skipConfigMaintenance: true,
                skipAutoApply: true,
                skipBuiltInAutoApply: true,
                skipRepoSync: true,
                skipSettingsInjection: true,
            });
            assert.strictEqual(
                (
                    JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                        compatibilityVersion?: number;
                    }
                ).compatibilityVersion,
                undefined,
                'The fixture should remain migration-required before the checkbox transition',
            );

            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    compatibilityVersion?: number;
                    synchronization?: { repoWideCopilotInstructions?: boolean };
                };
                return (
                    parsed.compatibilityVersion === 5 &&
                    parsed.synchronization?.repoWideCopilotInstructions === true
                );
            });
        } finally {
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                false,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.autoApply',
                previousAutoApply,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
            await updateConfigAndWait(
                'metaflow.synchronization.repoWideCopilotInstructions',
                previousSetting,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('workspace injection settings persist the canonical config policy', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousModes = cloneJson(
            wsConfig.inspect<Record<string, unknown>>('injection.modes')?.workspaceValue,
        );
        const previousTarget = wsConfig.inspect<string>('injection.target')?.workspaceValue;
        const configPath = getWorkspaceConfigPath();
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        try {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { instructions: 'settings', skills: 'synchronize' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.target',
                'user',
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    injection?: { instructions?: string; skills?: string };
                    settingsInjectionTarget?: string;
                };
                return (
                    parsed.injection?.instructions === 'settings' &&
                    parsed.injection?.skills === 'synchronize' &&
                    parsed.settingsInjectionTarget === 'user'
                );
            });
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { skills: 'synchronize' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    injection?: { instructions?: string; skills?: string };
                };
                return (
                    parsed.injection?.instructions === 'plugin' &&
                    parsed.injection?.skills === 'synchronize'
                );
            });
            await updateConfigAndWait(
                'metaflow.injection.modes',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    injection?: { instructions?: string; prompts?: string; skills?: string };
                };
                return (
                    parsed.injection?.instructions === 'plugin' &&
                    parsed.injection?.prompts === 'settings' &&
                    parsed.injection?.skills === 'plugin'
                );
            });
            await updateConfigAndWait(
                'metaflow.injection.target',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    settingsInjectionTarget?: string;
                };
                return parsed.settingsInjectionTarget === undefined;
            });
        } finally {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousModes,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.target',
                previousTarget,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('injection settings merge partial values across VS Code scopes before persistence', async function () {
        this.timeout(30000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousGlobalModes = cloneJson(
            wsConfig.inspect<Record<string, unknown>>('injection.modes')?.globalValue,
        );
        const previousWorkspaceModes = cloneJson(
            wsConfig.inspect<Record<string, unknown>>('injection.modes')?.workspaceValue,
        );
        const previousWorkspaceFolderModes = cloneJson(
            wsConfig.inspect<Record<string, unknown>>('injection.modes')?.workspaceFolderValue,
        );
        const configPath = getWorkspaceConfigPath();
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        try {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { prompts: 'synchronize' },
                vscode.ConfigurationTarget.Global,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { instructions: 'settings' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(
                () => {
                    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                        injection?: Record<string, string>;
                    };
                    return (
                        parsed.injection?.instructions === 'settings' &&
                        parsed.injection?.prompts === 'synchronize' &&
                        parsed.injection?.commands === 'plugin' &&
                        parsed.injection?.skills === 'plugin' &&
                        parsed.injection?.agents === 'plugin' &&
                        parsed.injection?.hooks === 'plugin'
                    );
                },
                DEFAULT_WAIT_FOR_TIMEOUT_MS,
                100,
                () => JSON.parse(fs.readFileSync(configPath, 'utf-8')),
            );

            // This Extension Host opens a single-folder workspace, where VS Code
            // treats Workspace Folder as Workspace. Test that scope separately
            // while retaining the User-scope partial value.
            await updateConfigAndWait(
                'metaflow.injection.modes',
                undefined,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { skills: 'settings' },
                vscode.ConfigurationTarget.WorkspaceFolder,
                wsFolder!,
            );
            await waitFor(
                () => {
                    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                        injection?: Record<string, string>;
                    };
                    return (
                        parsed.injection?.instructions === 'plugin' &&
                        parsed.injection?.prompts === 'synchronize' &&
                        parsed.injection?.skills === 'settings'
                    );
                },
                DEFAULT_WAIT_FOR_TIMEOUT_MS,
                100,
                () => JSON.parse(fs.readFileSync(configPath, 'utf-8')),
            );
        } finally {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousGlobalModes,
                vscode.ConfigurationTarget.Global,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousWorkspaceModes,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousWorkspaceFolderModes,
                vscode.ConfigurationTarget.WorkspaceFolder,
                wsFolder!,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('ordinary refresh does not replay unchanged injection settings over JSONC edits', async function () {
        this.timeout(30000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration('metaflow', wsFolder!.uri);
        const previousModes = cloneJson(
            wsConfig.inspect<Record<string, unknown>>('injection.modes')?.workspaceValue,
        );
        const configPath = getWorkspaceConfigPath();
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        try {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { instructions: 'settings' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await waitFor(() => {
                const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                    injection?: { instructions?: string };
                };
                return parsed.injection?.instructions === 'settings';
            });

            const manuallyEdited = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                injection?: Record<string, string>;
            };
            manuallyEdited.injection = {
                ...(manuallyEdited.injection ?? {}),
                instructions: 'synchronize',
            };
            fs.writeFileSync(configPath, `${JSON.stringify(manuallyEdited, null, 2)}\n`, 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');

            const afterRefresh = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                injection?: { instructions?: string };
            };
            assert.strictEqual(afterRefresh.injection?.instructions, 'synchronize');
        } finally {
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousModes,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('removeMetaFlowCapability cleans legacy built-in config references', async function () {
        this.timeout(20000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        await resetBuiltInCapabilityState();

        const authoredConfig = JSON.parse(originalConfig) as {
            metadataRepos?: Array<Record<string, unknown>>;
            layerSources?: Array<Record<string, unknown>>;
            profiles?: Record<
                string,
                { enabledCapabilities?: string[]; layerOverrides?: Array<Record<string, unknown>> }
            >;
        };
        authoredConfig.metadataRepos = [
            ...(authoredConfig.metadataRepos ?? []),
            { id: BUILT_IN_CAPABILITY_REPO_ID, localPath: 'bundled-metadata' },
        ];
        authoredConfig.layerSources = [
            ...(authoredConfig.layerSources ?? []),
            { repoId: BUILT_IN_CAPABILITY_REPO_ID, path: '.' },
        ];
        const defaultProfile = authoredConfig.profiles?.default;
        if (defaultProfile) {
            defaultProfile.enabledCapabilities = [
                ...(defaultProfile.enabledCapabilities ?? []),
                `${BUILT_IN_CAPABILITY_REPO_ID}:.`,
            ];
            defaultProfile.layerOverrides = [
                ...(defaultProfile.layerOverrides ?? []),
                { repoId: BUILT_IN_CAPABILITY_REPO_ID, path: '.', enabled: true },
            ];
        }
        fs.writeFileSync(configPath, JSON.stringify(authoredConfig, null, 2), 'utf-8');
        const legacyConfig = fs.readFileSync(configPath, 'utf-8');

        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;

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
            await vscode.commands.executeCommand('metaflow.refresh', {
                skipConfigMaintenance: true,
            });

            const beforeRemoveConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                beforeRemoveConfig,
                legacyConfig,
                'Loading legacy built-in config without maintenance should preserve it for explicit removal',
            );

            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.refresh');

            const afterRemoveConfig = JSON.parse(
                fs.readFileSync(configPath, 'utf-8'),
            ) as typeof authoredConfig;
            assert.ok(
                !afterRemoveConfig.metadataRepos?.some(
                    (repo) => repo.id === BUILT_IN_CAPABILITY_REPO_ID,
                ),
                'Removing built-in mode should remove its legacy metadataRepos entry',
            );
            assert.ok(
                !afterRemoveConfig.layerSources?.some(
                    (source) => source.repoId === BUILT_IN_CAPABILITY_REPO_ID,
                ),
                'Removing built-in mode should remove its legacy layerSources entries',
            );
            assert.ok(
                !Object.values(afterRemoveConfig.profiles ?? {}).some((profile) =>
                    profile.enabledCapabilities?.some((reference) =>
                        reference.startsWith(`${BUILT_IN_CAPABILITY_REPO_ID}:`),
                    ),
                ),
                'Removing built-in mode should remove its profile references',
            );
        } finally {
            windowAny.showWarningMessage = originalWarning;
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0335: unchecked built-in setting does not enable native capability paths', async function () {
        this.timeout(20000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        await wsConfig.update(
            'metaflow.aiMetadataAutoApplyMode',
            false,
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
                'Unchecked setting should not inject built-in capability instruction paths',
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

    test('TC-0337: checked built-in setting uses native contributions without mutating config', async function () {
        this.timeout(25000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await updateConfigAndWait(
            'metaflow.aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        const previousInjectionModes = await useSettingsBackedInstructions(wsFolder!);
        const configAfterInjectionSettings = fs.readFileSync(configPath, 'utf-8');
        await resetBuiltInCapabilityState();
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');

            const instructionSettings = getBuiltInInstructionSettingsPresence(wsConfig);
            assert.strictEqual(
                instructionSettings.hasBuiltIn,
                false,
                'Checked setting should keep built-in contribution paths out of settings',
            );
            assert.strictEqual(
                instructionSettings.hasExtensionInstall,
                false,
                'Checked setting should not inject paths from the installed extension directory',
            );

            const afterRefreshConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterRefreshConfig,
                configAfterInjectionSettings,
                'Checked setting should not mutate .metaflow/config.jsonc',
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
            await restoreInjectionModes(wsFolder!, previousInjectionModes);
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0318: toggleRepoSource keeps built-in selection in extension state', async function () {
        this.timeout(25000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');

        await updateConfigAndWait(
            'metaflow.aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        const previousInjectionModes = await useSettingsBackedInstructions(wsFolder!);
        const configAfterInjectionSettings = fs.readFileSync(configPath, 'utf-8');
        await resetBuiltInCapabilityState();
        await wsConfig.update(
            'chat.instructionsFilesLocations',
            undefined,
            vscode.ConfigurationTarget.Workspace,
        );

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: false,
            });

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: true,
            });

            const afterToggleConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterToggleConfig,
                configAfterInjectionSettings,
                'Built-in repo toggling should not persist extension-owned state in .metaflow/config.jsonc',
            );
            const persistedConfig = JSON.parse(afterToggleConfig) as {
                metadataRepos?: Array<{ id: string; localPath: string }>;
            };
            const persistedBuiltInRepo = persistedConfig.metadataRepos?.find(
                (repo) => repo.id === BUILT_IN_CAPABILITY_REPO_ID,
            );
            assert.strictEqual(persistedBuiltInRepo, undefined);
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
            await restoreInjectionModes(wsFolder!, previousInjectionModes);
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0339: built-in remove/re-add leaves user settings stable', async function () {
        this.timeout(30000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;
        const previousInstructionLocations = cloneJson(
            getScopedSettingValue<Record<string, boolean>>(
                wsConfig,
                'chat.instructionsFilesLocations',
            ),
        );
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const unmanagedRoot = path.join(workspaceRoot, '.metaflow-test-unmanaged-instructions');
        const unmanagedZeta = path.join(unmanagedRoot, 'zeta');
        const unmanagedAlpha = path.join(unmanagedRoot, 'alpha');
        removeDirectoryRecursive(unmanagedRoot);
        fs.mkdirSync(unmanagedZeta, { recursive: true });
        fs.mkdirSync(unmanagedAlpha, { recursive: true });
        const unmanagedInstructionLocations = {
            [unmanagedZeta]: true,
            [unmanagedAlpha]: true,
        };

        await updateConfigAndWait(
            'metaflow.aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        const previousInjectionModes = await useSettingsBackedInstructions(wsFolder!);
        const configAfterInjectionSettings = fs.readFileSync(configPath, 'utf-8');
        await updateConfigAndWait(
            'chat.instructionsFilesLocations',
            unmanagedInstructionLocations,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        await resetBuiltInCapabilityState();

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            const firstEnabledSnapshot = getInstructionSettingsSnapshot(
                vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
            );
            assert.strictEqual(
                snapshotHasBuiltInInstructions(firstEnabledSnapshot),
                false,
                'First built-in enable cycle should keep native contribution paths out of settings',
            );

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: false,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: true,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            const secondEnabledSnapshot = getInstructionSettingsSnapshot(
                vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
            );
            assert.deepStrictEqual(
                secondEnabledSnapshot,
                firstEnabledSnapshot,
                'Built-in remove/re-add should preserve the same user settings payload',
            );

            const afterToggleConfig = fs.readFileSync(configPath, 'utf-8');
            assert.strictEqual(
                afterToggleConfig,
                configAfterInjectionSettings,
                'Built-in remove/re-add should keep extension-owned state out of .metaflow/config.jsonc',
            );
        } finally {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'chat.instructionsFilesLocations',
                previousInstructionLocations,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await restoreInjectionModes(wsFolder!, previousInjectionModes);
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(unmanagedRoot);
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0340: repeated equivalent built-in operations are config-byte-stable', async function () {
        this.timeout(30000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;
        const previousInstructionLocations = cloneJson(
            getScopedSettingValue<Record<string, boolean>>(
                wsConfig,
                'chat.instructionsFilesLocations',
            ),
        );
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const unmanagedRoot = path.join(workspaceRoot, '.metaflow-test-unmanaged-instructions');
        const unmanagedZeta = path.join(unmanagedRoot, 'zeta');
        const unmanagedAlpha = path.join(unmanagedRoot, 'alpha');
        removeDirectoryRecursive(unmanagedRoot);
        fs.mkdirSync(unmanagedZeta, { recursive: true });
        fs.mkdirSync(unmanagedAlpha, { recursive: true });

        await updateConfigAndWait(
            'metaflow.aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        const previousInjectionModes = await useSettingsBackedInstructions(wsFolder!);
        await updateConfigAndWait(
            'chat.instructionsFilesLocations',
            {
                [unmanagedZeta]: true,
                [unmanagedAlpha]: true,
            },
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        await resetBuiltInCapabilityState();

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            const firstSnapshot = getInstructionSettingsSnapshot(
                vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
            );
            const firstConfig = fs.readFileSync(configPath, 'utf-8');

            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            const secondSnapshot = getInstructionSettingsSnapshot(
                vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
            );
            const secondConfig = fs.readFileSync(configPath, 'utf-8');

            assert.deepStrictEqual(
                secondSnapshot,
                firstSnapshot,
                'Equivalent built-in setting cycles should preserve the same user settings payload',
            );
            assert.strictEqual(
                secondConfig,
                firstConfig,
                'Equivalent built-in setting cycles should keep .metaflow/config.jsonc byte-stable',
            );
        } finally {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'chat.instructionsFilesLocations',
                previousInstructionLocations,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await restoreInjectionModes(wsFolder!, previousInjectionModes);
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(unmanagedRoot);
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('TC-0341: unmanaged user settings entries survive built-in toggles', async function () {
        this.timeout(30000);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;
        const previousInstructionLocations = cloneJson(
            getScopedSettingValue<Record<string, boolean>>(
                wsConfig,
                'chat.instructionsFilesLocations',
            ),
        );
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const unmanagedRoot = path.join(workspaceRoot, '.metaflow-test-unmanaged-instructions');
        const unmanagedZeta = path.join(unmanagedRoot, 'zeta');
        const unmanagedAlpha = path.join(unmanagedRoot, 'alpha');
        removeDirectoryRecursive(unmanagedRoot);
        fs.mkdirSync(unmanagedZeta, { recursive: true });
        fs.mkdirSync(unmanagedAlpha, { recursive: true });
        const unmanagedInstructionLocations = {
            [unmanagedZeta]: true,
            [unmanagedAlpha]: true,
        };

        await updateConfigAndWait(
            'metaflow.aiMetadataAutoApplyMode',
            false,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        const previousInjectionModes = await useSettingsBackedInstructions(wsFolder!);
        await updateConfigAndWait(
            'chat.instructionsFilesLocations',
            unmanagedInstructionLocations,
            vscode.ConfigurationTarget.Workspace,
            wsFolder!,
        );
        await resetBuiltInCapabilityState();

        const baselineSnapshot = getInstructionSettingsSnapshot(
            vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
        );

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                true,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: false,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: true,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            const finalSnapshot = getInstructionSettingsSnapshot(
                vscode.workspace.getConfiguration(undefined, wsFolder!.uri),
            );
            const baselineUnmanagedInstructionLocations =
                getUnmanagedInstructionLocationKeys(baselineSnapshot);
            const preservedBaselineInstructionLocations = getUnmanagedInstructionLocationKeys(
                finalSnapshot,
            ).filter((location) => baselineUnmanagedInstructionLocations.includes(location));

            assert.deepStrictEqual(
                preservedBaselineInstructionLocations,
                baselineUnmanagedInstructionLocations,
                'Unmanaged instruction location entries should survive built-in toggles in their original relative order',
            );
        } finally {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'chat.instructionsFilesLocations',
                previousInstructionLocations,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await restoreInjectionModes(wsFolder!, previousInjectionModes);
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            removeDirectoryRecursive(unmanagedRoot);
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });
});
