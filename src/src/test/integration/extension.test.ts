/**
 * Extension activation integration tests.
 *
 * Validates:
 * - Extension activates when .metaflow.json is present.
 * - All commands are registered after activation.
 * - Extension context is set correctly.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
    'metaflow.refresh',
    'metaflow.preview',
    'metaflow.apply',
    'metaflow.clean',
    'metaflow.status',
    'metaflow.switchProfile',
    'metaflow.toggleLayer',
    'metaflow.toggleRepoSource',
    'metaflow.openConfig',
    'metaflow.initConfig',
    'metaflow.promote',
];

suite('Extension Activation', () => {

    suiteSetup(async function () {
        this.timeout(15000);
        // Ensure the extension is activated
        const ext = vscode.extensions.getExtension('metaflow.metaflow');
        if (ext && !ext.isActive) {
            await ext.activate();
        }
    });

    test('extension is present', () => {
        const ext = vscode.extensions.getExtension('metaflow.metaflow');
        assert.ok(ext, 'Extension should be found in extensions list');
    });

    test('extension activates successfully', async () => {
        const ext = vscode.extensions.getExtension('metaflow.metaflow');
        assert.ok(ext, 'Extension not found');
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.strictEqual(ext.isActive, true, 'Extension should be active');
    });

    test('all commands are registered', async () => {
        const allCommands = await vscode.commands.getCommands(true);
        for (const cmd of EXPECTED_COMMANDS) {
            assert.ok(
                allCommands.includes(cmd),
                `Command "${cmd}" should be registered`
            );
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
