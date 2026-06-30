/**
 * TreeView provider integration tests.
 *
 * Validates that TreeView providers return expected items
 * after config is loaded and overlay is resolved.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigTreeViewProvider } from '../../views/configTreeView';
import { ProfilesTreeViewProvider } from '../../views/profilesTreeView';
import { LayersTreeViewProvider } from '../../views/layersTreeView';
import { FilesTreeViewProvider } from '../../views/filesTreeView';
import { StagedTreeExpandController } from '../../views/stagedTreeExpand';
import { createState, ExtensionState } from '../../commands/commandHandlers';

const INTEGRATION_STARTUP_TIMEOUT_MS = 90000;

suite('TreeView Providers', () => {
    let state: ExtensionState;

    suiteSetup(async function () {
        this.timeout(INTEGRATION_STARTUP_TIMEOUT_MS);

        // Ensure extension is active
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        // Refresh to load config
        await vscode.commands.executeCommand('metaflow.refresh');

        // Give state a moment to propagate
        await new Promise((resolve) => setTimeout(resolve, 500));
    });

    setup(() => {
        state = createState();
        state.isLoading = false;
    });

    // ── ConfigTreeView ─────────────────────────────────────────

    test('ConfigTreeView returns empty when no config', () => {
        const provider = new ConfigTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without config');
    });

    test('ConfigTreeView shows loading placeholder while config is resolving', () => {
        state.isLoading = true;

        const provider = new ConfigTreeViewProvider(state);
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should show one loading placeholder item');
        assert.strictEqual(String(items[0].label), 'Loading...');
        assert.strictEqual(items[0].contextValue, 'loading');
    });

    test('ConfigTreeView returns items when config set', () => {
        state.config = {
            metadataRepo: {
                localPath: '.ai/ai-metadata',
                url: 'git@github.com:org/repo.git',
                commit: 'abc1234',
            },
            layers: ['core'],
            injection: {
                instructions: 'settings',
                prompts: 'settings',
            },
            activeProfile: 'baseline',
        };
        state.configPath = '/fake/.metaflow/config.jsonc';

        const provider = new ConfigTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 1, 'Should return only the Repositories section');
        assert.strictEqual(items[0].label, 'Repositories');
    });

    test('ConfigTreeView shows workspace-relative config path when inside workspace', () => {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        assert.ok(wsRoot, 'Workspace root should be available');

        state.config = {
            metadataRepo: {
                localPath: '.ai/ai-metadata',
            },
            layers: ['core'],
        };
        state.configPath = path.join(wsRoot!, '.metaflow', 'config.jsonc');

        const provider = new ConfigTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 1, 'Should still only return the Repositories section');
        assert.strictEqual(items[0].label, 'Repositories');
    });

    test('ConfigTreeView repository items expose checkbox state', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', localPath: '.ai/ai-metadata', enabled: true },
                { id: 'secondary', localPath: '.ai/team-metadata', enabled: false },
            ],
            layerSources: [{ repoId: 'primary', path: 'company', enabled: true }],
        };

        const provider = new ConfigTreeViewProvider(state);
        const rootItems = provider.getChildren();
        const repoItems = provider.getChildren(rootItems[0] as never);

        assert.strictEqual(
            repoItems.length,
            2,
            'Should return all repository items under Repositories section',
        );
        assert.strictEqual(
            repoItems[0].checkboxState,
            vscode.TreeItemCheckboxState.Checked,
            'Primary repo should expose a checkbox and be togglable',
        );
        assert.strictEqual(
            repoItems[1].checkboxState,
            vscode.TreeItemCheckboxState.Unchecked,
            'Disabled repo should show unchecked checkbox',
        );
    });

    test('ConfigTreeView marks git-backed repositories and shows remote URL in tooltip', () => {
        state.config = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    url: 'https://github.com/org/ai-metadata.git',
                },
                {
                    id: 'secondary',
                    localPath: '.ai/team-metadata',
                    enabled: true,
                },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'secondary', path: 'team/default', enabled: true },
            ],
        };

        const provider = new ConfigTreeViewProvider(state);
        const rootItems = provider.getChildren();
        const repoItems = provider.getChildren(rootItems[0] as never);

        assert.strictEqual(
            repoItems.length,
            2,
            'Should return all repository items under Repositories section',
        );
        assert.strictEqual(
            repoItems[0].description,
            '.ai/ai-metadata [git] (0/0)',
            'Git-backed repo should include git marker and compact summary',
        );
        assert.strictEqual(
            repoItems[1].description,
            '.ai/team-metadata (0/0)',
            'Local-only repo should include compact summary',
        );
        assert.strictEqual(
            repoItems[0].contextValue,
            'configRepoSourceGit',
            'Git-backed repo should expose generic git context when no pull is pending',
        );
        assert.strictEqual(
            repoItems[1].contextValue,
            'configRepoSourceRescannable',
            'Local repo should keep non-git context value',
        );

        const primaryTooltip = repoItems[0].tooltip as vscode.MarkdownString;
        assert.ok(
            primaryTooltip.value.includes('Remote URL:'),
            'Git-backed repo tooltip should include remote URL label',
        );
        assert.ok(
            primaryTooltip.value.includes('https://github.com/org/ai-metadata.git'),
            'Git-backed repo tooltip should include configured remote URL',
        );
        assert.ok(
            primaryTooltip.value.includes('Instructions: 0/0 active'),
            'Git-backed repo tooltip should include summary breakdown',
        );

        const secondaryTooltip = repoItems[1].tooltip as vscode.MarkdownString;
        assert.ok(
            !secondaryTooltip.value.includes('Remote URL:'),
            'Local-only repo tooltip should not include remote URL label',
        );
        assert.ok(
            secondaryTooltip.value.includes('Skills: 0/0 active'),
            'Local repo tooltip should include summary breakdown',
        );
    });

    test('ConfigTreeView shows repo sync status indicators and tooltip details', () => {
        state.config = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                    url: 'https://github.com/org/ai-metadata.git',
                },
            ],
            layerSources: [{ repoId: 'primary', path: 'company/core', enabled: true }],
        };
        state.repoSyncByRepoId.primary = {
            state: 'behind',
            aheadCount: 0,
            behindCount: 2,
            trackingRef: 'origin/main',
            lastCheckedAt: '2026-03-01T12:00:00.000Z',
        };

        const provider = new ConfigTreeViewProvider(state);
        const rootItems = provider.getChildren();
        const repoItems = provider.getChildren(rootItems[0] as never);
        const repoItem = repoItems[0];

        assert.strictEqual(
            repoItem.description,
            '.ai/ai-metadata [git] (0/0, 2 updates)',
            'Behind repos should merge compact summary with update count',
        );
        assert.strictEqual(
            repoItem.contextValue,
            'configRepoSourceGitBehind',
            'Behind repos should expose pullable git context',
        );
        const icon = repoItem.iconPath as vscode.ThemeIcon;
        assert.strictEqual(icon.id, 'arrow-down', 'Behind repos should show arrow-down icon');

        const tooltip = repoItem.tooltip as vscode.MarkdownString;
        assert.ok(
            tooltip.value.includes('Sync status: Updates available upstream'),
            'Tooltip should include sync status summary',
        );
        assert.ok(
            tooltip.value.includes('Tracking branch: `origin/main`'),
            'Tooltip should include tracking branch',
        );
        assert.ok(
            tooltip.value.includes('Ahead/Behind: 0/2'),
            'Tooltip should include ahead/behind counts',
        );
        assert.ok(
            tooltip.value.includes('Last checked: 2026-03-01T12:00:00.000Z'),
            'Tooltip should include last-check timestamp',
        );
        assert.ok(
            tooltip.value.includes('Instructions: 0/0 active'),
            'Tooltip should include summary breakdown',
        );
    });

    test('ConfigTreeView surfaces repo-scoped governance signals in the Extension Host', () => {
        state.config = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: false }],
        };
        state.governanceContract = {
            requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
            severity: 'error',
        };
        state.governanceCompliance = {
            status: 'non-compliant',
            severity: 'error',
            activeProfile: 'default',
            activeProfileLocked: false,
            allowedProfiles: [],
            lockedProfiles: [],
            violations: [
                {
                    id: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
                    code: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING',
                    message:
                        'Required capability "primary/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
                    repoId: 'primary',
                    path: 'standards/sdlc',
                    severity: 'error',
                    rule: 'requiredCapabilities',
                },
            ],
        };

        const provider = new ConfigTreeViewProvider(state);
        const rootItems = provider.getChildren();
        const repoItems = provider.getChildren(rootItems[0] as never);

        assert.strictEqual(
            repoItems[0].description,
            '.ai/ai-metadata (0/0, governance 1 violation)',
        );
        assert.ok(
            (repoItems[0].tooltip as vscode.MarkdownString).value.includes(
                'Governance: non-compliant (severity: error)',
            ),
        );
        assert.deepStrictEqual(
            rootItems.map((item) => String(item.label)),
            ['Repositories'],
        );
    });

    // ── ProfilesTreeView ───────────────────────────────────────

    test('ProfilesTreeView returns empty when no profiles', () => {
        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without profiles');
    });

    test('ProfilesTreeView shows loading placeholder while config is resolving', () => {
        state.isLoading = true;

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should show one loading placeholder item');
        assert.strictEqual(String(items[0].label), 'Loading...');
        assert.strictEqual(items[0].contextValue, 'loading');
    });

    test('ProfilesTreeView returns profile items', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: [],
            profiles: {
                baseline: { displayName: 'Baseline' },
                lean: { disable: ['agents/**'] },
            },
            activeProfile: 'baseline',
        };

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 2, 'Should return 2 profiles');
        assert.strictEqual(items[0].label, 'Baseline');
        assert.strictEqual(items[0].description, 'baseline (0/0, active)');
        assert.strictEqual(items[1].description, '(0/0)');
    });

    test('ProfilesTreeView marks active profile', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: [],
            profiles: {
                baseline: {},
                lean: { disable: ['agents/**'] },
            },
            activeProfile: 'lean',
        };

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        const active = items.find((i) => (i.iconPath as vscode.ThemeIcon)?.id === 'check');
        assert.ok(active, 'Should have one active profile');
        assert.strictEqual(active.label, 'lean');
    });

    test('ProfilesTreeView tooltip includes per-type preview breakdown', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: [],
            profiles: {
                baseline: {},
                lean: { disable: ['agents/**'] },
            },
            activeProfile: 'baseline',
        };

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        const tooltip = items[1].tooltip as vscode.MarkdownString;

        assert.ok(
            tooltip.value.includes('Status: inactive profile preview'),
            'Inactive profiles should identify preview semantics',
        );
        assert.ok(
            tooltip.value.includes('Instructions: 0/0 active'),
            'Tooltip should include instructions summary',
        );
        assert.ok(
            tooltip.value.includes('Prompts: 0/0 active'),
            'Tooltip should include prompts summary',
        );
        assert.ok(
            tooltip.value.includes('Agents: 0/0 active'),
            'Tooltip should include agents summary',
        );
        assert.ok(
            tooltip.value.includes('Skills: 0/0 active'),
            'Tooltip should include skills summary',
        );
    });

    test('ProfilesTreeView passes profile id through item commands and protects default profile context', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: [],
            profiles: {
                default: { displayName: 'Default' },
                review: { displayName: 'Review' },
            },
            activeProfile: 'default',
        };

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        const defaultItem = items.find((item) => String(item.label) === 'Default');
        const reviewItem = items.find((item) => String(item.label) === 'Review');

        assert.ok(defaultItem, 'Should include default profile item');
        assert.ok(reviewItem, 'Should include non-default profile item');
        assert.strictEqual(defaultItem?.contextValue, 'profileDefault');
        assert.strictEqual(reviewItem?.contextValue, 'profile');
        assert.strictEqual(
            (reviewItem as unknown as { profileId?: string } | undefined)?.profileId,
            'review',
            'Profile row actions should carry the selected profile id',
        );
        assert.strictEqual(reviewItem?.command?.command, 'metaflow.switchProfile');
        assert.deepStrictEqual(reviewItem?.command?.arguments, [{ profileId: 'review' }]);
    });

    test('ProfilesTreeView surfaces governance lock and non-compliance cues in the Extension Host', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: [],
            profiles: {
                default: { displayName: 'Default' },
                review: { displayName: 'Review' },
            },
            activeProfile: 'default',
        };
        state.governanceCompliance = {
            status: 'non-compliant',
            severity: 'error',
            activeProfile: 'default',
            activeProfileLocked: true,
            allowedProfiles: ['default'],
            lockedProfiles: ['default', 'review'],
            violations: [
                {
                    id: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::default',
                    code: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED',
                    message:
                        'Active profile "default" is not allowed by governance. Allowed profiles: default.',
                    severity: 'error',
                    rule: 'allowedProfiles',
                    profileId: 'default',
                },
            ],
        };

        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        const active = items.find((item) => String(item.label) === 'Default');
        const inactiveLocked = items.find((item) => String(item.label) === 'Review');

        assert.ok(String(active?.description).includes('governance locked'));
        assert.ok(String(active?.description).includes('governance non-compliant'));
        assert.strictEqual((active?.iconPath as vscode.ThemeIcon).id, 'error');
        assert.ok(
            (active?.tooltip as vscode.MarkdownString).value.includes(
                'Governance: non-compliant (severity: error)',
            ),
        );
        assert.strictEqual((inactiveLocked?.iconPath as vscode.ThemeIcon).id, 'lock-small');
    });

    // ── LayersTreeView ─────────────────────────────────────────

    test('LayersTreeView returns empty when no config', () => {
        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without config');
    });

    test('LayersTreeView shows loading placeholder while config is resolving', () => {
        state.isLoading = true;

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should show one loading placeholder item');
        assert.strictEqual(String(items[0].label), 'Loading...');
        assert.strictEqual(items[0].contextValue, 'loading');
    });

    test('LayersTreeView returns layers for single-repo', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core', 'standards/sdlc'],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();
        assert.strictEqual(items.length, 2, 'Should return 2 layers');
        assert.strictEqual(
            items[0].checkboxState,
            vscode.TreeItemCheckboxState.Checked,
            'Single-repo layers should expose a checked checkbox',
        );
        assert.strictEqual(items[0].description, '(0/0)');
    });

    test('LayersTreeView hides layers from disabled repos in flat mode', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
                { id: 'secondary', name: 'TeamMeta', localPath: '.ai/team-meta', enabled: false },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'secondary', path: 'team/social', enabled: true },
            ],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should return only enabled-repo layer rows');
        assert.strictEqual(String(items[0].label), 'company/core');
        assert.strictEqual(items[0].description, '(0/0, CoreMeta)');

        const disabledLayer = items.find((i) => String(i.label) === 'team/social');
        assert.strictEqual(disabledLayer, undefined, 'Should hide layers from disabled repos');
    });

    test('LayersTreeView displays root layer as repository name', () => {
        state.config = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: '.ai/ai-metadata',
                    enabled: true,
                },
            ],
            layerSources: [{ repoId: 'ai-metadata', path: '.', enabled: true }],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should return the root layer row');
        assert.strictEqual(
            String(items[0].label),
            'ai-metadata',
            'Root layer should be displayed as repo name',
        );
        assert.strictEqual(items[0].description, '(0/0, ai-metadata)');
    });

    test('LayersTreeView tree mode groups multi-repo layers hierarchically', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
                { id: 'secondary', name: 'TeamMeta', localPath: '.ai/team-meta', enabled: true },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'primary', path: 'company/core/devtools', enabled: true },
                { repoId: 'secondary', path: 'team/social', enabled: true },
            ],
        };

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const primaryRepo = top.find((i) => String(i.label) === 'CoreMeta');
        assert.ok(primaryRepo, 'Tree mode should group layers under repository roots');

        const primaryChildren = provider.getChildren(primaryRepo as never);
        const companyFolder = primaryChildren.find((i) => String(i.label) === 'company');
        assert.ok(companyFolder, 'Repository root should contain first path segment folders');

        const companyChildren = provider.getChildren(companyFolder as never);
        const coreLayer = companyChildren.find((i) => String(i.label) === 'core');
        assert.ok(coreLayer, 'Path segment with a matching layer should be present');
        assert.strictEqual(
            coreLayer?.checkboxState,
            vscode.TreeItemCheckboxState.Checked,
            'Layer nodes should remain toggleable in tree mode',
        );
        assert.ok(
            typeof (coreLayer as { layerIndex?: unknown }).layerIndex === 'number',
            'Layer nodes should preserve layer index for toggle command wiring',
        );

        const coreChildren = provider.getChildren(coreLayer as never);
        const devtoolsLayer = coreChildren.find((i) => String(i.label) === 'devtools');
        assert.ok(devtoolsLayer, 'Nested layer paths should be represented as nested tree nodes');
    });

    test('LayersTreeView tree mode keeps single-repo hierarchy', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['company/core', 'company/standards/sdlc'],
        };

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const companyFolder = top.find((i) => String(i.label) === 'company');
        assert.ok(companyFolder, 'Single-repo tree mode should show top-level hierarchy segment');

        const companyChildren = provider.getChildren(companyFolder as never);
        const standardsFolder = companyChildren.find((i) => String(i.label) === 'standards');
        assert.ok(standardsFolder, 'Single-repo hierarchy should preserve intermediate folders');

        const standardsChildren = provider.getChildren(standardsFolder as never);
        const sdlcLayer = standardsChildren.find((i) => String(i.label) === 'sdlc');
        assert.ok(sdlcLayer, 'Leaf layer node should be present in hierarchy');
        assert.strictEqual(
            sdlcLayer?.checkboxState,
            vscode.TreeItemCheckboxState.Checked,
            'Leaf layer nodes should remain checked/toggleable',
        );
    });

    test('LayersTreeView tree mode exposes folder checkboxes for bulk capability toggling', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['company/core', 'company/standards/sdlc'],
        };

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const companyFolder = top.find((i) => String(i.label) === 'company');
        assert.ok(companyFolder, 'Single-repo tree mode should show top-level hierarchy segment');
        assert.strictEqual(companyFolder?.contextValue, 'layerFolder');
        assert.strictEqual(
            companyFolder?.checkboxState,
            vscode.TreeItemCheckboxState.Checked,
            'Fully enabled folder branches should render checked',
        );
    });

    test('LayersTreeView tree mode shows partial folder status when descendant capabilities are mixed', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'primary', path: 'company/standards/sdlc', enabled: false },
            ],
        };

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const primaryRepo = top.find((i) => String(i.label) === 'CoreMeta');
        assert.ok(primaryRepo, 'Tree mode should group layers under repository roots');

        const primaryChildren = provider.getChildren(primaryRepo as never);
        const companyFolder = primaryChildren.find((i) => String(i.label) === 'company');
        assert.ok(companyFolder, 'Repository root should contain first path segment folders');
        assert.strictEqual(
            companyFolder?.checkboxState,
            vscode.TreeItemCheckboxState.Unchecked,
            'Mixed folder branches should render unchecked',
        );
        assert.ok(
            String(companyFolder?.description).includes('1/2 enabled'),
            'Mixed folder branches should describe the enabled ratio',
        );

        const tooltip = companyFolder?.tooltip as vscode.MarkdownString;
        assert.ok(
            tooltip.value.includes('Branch state: partially enabled (1/2)'),
            'Folder tooltip should explain the mixed branch rule',
        );
    });

    test('LayersTreeView tree mode uses directory METAFLOW metadata for non-capability folders', async () => {
        const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metaflow-layers-dir-meta-'));

        try {
            const capabilitiesFolder = path.join(repoRoot, 'capabilities');
            await fs.mkdir(capabilitiesFolder, { recursive: true });
            await fs.writeFile(
                path.join(capabilitiesFolder, 'METAFLOW.md'),
                [
                    '---',
                    'name: Capability Catalog',
                    'description: Human-friendly grouping metadata for Capabilities browsing.',
                    '---',
                    '',
                    '# Capability Catalog',
                ].join('\n'),
                'utf-8',
            );

            state.config = {
                metadataRepos: [
                    {
                        id: 'ai-metadata',
                        localPath: repoRoot,
                        name: 'CoreMeta',
                    },
                ],
                layerSources: [
                    {
                        repoId: 'ai-metadata',
                        path: 'capabilities/devtools',
                    },
                    {
                        repoId: 'ai-metadata',
                        path: 'capabilities/comms',
                    },
                ],
            };

            state.capabilityByLayer = {
                'ai-metadata/capabilities/devtools': { name: 'Developer Tools' },
                'ai-metadata/capabilities/comms': { name: 'Communications' },
            };
            state.effectiveFiles = [];

            const provider = new LayersTreeViewProvider(state, () => 'tree');
            const [repoFolder] = provider.getChildren();
            const repoChildren = provider.getChildren(repoFolder as never);
            const capabilitiesFolderItem = repoChildren.find(
                (item) => String(item.label) === 'Capability Catalog',
            );

            assert.ok(
                capabilitiesFolderItem,
                'Non-capability Capabilities-tree folder should use directory METAFLOW display metadata',
            );

            const tooltip = capabilitiesFolderItem?.tooltip as vscode.MarkdownString;
            assert.ok(
                tooltip.value.includes(
                    'Human-friendly grouping metadata for Capabilities browsing.',
                ),
                'Tooltip should include directory METAFLOW description',
            );
        } finally {
            await fs.rm(repoRoot, { recursive: true, force: true });
        }
    });

    test('LayersTreeView tree mode shows browse-only artifact-type children for single-repo layers', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['capabilities/communication'],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/guide.md',
                sourcePath: path.join(
                    os.tmpdir(),
                    'metaflow-layer',
                    '.github',
                    'instructions',
                    'guide.md',
                ),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(
                    os.tmpdir(),
                    'metaflow-layer',
                    '.github',
                    'prompts',
                    'review.prompt.md',
                ),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
        ];

        const provider = new LayersTreeViewProvider(state, () => 'tree');

        const top = provider.getChildren();
        const capabilitiesFolder = top.find((i) => String(i.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'Single-repo tree mode should expose capabilities folder');

        const capabilitiesChildren = provider.getChildren(capabilitiesFolder as never);
        const communicationLayer = capabilitiesChildren.find(
            (i) => String(i.label) === 'communication',
        );
        assert.ok(communicationLayer, 'Should expose communication layer node under capabilities');

        const artifactChildren = provider.getChildren(communicationLayer as never);
        const labels = artifactChildren.map((i) => String(i.label));
        assert.deepStrictEqual(labels, ['instructions', 'prompts']);
        assert.ok(
            artifactChildren.every((i) => String(i.contextValue).startsWith('layerArtifactType:')),
            'Artifact-type children should be rendered with artifact-specific layerArtifactType context',
        );
        assert.ok(
            artifactChildren.every((i) => i.checkboxState === undefined),
            'Artifact-type children should be browse-only without checkboxes',
        );
    });

    test('LayersTreeView tree mode exposes browse-only descendants under artifact nodes', async () => {
        const layerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metaflow-layers-browse-'));
        const instructionDir = path.join(layerRoot, '.github', 'instructions', 'policies');
        const skillDir = path.join(layerRoot, '.github', 'skills', 'review-skill');
        await fs.mkdir(instructionDir, { recursive: true });
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(
            path.join(instructionDir, 'coding.instructions.md'),
            [
                '---',
                'name: Coding Policy',
                'description: Repository coding policy.',
                '---',
                '# Coding',
            ].join('\n'),
            'utf-8',
        );
        await fs.writeFile(
            path.join(skillDir, 'SKILL.md'),
            [
                '---',
                'name: review-skill',
                'description: Review skill description.',
                '---',
                '# Review Skill',
            ].join('\n'),
            'utf-8',
        );

        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['capabilities/communication'],
        };
        state.effectiveFiles = [
            {
                relativePath: 'instructions/policies/coding.instructions.md',
                sourcePath: path.join(instructionDir, 'coding.instructions.md'),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
            {
                relativePath: 'skills/review-skill/SKILL.md',
                sourcePath: path.join(skillDir, 'SKILL.md'),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
        ];

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const capabilitiesFolder = top.find((item) => String(item.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'Single-repo tree mode should expose capabilities folder');

        const capabilitiesChildren = provider.getChildren(capabilitiesFolder as never);
        const communicationLayer = capabilitiesChildren.find(
            (item) => String(item.label) === 'communication',
        );
        assert.ok(communicationLayer, 'Should expose communication layer node under capabilities');

        const artifactChildren = provider.getChildren(communicationLayer as never);
        const instructionsItem = artifactChildren.find(
            (item) => String(item.label) === 'instructions',
        );
        const skillsItem = artifactChildren.find((item) => String(item.label) === 'skills');

        assert.strictEqual(
            instructionsItem?.checkboxState,
            undefined,
            'Artifact node should be browse-only',
        );
        assert.strictEqual(
            instructionsItem?.collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed,
            'Artifact node should become expandable when descendants exist',
        );
        assert.strictEqual(
            skillsItem?.collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed,
            'Skill artifact node should become expandable when descendants exist',
        );

        const instructionFolders = provider.getChildren(instructionsItem as never);
        assert.strictEqual(
            instructionFolders.length,
            1,
            'Instructions node should expose nested browse folder',
        );
        assert.strictEqual(instructionFolders[0].contextValue, 'layerArtifactBrowseFolder');
        assert.strictEqual(
            instructionFolders[0].checkboxState,
            undefined,
            'Browse folder should not expose checkbox state',
        );
        assert.strictEqual(String(instructionFolders[0].label), 'policies');

        const instructionFiles = provider.getChildren(instructionFolders[0] as never);
        assert.strictEqual(instructionFiles.length, 1, 'Browse folder should expose nested file');
        assert.strictEqual(instructionFiles[0].contextValue, 'layerArtifactBrowseFile');
        assert.strictEqual(
            instructionFiles[0].checkboxState,
            undefined,
            'Browse file should not expose checkbox state',
        );
        assert.strictEqual(
            String(instructionFiles[0].label),
            'Coding Policy',
            'Browse file should prefer frontmatter name',
        );

        const skillFolders = provider.getChildren(skillsItem as never);
        assert.strictEqual(skillFolders.length, 1, 'Skills node should expose skill folder');
        assert.strictEqual(
            String(skillFolders[0].label),
            'Review',
            'Skill folder should prefer user-facing metadata name',
        );
        assert.strictEqual(
            skillFolders[0].checkboxState,
            undefined,
            'Skill browse folder should not expose checkbox state',
        );
    });

    test('LayersTreeView tree mode keeps disabled capabilities browseable', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [
                { repoId: 'primary', path: 'capabilities/communication', enabled: false },
            ],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/guide.md',
                sourcePath: path.join(
                    os.tmpdir(),
                    'metaflow-layer-disabled',
                    '.github',
                    'instructions',
                    'guide.md',
                ),
                sourceLayer: 'primary/capabilities/communication',
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(
                    os.tmpdir(),
                    'metaflow-layer-disabled',
                    '.github',
                    'prompts',
                    'review.prompt.md',
                ),
                sourceLayer: 'primary/capabilities/communication',
                classification: 'settings',
            },
        ];

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const primaryRepo = top.find((item) => String(item.label) === 'CoreMeta');
        assert.ok(
            primaryRepo,
            'Tree mode should group disabled capabilities under their repository root',
        );

        const repoChildren = provider.getChildren(primaryRepo as never);
        const capabilitiesFolder = repoChildren.find(
            (item) => String(item.label) === 'capabilities',
        );
        assert.ok(capabilitiesFolder, 'Disabled capability branch should remain visible');

        const capabilitiesChildren = provider.getChildren(capabilitiesFolder as never);
        const communicationLayer = capabilitiesChildren.find(
            (item) => String(item.label) === 'communication',
        );
        assert.ok(communicationLayer, 'Disabled capability node should still be present');
        assert.strictEqual(
            communicationLayer?.checkboxState,
            vscode.TreeItemCheckboxState.Unchecked,
            'Disabled capability should remain unchecked',
        );
        assert.strictEqual(
            communicationLayer?.collapsibleState,
            vscode.TreeItemCollapsibleState.Collapsed,
            'Disabled capability should remain expandable for browsing',
        );

        const artifactChildren = provider.getChildren(communicationLayer as never);
        assert.deepStrictEqual(
            artifactChildren.map((item) => String(item.label)),
            ['instructions', 'prompts'],
        );
        assert.ok(
            artifactChildren.every((item) =>
                String(item.contextValue).startsWith('layerArtifactType:'),
            ),
            'Disabled capabilities should still expose artifact-specific artifact-type browse nodes',
        );

        const instructionsItem = artifactChildren.find(
            (item) => String(item.label) === 'instructions',
        );
        assert.ok(
            String(instructionsItem?.description).includes('capability disabled'),
            'Artifact nodes should signal disabled capability state',
        );
    });

    test('LayersTreeView shows capability name as primary label when metadata available', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
        };
        state.capabilityByLayer = {
            'primary/standards/sdlc': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
                description: 'Shared SDLC traceability metadata.',
                license: 'MIT',
            },
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const items = provider.getChildren();
        assert.strictEqual(items.length, 1);
        assert.strictEqual(
            String(items[0].label),
            'SDLC Traceability',
            'Capability name should be the primary label',
        );
        assert.ok(
            String(items[0].description).includes('standards/sdlc'),
            `Description should include configured path, got: ${items[0].description}`,
        );
        assert.ok(
            String(items[0].description).includes('CoreMeta'),
            `Description should retain repo label, got: ${items[0].description}`,
        );
    });

    test('experimental capabilities project visible indicators into Capabilities and Effective Files runtime rows', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
        };
        state.capabilityByLayer = {
            'primary/standards/sdlc': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
                description: 'Shared SDLC traceability metadata.',
                experimental: true,
            },
        };
        state.effectiveFiles = [
            {
                relativePath: 'instructions/trace.instructions.md',
                sourcePath: path.join(
                    os.tmpdir(),
                    'metaflow-experimental',
                    'trace.instructions.md',
                ),
                sourceLayer: 'primary/standards/sdlc',
                sourceRepo: 'primary',
                sourceCapabilityId: 'sdlc-traceability',
                sourceCapabilityName: 'SDLC Traceability',
                sourceCapabilityExperimental: true,
                classification: 'settings',
            },
        ];

        const layersProvider = new LayersTreeViewProvider(state, () => 'flat');
        const [layerItem] = layersProvider.getChildren();
        assert.ok(
            String(layerItem.description).includes('experimental'),
            `Capabilities row should include experimental marker, got: ${layerItem.description}`,
        );

        const filesProvider = new FilesTreeViewProvider(state, () => 'unified');
        const [artifactNode] = filesProvider.getChildren();
        const [fileNode] = filesProvider.getChildren(artifactNode as never);
        assert.ok(
            String(fileNode.description).startsWith('[Experimental] '),
            `Effective Files row should include an experimental provenance marker, got: ${fileNode.description}`,
        );
    });

    test('LayersTreeView surfaces governed and violating capability cues in the Extension Host', () => {
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: false }],
        };
        state.capabilityByLayer = {
            'primary/standards/sdlc': {
                id: 'sdlc-traceability',
                name: 'SDLC Traceability',
                description: 'Shared SDLC traceability metadata.',
            },
        };
        state.governanceContract = {
            requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
            severity: 'error',
        };
        state.governanceCompliance = {
            status: 'non-compliant',
            severity: 'error',
            activeProfile: 'default',
            activeProfileLocked: false,
            allowedProfiles: [],
            lockedProfiles: [],
            violations: [
                {
                    id: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
                    code: 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING',
                    message:
                        'Required capability "primary/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
                    repoId: 'primary',
                    path: 'standards/sdlc',
                    severity: 'error',
                    rule: 'requiredCapabilities',
                },
            ],
        };

        const provider = new LayersTreeViewProvider(state, () => 'flat');
        const [item] = provider.getChildren();

        assert.ok(String(item.description).includes('governance non-compliant'));
        assert.ok(
            (item.tooltip as vscode.MarkdownString).value.includes(
                'Governance: non-compliant (severity: error)',
            ),
        );
        assert.ok(
            (item.tooltip as vscode.MarkdownString).value.includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc] Required capability "primary/standards/sdlc" is not active because the capability is disabled in the active runtime state.',
            ),
        );
    });

    // ── FilesTreeView ──────────────────────────────────────────

    test('FilesTreeView returns empty when no files', () => {
        const provider = new FilesTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without files');
    });

    test('FilesTreeView shows loading placeholder while config is resolving', () => {
        state.isLoading = true;

        const provider = new FilesTreeViewProvider(state);
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should show one loading placeholder item');
        assert.strictEqual(String(items[0].label), 'Loading...');
        assert.strictEqual(items[0].contextValue, 'loading');
    });

    test('FilesTreeView uses a unified hierarchy with realization annotations', () => {
        const repoRoot = path.join(os.tmpdir(), 'metaflow-source-core');

        state.config = {
            metadataRepo: {
                name: 'CoreMeta',
                localPath: repoRoot,
            },
            layers: ['company/components/devtools'],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/policies/coding.md',
                sourcePath: path.join(
                    repoRoot,
                    'company',
                    'components',
                    'devtools',
                    '.github',
                    'instructions',
                    'policies',
                    'coding.md',
                ),
                sourceLayer: 'company/components/devtools',
                classification: 'settings',
            },
            {
                relativePath: 'agents/test.agent.md',
                sourcePath: path.join(
                    repoRoot,
                    'company',
                    'components',
                    'devtools',
                    '.github',
                    'agents',
                    'test.agent.md',
                ),
                sourceLayer: 'company/components/devtools',
                classification: 'synchronized',
            },
        ];

        const provider = new FilesTreeViewProvider(state, () => 'unified');
        const items = provider.getChildren();
        assert.deepStrictEqual(
            items.map((i) => String(i.label)),
            ['instructions', 'agents'],
            'Unified mode should group by artifact type in canonical order',
        );

        const instructionsFolder = items.find((i) => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Should expose instructions artifact bucket');

        const instructionsChildren = provider.getChildren(instructionsFolder as never);
        const policiesFolder = instructionsChildren.find((i) => String(i.label) === 'policies');
        assert.ok(policiesFolder, 'Should preserve nested folder hierarchy under artifact type');
        assert.strictEqual(policiesFolder?.command?.command, 'revealInExplorer');
        assert.deepStrictEqual(
            policiesFolder?.command?.arguments,
            [
                vscode.Uri.file(
                    path.join(
                        repoRoot,
                        'company',
                        'components',
                        'devtools',
                        '.github',
                        'instructions',
                        'policies',
                    ),
                ),
            ],
            'Reveal should target the real source folder',
        );

        const policyChildren = provider.getChildren(policiesFolder as never);
        const codingFile = policyChildren.find((i) => String(i.label) === 'coding.md');
        assert.ok(codingFile, 'Should contain leaf file');
        assert.strictEqual(codingFile?.description, 'CoreMeta (settings)');
        assert.strictEqual(codingFile?.command?.command, 'vscode.open');

        const agentsFolder = items.find((i) => String(i.label) === 'agents');
        assert.ok(agentsFolder, 'Should expose agents artifact bucket');

        const agentChildren = provider.getChildren(agentsFolder as never);
        const agentFile = agentChildren.find((i) => String(i.label) === 'test.agent.md');
        assert.ok(agentFile, 'Should show synchronized file leaf');
        assert.strictEqual(agentFile?.description, 'CoreMeta (synchronized)');
        assert.strictEqual(agentFile?.command?.command, 'vscode.open');
    });

    test('FilesTreeView displays root layer as repository name instead of dot', () => {
        const repoRoot = path.join(os.tmpdir(), 'metaflow-source-ai-metadata');

        state.config = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: repoRoot,
                },
            ],
            layerSources: [
                {
                    repoId: 'ai-metadata',
                    path: '.',
                },
            ],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/root.instructions.md',
                sourcePath: path.join(repoRoot, '.github', 'instructions', 'root.instructions.md'),
                sourceLayer: 'ai-metadata/.',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
        ];

        const provider = new FilesTreeViewProvider(state, () => 'unified');
        const items = provider.getChildren();

        const instructionsFolder = items.find((i) => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Root-layer file should be grouped under its artifact type');

        const instructionChildren = provider.getChildren(instructionsFolder as never);
        const instructionFile = instructionChildren.find(
            (i) => String(i.label) === 'root.instructions.md',
        );
        assert.ok(instructionFile, 'Should include root instruction file');

        return provider
            .resolveTreeItem(
                instructionFile,
                instructionFile as never,
                { isCancellationRequested: false } as vscode.CancellationToken,
            )
            .then((resolvedItem) => {
                const tooltip = resolvedItem.tooltip as vscode.MarkdownString;
                assert.ok(
                    tooltip.value.includes('Layer: metaflow-source-ai-metadata'),
                    'Tooltip should use the resolved repository display label for root layers',
                );
            });
    });

    test('FilesTreeView repoTree mode groups files under repository roots', () => {
        const repoRoot = path.join(os.tmpdir(), 'metaflow-source-ai-metadata-repo-tree');

        state.config = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    name: 'ai-metadata',
                    localPath: repoRoot,
                },
            ],
            layerSources: [
                {
                    repoId: 'ai-metadata',
                    path: 'company/components/devtools',
                },
            ],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/policies/coding.md',
                sourcePath: path.join(
                    repoRoot,
                    'company',
                    'components',
                    'devtools',
                    '.github',
                    'instructions',
                    'policies',
                    'coding.md',
                ),
                sourceLayer: 'ai-metadata/company/components/devtools',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
        ];

        const provider = new FilesTreeViewProvider(state, () => 'repoTree');
        const items = provider.getChildren();

        const repoFolder = items.find(
            (i) => String(i.label) === 'metaflow-source-ai-metadata-repo-tree',
        );
        assert.ok(repoFolder, 'Top-level node should use the resolved repository display label');

        const repoChildren = provider.getChildren(repoFolder as never);
        const companyFolder = repoChildren.find((i) => String(i.label) === 'company');
        assert.ok(companyFolder, 'Repository should contain first layer segment');

        const companyChildren = provider.getChildren(companyFolder as never);
        const componentsFolder = companyChildren.find((i) => String(i.label) === 'components');
        assert.ok(componentsFolder, 'Should preserve layer hierarchy beneath repository');

        const componentsChildren = provider.getChildren(componentsFolder as never);
        const devtoolsFolder = componentsChildren.find((i) => String(i.label) === 'devtools');
        assert.ok(devtoolsFolder, 'Should preserve nested layer hierarchy');

        const devtoolsChildren = provider.getChildren(devtoolsFolder as never);
        const instructionsFolder = devtoolsChildren.find((i) => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Should show metadata category after layer path');
    });

    test('FilesTreeView repoTree mode uses directory METAFLOW metadata for non-capability folders', async () => {
        const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metaflow-tree-dir-meta-'));
        const folderRoot = path.join(repoRoot, 'areas', 'browsing');
        const instructionPath = path.join(
            folderRoot,
            '.github',
            'instructions',
            'guide.instructions.md',
        );

        await fs.mkdir(path.dirname(instructionPath), { recursive: true });
        await fs.writeFile(
            path.join(folderRoot, 'METAFLOW.md'),
            [
                '---',
                'name: Browsing Metadata',
                'description: Human-friendly grouping metadata for repoTree browsing.',
                '---',
                '',
                '# Browsing Metadata',
            ].join('\n'),
            'utf-8',
        );
        await fs.writeFile(instructionPath, '# Guide\n', 'utf-8');

        state.config = {
            metadataRepos: [
                {
                    id: 'ai-metadata',
                    localPath: repoRoot,
                },
            ],
            layerSources: [
                {
                    repoId: 'ai-metadata',
                    path: 'areas/browsing',
                },
            ],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/guide.instructions.md',
                sourcePath: instructionPath,
                sourceLayer: 'ai-metadata/areas/browsing',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
        ];

        const provider = new FilesTreeViewProvider(state, () => 'repoTree');
        const [repoFolder] = provider.getChildren();
        const repoChildren = provider.getChildren(repoFolder as never);
        const areasFolder = repoChildren.find((item) => String(item.label) === 'areas');
        assert.ok(areasFolder, 'Repository should preserve the path parent for grouping folders');

        const areaChildren = provider.getChildren(areasFolder as never);
        const browsingFolder = areaChildren.find(
            (item) => String(item.label) === 'Browsing Metadata',
        );
        assert.ok(
            browsingFolder,
            'Non-capability folder should use directory METAFLOW display metadata',
        );

        const resolvedFolder = await provider.resolveTreeItem(
            browsingFolder!,
            browsingFolder! as never,
            { isCancellationRequested: false } as vscode.CancellationToken,
        );
        const tooltip = resolvedFolder.tooltip as vscode.MarkdownString;
        assert.ok(
            tooltip.value.includes('Human-friendly grouping metadata for repoTree browsing.'),
            'Tooltip should include directory METAFLOW description',
        );
    });

    test('staged expand-all runtime stays bounded to capability-depth targets before deeper nodes', async () => {
        const expandEmitter = new vscode.EventEmitter<{ element: vscode.TreeItem }>();
        const collapseEmitter = new vscode.EventEmitter<{ element: vscode.TreeItem }>();

        const layersRevealed: string[] = [];
        state.config = {
            metadataRepos: [
                { id: 'primary', name: 'CoreMeta', localPath: '.ai/core-meta', enabled: true },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                { repoId: 'primary', path: 'company/core/devtools', enabled: true },
            ],
        };
        state.effectiveFiles = [
            {
                relativePath: 'instructions/root.instructions.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-stage', 'root.instructions.md'),
                sourceLayer: 'primary/company/core',
                classification: 'settings',
            },
            {
                relativePath: 'skills/review/SKILL.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-stage', 'review-skill', 'SKILL.md'),
                sourceLayer: 'primary/company/core/devtools',
                classification: 'settings',
            },
        ];

        const layersProvider = new LayersTreeViewProvider(state, () => 'tree');
        const layersController = new StagedTreeExpandController(
            {
                async reveal(element) {
                    layersRevealed.push(String(element.label));
                    expandEmitter.fire({ element });
                },
                onDidExpandElement: expandEmitter.event,
                onDidCollapseElement: collapseEmitter.event,
            },
            layersProvider,
        );

        await layersController.expandAll();
        assert.deepStrictEqual(
            layersRevealed,
            ['CoreMeta'],
            'first Layers-tree expansion should reveal only the repository root',
        );

        await layersController.expandAll();
        assert.deepStrictEqual(
            layersRevealed,
            ['CoreMeta', 'company'],
            'second Layers-tree expansion should reveal the first capability ancestor only',
        );

        await layersController.expandAll();
        assert.deepStrictEqual(
            layersRevealed,
            ['CoreMeta', 'company'],
            'third Layers-tree expansion should remain bounded before concrete capability nodes',
        );

        const filesExpandEmitter = new vscode.EventEmitter<{ element: vscode.TreeItem }>();
        const filesCollapseEmitter = new vscode.EventEmitter<{ element: vscode.TreeItem }>();
        const filesRevealed: string[] = [];
        state.config = {
            metadataRepos: [{ id: 'ai-metadata', localPath: '.ai/ai-metadata' }],
            layerSources: [{ repoId: 'ai-metadata', path: 'areas/browsing' }],
        };
        state.effectiveFiles = [
            {
                relativePath: 'instructions/guide.instructions.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-stage-files', 'guide.instructions.md'),
                sourceLayer: 'ai-metadata/areas/browsing',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
            {
                relativePath: 'skills/review/SKILL.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-stage-files', 'review', 'SKILL.md'),
                sourceLayer: 'ai-metadata/areas/browsing',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
        ];

        const filesProvider = new FilesTreeViewProvider(state, () => 'repoTree');
        const filesController = new StagedTreeExpandController(
            {
                async reveal(element) {
                    filesRevealed.push(String(element.label));
                    filesExpandEmitter.fire({ element });
                },
                onDidExpandElement: filesExpandEmitter.event,
                onDidCollapseElement: filesCollapseEmitter.event,
            },
            filesProvider,
        );

        await filesController.expandAll();
        assert.deepStrictEqual(
            filesRevealed,
            ['ai-metadata', 'areas'],
            'first Files-tree expansion should stop at capability-depth ancestors',
        );

        await filesController.expandAll();
        assert.deepStrictEqual(
            filesRevealed,
            ['ai-metadata', 'areas', 'browsing'],
            'second Files-tree expansion should reveal the bounded capability node only',
        );
        assert.strictEqual(
            filesRevealed.includes('skills'),
            false,
            'staged expansion should not auto-expand skill-directory internals',
        );

        layersController.dispose();
        filesController.dispose();
        expandEmitter.dispose();
        collapseEmitter.dispose();
        filesExpandEmitter.dispose();
        filesCollapseEmitter.dispose();
    });
});
