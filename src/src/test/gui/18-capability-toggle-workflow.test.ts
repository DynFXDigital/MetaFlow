/**
 * GUI tests — End-to-end capability toggle workflow (v0.2.0).
 *
 * Simulates the primary user workflow:
 *   1. Start with a capability disabled
 *   2. Enable it (via config edit, mirroring the sidebar toggle)
 *   3. Run Apply Overlay
 *   4. Verify the overlay output changed accordingly
 *
 * Signal: the Effective Files tree (host-independent). The derived `chat.*`
 * settings keys are NOT asserted here because VS Code's config editing service
 * in the ExTester host rejects those programmatic writes (see
 * 15-settings-injection.test.ts for the full explanation); the exact settings
 * key→path mapping is verified by the engine unit tests for
 * `computeSettingsEntries`.
 *
 * Fixture artifacts (Effective Files basenames):
 *   standards/sdlc (enabled by default): testing, test-agent, test-skill
 *   company/core   (disabled by default): coding, review.prompt
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
    applyOverlayAndWait,
    refreshOverlayAndWait,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Known fixture artifacts (Effective Files basenames) ────────────────────────

const KNOWN_ARTIFACTS = ['testing', 'test-agent', 'test-skill', 'coding', 'review.prompt'];

/** Returns the subset of known fixture artifacts currently surfaced in Effective Files. */
async function presentArtifacts(sideBar: SideBarView): Promise<string[]> {
    const present: string[] = [];
    for (const a of KNOWN_ARTIFACTS) {
        if (await effectiveFilesContains(sideBar, a)) {
            present.push(a);
        }
    }
    return present;
}

// ── Config builders ───────────────────────────────────────────────────────────

function configWith(opts: {
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
    useSettingsInjection?: boolean;
}): string {
    const { coreEnabled = false, sdlcEnabled = true, useSettingsInjection = true } = opts;
    const enabledCapabilities = [
        ...(coreEnabled ? ['primary:company/core'] : []),
        ...(sdlcEnabled ? ['primary:standards/sdlc'] : []),
    ];
    const base: Record<string, unknown> = {
        metadataRepos: [{
            id: 'primary',
            localPath: '.ai/ai-metadata',
            capabilities: [
                { path: 'company/core' },
                { path: 'standards/sdlc' },
            ],
        }],
        profiles: {
            default: { enabledCapabilities, enable: ['**/*'] },
            review:  { enabledCapabilities, enable: ['**/*'] },
        },
        activeProfile: 'default',
        compatibilityVersion: 3,
    };
    if (useSettingsInjection) {
        base['injection'] = {
            instructions: 'settings',
            agents:        'settings',
            skills:        'settings',
            prompts:       'settings',
        };
    }
    return JSON.stringify(base, null, 2);
}

async function reapplyFromDisk(): Promise<void> {
    await sleep(1_000);
    await refreshOverlayAndWait(WORKSPACE_ROOT);
    await applyOverlayAndWait(WORKSPACE_ROOT);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('End-to-End Capability Toggle Workflow', function () {
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
        const files = await getSection(sideBar, 'Effective Files');
        await waitForSectionReady(files, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await reapplyFromDisk();
        await applyOverlayAndWait(WORKSPACE_ROOT);
        await dismissAllNotifications(new Workbench());
    });

    // ── Enable → Apply → overlay updated ─────────────────────────────────────

    test('Enabling company/core and applying surfaces core instructions', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Start: core disabled, sdlc enabled — core artifacts must be absent
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'coding', false);

        assert.ok(
            !(await effectiveFilesContains(sideBar, 'coding')),
            'Precondition: company/core instructions (coding) should be absent before enabling',
        );

        // Enable company/core and apply
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');
        await reapplyFromDisk();

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected company/core instructions (coding) after enabling company/core and applying',
        );
    });

    test('Disabling standards/sdlc and applying removes its instructions', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Start: sdlc enabled — establish baseline
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: true }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing');

        // Disable sdlc and apply
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false }), 'utf-8');
        await reapplyFromDisk();

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected standards/sdlc instructions (testing) removed after disabling sdlc',
        );
    });

    test('Re-enabling a disabled capability restores its artifacts after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Step 1: disable sdlc
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing', false);

        // Step 2: re-enable sdlc
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: true }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing');

        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected standards/sdlc instructions (testing) to reappear after re-enabling sdlc',
        );
    });

    // ── Multiple Apply calls are idempotent ──────────────────────────────────

    test('Applying the same config twice produces the same overlay output', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing');

        const afterFirst = (await presentArtifacts(sideBar)).join(',');

        await applyOverlayAndWait(WORKSPACE_ROOT);

        const afterSecond = (await presentArtifacts(sideBar)).join(',');

        assert.strictEqual(
            afterSecond,
            afterFirst,
            'Overlay output should be identical after a second Apply with the same config (idempotent)',
        );
    });

    // ── Delivery mode does not change overlay membership ─────────────────────

    test('Default injection mode still surfaces the instructions artifact in the overlay', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Write config WITHOUT explicit injection key — default classifies
        // instructions as 'plugin' rather than 'settings'. Delivery mode changes
        // WHERE an artifact is delivered, not WHETHER it is part of the overlay,
        // so the artifact still appears in Effective Files. (The settings-key
        // classification difference is covered by the engine unit tests.)
        fs.writeFileSync(CONFIG_PATH, configWith({ useSettingsInjection: false }), 'utf-8');

        const workbench = new Workbench();
        await reapplyFromDisk();
        await sleep(3_000);
        await dismissAllNotifications(workbench);

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Default (plugin) injection mode should still surface the instructions artifact in the overlay',
        );
    });

    // ── Both capabilities enabled ────────────────────────────────────────────

    test('Both capabilities enabled surfaces artifacts from both', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true, sdlcEnabled: true }), 'utf-8');
        await reapplyFromDisk();

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected standards/sdlc instructions (testing) when both enabled',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected company/core instructions (coding) when both enabled',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Expected standards/sdlc agents (test-agent) when both enabled',
        );
    });

    // ── Tree reflects the enabled capability set ─────────────────────────────

    test('After Apply, Effective Files reflects the enabled capabilities', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false, sdlcEnabled: true }), 'utf-8');
        await reapplyFromDisk();

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Effective Files must surface sdlc instructions (testing) after Apply',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'coding')),
            'Effective Files must not surface core instructions (coding) while core is disabled',
        );
    });
});
