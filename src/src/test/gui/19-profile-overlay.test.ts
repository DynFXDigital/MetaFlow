/**
 * GUI tests — Profile-based file overlay filtering (v0.2.0).
 *
 * Verifies that the active profile's enable patterns correctly narrow the
 * set of files surfaced by Apply Overlay, and that switching between
 * profiles updates the Effective Files tree accordingly.
 *
 * Profile filtering acts on the resolved effective file set: a profile with
 * enable: ['instructions/**'] shows only instruction artifacts; a profile with
 * enable: ['**\/*'] shows all artifacts; a profile with enable: [] shows none.
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
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

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
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: { default: { enable: ['**/*'] } },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected testing.md from sdlc in Effective Files with all-files profile',
        );
    });

    // ── Empty-enable profile ──────────────────────────────────────────────────

    test('"empty" profile with enable [] shows no files in Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected Effective Files to be empty when active profile has enable: []',
        );
    });

    test('"empty" profile surfaces no artifacts of any type', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected no sdlc instruction artifact (testing) when empty profile is active',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'test-agent')),
            'Expected no sdlc agent artifact (test-agent) when empty profile is active',
        );
    });

    // ── Profile switch updates the overlay ────────────────────────────────────

    test('Switching from "default" to "empty" profile removes files after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Start: default profile — sdlc artifacts present
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitForEffectiveFiles(sideBar, 'testing');

        // Switch to empty profile
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'empty',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected sdlc artifacts removed after switching to empty profile',
        );
    });

    test('Switching from "empty" back to "default" restores files after Apply', async function () {
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
        await waitForEffectiveFiles(sideBar, 'testing', false);

        // Step 2: switch back to default
        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: {
                default: { enable: ['**/*'] },
                empty:   { enable: [] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc artifacts to reappear after switching back to default profile',
        );
    });

    // ── "review" profile ──────────────────────────────────────────────────────

    test('"review" profile with enable [**/*] also surfaces sdlc files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'review',
            profiles: {
                default: { enable: ['**/*'] },
                review:  { enable: ['**/*'] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc files when "review" profile is active (enable: [**/*])',
        );
    });

    // ── Both capabilities + profile ───────────────────────────────────────────

    test('Both capabilities enabled + default profile → all files in overlay', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'default',
            profiles: { default: { enable: ['**/*'] } },
            coreEnabled: true,
            sdlcEnabled: true,
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc files (testing) in overlay (both capabilities enabled, default profile)',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected core files (coding) in overlay (both capabilities enabled, default profile)',
        );
    });

    test('Both capabilities enabled + empty profile → no files in overlay', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

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

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'No sdlc files expected with empty profile even when sdlc is enabled',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'coding')),
            'No core files expected with empty profile even when core is enabled',
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
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfiles({
            activeProfile: 'ghost-profile',
            profiles: {
                default: { enable: ['**/*'] },
            },
        }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // With an unknown activeProfile, the engine emits an ACTIVE_PROFILE_NOT_FOUND
        // warning and surfaces all files without profile filtering. The Effective
        // Files tree is the host-independent signal for that fallback.
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc instruction artifact (testing) surfaced as fallback when activeProfile does not exist',
        );
    });
});
