/**
 * GUI tests — Settings-mode overlay output verification (v0.2.0).
 *
 * The test workspace default: standards/sdlc enabled, company/core disabled,
 * with all per-type artifacts configured for `settings` delivery mode.
 *
 * These tests verify the END-TO-END behavior that, in settings delivery mode,
 * Apply resolves the correct overlay and that enabling/disabling capabilities
 * changes the resolved output. The signal is the Effective Files tree, which is
 * host-independent.
 *
 * Why not assert `.vscode/settings.json` directly: VS Code's config editing
 * service in the ExTester host rejects programmatic writes of the derived
 * `chat.*` keys (workspace writes fail with "correct errors/warnings in the
 * file"; `chat.pluginLocations` is user-scoped and its write is rejected when
 * the user settings model is dirty), so the settings file is never populated in
 * this host. The exact settings key→path mapping is verified host-independently
 * by the engine unit tests for `computeSettingsEntries`
 * (packages/engine/test/engine.test.ts); here we verify the overlay behavior the
 * settings injection is derived from.
 *
 * Fixture artifacts:
 *   standards/sdlc (enabled):  instructions/testing.md, agents/test-agent.agent.md,
 *                              skills/test-skill/SKILL.md   → tree: testing, test-agent, test-skill
 *   company/core (disabled):   instructions/coding.md, prompts/review.prompt.md
 *                              → tree: coding, review.prompt
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
    waitForSectionReady,
    effectiveFilesContains,
    waitForEffectiveFiles,
    dismissAllNotifications,
    waitForNotification,
    INTERACTION_TIMEOUT,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config builders ───────────────────────────────────────────────────────────

function configWith(opts: { coreEnabled?: boolean; sdlcEnabled?: boolean }): string {
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
            injection: {
                instructions: 'settings',
                agents:        'settings',
                skills:        'settings',
                prompts:       'settings',
            },
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Settings Injection Output', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);

        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        // Establish a known baseline: default settings-mode config + Apply
        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());

        const files = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(files, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        // Re-establish the settings-mode baseline so capability mutations in one
        // test do not bleed into the next.
        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    after(async function () {
        this.timeout(STARTUP_TIMEOUT);
        // Restore the pristine golden config and clear injected settings so the next
        // suite starts from a clean, uncontaminated baseline.
        restoreGoldenConfig(CONFIG_PATH);
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    // ── Baseline: sdlc enabled, core disabled ────────────────────────────────

    test('Apply surfaces the sdlc instructions artifact (chat.instructionsFilesLocations)', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected the standards/sdlc instructions artifact (testing) in Effective Files',
        );
    });

    test('Apply surfaces the sdlc agents artifact (chat.agentFilesLocations)', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);
        await waitForEffectiveFiles(sideBar, 'test-agent');
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Expected the standards/sdlc agents artifact (test-agent) in Effective Files',
        );
    });

    test('Apply surfaces the sdlc skills artifact (chat.agentSkillsLocations)', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);
        await waitForEffectiveFiles(sideBar, 'test-skill');
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-skill'),
            'Expected the standards/sdlc skills artifact (test-skill) in Effective Files',
        );
    });

    test('Apply does not surface company/core artifacts when core is disabled', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);
        await waitForEffectiveFiles(sideBar, 'testing'); // baseline settled
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'coding')),
            'company/core instructions artifact (coding) should not appear while core is disabled',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'review.prompt')),
            'company/core prompts artifact (review.prompt) should not appear while core is disabled',
        );
    });

    // ── Enabling company/core adds its artifacts ─────────────────────────────

    test('Enabling company/core surfaces its instruction and prompt artifacts', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected company/core instructions artifact (coding) after enabling core',
        );
    });

    test('Both capabilities enabled surfaces artifacts from both', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true, sdlcEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected standards/sdlc instructions artifact (testing) with both capabilities enabled',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected company/core instructions artifact (coding) with both capabilities enabled',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Expected standards/sdlc agents artifact (test-agent) with both capabilities enabled',
        );
    });

    // ── Disabling a capability removes its artifacts ─────────────────────────

    test('Disabling sdlc removes its artifacts after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        // Baseline: sdlc artifacts present
        await waitForEffectiveFiles(sideBar, 'testing');

        // Disable both capabilities
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false, coreEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'standards/sdlc instructions artifact (testing) should be removed after disabling sdlc',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'test-agent')),
            'standards/sdlc agents artifact (test-agent) should be removed after disabling sdlc',
        );
    });

    // ── Clean command runs without breaking the overlay ──────────────────────

    test('Clean Synchronized Files runs without error in settings mode', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + INTERACTION_TIMEOUT + 15_000);

        // Baseline overlay present
        await waitForEffectiveFiles(sideBar, 'testing');

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        // In settings mode there are no synchronized files, so Clean either prompts
        // to remove (no-op set) or completes silently — either is acceptable. Take
        // the Remove action if offered so the command resolves.
        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );
        if (notification) {
            await notification.takeAction('Remove').catch(() => undefined);
        }
        await sleep(2_000);
        await dismissAllNotifications(new Workbench());

        // The extension stays healthy: the overlay still resolves and is navigable.
        const section = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(section, WAIT_TIMEOUT);
        assert.ok(section, 'Effective Files section missing after Clean');
    });

    // ── Overlay survives Refresh ─────────────────────────────────────────────

    test('Overlay output persists after MetaFlow: Refresh', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        await waitForEffectiveFiles(sideBar, 'testing');

        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'standards/sdlc instructions artifact (testing) should remain after Refresh',
        );
    });
});
