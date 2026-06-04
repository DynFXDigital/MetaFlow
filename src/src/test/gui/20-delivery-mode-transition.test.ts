/**
 * GUI tests — Delivery mode transitions (v0.2.0).
 *
 * Verifies that switching the injection mode for an artifact type between
 * 'settings' and 'synchronize' changes WHERE the artifact is delivered, while
 * the artifact remains a member of the resolved overlay (Effective Files):
 *
 *   settings  → synchronize:  Apply writes the file(s) into .github/ (with provenance)
 *   synchronize → settings:   Apply removes the .github/ file(s)
 *   plugin mode:              neither .github/ files nor settings delivery
 *
 * Observable signals (host-independent):
 *   - .github/ file presence — the synchronizer writes real files to disk.
 *   - Effective Files tree   — overlay membership, independent of delivery mode.
 *
 * The derived `chat.*` settings keys are NOT asserted here: VS Code's config
 * editing service in the ExTester host rejects those programmatic writes (see
 * 15-settings-injection.test.ts). The exact settings key→path mapping and the
 * mode→classification mapping are covered by the engine unit tests
 * (computeSettingsEntries / classifyDelivery). Here we verify the disk-level
 * synchronize behavior and that delivery mode does not change overlay membership.
 *
 * Test workspace: standards/sdlc enabled, company/core disabled.
 * Relevant file: standards/sdlc/instructions/testing.md → tree basename `testing`
 * Sync output:   .github/instructions/_default-sdlc__testing.md
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
const GITHUB_DIR     = path.join(WORKSPACE_ROOT, '.github');

// ── File helpers ──────────────────────────────────────────────────────────────

function anyGithubFileMatchesFragment(fragment: string): boolean {
    if (!fs.existsSync(GITHUB_DIR)) { return false; }
    return walkDir(GITHUB_DIR).some(f => f.replace(/\\/g, '/').includes(fragment));
}

function walkDir(dir: string): string[] {
    const results: string[] = [];
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...walkDir(full));
            } else {
                results.push(full);
            }
        }
    } catch {
        // directory may not exist
    }
    return results;
}

// ── Config builders ───────────────────────────────────────────────────────────

// NOTE: the config injection *mode* value is 'synchronize' (see InjectionMode in
// configSchema.ts). The resulting internal *classification* is 'synchronized'. Authoring
// 'synchronized' as the mode is invalid and silently falls through to the plugin default.
type InstructionMode = 'settings' | 'synchronize' | 'plugin';

function configWith(opts: {
    instructionMode: InstructionMode;
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
}): string {
    const { instructionMode, coreEnabled = false, sdlcEnabled = true } = opts;
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
                instructions: instructionMode,
                agents:        'settings',
                skills:        'settings',
                prompts:       'settings',
            },
        },
        null,
        2,
    );
}

// ── Apply helper ────────────────────────────────────────────────────────────

/**
 * Deterministically deliver a just-written config.jsonc in the ExTester host.
 *
 * Two host facts make a bare `Apply Overlay` after a config write unreliable:
 *   1. The GUI test settings set `metaflow.autoApply: false`
 *      (.vscode-test-gui-settings.json), so Refresh recomputes the overlay from
 *      disk but does NOT auto-apply.
 *   2. The config watcher suppresses changes that land while a prior Apply is
 *      still settling (extension.ts isApplying / suppressConfigWatcherUntil), so
 *      a rapid mode-switch write can be dropped — leaving state.effectiveFiles
 *      stale, so a bare Apply acts on the previous mode.
 *
 * Refresh re-reads config.jsonc straight from disk and recomputes
 * state.effectiveFiles (immune to the watcher and to autoApply); the explicit
 * Apply then runs the synchronizer/injector against that fresh classification.
 */
async function reapplyFromDisk(): Promise<void> {
    await sleep(1_000);
    await new Workbench().executeCommand('MetaFlow: Refresh');
    await sleep(1_500);
    await new Workbench().executeCommand('MetaFlow: Apply Overlay');
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Delivery Mode Transitions', function () {
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
        // Restore golden config, then Refresh so in-memory state reflects the
        // restored (plugin-default) config before applying — otherwise a bare Apply
        // would run the synchronizer against the previous test's stale synchronize
        // classification and re-write .github/ files. Clean then mops up any
        // synchronized files left on disk.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await reapplyFromDisk();
        const workbench = new Workbench();
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
    });

    // ── non-.github delivery → synchronize ────────────────────────────────────

    // The precondition uses PLUGIN mode (not settings) for the "delivered, but not
    // as a .github/ file" baseline. In settings mode the Apply pipeline calls
    // injectWorkspaceSettings, whose programmatic chat.* write is REJECTED by VS
    // Code's config editing service in the ExTester host (see
    // 15-settings-injection.test.ts). That rejection makes the settings-mode Apply
    // throw before its post-apply refresh, leaving stale in-memory state that
    // corrupts the *next* Apply — so a settings→synchronize transition is not
    // faithfully observable in-host. Plugin mode delivers via chat.pluginLocations
    // (also no .github/ file) without triggering the rejected write, giving a
    // host-faithful "not in .github" baseline. The settings→synchronized
    // classification mapping itself is engine-owned (computeSettingsEntries).
    test('Switching to synchronize mode moves delivery into .github/', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        // Baseline: plugin mode — artifact is in the overlay but NOT delivered as a .github/ file
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'plugin' }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Precondition: plugin mode should not write sdlc files to .github/',
        );

        // Switch to synchronize mode: the artifact is now delivered as a file in .github/.
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();

        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);
        assert.ok(
            anyGithubFileMatchesFragment('sdlc'),
            'Expected sdlc instruction files written to .github/ after switching to synchronize mode',
        );
        // Delivery mode does not change overlay membership.
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected the instruction artifact (testing) to remain in the overlay after switching to synchronize mode',
        );
    });

    // ── synchronize → non-.github delivery ────────────────────────────────────

    // The destination uses PLUGIN mode (not settings) for the "left synchronize,
    // no longer a .github/ file" end state — same host constraint as the previous
    // test: a settings-mode Apply triggers the chat.* write that VS Code's config
    // editing service REJECTS in the ExTester host, which makes that Apply throw
    // and leaves the .github/ removal unobservable in-host. Plugin mode is the
    // host-faithful non-.github delivery. The synchronize→settings removal
    // specifically is engine-owned (synchronizer + computeSettingsEntries).
    test('Switching out of synchronize mode removes the .github/ files', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        // Step 1: apply in synchronize mode (Refresh recomputes from disk, then Apply
        // runs the synchronizer — see reapplyFromDisk).
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();
        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);
        assert.ok(
            anyGithubFileMatchesFragment('sdlc'),
            'Precondition: sdlc sync files must exist in .github/ before mode switch',
        );

        // Step 2: switch to plugin mode — .github/ files are removed. Refresh
        // recomputes the overlay (now plugin classification) from disk; the explicit
        // Apply then runs the synchronizer prune against that refreshed state,
        // removing the orphaned synchronized file.
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'plugin' }), 'utf-8');
        await reapplyFromDisk();

        await waitFor(async () => !anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Expected sdlc sync files removed from .github/ after switching out of synchronize mode',
        );
        // The artifact is still part of the overlay, now delivered via plugin instead.
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected the instruction artifact (testing) to remain in the overlay after switching out of synchronize mode',
        );
    });

    // ── plugin mode ───────────────────────────────────────────────────────────

    test('Plugin mode delivers via neither settings nor .github/ but keeps overlay membership', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        // First Clean to ensure a blank slate
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Apply with plugin mode (default for instructions)
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'plugin' }), 'utf-8');
        await reapplyFromDisk();
        await sleep(1_000);

        // Plugin mode: instructions contribute only to chat.pluginLocations — no .github/ files.
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Plugin mode should NOT write sdlc instruction files to .github/',
        );
        // The artifact remains part of the overlay regardless of delivery classification.
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected the instruction artifact (testing) to remain in the overlay in plugin mode',
        );
    });

    // ── Idempotent transitions ────────────────────────────────────────────────

    test('Applying synchronize mode twice is idempotent (no duplicate .github/ files)', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();
        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);

        const filesAfterFirst = walkDir(GITHUB_DIR).map(f => path.relative(GITHUB_DIR, f));

        // Apply again without changing config
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        const filesAfterSecond = walkDir(GITHUB_DIR).map(f => path.relative(GITHUB_DIR, f));

        assert.deepStrictEqual(
            filesAfterSecond.sort(),
            filesAfterFirst.sort(),
            'Second Apply in synchronize mode should produce identical .github/ file set',
        );
    });

    // ── Clean removes synchronized files ──────────────────────────────────────

    test('Clean removes .github/ files written by synchronize mode', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        // Apply in synchronize mode to create .github/ files.
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();
        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);

        // Writing CONFIG_PATH above triggers the config watcher, which emits a
        // delayed auto-apply notification. Let it (and the Apply toast) settle,
        // then clear all notifications — otherwise a stray toast stacks above the
        // Clean confirmation and intercepts the Remove button click.
        const workbench = new Workbench();
        await sleep(3_000);
        await dismissAllNotifications(workbench);

        // Run Clean and confirm the removal (the confirmation must be *actioned*,
        // not merely dismissed, or the files are left in place). The Remove button
        // can be transiently non-interactable when a late auto-apply toast stacks
        // over it, so clear strays and re-issue Clean to get a fresh confirmation
        // on retry.
        for (let attempt = 0; attempt < 3; attempt++) {
            await dismissAllNotifications(workbench);
            await sleep(500);
            await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
            const notification = await waitForNotification(
                workbench,
                'Remove all synchronized files',
                INTERACTION_TIMEOUT,
            );
            if (!notification) {
                // No confirmation means there is nothing left to clean.
                break;
            }
            try {
                await sleep(500);
                await notification.takeAction('Remove');
                break;
            } catch {
                // A stray toast intercepted the click — clear and retry.
            }
        }

        await waitFor(async () => !anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Expected MetaFlow-managed sdlc files removed from .github/ after Clean',
        );
    });

    // ── Verify .github/ file contains provenance header ──────────────────────

    test('Synchronize mode writes files with MetaFlow provenance header', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();
        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);

        // Find the first sdlc file in .github/ and verify it has a provenance header
        const syncedFile = walkDir(GITHUB_DIR).find(f => f.replace(/\\/g, '/').includes('sdlc'));
        assert.ok(syncedFile, 'Expected at least one sdlc file in .github/ after synchronize Apply');

        const content = fs.readFileSync(syncedFile, 'utf-8');
        assert.ok(
            content.includes('metaflow') || content.includes('synced') || content.includes('MetaFlow'),
            `Expected provenance header in synced file. File starts with:\n${content.slice(0, 200)}`,
        );
    });

    // ── Delivery mode is independent of overlay membership ────────────────────

    test('The artifact stays in the overlay across plugin and synchronize modes', async function () {
        this.timeout(WAIT_TIMEOUT * 4 + 20_000);

        // plugin mode → in overlay, not on disk. (settings mode is not host-faithful
        // here: the ExTester host rejects the programmatic chat.* write, so a
        // settings-mode Apply throws and poisons the next Apply. plugin mode is the
        // host-faithful "delivered, not in .github/" classification — see test 1.)
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'plugin' }), 'utf-8');
        await reapplyFromDisk();
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing') && !anyGithubFileMatchesFragment('sdlc'),
            'plugin mode: artifact in overlay, not delivered to .github/',
        );

        // synchronize mode → still in overlay, now on disk
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronize' }), 'utf-8');
        await reapplyFromDisk();
        await waitFor(async () => anyGithubFileMatchesFragment('sdlc'), WAIT_TIMEOUT * 2);
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing') && anyGithubFileMatchesFragment('sdlc'),
            'synchronize mode: artifact still in overlay, now delivered to .github/',
        );
    });
});
