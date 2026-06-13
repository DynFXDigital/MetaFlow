/**
 * GUI tests — AI Metadata (config) tree view.
 *
 * Verifies that the AI Metadata view renders repo sources from the
 * test workspace config (.ai/ai-metadata with id "primary").
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

suite('AI Metadata Tree View', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        sideBar = await openMetaFlowSidebar();
    });

    test('AI Metadata section is present and expandable', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        assert.ok(section, 'AI Metadata section not found');
        await expandSection(section);
    });

    test('AI Metadata section shows at least one item after load', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const texts = await getVisibleItemTexts(section);
        assert.ok(
            texts.length > 0,
            'AI Metadata section should show at least one item (repo source or warning)',
        );
    });

    test('AI Metadata section shows the "primary" repo source from test workspace', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        // The test workspace config has one repo with id "primary" at ".ai/ai-metadata"
        const hasRepo = await sectionContainsText(section, 'primary') ||
                        await sectionContainsText(section, 'ai-metadata');
        assert.ok(
            hasRepo,
            `Expected a repo source item containing "primary" or "ai-metadata". ` +
            `Visible items: ${(await getVisibleItemTexts(section)).join(', ')}`,
        );
    });

    test('AI Metadata repo source item is visible at top level', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        await expandSection(section);
        const texts = await getVisibleItemTexts(section);
        // Expect a non-empty section with real labels
        const realItems = texts.filter(
            (t) => t.length > 0 && !t.toLowerCase().includes('loading'),
        );
        assert.ok(realItems.length > 0, `No real items in AI Metadata tree. Texts: ${texts.join(', ')}`);
    });
});
