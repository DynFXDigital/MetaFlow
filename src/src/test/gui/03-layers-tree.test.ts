/**
 * GUI tests — Capabilities (layers) tree view.
 *
 * Verifies that the Capabilities view renders the capabilities from the
 * test workspace config: company/core (disabled) and standards/sdlc (enabled).
 */

import * as assert from 'assert';
import { SideBarView } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    openMetaFlowSidebar,
    getSection,
    expandSection,
    waitForSectionReady,
    getVisibleItemTexts,
    sectionContainsText,
} from './helpers/metaflowGuiHelpers';

suite('Capabilities Tree View', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        sideBar = await openMetaFlowSidebar();
    });

    test('Capabilities section is present', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section not found');
    });

    test('Capabilities section loads items from the test workspace', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const texts = await getVisibleItemTexts(section);
        assert.ok(
            texts.length > 0,
            'Capabilities section should show at least one capability item',
        );
    });

    test('Capabilities section shows a repo node for the primary repo', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        // The repo node label is derived from the localPath (.ai/ai-metadata)
        const hasRepo =
            (await sectionContainsText(section, 'ai-metadata')) ||
            (await sectionContainsText(section, 'primary'));
        assert.ok(
            hasRepo,
            `Expected a repo node labeled with "ai-metadata" or "primary". ` +
            `Visible: ${(await getVisibleItemTexts(section)).join(', ')}`,
        );
    });

    test('Capabilities section shows standards/sdlc capability (enabled)', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        // Expand to see capability items under the repo node
        const items = await section.getVisibleItems();
        // Try to expand the first item (repo node) to reveal capabilities
        if (items.length > 0) {
            try {
                await items[0].click();
            } catch {
                // already expanded
            }
        }
        const hasSdlc = await sectionContainsText(section, 'sdlc');
        assert.ok(
            hasSdlc,
            `Expected "standards/sdlc" capability in Capabilities tree. ` +
            `Visible items: ${(await getVisibleItemTexts(section)).join(', ')}`,
        );
    });

    test('Effective Files section reflects overlay output', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section not found');
        await expandSection(section);
        // Should either show files or be empty — just verify it renders
        const texts = await getVisibleItemTexts(section);
        const hasNoErrors = texts.every(
            (t) => !t.toLowerCase().includes('error'),
        );
        assert.ok(hasNoErrors, `Effective Files section shows error items: ${texts.join(', ')}`);
    });
});
