/**
 * GUI tests — Bulk layer selection and view mode toggles (v0.2.0).
 *
 * Verifies selectAllLayers, deselectAllLayers, toggleLayersViewMode, and
 * toggleFilesViewMode through the VS Code GUI.
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
    getVisibleItemTexts,
    dismissActiveInput,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

const CONFIG_PATH = path.resolve(__dirname, '../../../test-workspace/.metaflow/config.jsonc');

suite('Bulk Layer Selection and View Mode Toggles', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const capSection = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(capSection, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        await dismissActiveInput();
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
    });

    // ── View mode toggles (non-mutating state) ───────────────────────────────

    test('MetaFlow: Toggle Capabilities View Mode command executes without error', async () => {
        const workbench = new Workbench();
        // Toggle once
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await sleep(500);
        // Toggle back
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await sleep(500);
        // Verify the section still shows items (did not break the tree)
        const section = await getSection(sideBar, 'Capabilities');
        const texts = await getVisibleItemTexts(section);
        assert.ok(texts.length > 0, 'Capabilities section is empty after view mode toggle');
    });

    test('MetaFlow: Toggle Effective Files View Mode command executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Toggle Effective Files View Mode');
        await sleep(500);
        await workbench.executeCommand('MetaFlow: Toggle Effective Files View Mode');
        await sleep(500);
        // Just verify the section did not disappear
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after view mode toggle');
    });

    // ── Expand/collapse ──────────────────────────────────────────────────────

    test('Expand All in Capabilities executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('Expand');
        await sleep(500);
        const section = await getSection(sideBar, 'Capabilities');
        const texts = await getVisibleItemTexts(section);
        assert.ok(texts.length > 0, 'No items visible after Expand All');
    });

    test('Collapse All in Capabilities executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('Collapse');
        await sleep(500);
        // Section itself should still be there
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after Collapse All');
    });

    // ── Bulk select / deselect ────────────────────────────────────────────────

    // Smoke-level: the command completes and the Capabilities section survives.
    // The fixture has an active profile, so enablement is persisted as profile
    // overrides rather than base `enabled` flags — suite 24 verifies that
    // effective enablement rigorously. Here we only confirm no crash.
    test('MetaFlow: Select All command runs without error', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Select All');
        await sleep(1_000);
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after Select All');
    });

    test('MetaFlow: Deselect All command runs without error', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Select All');
        await sleep(500);
        await workbench.executeCommand('MetaFlow: Deselect All');
        await sleep(1_000);
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after Deselect All');
    });
});
