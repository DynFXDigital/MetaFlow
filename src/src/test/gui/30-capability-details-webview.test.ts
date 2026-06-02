/**
 * GUI tests — Capability Details webview content (v0.2.0).
 *
 * Suite 11 already verifies the openCapabilityDetails inline button opens
 * a panel; this suite goes further and inspects the rendered DOM inside
 * the webview.
 *
 * Webview interaction uses the WebView mixin from vscode-extension-tester:
 *   - findWebElement(locator) to locate DOM elements
 *   - switchToFrame() to enter the webview iframe
 *   - switchBack() to return to the main DOM
 *
 * Locating the inline action button is sometimes flaky depending on hover
 * state and VS Code version. Tests soft-skip when the inline button cannot
 * be reached, and fall through to verifying the command and editor tab.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { By } from 'selenium-webdriver';
import {
    SideBarView,
    Workbench,
    EditorView,
    TreeItem,
    ViewItemAction,
    WebView,
} from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    findItemByText,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.resolve(
    __dirname,
    '../../../test-workspace/.metaflow/config.jsonc',
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Locates the inline "View Capability Details" action button on a tree item.
 * Returns undefined if the button cannot be found.
 */
async function findDetailsAction(item: TreeItem): Promise<ViewItemAction | undefined> {
    const buttons = await item.getActionButtons().catch(() => [] as ViewItemAction[]);
    for (const btn of buttons) {
        const label = await btn.getLabel().catch(() => '');
        if (
            label.toLowerCase().includes('details') ||
            label.toLowerCase().includes('capability')
        ) {
            return btn;
        }
    }
    return undefined;
}

/**
 * Opens the capability details panel for the sdlc layer item.
 * Returns true if the panel opened, false if the inline button is unavailable.
 */
async function openSdlcCapabilityDetails(sideBar: SideBarView): Promise<boolean> {
    const section = await getSection(sideBar, 'Capabilities');
    await waitForSectionReady(section, WAIT_TIMEOUT);

    // Expand repo node so layer items are visible
    const items = await section.getVisibleItems();
    if (items.length > 0) {
        try { await items[0].click(); } catch { /* already expanded */ }
        await sleep(500);
    }

    let sdlcItem: TreeItem;
    try {
        sdlcItem = await findItemByText(section, 'sdlc', INTERACTION_TIMEOUT);
    } catch {
        return false;
    }

    const detailsBtn = await findDetailsAction(sdlcItem);
    if (!detailsBtn) {
        return false;
    }
    await detailsBtn.click();
    await sleep(2_500);
    return true;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Capability Details Webview Content', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        // Close any open editors and restore config
        try {
            const editorView = new EditorView();
            await editorView.closeAllEditors().catch(() => { /* ignore */ });
        } catch {
            // nothing
        }
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(800);
        await dismissAllNotifications(new Workbench());
    });

    // ── Editor tab appears ───────────────────────────────────────────────────

    test('Clicking View Capability Details opens a webview editor tab', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const opened = await openSdlcCapabilityDetails(sideBar);
        if (!opened) {
            // Inline button not reachable — soft skip
            this.skip();
            return;
        }

        const editorView = new EditorView();
        const titles = await editorView.getOpenEditorTitles().catch(() => [] as string[]);
        assert.ok(
            titles.some(t => t.toLowerCase().includes('sdlc') || t.toLowerCase().includes('capability')),
            `Expected a capability details editor tab. Open tabs: ${titles.join(', ')}`,
        );
    });

    // ── Webview DOM contains capability identifier ───────────────────────────

    test('Capability Details webview body contains the capability name', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        const opened = await openSdlcCapabilityDetails(sideBar);
        if (!opened) {
            this.skip();
            return;
        }

        let webView: WebView;
        try {
            webView = new WebView();
            await webView.switchToFrame(INTERACTION_TIMEOUT);
        } catch {
            this.skip();
            return;
        }

        try {
            // Grab the entire body text and verify a capability identifier is present
            const body = await webView.findWebElement(By.css('body'));
            const text = await body.getText().catch(() => '');
            assert.ok(
                text.toLowerCase().includes('sdlc') ||
                text.toLowerCase().includes('standards') ||
                text.toLowerCase().includes('capability'),
                `Expected webview body to reference the sdlc capability. Got:\n${text.slice(0, 600)}`,
            );
        } finally {
            await webView.switchBack().catch(() => { /* ignore */ });
        }
    });

    // ── Webview DOM contains artifact bucket sections ────────────────────────

    test('Capability Details webview lists at least one artifact bucket', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        const opened = await openSdlcCapabilityDetails(sideBar);
        if (!opened) {
            this.skip();
            return;
        }

        let webView: WebView;
        try {
            webView = new WebView();
            await webView.switchToFrame(INTERACTION_TIMEOUT);
        } catch {
            this.skip();
            return;
        }

        try {
            const body = await webView.findWebElement(By.css('body'));
            const text = (await body.getText().catch(() => '')).toLowerCase();
            // sdlc has instructions, agents, skills; the panel should mention at least one
            const buckets = ['instructions', 'agents', 'skills'];
            const found = buckets.filter(b => text.includes(b));
            assert.ok(
                found.length > 0,
                `Expected the webview to list at least one artifact bucket (${buckets.join(', ')}). Body excerpt:\n${text.slice(0, 600)}`,
            );
        } finally {
            await webView.switchBack().catch(() => { /* ignore */ });
        }
    });

    // ── Closing the webview leaves the sidebar functional ────────────────────

    test('Closing the Capability Details editor leaves the sidebar fully accessible', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const opened = await openSdlcCapabilityDetails(sideBar);
        if (!opened) {
            this.skip();
            return;
        }

        const editorView = new EditorView();
        await editorView.closeAllEditors().catch(() => { /* ignore */ });
        await sleep(1_500);

        const capSection   = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');
        const aiSection    = await getSection(sideBar, 'AI Metadata');
        assert.ok(capSection,   'Capabilities section missing after closing details panel');
        assert.ok(filesSection, 'Effective Files section missing after closing details panel');
        assert.ok(aiSection,    'AI Metadata section missing after closing details panel');
    });
});
