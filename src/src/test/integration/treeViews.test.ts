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
        const ext = vscode.extensions.getExtension('kiates.metaflow');
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
});
