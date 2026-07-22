import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const INTEGRATION_STARTUP_TIMEOUT_MS = 90000;
const DEFAULT_WAIT_FOR_TIMEOUT_MS = process.env.CI ? 30000 : 10000;
const GOVERNANCE_TEST_TIMEOUT_MS = process.env.CI ? 60000 : 30000;

suite('Governance command enforcement', () => {
    let workspaceRoot: string;
    let governancePath: string;

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

    async function updateConfigAndWait(
        section: string,
        value: unknown,
        target: vscode.ConfigurationTarget,
        wsFolder?: vscode.WorkspaceFolder,
    ): Promise<void> {
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder?.uri);
        await wsConfig.update(section, value, target);
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
    }

    function getInjectedLocationValue<T>(
        inspection: { workspaceValue?: T; workspaceFolderValue?: T } | undefined,
    ): T | undefined {
        return inspection?.workspaceValue ?? inspection?.workspaceFolderValue;
    }

    function hasBuiltInInstructionPath(
        locations: Record<string, boolean> | string[] | undefined,
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
                normalized.endsWith('/.github/instructions')
            );
        });
    }

    function getBuiltInInstructionState(wsConfig: vscode.WorkspaceConfiguration) {
        const locations = getInjectedLocationValue(
            wsConfig.inspect<Record<string, boolean>>('chat.instructionsFilesLocations'),
        );
        return {
            hasBuiltInInstructionPath: hasBuiltInInstructionPath(locations),
            locations,
        };
    }

    async function resetBuiltInCapabilityState(): Promise<void> {
        const windowAny = vscode.window as unknown as {
            showQuickPick: (...items: unknown[]) => Thenable<unknown>;
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showErrorMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalQuickPick = windowAny.showQuickPick;
        const originalWarning = windowAny.showWarningMessage;
        const originalError = windowAny.showErrorMessage;
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
        windowAny.showErrorMessage = async () => undefined;

        try {
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
            await vscode.commands.executeCommand('metaflow.removeMetaFlowCapability');
        } finally {
            windowAny.showQuickPick = originalQuickPick;
            windowAny.showWarningMessage = originalWarning;
            windowAny.showErrorMessage = originalError;
        }
    }

    function captureWindowMessages() {
        const windowAny = vscode.window as unknown as {
            showWarningMessage: (...items: unknown[]) => Thenable<string | undefined>;
            showErrorMessage: (...items: unknown[]) => Thenable<string | undefined>;
        };
        const originalWarning = windowAny.showWarningMessage;
        const originalError = windowAny.showErrorMessage;
        const warnings: string[] = [];
        const errors: string[] = [];

        windowAny.showWarningMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                warnings.push(message);
            }
            return undefined;
        };
        windowAny.showErrorMessage = async (message: unknown) => {
            if (typeof message === 'string') {
                errors.push(message);
            }
            return undefined;
        };

        return {
            warnings,
            errors,
            restore: () => {
                windowAny.showWarningMessage = originalWarning;
                windowAny.showErrorMessage = originalError;
            },
        };
    }

    suiteSetup(async function () {
        this.timeout(INTEGRATION_STARTUP_TIMEOUT_MS);
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');
        workspaceRoot = ws!.uri.fsPath;
        governancePath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
    });

    test('blocks disallowed profile switches under error governance without persisting config writes', async function () {
        this.timeout(process.env.CI ? 30000 : 15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/sdlc', enabled: true }],
                    },
                ],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                profiles: {
                    default: { enabledCapabilities: ['primary:standards/sdlc'] },
                    review: { enabledCapabilities: ['primary:standards/sdlc'] },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'error',
                allowedProfiles: ['default'],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.switchProfile', {
                profileId: 'review',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                activeProfile?: string;
            };
            assert.strictEqual(
                updatedConfig.activeProfile,
                'default',
                'Blocked profile switches must not persist the candidate activeProfile',
            );
            assert.ok(
                messages.errors.some((message) =>
                    message.includes('[GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review]'),
                ),
                `Expected stable governance id in error message, got: ${messages.errors.join('\n')}`,
            );
            assert.ok(
                messages.errors.some((message) =>
                    message.includes('Switch to one of the allowed profiles (default) and retry.'),
                ),
                `Expected remediation guidance in error message, got: ${messages.errors.join('\n')}`,
            );
        } finally {
            messages.restore();
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('warns but persists single-layer toggles under warning governance', async function () {
        this.timeout(process.env.CI ? 30000 : 15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [{ path: 'standards/sdlc', enabled: true }],
                    },
                ],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                profiles: {
                    default: { enabledCapabilities: ['primary:standards/sdlc'] },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'warn',
                requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                repoId: 'primary',
                layerPath: 'standards/sdlc',
                checked: false,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };
            assert.strictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities?.includes(
                    'primary:standards/sdlc',
                ),
                false,
                'Warning-mode layer toggles should still persist the candidate profile selection',
            );
            assert.ok(
                messages.warnings.some((message) =>
                    message.includes(
                        '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc]',
                    ),
                ),
                `Expected stable governance id in warning message, got: ${messages.warnings.join('\n')}`,
            );
            assert.ok(
                messages.warnings.some((message) =>
                    message.includes(
                        'Ensure primary/standards/sdlc is active in the candidate runtime state, then retry.',
                    ),
                ),
                `Expected remediation guidance in warning message, got: ${messages.warnings.join('\n')}`,
            );

            const snapshot = await vscode.commands.executeCommand<{
                governance: {
                    compliance?: {
                        status: 'not-applicable' | 'compliant' | 'non-compliant';
                        severity: 'warn' | 'error';
                        violations: Array<{ id: string }>;
                    };
                };
            }>('metaflow.getDiagnosticsSnapshot');
            assert.strictEqual(snapshot?.governance.compliance?.status, 'non-compliant');
            assert.strictEqual(snapshot?.governance.compliance?.severity, 'warn');
            assert.deepStrictEqual(
                snapshot?.governance.compliance?.violations.map((violation) => violation.id),
                ['GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc'],
            );
        } finally {
            messages.restore();
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('blocks branch toggles under error governance without persisting candidate overrides', async function () {
        this.timeout(process.env.CI ? 30000 : 15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [
                            { path: 'company/core', enabled: true },
                            { path: 'company/standards/sdlc', enabled: true },
                        ],
                    },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'company/core', enabled: true },
                    { repoId: 'primary', path: 'company/standards/sdlc', enabled: true },
                ],
                profiles: {
                    default: {
                        enabledCapabilities: [
                            'primary:company/core',
                            'primary:company/standards/sdlc',
                        ],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'error',
                requiredCapabilities: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/standards/sdlc' },
                ],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.toggleLayerBranch', {
                repoId: 'primary',
                pathKey: 'company',
                checked: false,
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };
            assert.deepStrictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities,
                ['primary:company/core', 'primary:company/standards/sdlc'],
                'Blocked branch toggles must not persist candidate profile overrides',
            );
            assert.ok(
                messages.errors.some((message) =>
                    message.includes('Remediation: Review the listed governance violations'),
                ),
                `Expected aggregate remediation in error message, got: ${messages.errors.join('\n')}`,
            );
        } finally {
            messages.restore();
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('blocks deselectAllLayers under error governance without persisting bulk writes', async function () {
        this.timeout(process.env.CI ? 30000 : 15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [
                            { path: 'company/core', enabled: true },
                            { path: 'company/standards/sdlc', enabled: true },
                        ],
                    },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'company/core', enabled: true },
                    { repoId: 'primary', path: 'company/standards/sdlc', enabled: true },
                ],
                profiles: {
                    default: {
                        enabledCapabilities: [
                            'primary:company/core',
                            'primary:company/standards/sdlc',
                        ],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'error',
                requiredCapabilities: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/standards/sdlc' },
                ],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            await vscode.commands.executeCommand('metaflow.deselectAllLayers', {
                contextValue: 'layerRepo',
                repoId: 'primary',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };
            assert.deepStrictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities,
                ['primary:company/core', 'primary:company/standards/sdlc'],
                'Blocked bulk deselection must not persist candidate overrides',
            );
            assert.ok(
                messages.errors.some((message) =>
                    message.includes('Remediation: Review the listed governance violations'),
                ),
                `Expected aggregate remediation in error message, got: ${messages.errors.join('\n')}`,
            );
        } finally {
            messages.restore();
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('blocks built-in repo toggles under error governance without persisting workspace-state writes', async function () {
        this.timeout(GOVERNANCE_TEST_TIMEOUT_MS);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;
        const previousInjectionModes = wsConfig.inspect<Record<string, unknown>>(
            'metaflow.injection.modes',
        )?.workspaceValue;
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                'off',
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { instructions: 'settings' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await resetBuiltInCapabilityState();
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );

            fs.writeFileSync(
                governancePath,
                JSON.stringify(
                    {
                        severity: 'error',
                        requiredCapabilities: [{ repoId: '__metaflow_builtin__', path: '.' }],
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                'builtinLayer',
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await waitFor(
                () => getBuiltInInstructionState(wsConfig).hasBuiltInInstructionPath,
                undefined,
                100,
                () => getBuiltInInstructionState(wsConfig),
            );

            await vscode.commands.executeCommand('metaflow.toggleRepoSource', {
                repoId: '__metaflow_builtin__',
                checked: false,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await waitFor(
                () => getBuiltInInstructionState(wsConfig).hasBuiltInInstructionPath,
                undefined,
                100,
                () => getBuiltInInstructionState(wsConfig),
            );

            assert.ok(
                messages.errors.some((message) =>
                    message.includes(
                        '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::__metaflow_builtin__::.]',
                    ),
                ),
                `Expected built-in governance id in error message, got: ${messages.errors.join('\n')}`,
            );
            assert.strictEqual(
                fs.readFileSync(configPath, 'utf-8'),
                originalConfig,
                'Blocked built-in repo toggles must not mutate .metaflow/config.jsonc',
            );
        } finally {
            messages.restore();
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousInjectionModes,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('blocks built-in layer toggles under error governance without persisting workspace-state writes', async function () {
        this.timeout(GOVERNANCE_TEST_TIMEOUT_MS);

        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(wsFolder, 'Workspace folder should be available');
        const wsConfig = vscode.workspace.getConfiguration(undefined, wsFolder!.uri);
        const previousMode = wsConfig.inspect<string>(
            'metaflow.aiMetadataAutoApplyMode',
        )?.workspaceValue;
        const previousInjectionModes = wsConfig.inspect<Record<string, unknown>>(
            'metaflow.injection.modes',
        )?.workspaceValue;
        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        try {
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                'off',
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                { instructions: 'settings' },
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await resetBuiltInCapabilityState();
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );

            fs.writeFileSync(
                governancePath,
                JSON.stringify(
                    {
                        severity: 'error',
                        requiredCapabilities: [{ repoId: '__metaflow_builtin__', path: '.' }],
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                'builtinLayer',
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await vscode.commands.executeCommand('metaflow.refresh');
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await waitFor(
                () => getBuiltInInstructionState(wsConfig).hasBuiltInInstructionPath,
                undefined,
                100,
                () => getBuiltInInstructionState(wsConfig),
            );

            await vscode.commands.executeCommand('metaflow.toggleLayer', {
                repoId: '__metaflow_builtin__',
                layerPath: '.',
                checked: false,
            });
            await vscode.commands.executeCommand('metaflow.apply', { skipRefresh: true });

            await waitFor(
                () => getBuiltInInstructionState(wsConfig).hasBuiltInInstructionPath,
                undefined,
                100,
                () => getBuiltInInstructionState(wsConfig),
            );

            assert.ok(
                messages.errors.some((message) =>
                    message.includes(
                        '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::__metaflow_builtin__::.]',
                    ),
                ),
                `Expected built-in governance id in error message, got: ${messages.errors.join('\n')}`,
            );
            assert.strictEqual(
                fs.readFileSync(configPath, 'utf-8'),
                originalConfig,
                'Blocked built-in layer toggles must not mutate .metaflow/config.jsonc',
            );
        } finally {
            messages.restore();
            await updateConfigAndWait(
                'metaflow.aiMetadataAutoApplyMode',
                previousMode,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await updateConfigAndWait(
                'metaflow.injection.modes',
                previousInjectionModes,
                vscode.ConfigurationTarget.Workspace,
                wsFolder!,
            );
            await wsConfig.update(
                'chat.instructionsFilesLocations',
                undefined,
                vscode.ConfigurationTarget.Workspace,
            );
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await resetBuiltInCapabilityState();
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });

    test('selectAllLayers restores governed bulk-enable state and runtime compliance', async function () {
        this.timeout(process.env.CI ? 30000 : 15000);

        const configPath = path.join(workspaceRoot, '.metaflow', 'config.jsonc');
        const originalConfig = fs.readFileSync(configPath, 'utf-8');
        const originalGovernanceExists = fs.existsSync(governancePath);
        const originalGovernance = originalGovernanceExists
            ? fs.readFileSync(governancePath, 'utf-8')
            : undefined;
        const messages = captureWindowMessages();

        const governedConfig = JSON.stringify(
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        capabilities: [
                            { path: 'company/core', enabled: true },
                            { path: 'standards/sdlc', enabled: false },
                        ],
                    },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'company/core', enabled: true },
                    { repoId: 'primary', path: 'standards/sdlc', enabled: false },
                ],
                profiles: {
                    default: {
                        enabledCapabilities: ['primary:company/core'],
                    },
                },
                activeProfile: 'default',
            },
            null,
            2,
        );
        const governanceContract = JSON.stringify(
            {
                severity: 'error',
                requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
            },
            null,
            2,
        );

        try {
            fs.writeFileSync(configPath, governedConfig, 'utf-8');
            fs.writeFileSync(governancePath, governanceContract, 'utf-8');
            await vscode.commands.executeCommand('metaflow.refresh');

            const beforeSnapshot = await vscode.commands.executeCommand<{
                governance: {
                    compliance?: {
                        status: 'not-applicable' | 'compliant' | 'non-compliant';
                        violations: Array<{ id: string }>;
                    };
                };
            }>('metaflow.getDiagnosticsSnapshot');
            assert.strictEqual(beforeSnapshot?.governance.compliance?.status, 'non-compliant');
            assert.deepStrictEqual(
                beforeSnapshot?.governance.compliance?.violations.map(
                    (violation) => violation.id,
                ) ?? [],
                ['GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc'],
            );

            await vscode.commands.executeCommand('metaflow.selectAllLayers', {
                contextValue: 'layerRepo',
                repoId: 'primary',
            });

            const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
                profiles?: Record<string, { enabledCapabilities?: string[] }>;
            };
            assert.strictEqual(
                updatedConfig.profiles?.default?.enabledCapabilities?.includes(
                    'primary:standards/sdlc',
                ),
                true,
                'selectAllLayers should persist a bulk-enable profile selection for the governed capability',
            );

            const afterSnapshot = await vscode.commands.executeCommand<{
                governance: {
                    compliance?: {
                        status: 'not-applicable' | 'compliant' | 'non-compliant';
                        violations: Array<{ id: string }>;
                    };
                };
            }>('metaflow.getDiagnosticsSnapshot');
            assert.strictEqual(afterSnapshot?.governance.compliance?.status, 'compliant');
            assert.deepStrictEqual(
                afterSnapshot?.governance.compliance?.violations.map((violation) => violation.id) ??
                    [],
                [],
            );
            assert.deepStrictEqual(
                messages.errors,
                [],
                'Compliant bulk-enable operations should not emit governance error toasts',
            );
            assert.deepStrictEqual(
                messages.warnings,
                [],
                'Compliant bulk-enable operations should not emit governance warning toasts',
            );
        } finally {
            messages.restore();
            fs.writeFileSync(configPath, originalConfig, 'utf-8');
            if (originalGovernanceExists) {
                fs.writeFileSync(governancePath, originalGovernance!, 'utf-8');
            } else if (fs.existsSync(governancePath)) {
                fs.unlinkSync(governancePath);
            }
            await vscode.commands.executeCommand('metaflow.refresh');
        }
    });
});
