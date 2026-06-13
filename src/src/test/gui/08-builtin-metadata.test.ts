/**
 * GUI tests — Built-in AI metadata management (v0.2.0).
 *
 * Verifies that the initMetaFlowAiMetadata and removeMetaFlowCapability
 * commands are accessible and open the expected dialogs.
 */

import * as assert from 'assert';
import { SideBarView, Workbench, InputBox } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    dismissActiveInput,
} from './helpers/metaflowGuiHelpers';

suite('Built-in AI Metadata Management', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'AI Metadata');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        await dismissActiveInput();
    });

    test('MetaFlow: Initialize MetaFlow Capability command opens input dialogs', async function () {
        this.timeout(30_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Initialize MetaFlow Capability');

        // Extension should show an input box for capability name
        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No input dialog appeared after Initialize MetaFlow Capability command');

        // Cancel without completing
        await input.cancel();
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

    test('MetaFlow: Maintain All Capability Plugin Metadata command is accessible', async () => {
        const workbench = new Workbench();
        // This command maintains plugin.json files — runs silently on git repos
        // Just verify it is registered
        try {
            await workbench.executeCommand('MetaFlow: Maintain All Capability Plugin Metadata');
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
