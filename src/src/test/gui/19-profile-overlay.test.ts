/**
 * GUI tests — Profile-based file overlay filtering (v0.2.0).
 *
 * Verifies that the active profile's enable patterns correctly narrow the
 * set of files surfaced by Apply Overlay, and that switching between
 * profiles updates both the Effective Files tree and the injected settings.
 *
 * Profile filtering acts on the resolved effective file set: a profile with
 * enable: ['instructions/**'] shows only instruction artifacts; a profile with
 * enable: ['**\/*'] shows all artifacts; a profile with enable: [] shows none.
 *
 * All tests use explicit injection: { instructions: 'settings', ... } so
 * the settings keys reflect what the profile exposes.
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
    restoreGoldenConfig,
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

function configWithProfiles(opts: {
    activeProfile: string;
    profiles: Record<string, { enable: string[] }>;
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
}): string {
    const { activeProfile, profiles, coreEnabled = false, sdlcEnabled = true } = opts;
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

suite('Profile-Based Overlay Filtering', function () {
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
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(new Workbench());
    });

    // ── All-files profile ─────────────────────────────────────────────────────

    test('"default" profile with enable [**/*] surfaces all sdlc files in Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: { default: { enable: ['**/*'] } },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected testing.md from sdlc in Effective Files with all-files profile',
        );
    });

    // ── Empty-enable profile ──────────────────────────────────────────────────

    test('"empty" profile with enable [] shows no files in Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Expected Effective Files to be empty when active profile has enable: []',
        );
    });

    test('"empty" profile does not write settings keys when no files are enabled', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => {
            return (
                !settingsHasKey('chat.instructionsFilesLocations') ||
                !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected no sdlc settings paths when empty profile is active',
        );
    });

    // ── Profile switch updates settings ───────────────────────────────────────

    test('Switching from "default" to "empty" profile removes settings paths after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Start: default profile — settings should have sdlc paths
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Switch to empty profile
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected sdlc settings paths removed after switching to empty profile',
        );
    });

    test('Switching from "empty" back to "default" restores settings paths after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Step 1: empty profile
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Step 2: switch back to default
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected sdlc settings paths to reappear after switching back to default profile',
        );
    });

    // ── "review" profile ──────────────────────────────────────────────────────

    test('"review" profile with enable [**/*] also surfaces sdlc files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'review',
            profiles: {
                default: { enable: ['**/*'] },
                review:  { enable: ['**/*'] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected sdlc paths in settings when "review" profile is active (enable: [**/*])',
        );
    });

    // ── Both capabilities + profile ───────────────────────────────────────────

    test('Both capabilities enabled + default profile → all paths in settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: { default: { enable: ['**/*'] } },
            coreEnabled: true,
            sdlcEnabled: true,
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => {
            return (
                settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc') &&
                settingsContainsPath('chat.instructionsFilesLocations', 'company/core')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected sdlc paths in settings (both capabilities enabled, default profile)',
        );
        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'company/core'),
            'Expected core paths in settings (both capabilities enabled, default profile)',
        );
    });

    test('Both capabilities enabled + empty profile → no paths in settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
            coreEnabled: true,
            sdlcEnabled: true,
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => {
            return (
                !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc') &&
                !settingsContainsPath('chat.instructionsFilesLocations', 'company/core')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'No sdlc paths expected in settings with empty profile even when sdlc is enabled',
        );
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'company/core'),
            'No core paths expected in settings with empty profile even when core is enabled',
        );
    });

    // ── Profile resilience ────────────────────────────────────────────────────

    test('Profile with non-existent activeProfile still loads extension without crash', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'ghost-profile',
            profiles: {
                default: { enable: ['**/*'] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        // Extension must remain functional
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section must remain accessible when activeProfile is invalid');
    });

    test('Profile with non-existent activeProfile falls back to surfacing all files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'ghost-profile',
            profiles: {
                default: { enable: ['**/*'] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // With an unknown activeProfile, the engine emits an ACTIVE_PROFILE_NOT_FOUND
        // warning and surfaces all files without profile filtering. The injected
        // settings paths are the deterministic signal for that fallback — the
        // Effective Files tree is virtualized and may scroll its leaves out of the
        // rendered DOM, so we assert on settings rather than tree text.
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected sdlc instruction paths surfaced as fallback when activeProfile does not exist',
        );
    });
});
