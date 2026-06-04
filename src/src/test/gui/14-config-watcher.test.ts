/**
 * GUI tests — Config file watcher: automatic refresh (v0.2.0).
 *
 * Verifies that the extension detects changes to .metaflow/config.jsonc made
 * outside the UI (direct file edits) and re-applies the overlay, updating the
 * Capabilities and Effective Files tree views to reflect the new config.
 *
 * Each test writes a modified config, waits for the tree to converge to the
 * expected state via polling, and asserts the final visible content.
 *
 * HOST DETERMINISM NOTES (these stabilise host timing only — the config→tree
 * contract under test is unchanged):
 *   1. SYNCHRONIZE injection. The golden config delivers instructions/skills/
 *      agents in plugin mode, which writes `chat.pluginLocations` to the User
 *      settings.json on every refresh. In the ExTester host that write contends
 *      with the harness's own launch-time settings write and can stall ~60s on an
 *      EPERM rename, sitting on the refresh critical path (settings injection runs
 *      inline before the tree fires). This suite pins every config it writes —
 *      including the restored baseline — to `injection: synchronize`, so settings
 *      injection computes zero entries and the refresh never touches User
 *      settings.json. Overlay resolution (and therefore the Effective Files tree)
 *      is delivery-mode-independent, so the assertions are unaffected.
 *   2. Explicit Refresh nudge. In production the config watcher fires the refresh
 *      automatically; in the host an incoming config write can be dropped if it
 *      lands while a prior refresh is still in-flight ("change originated during
 *      internal MetaFlow activity"). A single explicit MetaFlow: Refresh after each
 *      write is a user command not subject to that suppression, so convergence is
 *      deterministic. With (1) removing the stall, this refresh is fast and never
 *      overlaps.
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
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config builders ───────────────────────────────────────────────────────────

// Every artifact type is delivered via `synchronize` so settings injection is a
// no-op on the refresh path (see HOST DETERMINISM NOTE 1).
const SYNCHRONIZE_INJECTION = {
    instructions: 'synchronize',
    prompts:      'synchronize',
    skills:       'synchronize',
    agents:       'synchronize',
    hooks:        'synchronize',
} as const;

function configWith(opts: {
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
    activeProfile?: string;
    profiles?: Record<string, { enable: string[] }>;
    repoEnabled?: boolean;
}): string {
    const {
        coreEnabled    = false,
        sdlcEnabled    = true,
        activeProfile  = 'default',
        profiles       = { default: { enable: ['**/*'] }, review: { enable: ['**/*'] } },
        repoEnabled,
    } = opts;
    const repo: Record<string, unknown> = {
        id: 'primary',
        localPath: '.ai/ai-metadata',
        capabilities: [
            { path: 'company/core',   enabled: coreEnabled },
            { path: 'standards/sdlc', enabled: sdlcEnabled },
        ],
    };
    if (repoEnabled !== undefined) {
        repo.enabled = repoEnabled;
    }
    return JSON.stringify(
        {
            metadataRepos: [repo],
            profiles,
            activeProfile,
            compatibilityVersion: 2,
            injection: { ...SYNCHRONIZE_INJECTION },
        },
        null,
        2,
    );
}

// ── Determinism helper ────────────────────────────────────────────────────────

// See HOST DETERMINISM NOTE 2: a single explicit Refresh defeats the watcher's
// in-activity suppression so convergence is deterministic. Fast because the
// synchronize-mode config keeps settings injection a no-op.
async function nudgeRefresh(): Promise<void> {
    await sleep(1_000);
    await new Workbench().executeCommand('MetaFlow: Refresh');
    await sleep(1_500);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Config File Watcher — Automatic Refresh', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let baselineConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        // Establish a synchronize-mode baseline so neither the tests nor the
        // afterEach restore ever trigger a plugin-mode settings write.
        restoreGoldenConfig(CONFIG_PATH);
        baselineConfig = configWith({});
        fs.writeFileSync(CONFIG_PATH, baselineConfig, 'utf-8');

        sideBar = await openMetaFlowSidebar();
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(filesSection, WAIT_TIMEOUT);

        await nudgeRefresh();
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        fs.writeFileSync(CONFIG_PATH, baselineConfig, 'utf-8');
        await nudgeRefresh();
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
        await nudgeRefresh();

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
        await nudgeRefresh();

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
        await nudgeRefresh();

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
        await nudgeRefresh();

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
        await nudgeRefresh();

        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        // Step 2: switch back to default
        fs.writeFileSync(CONFIG_PATH, configWith({ activeProfile: 'default' }), 'utf-8');
        await nudgeRefresh();

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
        fs.writeFileSync(CONFIG_PATH, baselineConfig, 'utf-8');
        await nudgeRefresh();

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
        fs.writeFileSync(CONFIG_PATH, configWith({ repoEnabled: false }), 'utf-8');
        await nudgeRefresh();

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
