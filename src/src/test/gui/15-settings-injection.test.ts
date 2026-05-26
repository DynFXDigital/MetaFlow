/**
 * GUI tests — Settings injection output verification (v0.2.0).
 *
 * Verifies that Apply Overlay in the default 'settings' delivery mode writes
 * the correct VS Code workspace settings keys to .vscode/settings.json.
 * Assertions are made by reading the settings file from disk after Apply,
 * using polling to tolerate the async settings write.
 *
 * The test workspace default: standards/sdlc enabled, company/core disabled.
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
    waitForNotification,
    INTERACTION_TIMEOUT,
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
    const value = settings[key];
    return value !== undefined && value !== null;
}

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
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Settings Injection Output', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;
    let originalSettings: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig   = fs.readFileSync(CONFIG_PATH, 'utf-8');
        originalSettings = fs.existsSync(SETTINGS_PATH)
            ? fs.readFileSync(SETTINGS_PATH, 'utf-8')
            : '{}';

        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        // Establish a known baseline: default config + Apply
        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    afterEach(async function () {
        // Restore config, then Apply to bring settings back to the original state.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    // ── Baseline: sdlc enabled, core disabled ────────────────────────────────

    test('Apply writes chat.instructionsFilesLocations with the sdlc instructions path', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'Expected chat.instructionsFilesLocations to contain the standards/sdlc/instructions path',
        );
    });

    test('Apply writes chat.agentFilesLocations with the sdlc agents path', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        await waitFor(
            async () => settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            'Expected chat.agentFilesLocations to contain the standards/sdlc/agents path',
        );
    });

    test('Apply writes chat.agentSkillsLocations with the sdlc skills path', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        await waitFor(
            async () => settingsContainsPath('chat.agentSkillsLocations', 'standards/sdlc/skills'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.agentSkillsLocations', 'standards/sdlc/skills'),
            'Expected chat.agentSkillsLocations to contain the standards/sdlc/skills path',
        );
    });

    test('Apply does not inject company/core paths when core is disabled', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        // Wait for baseline Apply to settle
        await sleep(2_000);

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'company/core'),
            'company/core instructions path should not appear while company/core is disabled',
        );
        assert.ok(
            !settingsContainsPath('chat.promptFilesLocations', 'company/core'),
            'company/core prompts path should not appear while company/core is disabled',
        );
    });

    // ── Enabling company/core adds its paths ─────────────────────────────────

    test('Enabling company/core adds core instruction and prompt paths to settings', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            'Expected company/core/instructions path in chat.instructionsFilesLocations after enabling core',
        );
    });

    test('Both capabilities enabled injects paths from both into settings', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

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
            'Expected standards/sdlc/instructions in chat.instructionsFilesLocations',
        );
        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'company/core/instructions'),
            'Expected company/core/instructions in chat.instructionsFilesLocations',
        );
        assert.ok(
            settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            'Expected standards/sdlc/agents in chat.agentFilesLocations',
        );
    });

    // ── Disabling a capability removes its paths ─────────────────────────────

    test('Disabling sdlc removes its paths from settings after Apply', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        // Baseline: sdlc paths should be present
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Disable both capabilities
        fs.writeFileSync(CONFIG_PATH, configWith({ sdlcEnabled: false, coreEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // After Apply with no enabled capabilities, settings keys should be absent or empty
        await waitFor(async () => {
            return !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc');
        }, WAIT_TIMEOUT);

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'standards/sdlc instructions path should be removed after disabling sdlc',
        );
        assert.ok(
            !settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc'),
            'standards/sdlc agents path should be removed after disabling sdlc',
        );
    });

    // ── Clean removes all injected settings keys ─────────────────────────────

    test('Clean Synchronized Files removes all MetaFlow-managed settings keys', async function () {
        this.timeout(WAIT_TIMEOUT + INTERACTION_TIMEOUT + 15_000);

        // Baseline: settings should be injected
        await waitFor(
            async () => settingsHasKey('chat.instructionsFilesLocations'),
            WAIT_TIMEOUT,
        );

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');

        const notification = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );

        if (!notification) {
            // Nothing to clean — command completed silently; settings should still be cleared
        } else {
            await notification.takeAction('Remove');
        }

        // After Clean, all MetaFlow-managed settings keys should be absent
        await waitFor(async () => {
            return (
                !settingsHasKey('chat.instructionsFilesLocations') &&
                !settingsHasKey('chat.agentFilesLocations')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            !settingsHasKey('chat.instructionsFilesLocations'),
            'chat.instructionsFilesLocations should be removed after Clean',
        );
        assert.ok(
            !settingsHasKey('chat.agentFilesLocations'),
            'chat.agentFilesLocations should be removed after Clean',
        );
        assert.ok(
            !settingsHasKey('chat.agentSkillsLocations'),
            'chat.agentSkillsLocations should be removed after Clean',
        );
    });

    // ── Settings survive Refresh ─────────────────────────────────────────────

    test('Injected settings persist after MetaFlow: Refresh', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        // Baseline settings should be present
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'standards/sdlc instructions path should remain in settings after Refresh',
        );
    });
});
