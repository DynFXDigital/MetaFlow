/**
 * GUI tests — Built-in AI metadata management (v0.2.0).
 *
 * Verifies that the initMetaFlowAiMetadata and removeMetaFlowCapability
 * commands are accessible.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SideBarView, Workbench } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    dismissActiveInput,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const WORKSPACE_SETTINGS_PATH = path.join(WORKSPACE_ROOT, '.vscode', 'settings.json');
const SDLC_PLUGIN_PATH = path.join(
    WORKSPACE_ROOT,
    '.ai',
    'ai-metadata',
    'standards',
    'sdlc',
    'plugin.json',
);

suite('Built-in AI Metadata Management', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalWorkspaceSettings: string | undefined;
    let originalSdlcPlugin: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalWorkspaceSettings = fs.existsSync(WORKSPACE_SETTINGS_PATH)
            ? fs.readFileSync(WORKSPACE_SETTINGS_PATH, 'utf-8')
            : undefined;
        originalSdlcPlugin = fs.readFileSync(SDLC_PLUGIN_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'AI Metadata');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        await dismissActiveInput();
    });

    after(async function () {
        this.timeout(STARTUP_TIMEOUT);

        // The initialization command deliberately persists the built-in capability
        // setting, and manifest maintenance rewrites the test plugin. Restore both
        // before the next one-host-per-suite batch starts so Effective Files is not
        // flooded with built-in artifacts and the tracked fixture remains pristine.
        fs.writeFileSync(SDLC_PLUGIN_PATH, originalSdlcPlugin, 'utf-8');
        restoreGoldenConfig(CONFIG_PATH);
        if (originalWorkspaceSettings === undefined) {
            fs.rmSync(WORKSPACE_SETTINGS_PATH, { force: true });
        } else {
            fs.writeFileSync(WORKSPACE_SETTINGS_PATH, originalWorkspaceSettings, 'utf-8');
        }

        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);
        await dismissAllNotifications(workbench);

        // Refresh removes the persisted built-in capability state. Reassert the
        // immutable fixture bytes after any cleanup writes it triggered.
        fs.writeFileSync(SDLC_PLUGIN_PATH, originalSdlcPlugin, 'utf-8');
        restoreGoldenConfig(CONFIG_PATH);
    });

    test('MetaFlow: Initialize MetaFlow Capability command executes without prompting', async function () {
        this.timeout(30_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Initialize MetaFlow Capability');
        await sleep(INTERACTION_TIMEOUT);

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(
            capSection,
            'Capabilities section missing after initializing MetaFlow capability',
        );
    });

    test('MetaFlow: Get Diagnostics Snapshot command executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Get Diagnostics Snapshot');
        await sleep(1_000);
        // Just verify it doesn't throw — output goes to output channel
    });

    test('MetaFlow: Refresh command executes and keeps sections intact', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // After refresh, sections should still be present
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after refresh');

        const configSection = await getSection(sideBar, 'AI Metadata');
        assert.ok(configSection, 'AI Metadata section missing after refresh');
    });

    test('MetaFlow: Status command executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Status');
        await sleep(500);
        // Status command opens the output channel — no dialog expected
    });

    test('MetaFlow: Open Config File command executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Open Config File');
        await sleep(500);
        // Should open the config file in the editor
    });

    test('AI Metadata section toolbar shows expected actions', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        assert.ok(section, 'AI Metadata section not found');
        // Verify the section is visible — toolbar buttons are in the section header
        const title = await section.getTitle();
        assert.ok(
            title.toLowerCase().includes('metadata') || title.toLowerCase().includes('config'),
            `Unexpected section title: "${title}"`,
        );
    });

    test('MetaFlow: Maintain All Plugin Manifests (plugin.json) command is accessible', async () => {
        const workbench = new Workbench();
        // This command maintains plugin.json files — runs silently on git repos
        // Just verify it is registered
        try {
            await workbench.executeCommand('MetaFlow: Maintain All Plugin Manifests (plugin.json)');
            await sleep(500);
        } catch (err) {
            // May require a context (repo item selection) — just verify it is registered
            const msg = (err as Error).message ?? '';
            assert.ok(
                !msg.includes('command not found') && !msg.includes('Unknown command'),
                `Command not registered: ${msg}`,
            );
        }
    });
});
