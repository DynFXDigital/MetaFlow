/**
 * GUI tests — Extension Activation.
 *
 * Verifies that MetaFlow activates correctly, the activity bar entry is
 * present, and the sidebar sections render.
 */

import * as assert from 'assert';
import { ActivityBar, SideBarView } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    openMetaFlowSidebar,
    getSection,
    expandSection,
    waitForSectionReady,
    getVisibleItemTexts,
} from './helpers/metaflowGuiHelpers';

suite('Activation and Baseline UI', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        sideBar = await openMetaFlowSidebar();
        // Wait for at least one core section to be ready before running tests
        const layersSection = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(layersSection);
    });

    test('MetaFlow activity bar entry is present', async () => {
        const activityBar = new ActivityBar();
        const control = await activityBar.getViewControl('MetaFlow');
        assert.ok(control, 'MetaFlow activity bar entry not found');
    });

    test('Opening MetaFlow sidebar returns a SideBarView', async () => {
        assert.ok(sideBar, 'MetaFlow sidebar did not open');
    });

    test('Sidebar contains Capabilities section', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section not found in MetaFlow sidebar');
        const title = await section.getTitle();
        assert.match(
            title.toLowerCase(),
            /capabilities|layers/,
            `Unexpected section title: "${title}"`,
        );
    });

    test('Sidebar contains Effective Files section', async () => {
        const section = await getSection(sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section not found');
    });

    test('Sidebar contains AI Metadata section', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        assert.ok(section, 'AI Metadata section not found');
    });

    test('Sidebar contains Profiles section', async () => {
        const section = await getSection(sideBar, 'Profiles');
        assert.ok(section, 'Profiles section not found');
    });

    test('Capabilities section shows loaded items (not just Loading...)', async () => {
        const section = await getSection(sideBar, 'Capabilities');
        await expandSection(section);
        const texts = await getVisibleItemTexts(section);
        assert.ok(texts.length > 0, 'Capabilities section is empty');
        const hasRealContent = texts.some(
            (t) => t.length > 0 && !t.toLowerCase().includes('loading'),
        );
        assert.ok(
            hasRealContent,
            `Capabilities section still shows loading state. Items: ${texts.join(', ')}`,
        );
    });
});
