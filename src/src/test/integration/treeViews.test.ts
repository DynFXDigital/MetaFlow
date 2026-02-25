/**
 * TreeView provider integration tests.
 *
 * Validates that TreeView providers return expected items
 * after config is loaded and overlay is resolved.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { ConfigTreeViewProvider } from '../../views/configTreeView';
import { ProfilesTreeViewProvider } from '../../views/profilesTreeView';
import { LayersTreeViewProvider } from '../../views/layersTreeView';
import { FilesTreeViewProvider } from '../../views/filesTreeView';
import { createState, ExtensionState } from '../../commands/commandHandlers';

suite('TreeView Providers', () => {

    let state: ExtensionState;

    suiteSetup(async function () {
        this.timeout(15000);

        // Ensure extension is active
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        // Refresh to load config
        await vscode.commands.executeCommand('metaflow.refresh');

        // Give state a moment to propagate
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    setup(() => {
        state = createState();
    });

    // ── ConfigTreeView ─────────────────────────────────────────

    test('ConfigTreeView returns empty when no config', () => {
        const provider = new ConfigTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without config');
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
            layerSources: [
                { repoId: 'primary', path: 'company', enabled: true },
            ],
        };

        const provider = new ConfigTreeViewProvider(state);
        const rootItems = provider.getChildren();
        const repoItems = provider.getChildren(rootItems[0] as never);

        assert.strictEqual(repoItems.length, 2, 'Should return all repository items under Repositories section');
        assert.strictEqual(repoItems[0].checkboxState, vscode.TreeItemCheckboxState.Checked, 'Primary repo should expose a checkbox and be togglable');
        assert.strictEqual(repoItems[1].checkboxState, vscode.TreeItemCheckboxState.Unchecked, 'Disabled repo should show unchecked checkbox');
    });

    // ── ProfilesTreeView ───────────────────────────────────────

    test('ProfilesTreeView returns empty when no profiles', () => {
        const provider = new ProfilesTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without profiles');
    });

    test('ProfilesTreeView returns profile items', () => {
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
        assert.strictEqual(items.length, 2, 'Should return 2 profiles');
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
        const active = items.find(i => i.description === '(active)');
        assert.ok(active, 'Should have one active profile');
        assert.strictEqual(active.label, 'lean');
    });

    // ── LayersTreeView ─────────────────────────────────────────

    test('LayersTreeView returns empty when no config', () => {
        const provider = new LayersTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without config');
    });

    test('LayersTreeView returns layers for single-repo', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata' },
            layers: ['company/core', 'standards/sdlc'],
        };

        const provider = new LayersTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 2, 'Should return 2 layers');
        assert.strictEqual(items[0].checkboxState, vscode.TreeItemCheckboxState.Checked, 'Single-repo layers should expose a checked checkbox');
        assert.strictEqual(items[0].description, '');
    });

    test('LayersTreeView shows layers and reflects disabled repos', () => {
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

        const provider = new LayersTreeViewProvider(state);
        const items = provider.getChildren();

        assert.strictEqual(items.length, 2, 'Should return only layer rows');

        const disabledLayer = items.find(i => String(i.label) === 'team/social');
        assert.ok(disabledLayer, 'Should include layer item for disabled repo');
        assert.strictEqual(disabledLayer?.description, '(secondary, repo disabled)');
    });

    test('LayersTreeView displays root layer as repository name', () => {
        state.config = {
            metadataRepos: [
                { id: 'ai-metadata', name: 'ai-metadata', localPath: '.ai/ai-metadata', enabled: true },
            ],
            layerSources: [
                { repoId: 'ai-metadata', path: '.', enabled: true },
            ],
        };

        const provider = new LayersTreeViewProvider(state);
        const items = provider.getChildren();

        assert.strictEqual(items.length, 1, 'Should return the root layer row');
        assert.strictEqual(String(items[0].label), 'ai-metadata', 'Root layer should be displayed as repo name');
        assert.strictEqual(items[0].description, '(ai-metadata)');
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
        const primaryRepo = top.find(i => String(i.label) === 'CoreMeta');
        assert.ok(primaryRepo, 'Tree mode should group layers under repository roots');

        const primaryChildren = provider.getChildren(primaryRepo as never);
        const companyFolder = primaryChildren.find(i => String(i.label) === 'company');
        assert.ok(companyFolder, 'Repository root should contain first path segment folders');

        const companyChildren = provider.getChildren(companyFolder as never);
        const coreLayer = companyChildren.find(i => String(i.label) === 'core');
        assert.ok(coreLayer, 'Path segment with a matching layer should be present');
        assert.strictEqual(coreLayer?.checkboxState, vscode.TreeItemCheckboxState.Checked, 'Layer nodes should remain toggleable in tree mode');
        assert.ok(typeof (coreLayer as { layerIndex?: unknown }).layerIndex === 'number', 'Layer nodes should preserve layer index for toggle command wiring');

        const coreChildren = provider.getChildren(coreLayer as never);
        const devtoolsLayer = coreChildren.find(i => String(i.label) === 'devtools');
        assert.ok(devtoolsLayer, 'Nested layer paths should be represented as nested tree nodes');
    });

    test('LayersTreeView tree mode keeps single-repo hierarchy', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['company/core', 'company/standards/sdlc'],
        };

        const provider = new LayersTreeViewProvider(state, () => 'tree');
        const top = provider.getChildren();
        const companyFolder = top.find(i => String(i.label) === 'company');
        assert.ok(companyFolder, 'Single-repo tree mode should show top-level hierarchy segment');

        const companyChildren = provider.getChildren(companyFolder as never);
        const standardsFolder = companyChildren.find(i => String(i.label) === 'standards');
        assert.ok(standardsFolder, 'Single-repo hierarchy should preserve intermediate folders');

        const standardsChildren = provider.getChildren(standardsFolder as never);
        const sdlcLayer = standardsChildren.find(i => String(i.label) === 'sdlc');
        assert.ok(sdlcLayer, 'Leaf layer node should be present in hierarchy');
        assert.strictEqual(sdlcLayer?.checkboxState, vscode.TreeItemCheckboxState.Checked, 'Leaf layer nodes should remain checked/toggleable');
    });

    test('LayersTreeView tree mode shows artifact-type checkbox children for single-repo layers', () => {
        state.config = {
            metadataRepo: { localPath: '.ai/ai-metadata', name: 'PrimaryRepo' },
            layers: ['capabilities/communication'],
        };

        state.effectiveFiles = [
            {
                relativePath: 'instructions/guide.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-layer', '.github', 'instructions', 'guide.md'),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(os.tmpdir(), 'metaflow-layer', '.github', 'prompts', 'review.prompt.md'),
                sourceLayer: 'capabilities/communication',
                classification: 'settings',
            },
        ];

        const provider = new LayersTreeViewProvider(state, () => 'tree');

        const top = provider.getChildren();
        const capabilitiesFolder = top.find(i => String(i.label) === 'capabilities');
        assert.ok(capabilitiesFolder, 'Single-repo tree mode should expose capabilities folder');

        const capabilitiesChildren = provider.getChildren(capabilitiesFolder as never);
        const communicationLayer = capabilitiesChildren.find(i => String(i.label) === 'communication');
        assert.ok(communicationLayer, 'Should expose communication layer node under capabilities');

        const artifactChildren = provider.getChildren(communicationLayer as never);
        const labels = artifactChildren.map(i => String(i.label));
        assert.deepStrictEqual(labels, ['instructions', 'prompts']);
        assert.ok(
            artifactChildren.every(i => i.contextValue === 'layerArtifactType'),
            'Artifact-type children should be rendered with layerArtifactType context'
        );
        assert.ok(
            artifactChildren.every(i => i.checkboxState === vscode.TreeItemCheckboxState.Checked),
            'Artifact-type children should be checked by default'
        );
    });

    // ── FilesTreeView ──────────────────────────────────────────

    test('FilesTreeView returns empty when no files', () => {
        const provider = new FilesTreeViewProvider(state);
        const items = provider.getChildren();
        assert.strictEqual(items.length, 0, 'Should return no items without files');
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
                sourcePath: path.join(repoRoot, 'company', 'components', 'devtools', '.github', 'instructions', 'policies', 'coding.md'),
                sourceLayer: 'company/components/devtools',
                classification: 'settings',
            },
            {
                relativePath: 'agents/test.agent.md',
                sourcePath: path.join(repoRoot, 'company', 'components', 'devtools', '.github', 'agents', 'test.agent.md'),
                sourceLayer: 'company/components/devtools',
                classification: 'materialized',
            },
        ];

        const provider = new FilesTreeViewProvider(state);
        const items = provider.getChildren();
        const companyFolder = items.find(i => String(i.label) === 'company');
        assert.ok(companyFolder, 'Should preserve hierarchy above .github');

        const companyChildren = provider.getChildren(companyFolder as never);
        const componentsFolder = companyChildren.find(i => String(i.label) === 'components');
        assert.ok(componentsFolder, 'Should preserve hierarchy above .github');

        const componentsChildren = provider.getChildren(componentsFolder as never);
        const devtoolsFolder = componentsChildren.find(i => String(i.label) === 'devtools');
        assert.ok(devtoolsFolder, 'Should preserve hierarchy above .github');

        const devtoolsChildren = provider.getChildren(devtoolsFolder as never);
        const githubFolder = devtoolsChildren.find(i => String(i.label) === '.github');
        assert.strictEqual(githubFolder, undefined, 'Should suppress .github from displayed hierarchy');

        const instructionsFolder = devtoolsChildren.find(i => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Should show metadata category folders directly under layer path');
        assert.strictEqual(instructionsFolder?.command?.command, 'revealInExplorer');
        assert.deepStrictEqual(
            instructionsFolder?.command?.arguments,
            [vscode.Uri.file(path.join(repoRoot, 'company', 'components', 'devtools', '.github', 'instructions'))],
            'Reveal should still target the real .github folder path'
        );

        const instructionsChildren = provider.getChildren(instructionsFolder as never);
        const policiesFolder = instructionsChildren.find(i => String(i.label) === 'policies');
        assert.ok(policiesFolder, 'Should preserve nested folder hierarchy');
        assert.strictEqual(policiesFolder?.command?.command, 'revealInExplorer');

        const policyChildren = provider.getChildren(policiesFolder as never);
        const codingFile = policyChildren.find(i => String(i.label) === 'coding.md');
        assert.ok(codingFile, 'Should contain leaf file');
        assert.strictEqual(codingFile?.description, 'CoreMeta (settings)');
        assert.strictEqual(codingFile?.command?.command, 'vscode.open');

        const agentsFolder = devtoolsChildren.find(i => String(i.label) === 'agents');
        assert.ok(agentsFolder, 'Should show folder for materialized files');
        assert.strictEqual(agentsFolder?.command?.command, 'revealInExplorer');

        const agentChildren = provider.getChildren(agentsFolder as never);
        const agentFile = agentChildren.find(i => String(i.label) === 'test.agent.md');
        assert.ok(agentFile, 'Should show materialized file leaf');
        assert.strictEqual(agentFile?.description, 'CoreMeta (materialized)');
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

        const provider = new FilesTreeViewProvider(state);
        const items = provider.getChildren();

        const repoFolder = items.find(i => String(i.label) === 'ai-metadata');
        assert.ok(repoFolder, 'Root layer should be shown as repository name');

        const dotFolder = items.find(i => String(i.label) === '.');
        assert.strictEqual(dotFolder, undefined, 'Dot layer label should not be shown in effective files tree');

        const repoChildren = provider.getChildren(repoFolder as never);
        const instructionsFolder = repoChildren.find(i => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Root layer should include instructions folder');

        const instructionChildren = provider.getChildren(instructionsFolder as never);
        const instructionFile = instructionChildren.find(i => String(i.label) === 'root.instructions.md');
        assert.ok(instructionFile, 'Should include root instruction file');

        const tooltipText = String(instructionFile?.tooltip ?? '');
        assert.ok(
            tooltipText.includes('Layer: ai-metadata (raw: ai-metadata/.)'),
            'Tooltip should include transformed display layer and raw source layer value'
        );
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
                sourcePath: path.join(repoRoot, 'company', 'components', 'devtools', '.github', 'instructions', 'policies', 'coding.md'),
                sourceLayer: 'ai-metadata/company/components/devtools',
                sourceRepo: 'ai-metadata',
                classification: 'settings',
            },
        ];

        const provider = new FilesTreeViewProvider(state, () => 'repoTree');
        const items = provider.getChildren();

        const repoFolder = items.find(i => String(i.label) === 'ai-metadata');
        assert.ok(repoFolder, 'Top-level node should be repository');

        const repoChildren = provider.getChildren(repoFolder as never);
        const companyFolder = repoChildren.find(i => String(i.label) === 'company');
        assert.ok(companyFolder, 'Repository should contain first layer segment');

        const companyChildren = provider.getChildren(companyFolder as never);
        const componentsFolder = companyChildren.find(i => String(i.label) === 'components');
        assert.ok(componentsFolder, 'Should preserve layer hierarchy beneath repository');

        const componentsChildren = provider.getChildren(componentsFolder as never);
        const devtoolsFolder = componentsChildren.find(i => String(i.label) === 'devtools');
        assert.ok(devtoolsFolder, 'Should preserve nested layer hierarchy');

        const devtoolsChildren = provider.getChildren(devtoolsFolder as never);
        const instructionsFolder = devtoolsChildren.find(i => String(i.label) === 'instructions');
        assert.ok(instructionsFolder, 'Should show metadata category after layer path');
    });
});
