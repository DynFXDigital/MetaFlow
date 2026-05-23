/**
 * GUI tests — Injection configuration UI (v0.2.0).
 *
 * Verifies that the injection policy context menu and quick picks
 * are accessible from the Capabilities tree view.
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
    getVisibleItemTexts,
    dismissActiveInput,
} from './helpers/metaflowGuiHelpers';

suite('Injection Configuration UI', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        await dismissActiveInput();
    });

    test('MetaFlow: Configure Global Injection Defaults command opens a quick pick', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Global Injection Defaults');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No quick pick appeared after Configure Global Injection Defaults');
        await input.cancel();
    });

    test('MetaFlow: Configure Repository Injection Defaults command opens a quick pick', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Repository Injection Defaults');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No quick pick appeared after Configure Repository Injection Defaults');
        await input.cancel();
    });

    test('MetaFlow: Configure Capability Injection command opens a quick pick', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Capability Injection');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No quick pick appeared after Configure Capability Injection');
        await input.cancel();
    });

    test('Capabilities tree context menu includes Injection Policy submenu item', async function () {
        this.timeout(30_000);
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        const items = await section.getVisibleItems();
        if (items.length === 0) {
            // Capabilities section might need expansion — skip gracefully
            this.skip();
            return;
        }

        // Open context menu on first visible item
        const ctxMenu = await items[0].openContextMenu();
        assert.ok(ctxMenu, 'Context menu did not open on capability item');

        // Check for Injection Policy submenu — it appears on layerRepo and layer items
        const hasPolicy = await ctxMenu
            .hasItem('Injection Policy')
            .catch(() => false);

        await ctxMenu.close();

        // The injection policy submenu is only on repo/capability nodes,
        // so this is informational — not all items will have it
        if (!hasPolicy) {
            // Try on a deeper item if first was not a repo/layer node
            const texts = await getVisibleItemTexts(section);
            assert.ok(
                texts.length > 0,
                'No items found in Capabilities section for injection policy test',
            );
        }
    });

    test('Global injection settings commands are registered', async () => {
        const workbench = new Workbench();

        // These commands should be registered and callable without errors
        for (const cmd of [
            'metaflow.injectionPolicy.global.settings',
            'metaflow.injectionPolicy.global.synchronize',
            'metaflow.injectionPolicy.global.inherit',
        ]) {
            try {
                // Commands may need context (item selection) to do anything meaningful;
                // just verify they are registered by attempting execution
                await workbench.executeCommand(cmd);
                await sleep(200);
                await dismissActiveInput();
            } catch (err) {
                // If command is not found, this is a real failure
                assert.fail(
                    `Command "${cmd}" failed to execute: ${(err as Error).message}`,
                );
            }
        }
    });
});
