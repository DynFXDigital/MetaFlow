/**
 * GUI tests — Extension error and warning states (v0.2.0).
 *
 * Verifies the extension's observable behavior when the workspace is in an
 * invalid or degraded configuration state:
 *
 *  - Malformed config JSON: trees empty out, no crash
 *  - Config with no enabled capabilities: Effective Files is empty
 *  - Config referencing a non-existent capability path: partial content from
 *    valid capabilities still appears; the missing-path capability contributes
 *    nothing to Effective Files
 *  - Config with empty metadataRepos: trees reflect empty state
 *  - Recovery after each error state is verified implicitly by afterEach
 *    restoring the original config
 *
 * These tests complement the malformed-config recovery test in
 * 14-config-watcher.test.ts by focusing on Refresh-triggered diagnostics
 * rather than the file-watcher path.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationType, SideBarView, Workbench } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    expandSection,
    waitForSectionReady,
    sectionContainsText,
    waitFor,
    hasNotification,
    waitForNotification,
    dismissAllNotifications,
    dismissActiveInput,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config builders ───────────────────────────────────────────────────────────

function validConfig(opts: { coreEnabled?: boolean; sdlcEnabled?: boolean } = {}): string {
    const { coreEnabled = false, sdlcEnabled = true } = opts;
    return JSON.stringify(
        {
            metadataRepos: [{
                id: 'primary',
                localPath: '.ai/ai-metadata',
                capabilities: [
                    { path: 'company/core',   enabled: coreEnabled },
                    { path: 'standards/sdlc', enabled: sdlcEnabled },
                ],
            }],
            profiles: {
                default: { enable: ['**/*'] },
                review:  { enable: ['**/*'] },
            },
            activeProfile: 'default',
            compatibilityVersion: 2,
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Extension Error and Warning States', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        // Restore valid config and wait for the extension to recover.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(2_000);
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
    });

    // ── Malformed config (via Refresh) ────────────────────────────────────────

    test('Refresh with malformed config does not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must not crash — sidebar sections should still be accessible
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section disappeared after Refresh with malformed config');

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(filesSection, 'Effective Files section disappeared after Refresh with malformed config');
    });

    test('Refresh with malformed config does not produce normal capability items', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        // The Effective Files tree is virtualized and tears down asynchronously
        // after a malformed-config refresh; poll until the prior content clears
        // rather than asserting once after a fixed sleep (which races the
        // teardown under host load). Use a doubled wait budget — under host load
        // the refresh+teardown occasionally exceeds the default 30s poll window.
        await waitFor(async () => {
            const section = await getSection(sideBar, 'Effective Files');
            await expandSection(section);
            return !(await sectionContainsText(section, 'testing'));
        }, WAIT_TIMEOUT * 2);

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Effective Files should not show testing.md while config is malformed',
        );
    });

    test('Refresh with invalid config shows a warning notification, not an error notification', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        // MetaFlow surfaces config parse errors as a VS Code warning notification
        // ("Found config file, but it is invalid. Check Problems for details.") and
        // as VS Code diagnostics in the Problems panel — but NOT as a pop-up error.
        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(1_500);

        // Warning toasts auto-hide after a few seconds, and Workbench.getNotifications()
        // only reads the (now-gone) toast overlay. Open the notifications center and read
        // its persisted list directly — that is what survives the toast lifetime and is
        // the source of this test's prior flakiness.
        const center = await workbench.openNotificationsCenter();

        try {
            let warningText: string | undefined;
            await waitFor(async () => {
                const notes = await center.getNotifications(NotificationType.Any);
                for (const n of notes) {
                    const msg = await n.getMessage().catch(() => '');
                    if (msg.toLowerCase().includes('invalid')) {
                        warningText = msg;
                        return true;
                    }
                }
                return false;
            }, WAIT_TIMEOUT);
            assert.ok(
                warningText,
                'Expected a warning notification containing "invalid" after Refresh with malformed config',
            );

            const errorNotes = await center.getNotifications(NotificationType.Error);
            const metaflowError = await Promise.all(
                errorNotes.map((n) => n.getMessage().catch(() => '')),
            );
            assert.ok(
                !metaflowError.some((m) => m.toLowerCase().includes('metaflow')),
                'Expected a warning notification, not an error notification, for malformed config',
            );
        } finally {
            // Close the notifications center so it does not leak into subsequent tests.
            await center.close().catch(() => undefined);
        }
    });

    // ── Missing config (first-run) ────────────────────────────────────────────

    test('Missing config offers initialization via the view welcome content, not a warning', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // A genuinely missing config is the first-run state, not an error: the
        // AI Metadata view must surface an "Initialize Configuration" welcome
        // action rather than a "No .metaflow/config.jsonc found" warning. The
        // welcome view only renders when the config tree is empty, so surfacing
        // the missing state as a warning row (or toast) would suppress the
        // Initialize action — exactly the regression this guards.
        fs.rmSync(CONFIG_PATH, { force: true });
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const configSection = await getSection(sideBar, 'AI Metadata');
        await expandSection(configSection);

        await waitFor(async () => {
            const welcome = await configSection.findWelcomeContent();
            if (!welcome) {
                return false;
            }
            const textSections = await welcome.getTextSections();
            return textSections.some((t) => t.includes('No MetaFlow configuration found'));
        }, WAIT_TIMEOUT);

        const welcome = await configSection.findWelcomeContent();
        assert.ok(
            welcome,
            'Expected welcome content in the AI Metadata view when config is missing',
        );
        const buttons = await welcome.getButtons();
        const buttonTitles = await Promise.all(
            buttons.map((b) => b.getTitle().catch(() => '')),
        );
        assert.ok(
            buttonTitles.some((title) => title.includes('Initialize Configuration')),
            `Expected an "Initialize Configuration" welcome button, got: [${buttonTitles.join(', ')}]`,
        );

        // The missing-config case must NOT raise the legacy warning toast.
        const warned = await hasNotification(workbench, 'No .metaflow');
        assert.ok(
            !warned,
            'A missing config should not raise a "No .metaflow" warning notification',
        );
    });

    // ── All capabilities disabled ─────────────────────────────────────────────

    test('Refresh with all capabilities disabled empties Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, validConfig({ sdlcEnabled: false, coreEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitFor(async () => {
            const filesSection = await getSection(sideBar, 'Effective Files');
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Effective Files should be empty when all capabilities are disabled',
        );
        assert.ok(
            !(await sectionContainsText(filesSection, 'coding')),
            'Effective Files should not show company/core content when all capabilities are disabled',
        );
    });

    test('Capabilities section survives when all capabilities are disabled', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, validConfig({ sdlcEnabled: false, coreEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section disappeared after disabling all capabilities');
        await expandSection(capSection);
        await sleep(500);
        // Section should still be accessible — might be empty or show disabled-state items
    });

    // ── Non-existent capability path ──────────────────────────────────────────

    test('Config with a non-existent capability path does not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const configWithMissingPath = JSON.stringify(
            {
                metadataRepos: [{
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    capabilities: [
                        { path: 'company/nonexistent', enabled: true },
                        { path: 'standards/sdlc',      enabled: true },
                    ],
                }],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
                compatibilityVersion: 2,
            },
            null,
            2,
        );

        fs.writeFileSync(CONFIG_PATH, configWithMissingPath, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must remain functional
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after referencing non-existent capability path');
    });

    test('Valid capabilities still populate Effective Files when one capability path is missing', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const configWithMissingPath = JSON.stringify(
            {
                metadataRepos: [{
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    capabilities: [
                        { path: 'company/nonexistent', enabled: true },
                        { path: 'standards/sdlc',      enabled: true },
                    ],
                }],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
                compatibilityVersion: 2,
            },
            null,
            2,
        );

        fs.writeFileSync(CONFIG_PATH, configWithMissingPath, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        // standards/sdlc exists — its files should still appear
        await waitFor(async () => {
            const filesSection = await getSection(sideBar, 'Effective Files');
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected testing.md from the valid standards/sdlc capability even though another capability path is missing',
        );
    });

    // ── Empty metadataRepos ───────────────────────────────────────────────────

    test('Config with empty metadataRepos array empties Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const emptyReposConfig = JSON.stringify(
            {
                metadataRepos: [],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
                compatibilityVersion: 2,
            },
            null,
            2,
        );

        fs.writeFileSync(CONFIG_PATH, emptyReposConfig, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitFor(async () => {
            const filesSection = await getSection(sideBar, 'Effective Files');
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Effective Files should be empty when metadataRepos is empty',
        );
    });

    test('Config with empty metadataRepos does not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const emptyReposConfig = JSON.stringify(
            {
                metadataRepos: [],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'default',
                compatibilityVersion: 2,
            },
            null,
            2,
        );

        fs.writeFileSync(CONFIG_PATH, emptyReposConfig, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const capSection  = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(capSection,   'Capabilities section missing after empty metadataRepos config');
        assert.ok(filesSection, 'Effective Files section missing after empty metadataRepos config');
    });

    // ── Profile not found ─────────────────────────────────────────────────────

    test('Config with activeProfile that does not exist in profiles still loads without crash', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        // Bug fix: previously the extension silently returned ALL files when activeProfile
        // referenced a non-existent profile. Now it emits a capability warning.
        const missingProfileConfig = JSON.stringify(
            {
                metadataRepos: [{
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    capabilities: [
                        { path: 'standards/sdlc', enabled: true },
                    ],
                }],
                profiles: { default: { enable: ['**/*'] } },
                activeProfile: 'nonexistent-profile',
                compatibilityVersion: 2,
                // Force settings delivery so the fallback produces an observable
                // signal in .vscode/settings.json (instructions default to plugin
                // delivery, which would not surface here).
                injection: { instructions: 'settings' },
            },
            null,
            2,
        );

        fs.writeFileSync(CONFIG_PATH, missingProfileConfig, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must not crash — sidebar sections should still be accessible
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after referencing non-existent activeProfile');

        // A non-existent activeProfile is non-fatal: the overlay falls back to
        // surfacing ALL files (no profile filtering) and emits an
        // ACTIVE_PROFILE_NOT_FOUND warning. Assert on the Effective Files tree —
        // testing.md from standards/sdlc must still appear under the fallback.
        // (The doubled wait budget absorbs host-load spikes on the virtualized tree.)
        await waitFor(async () => {
            const filesSection = await getSection(sideBar, 'Effective Files');
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT * 2);
        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected testing.md surfaced even when activeProfile is not found (fallback to all-files)',
        );
    });

    // ── Clean with nothing to do ──────────────────────────────────────────────

    test('Clean shows "Nothing to clean" information message when there is nothing to remove', async function () {
        this.timeout(WAIT_TIMEOUT + INTERACTION_TIMEOUT + 15_000);

        // Ensure we are in a clean state: run Clean to remove any previously injected settings,
        // then verify Clean a second time shows the no-op message instead of the confirmation dialog.
        const workbench = new Workbench();

        // First Clean: confirm if prompted, so subsequent state is empty
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        const firstNotif = await waitForNotification(workbench, 'Remove all synchronized files', INTERACTION_TIMEOUT);
        if (firstNotif) {
            await firstNotif.takeAction('Remove');
            await sleep(2_000);
        }
        await dismissAllNotifications(workbench);
        await sleep(500);

        // Second Clean: now there's nothing to clean — should show "Nothing to clean"
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        const nothingToClean = await waitForNotification(workbench, 'Nothing to clean', INTERACTION_TIMEOUT);
        assert.ok(
            nothingToClean,
            'Expected "Nothing to clean" info message when Clean is run with no managed state',
        );

        // Must NOT show the confirmation dialog
        const removeDialog = await waitForNotification(workbench, 'Remove all synchronized files', 2_000);
        assert.ok(
            !removeDialog,
            'Expected no "Remove all synchronized files?" dialog when there is nothing to clean',
        );
    });

    // ── Recovery ─────────────────────────────────────────────────────────────

    test('Extension recovers to normal state after invalid config is replaced via Refresh', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        // Put extension in error state
        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Restore valid config and refresh
        fs.writeFileSync(CONFIG_PATH, validConfig(), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitFor(async () => {
            const filesSection = await getSection(sideBar, 'Effective Files');
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Effective Files should show testing.md after valid config is restored and refreshed',
        );
    });
});
