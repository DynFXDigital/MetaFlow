/**
 * Extension activation integration tests.
 *
 * Validates:
 * - Extension activates when .metaflow/config.jsonc is present.
 * - All commands are registered after activation.
 * - Extension context is set correctly.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
    'metaflow.addRepoSource',
    'metaflow.apply',
    'metaflow.checkRepoUpdates',
    'metaflow.clean',
    'metaflow.collapseAllFiles',
    'metaflow.collapseAllLayers',
    'metaflow.collapseFilesBranch',
    'metaflow.collapseLayersBranch',
    'metaflow.configureCapabilityInjection',
    'metaflow.configureGlobalInjectionDefaults',
    'metaflow.configureRepoInjectionDefaults',
    'metaflow.createProfile',
    'metaflow.deleteProfile',
    'metaflow.deselectAllLayers',
    'metaflow.duplicateProfile',
    'metaflow.expandAllFiles',
    'metaflow.expandAllLayers',
    'metaflow.expandFilesBranch',
    'metaflow.expandLayersBranch',
    'metaflow.initConfig',
    'metaflow.initMetaFlowAiMetadata',
    'metaflow.injectionPolicy.global.inherit',
    'metaflow.injectionPolicy.global.synchronize',
    'metaflow.injectionPolicy.global.settings',
    'metaflow.offerGitIgnoreStateConfiguration',
    'metaflow.offerGitRemotePromotion',
    'metaflow.openCapabilityDetails',
    'metaflow.openConfig',
    'metaflow.preview',
    'metaflow.promote',
    'metaflow.pullRepository',
    'metaflow.refresh',
    'metaflow.synchronization.agents.inherit',
    'metaflow.synchronization.agents.synchronize',
    'metaflow.synchronization.agents.settings',
    'metaflow.synchronization.hooks.inherit',
    'metaflow.synchronization.hooks.synchronize',
    'metaflow.synchronization.hooks.settings',
    'metaflow.synchronization.instructions.inherit',
    'metaflow.synchronization.instructions.synchronize',
    'metaflow.synchronization.instructions.settings',
    'metaflow.synchronization.prompts.inherit',
    'metaflow.synchronization.prompts.synchronize',
    'metaflow.synchronization.prompts.settings',
    'metaflow.synchronization.skills.inherit',
    'metaflow.synchronization.skills.synchronize',
    'metaflow.synchronization.skills.settings',
    'metaflow.removeMetaFlowCapability',
    'metaflow.removeRepoSource',
    'metaflow.rescanRepository',
    'metaflow.selectAllLayers',
    'metaflow.status',
    'metaflow.switchProfile',
    'metaflow.toggleFilesViewMode',
    'metaflow.toggleLayer',
    'metaflow.toggleLayerArtifactType',
    'metaflow.toggleLayerBranch',
    'metaflow.toggleLayersViewMode',
    'metaflow.toggleRepoSource',
];

suite('Extension Activation', () => {
    suiteSetup(async function () {
        this.timeout(15000);
        // Ensure the extension is activated
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('extension is present', () => {
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        assert.ok(ext, 'Extension should be found in extensions list');
    });

    test('extension activates successfully', async () => {
        const ext = vscode.extensions.getExtension('dynfxdigital.metaflow-ai');
        assert.ok(ext, 'Extension not found');
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.strictEqual(ext.isActive, true, 'Extension should be active');
    });

    test('all commands are registered', async () => {
        const allCommands = await vscode.commands.getCommands(true);
        for (const cmd of EXPECTED_COMMANDS) {
            assert.ok(allCommands.includes(cmd), `Command "${cmd}" should be registered`);
        }
    });

    test('refresh command executes without error', async () => {
        // This should not throw even if config loading fails
        await vscode.commands.executeCommand('metaflow.refresh');
    });

    test('status command executes without error', async () => {
        await vscode.commands.executeCommand('metaflow.status');
    });

    test('preview command executes without error', async () => {
        // May show a warning if no config is loaded, but shouldn't throw
        await vscode.commands.executeCommand('metaflow.preview');
    });
});
