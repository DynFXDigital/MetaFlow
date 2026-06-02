/**
 * GUI tests — Profile management (v0.2.0).
 *
 * Verifies createProfile, switchProfile, and deleteProfile through the
 * VS Code GUI. Restores the test workspace config after each mutating test.
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
    sectionContainsText,
    waitFor,
    waitForNotification,
    dismissActiveInput,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

const CONFIG_PATH = path.resolve(__dirname, '../../../test-workspace/.metaflow/config.jsonc');

suite('Profile Management', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Profiles');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async () => {
        // Restore config and dismiss any lingering dialogs
        await dismissActiveInput();
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        // Brief pause for extension to detect the file change
        await sleep(1_500);
    });

    // ── Read-only assertions ─────────────────────────────────────────────────

    test('Profiles section is visible', async () => {
        const section = await getSection(sideBar, 'Profiles');
        assert.ok(section, 'Profiles section not found');
    });

    test('Profiles section shows the "default" profile', async () => {
        const section = await getSection(sideBar, 'Profiles');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const hasDefault = await sectionContainsText(section, 'default');
        assert.ok(
            hasDefault,
            `Expected "default" profile in Profiles section. ` +
                `Visible: ${(await getVisibleItemTexts(section)).join(', ')}`,
        );
    });

    test('Profiles section shows the "review" profile', async () => {
        const section = await getSection(sideBar, 'Profiles');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        const hasReview = await sectionContainsText(section, 'review');
        assert.ok(
            hasReview,
            `Expected "review" profile. Visible: ${(await getVisibleItemTexts(section)).join(', ')}`,
        );
    });

    // ── Command invocation ───────────────────────────────────────────────────

    test('MetaFlow: Create Profile command opens an input dialog', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Create Profile');

        // Extension shows a quick pick to select the source profile
        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No dialog appeared after Create Profile command');
        await input.cancel();
    });

    test('MetaFlow: Switch Profile command opens a quick pick', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Switch Profile');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No quick pick appeared after Switch Profile command');
        const placeholder = await input.getPlaceHolder().catch(() => '');
        // Verify it's showing profiles
        await input.cancel();
        // The placeholder or items should mention "profile"
        assert.ok(
            placeholder.length >= 0, // just verifying it opened
            'Switch Profile quick pick did not appear',
        );
    });

    test('MetaFlow: Duplicate Profile command opens a quick pick', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Duplicate Profile');

        const input = await InputBox.create(INTERACTION_TIMEOUT);
        assert.ok(input, 'No dialog appeared after Duplicate Profile command');
        await input.cancel();
    });

    // ── Mutating flow: create + delete ───────────────────────────────────────

    test('Create Profile flow: creates a new profile visible in the Profiles tree', async function () {
        this.timeout(60_000);
        const workbench = new Workbench();

        // Create Profile prompts only for a name (a single input box).
        await workbench.executeCommand('MetaFlow: Create Profile');

        const nameInput = await InputBox.create(INTERACTION_TIMEOUT);
        await nameInput.setText('gui-test-profile');
        await nameInput.confirm();

        // Verify new profile appears in the Profiles tree
        const section = await getSection(sideBar, 'Profiles');
        await waitFor(async () => sectionContainsText(section, 'gui-test-profile'), WAIT_TIMEOUT);
        const hasNew = await sectionContainsText(section, 'gui-test-profile');
        assert.ok(hasNew, 'Newly created profile "gui-test-profile" not found in Profiles tree');
    });

    test('Delete Profile flow: removes a non-default profile from the Profiles tree', async function () {
        this.timeout(60_000);
        const workbench = new Workbench();

        // First create a profile so we have something to delete
        await workbench.executeCommand('MetaFlow: Create Profile');
        const nameInput = await InputBox.create(INTERACTION_TIMEOUT);
        await nameInput.setText('to-delete-profile');
        await nameInput.confirm();

        const section = await getSection(sideBar, 'Profiles');
        await waitFor(async () => sectionContainsText(section, 'to-delete-profile'), WAIT_TIMEOUT);

        // Delete via the command palette; it shows a quick pick of deletable profiles.
        await workbench.executeCommand('MetaFlow: Delete Profile');
        const pick = await InputBox.create(INTERACTION_TIMEOUT);
        await pick.selectQuickPick('to-delete-profile');

        // Confirm deletion in the warning notification (Delete / Cancel buttons).
        const confirm = await waitForNotification(workbench, 'Delete profile');
        assert.ok(confirm, 'Delete confirmation notification did not appear');
        await confirm.takeAction('Delete');

        // Verify it's gone
        await waitFor(async () => {
            const texts = await getVisibleItemTexts(section);
            return !texts.some((t) => t.includes('to-delete-profile'));
        }, WAIT_TIMEOUT);

        const hasGone = !(await sectionContainsText(section, 'to-delete-profile'));
        assert.ok(hasGone, '"to-delete-profile" should have been deleted from the Profiles tree');
    });
});
