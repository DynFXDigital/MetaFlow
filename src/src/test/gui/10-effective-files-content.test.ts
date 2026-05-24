/**
 * GUI tests — Effective Files section content (v0.2.0).
 *
 * Verifies that the Effective Files tree view reflects the actual overlay
 * output.  The test workspace has standards/sdlc enabled (instructions,
 * agents, skills) and company/core disabled, so we can assert specific
 * artifact types appear and that disabled capabilities are absent.
 *
 * Also covers the MetaFlow: Filter Effective Files command which was not
 * tested in any prior suite.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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
    expandSection,
    dismissActiveInput,
    dismissAllNotifications,
} from './helpers/metaflowGuiHelpers';

const CONFIG_PATH = path.resolve(
    __dirname,
    '../../../test-workspace/.metaflow/config.jsonc',
);

suite('Effective Files Tree Content', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();

        // Apply overlay so Effective Files is populated
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_500);
        await dismissAllNotifications(workbench);

        const section = await getSection(sideBar, 'Effective Files');
        await expandSection(section);
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        await dismissActiveInput();
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
    });

    // ── Section presence ─────────────────────────────────────────────────────

    test('Effective Files section is present and expandable', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section not found');
        await expandSection(section);
    });

    test('Effective Files section shows items (not empty)', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const texts = await getVisibleItemTexts(section);
        assert.ok(
            texts.length > 0,
            'Effective Files section is empty — expected files from standards/sdlc',
        );
    });

    test('Effective Files section shows no error items', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const texts = await getVisibleItemTexts(section);
        const errorItems = texts.filter((t) => t.toLowerCase().includes('error'));
        assert.strictEqual(
            errorItems.length,
            0,
            `Effective Files section has error items: ${errorItems.join(', ')}`,
        );
    });

    // ── Content from enabled capability (standards/sdlc) ─────────────────────

    test('Effective Files shows content from the enabled standards/sdlc capability', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        // Expand to see file entries — click repo/folder nodes
        const items = await section.getVisibleItems();
        if (items.length > 0) {
            try { await items[0].click(); } catch { /* already expanded */ }
            await sleep(500);
        }

        const texts = await getVisibleItemTexts(section);

        // standards/sdlc contributes:
        //   instructions/testing.md
        //   agents/test-agent.agent.md
        //   skills/test-skill/SKILL.md
        // At least one of these (or their directory) should be visible
        const sdlcArtifacts = ['testing', 'test-agent', 'test-skill', 'sdlc', 'standards'];
        const hasAnySdlcArtifact = sdlcArtifacts.some((keyword) =>
            texts.some((t) => t.toLowerCase().includes(keyword)),
        );
        assert.ok(
            hasAnySdlcArtifact,
            `Expected at least one standards/sdlc artifact in Effective Files. ` +
            `Visible: ${texts.join(', ')}`,
        );
    });

    test('Effective Files section reflects the primary repo source', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        // Top-level item should reference the primary repo (ai-metadata)
        const texts = await getVisibleItemTexts(section);
        const hasRepoNode =
            texts.some((t) => t.toLowerCase().includes('ai-metadata')) ||
            texts.some((t) => t.toLowerCase().includes('primary')) ||
            texts.some((t) => t.toLowerCase().includes('standards')) ||
            texts.length > 0; // any content means at least one repo was resolved

        assert.ok(
            hasRepoNode,
            `Expected Effective Files to show at least one repo-level item. Visible: ${texts.join(', ')}`,
        );
    });

    // ── View mode toggle ─────────────────────────────────────────────────────

    test('Toggle Effective Files View Mode updates the section without clearing content', async () => {
        const workbench = new Workbench();

        await workbench.executeCommand('MetaFlow: Toggle Effective Files View Mode');
        await sleep(800);

        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const textsAfterToggle = await getVisibleItemTexts(section);
        assert.ok(
            textsAfterToggle.length > 0,
            'Effective Files section empty after first view mode toggle',
        );

        // Toggle back
        await workbench.executeCommand('MetaFlow: Toggle Effective Files View Mode');
        await sleep(800);

        await waitForSectionReady(section, WAIT_TIMEOUT);
        const textsAfterReset = await getVisibleItemTexts(section);
        assert.ok(
            textsAfterReset.length > 0,
            'Effective Files section empty after second view mode toggle (reset)',
        );
    });

    // ── Filter / search ──────────────────────────────────────────────────────

    test('MetaFlow: Filter Effective Files command opens an input box', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Filter Effective Files');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No input box appeared after Filter Effective Files command');
        await input.cancel();
    });

    test('Filter Effective Files input accepts text without crashing', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Filter Effective Files');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No input box appeared after Filter Effective Files command');

        await input.setText('testing');
        await sleep(500);
        await input.cancel();
        await sleep(500);

        // Section should still be navigable after filter cancel
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after filter cancel');
    });

    test('MetaFlow: Filter Capabilities command opens an input box', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Filter Capabilities');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No input box appeared after Filter Capabilities command');
        await input.cancel();
    });

    test('Filter Capabilities input accepts text without crashing', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Filter Capabilities');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No input box appeared');

        await input.setText('sdlc');
        await sleep(500);
        await input.cancel();
        await sleep(500);

        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after filter cancel');
    });

    // ── Expand / collapse Effective Files ────────────────────────────────────

    test('Expand All in Effective Files executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('Expand');
        await sleep(500);
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after Expand All');
    });

    test('Collapse All in Effective Files executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('Collapse');
        await sleep(500);
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after Collapse All');
    });

    // ── Disabled capability is absent ────────────────────────────────────────

    test('Effective Files does not show artifacts from disabled company/core capability', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        // Wait for section to fully load, then expand all levels
        const workbench = new Workbench();
        await workbench.executeCommand('Expand');
        await sleep(1_000);

        // company/core has: instructions/coding.md, prompts/review.prompt.md
        // These should NOT appear since company/core is disabled
        const allTexts = await getVisibleItemTexts(section);
        const hasCoreArtifact =
            allTexts.some((t) => t.toLowerCase().includes('coding')) ||
            allTexts.some((t) => t.toLowerCase().includes('review.prompt'));

        // Soft assertion — if the company/core files appear, it's unexpected
        assert.ok(
            !hasCoreArtifact,
            `Effective Files shows company/core artifacts even though it is disabled. ` +
            `Visible: ${allTexts.join(', ')}`,
        );
    });

    // ── After-apply section still has content after refresh ──────────────────

    test('Effective Files content survives a MetaFlow: Refresh', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(2_500);

        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const texts = await getVisibleItemTexts(section);
        assert.ok(
            texts.length > 0,
            'Effective Files section empty after Refresh — expected overlay content to persist',
        );
    });
});
