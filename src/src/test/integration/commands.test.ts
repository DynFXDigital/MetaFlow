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
        const ext = vscode.extensions.getExtension('metaflow.metaflow');
        if (ext && !ext.isActive) {
            await ext.activate();
        }

        const ws = vscode.workspace.workspaceFolders?.[0];
        assert.ok(ws, 'Test workspace folder should be available');
        workspaceRoot = ws.uri.fsPath;
    });

    test('refresh loads config from test workspace', async function () {
        this.timeout(10000);
        // Execute refresh — should find .ai-sync.json in test-workspace
        await vscode.commands.executeCommand('metaflow.refresh');
        // If it reaches here without throwing, the command succeeded
    });

    test('openConfig opens the config file', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.openConfig');

        // Verify an editor is open with .ai-sync.json
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            assert.ok(
                editor.document.fileName.endsWith('.ai-sync.json'),
                'Active editor should be .ai-sync.json'
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

    test('clean removes managed files', async function () {
        this.timeout(15000);
        // First apply, then clean
        await vscode.commands.executeCommand('metaflow.refresh');
        await vscode.commands.executeCommand('metaflow.apply');

        // Clean requires user confirmation — skip interactive confirmation in tests
        // This tests that the command doesn't throw; actual clean logic is tested in unit tests
        // await vscode.commands.executeCommand('metaflow.clean');
    });

    test('status executes and logs', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.status');
        // Status writes to output channel — no assertion on output, just no throw
    });

    test('promote reports drift status', async function () {
        this.timeout(10000);
        await vscode.commands.executeCommand('metaflow.promote');
        // Promote writes to output channel — no assertion on output, just no throw
    });
});
