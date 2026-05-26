/**
 * GUI tests — Config file watcher: automatic refresh (v0.2.0).
 *
 * Verifies that the extension detects changes to .metaflow/config.jsonc made
 * outside the UI (direct file edits) and automatically re-applies the overlay,
 * updating the Capabilities and Effective Files tree views without a manual
 * Refresh command.
 *
 * Each test writes a modified config, waits for the tree to converge to the
 * expected state via polling, and asserts the final visible content.
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
    dismissAllNotifications,
    dismissActiveInput,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config builders ───────────────────────────────────────────────────────────

function configWith(opts: {
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
    activeProfile?: string;
    profiles?: Record<string, { enable: string[] }>;
}): string {
    const {
        coreEnabled    = false,
        sdlcEnabled    = true,
        activeProfile  = 'default',
        profiles       = { default: { enable: ['**/*'] }, review: { enable: ['**/*'] } },
    } = opts;
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
            profiles,
            activeProfile,
            compatibilityVersion: 2,
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Config File Watcher — Automatic Refresh', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(filesSection, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(2_000);
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
    });

    // ── Enabling a capability ─────────────────────────────────────────────────

    test('Enabling company/core via config edit adds its files to Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const filesSection = await getSection(sideBar, 'Effective Files');
        await expandSection(filesSection);

        // Baseline: company/core is disabled; coding.md must not appear
        assert.ok(
            !(await sectionContainsText(filesSection, 'coding')),
            'Precondition: coding.md should not appear while company/core is disabled',
        );

        // Enable company/core by editing the config directly
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');

        // Wait for the extension's file watcher to trigger a refresh
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'coding');
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'coding'),
            'Expected coding.md to appear in Effective Files after enabling company/core',
        );
    });

    test('Disabling standards/sdlc via config edit removes its files from Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const filesSection = await getSection(sideBar, 'Effective Files');
        await expandSection(filesSection);

        // Baseline: standards/sdlc is enabled; testing.md must appear
        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Precondition: testing.md should appear while standards/sdlc is enabled',
        );

        // Disable standards/sdlc
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false }), 'utf-8');

        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Expected testing.md to be removed from Effective Files after disabling standards/sdlc',
        );
    });

    // ── Capabilities tree ─────────────────────────────────────────────────────

    test('Enabling company/core still shows both capabilities in the Capabilities tree', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const capSection   = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');

        // Use Effective Files as the convergence signal
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'coding');
        }, WAIT_TIMEOUT);

        await expandSection(capSection);
        assert.ok(
            await sectionContainsText(capSection, 'core'),
            'Capabilities tree should still display company/core',
        );
        assert.ok(
            await sectionContainsText(capSection, 'sdlc'),
            'Capabilities tree should still display standards/sdlc',
        );
    });

    // ── Profile switching via config edit ─────────────────────────────────────

    test('Switching active profile to one that enables nothing clears Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const filesSection = await getSection(sideBar, 'Effective Files');
        await expandSection(filesSection);

        // Baseline: testing.md visible under default profile
        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Precondition: testing.md should be visible under the default profile',
        );

        // Switch to a profile that enables nothing
        fs.writeFileSync(CONFIG_PATH, configWith({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');

        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Expected Effective Files to be empty when active profile enables nothing',
        );
    });

    test('Switching back to the default profile restores Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        const filesSection = await getSection(sideBar, 'Effective Files');
        await expandSection(filesSection);

        // Step 1: switch to empty profile
        fs.writeFileSync(CONFIG_PATH, configWith({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');

        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        // Step 2: switch back to default
        fs.writeFileSync(CONFIG_PATH, configWith({ activeProfile: 'default' }), 'utf-8');

        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected testing.md to reappear after switching back to default profile',
        );
    });

    // ── Resilience ────────────────────────────────────────────────────────────

    test('Extension recovers and shows correct state after a malformed config is replaced', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        const filesSection = await getSection(sideBar, 'Effective Files');

        // Write intentionally malformed JSONC
        fs.writeFileSync(CONFIG_PATH, '{ this: is not valid }', 'utf-8');
        await sleep(3_000);

        // Restore valid config
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');

        // Extension must recover and re-show items
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected extension to recover and restore Effective Files after valid config is written',
        );
    });

    test('Repo source toggle via config edit updates AI Metadata tree', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const configSection = await getSection(sideBar, 'AI Metadata');
        await expandSection(configSection);

        // Disable the primary repo
        const disabledRepoConfig = JSON.stringify(
            {
                metadataRepos: [{
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: false,
                    capabilities: [
                        { path: 'company/core',   enabled: false },
                        { path: 'standards/sdlc', enabled: true },
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
        fs.writeFileSync(CONFIG_PATH, disabledRepoConfig, 'utf-8');

        // Effective Files should become empty because the only repo is disabled
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Expected Effective Files to be empty when the only repo source is disabled',
        );
    });
});
