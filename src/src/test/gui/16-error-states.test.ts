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
import { SideBarView, Workbench } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    expandSection,
    waitForSectionReady,
    sectionContainsText,
    waitFor,
    hasNotification,
    dismissAllNotifications,
    dismissActiveInput,
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
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const filesSection = await getSection(sideBar, 'Effective Files');
        await expandSection(filesSection);
        await sleep(1_000);

        // With an unparseable config, Effective Files should be empty
        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Effective Files should not show testing.md while config is malformed',
        );
    });

    test('Extension produces no error notification for invalid config (errors are silent/diagnostic)', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        // MetaFlow surfaces config errors as VS Code diagnostics (Problems panel),
        // not as pop-up error notifications. Verify no error notification appears.
        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid json', 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const workbench = new Workbench();
        const hasErrorNotif = await hasNotification(workbench, 'error');
        assert.ok(
            !hasErrorNotif,
            'Expected MetaFlow to surface config errors as diagnostics, not as error notifications',
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
