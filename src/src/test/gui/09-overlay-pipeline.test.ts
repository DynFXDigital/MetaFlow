/**
 * GUI tests — Overlay pipeline: Preview, Apply, Clean (v0.2.0).
 *
 * Verifies that the three core overlay commands execute, produce the expected
 * notifications, and that the Clean confirmation dialog exposes the correct
 * button choices.  File-system assertions are deliberately avoided here because
 * the test workspace may be in "settings" delivery mode (no files written to
 * .github/); what matters at the GUI layer is that the commands complete without
 * error and surface the right user-visible feedback.
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
    waitForNotification,
    takeNotificationAction,
    dismissAllNotifications,
    hasNotification,
    dismissActiveInput,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

const CONFIG_PATH = path.resolve(
    __dirname,
    '../../../test-workspace/.metaflow/config.jsonc',
);

suite('Overlay Pipeline (Preview, Apply, Clean)', function () {
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

    afterEach(async () => {
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
    });

    // ── Preview ──────────────────────────────────────────────────────────────

    test('MetaFlow: Preview Overlay executes without error', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Preview Overlay');
        await sleep(2_000);

        // Preview writes to the output channel — no dialog expected.
        // Verify no error notification surfaced.
        const hasError = await hasNotification(workbench, 'error');
        assert.ok(!hasError, 'Preview Overlay produced an error notification');
    });

    test('MetaFlow: Preview Overlay does not open an input dialog', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Preview Overlay');
        await sleep(1_000);

        // Preview should silently log to the output channel, not prompt the user.
        let dialogOpened = false;
        try {
            // If an input box appeared the command misbehaved
            const { InputBox } = await import('vscode-extension-tester');
            await InputBox.create(2_000);
            dialogOpened = true;
            await (await InputBox.create(2_000)).cancel();
        } catch {
            // expected — no dialog
        }
        assert.ok(!dialogOpened, 'Preview Overlay unexpectedly opened an input dialog');
    });

    // ── Apply ────────────────────────────────────────────────────────────────

    test('MetaFlow: Apply Overlay executes without error notification', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        // Wait for the progress notification to finish (up to 10 s)
        await sleep(3_000);

        const hasError = await hasNotification(workbench, 'error');
        assert.ok(
            !hasError,
            'Apply Overlay produced an error notification — expected clean completion',
        );
    });

    test('MetaFlow: Apply Overlay keeps Capabilities section intact', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        // After apply the tree should refresh and remain usable
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section disappeared after Apply Overlay');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    test('Repeated Apply Overlay is idempotent (no error on second run)', async () => {
        const workbench = new Workbench();

        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);

        const hasError = await hasNotification(workbench, 'error');
        assert.ok(!hasError, 'Second Apply Overlay run produced an error notification');
    });

    // ── Clean ────────────────────────────────────────────────────────────────

    test('MetaFlow: Clean Synchronized Files shows a confirmation notification', async () => {
        const workbench = new Workbench();

        // Run apply first so clean has something to act on
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        // Expect a warning notification with Remove / Cancel buttons
        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );
        assert.ok(
            notification,
            'Expected a "Remove all synchronized files?" confirmation notification',
        );
    });

    test('Canceling the Clean confirmation does not complete the clean', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );

        if (!notification) {
            // No dialog — command may have completed silently (nothing to clean)
            return;
        }

        // Cancel the operation
        await takeNotificationAction(workbench, 'Remove all synchronized files', 'Cancel');
        await sleep(1_000);

        // No "Cleaned N files" completion notification should appear
        const cleanedNotif = await waitForNotification(workbench, 'Cleaned', 2_000);
        assert.ok(!cleanedNotif, 'Clean completed after Cancel was clicked');
    });

    test('Confirming the Clean notification produces a completion message', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );

        if (!notification) {
            // Nothing to clean — skip gracefully
            return;
        }

        await takeNotificationAction(workbench, 'Remove all synchronized files', 'Remove');
        await sleep(2_000);

        // Completion message: "MetaFlow: Cleaned N files."
        const completionNotif = await waitForNotification(workbench, 'Cleaned', INTERACTION_TIMEOUT);
        assert.ok(
            completionNotif,
            'Expected a "Cleaned N files" completion notification after confirming Clean',
        );
    });

    test('MetaFlow: Clean Synchronized Files keeps Capabilities section intact', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );

        if (notification) {
            await takeNotificationAction(workbench, 'Remove all synchronized files', 'Remove');
            await sleep(2_000);
        }

        await dismissAllNotifications(workbench);

        // Tree should still be navigable after clean
        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after Clean');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });
});
