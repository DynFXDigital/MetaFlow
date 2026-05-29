/**
 * GUI tests — End-to-end capability toggle workflow (v0.2.0).
 *
 * Simulates the primary user workflow:
 *   1. Start with a capability disabled
 *   2. Enable it (via config edit, mirroring the sidebar toggle)
 *   3. Run Apply Overlay
 *   4. Verify settings keys were updated in .vscode/settings.json
 *
 * These tests use explicit injection: { instructions: 'settings', ... } so
 * that chat.instructionsFilesLocations and related keys are actually written.
 * The default injection mode ('plugin') does NOT write these keys — that
 * behavior is intentional but surprising for new users, so it is also
 * exercised here for documentation purposes.
 *
 * Note on defaults: Without an explicit injection config, instructions/agents/
 * skills are classified as 'plugin' (not 'settings'), so Apply Overlay with
 * default config does NOT write chat.instructionsFilesLocations to settings.
 * Users who expect these keys must set injection: { instructions: 'settings' }.
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
    waitFor,
    dismissAllNotifications,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const SETTINGS_PATH  = path.join(WORKSPACE_ROOT, '.vscode', 'settings.json');

// ── File helpers ──────────────────────────────────────────────────────────────

function readSettings(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function settingsContainsPath(key: string, fragment: string): boolean {
    const settings = readSettings();
    const value = settings[key] as Record<string, boolean> | undefined;
    if (!value || typeof value !== 'object') { return false; }
    return Object.keys(value).some(p => p.replace(/\\/g, '/').includes(fragment));
}

function settingsHasKey(key: string): boolean {
    const settings = readSettings();
    return settings[key] !== undefined && settings[key] !== null;
}

// ── Config builders ───────────────────────────────────────────────────────────

function configWith(opts: {
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
    useSettingsInjection?: boolean;
}): string {
    const { coreEnabled = false, sdlcEnabled = true, useSettingsInjection = true } = opts;
    const base: Record<string, unknown> = {
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

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('End-to-End Capability Toggle Workflow', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    // ── Enable → Apply → settings updated ────────────────────────────────────

    test('Enabling company/core and applying adds core instructions to settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start: core disabled, sdlc enabled — core paths must not be in settings
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'company/core'),
            'Precondition: company/core instructions should not be in settings before enabling',
        );

        // Enable company/core and apply
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            'Expected company/core/instructions path in settings after enabling company/core and applying',
        );
    });

    test('Disabling standards/sdlc and applying removes its instructions from settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start: sdlc enabled — establish baseline
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        // Disable sdlc and apply
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'Expected standards/sdlc/instructions path removed from settings after disabling sdlc',
        );
    });

    test('Re-enabling a disabled capability restores its settings paths after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Step 1: disable sdlc
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        // Step 2: re-enable sdlc
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'Expected standards/sdlc/instructions to reappear in settings after re-enabling sdlc',
        );
    });

    // ── Multiple Apply calls are idempotent ───────────────────────────────────

    test('Applying the same config twice produces identical settings entries', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        const settingsAfterFirst = JSON.stringify(readSettings());

        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        const settingsAfterSecond = JSON.stringify(readSettings());

        assert.strictEqual(
            settingsAfterSecond,
            settingsAfterFirst,
            'Settings should be identical after a second Apply with the same config (idempotent)',
        );
    });

    // ── Default injection mode behavior ───────────────────────────────────────

    test('Default injection (no explicit config) does NOT write chat.instructionsFilesLocations', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Write config WITHOUT explicit injection key — default is 'plugin' for instructions
        fs.writeFileSync(CONFIG_PATH, configWith({ useSettingsInjection: false }), 'utf-8');

        // First Clean to ensure no previously-injected stale settings entries exist
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        // Dismiss any confirmation or info notifications
        await dismissAllNotifications(workbench);
        await sleep(500);

        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // With default injection mode, instructions are 'plugin' — NOT written as settings paths
        assert.ok(
            !settingsHasKey('chat.instructionsFilesLocations'),
            'With default injection, Apply should NOT write chat.instructionsFilesLocations — use injection: { instructions: "settings" } to enable this',
        );
    });

    // ── Both capabilities enabled ─────────────────────────────────────────────

    test('Both capabilities enabled injects all paths from both into settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true, sdlcEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => {
            return (
                settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions') &&
                settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'Expected standards/sdlc/instructions in chat.instructionsFilesLocations when both enabled',
        );
        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            'Expected company/core/instructions in chat.instructionsFilesLocations when both enabled',
        );
        assert.ok(
            settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            'Expected standards/sdlc/agents in chat.agentFilesLocations when both enabled',
        );
    });

    // ── Apply followed by tree view reflects same state ───────────────────────

    test('After Apply, Effective Files tree and settings.json reflect the same capabilities', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false, sdlcEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        // Verify the tree also reflects the same enabled state
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            const items = await filesSection.getVisibleItems();
            return items.length > 0;
        }, WAIT_TIMEOUT);

        // Both settings and tree should reflect sdlc enabled, core disabled
        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'settings.json must contain sdlc instruction paths after Apply',
        );
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            'settings.json must not contain core instruction paths while core is disabled',
        );
    });
});
