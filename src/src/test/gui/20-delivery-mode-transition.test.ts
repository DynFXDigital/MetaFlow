/**
 * GUI tests — Delivery mode transitions (v0.2.0).
 *
 * Verifies that switching the injection mode for an artifact type between
 * 'settings' and 'synchronized' correctly:
 *
 *   settings → synchronized:
 *     - Apply writes the artifact file(s) into .github/ with provenance
 *     - Apply removes the corresponding VS Code settings key
 *
 *   synchronized → settings:
 *     - Apply writes the VS Code settings key
 *     - Apply removes the .github/ file(s)
 *
 * Test workspace: standards/sdlc enabled, company/core disabled.
 * Relevant file: standards/sdlc/instructions/testing.md
 * Sync output:   .github/instructions/_default-sdlc__testing.md
 *
 * Each test establishes a known starting state via before/afterEach so
 * transitions are verified in isolation.
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
const GITHUB_DIR     = path.join(WORKSPACE_ROOT, '.github');

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

type InstructionMode = 'settings' | 'synchronized' | 'plugin';

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

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Delivery Mode Transitions', function () {
    this.timeout(STARTUP_TIMEOUT);

    let _sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        _sideBar = await openMetaFlowSidebar();
        const section = await getSection(_sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        // Restore original config then Apply to clean up any sync files and restore settings.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── settings → synchronized ───────────────────────────────────────────────

    test('Switching to synchronized mode writes instructions to .github/', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start in settings mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'settings' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Switch to synchronized mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // Synchronized mode should write instructions into .github/
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            anyGithubFileMatchesFragment('sdlc'),
            'Expected sdlc instruction files written to .github/ after switching to synchronized mode',
        );
    });

    test('Switching to synchronized mode removes settings key', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start in settings mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'settings' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Switch to synchronized mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'chat.instructionsFilesLocations should not contain sdlc paths after switching to synchronized mode',
        );
    });

    // ── synchronized → settings ───────────────────────────────────────────────

    test('Switching from synchronized back to settings restores the settings key', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Step 1: apply in synchronized mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        // Step 2: switch back to settings mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'settings' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Expected chat.instructionsFilesLocations to be restored after switching back to settings mode',
        );
    });

    test('Switching from synchronized back to settings removes the .github/ files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Step 1: apply in synchronized mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        // Confirm files exist
        assert.ok(
            anyGithubFileMatchesFragment('sdlc'),
            'Precondition: sdlc sync files must exist in .github/ before mode switch',
        );

        // Step 2: switch back to settings mode
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'settings' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Expected sdlc sync files removed from .github/ after switching back to settings mode',
        );
    });

    // ── plugin mode ───────────────────────────────────────────────────────────

    test('Plugin mode does not write settings key and does not write .github/ files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // First Clean to ensure a blank slate
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Apply with plugin mode (default for instructions)
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'plugin' }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // Plugin mode: instructions contribute only to chat.pluginLocations, not settings or .github/
        assert.ok(
            !settingsHasKey('chat.instructionsFilesLocations'),
            'Plugin mode should NOT write chat.instructionsFilesLocations',
        );
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Plugin mode should NOT write sdlc instruction files to .github/',
        );
    });

    // ── Idempotent transitions ────────────────────────────────────────────────

    test('Applying synchronized mode twice is idempotent (no duplicate .github/ files)', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        const filesAfterFirst = walkDir(GITHUB_DIR).map(f => path.relative(GITHUB_DIR, f));

        // Apply again without changing config
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);

        const filesAfterSecond = walkDir(GITHUB_DIR).map(f => path.relative(GITHUB_DIR, f));

        assert.deepStrictEqual(
            filesAfterSecond.sort(),
            filesAfterFirst.sort(),
            'Second Apply in synchronized mode should produce identical .github/ file set',
        );
    });

    // ── Clean removes synchronized files ──────────────────────────────────────

    test('Clean removes .github/ files written by synchronized mode', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Apply in synchronized mode to create .github/ files
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        // Run Clean and confirm
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);

        // Dismiss any confirmation notification
        await dismissAllNotifications(workbench);
        await sleep(500);

        await waitFor(
            async () => !anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Expected MetaFlow-managed sdlc files removed from .github/ after Clean',
        );
    });

    // ── Verify .github/ file contains provenance header ──────────────────────

    test('Synchronized mode writes files with MetaFlow provenance header', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        // Find the first sdlc file in .github/ and verify it has a provenance header
        const syncedFile = walkDir(GITHUB_DIR).find(f => f.replace(/\\/g, '/').includes('sdlc'));
        assert.ok(syncedFile, 'Expected at least one sdlc file in .github/ after synchronized Apply');

        const content = fs.readFileSync(syncedFile, 'utf-8');
        assert.ok(
            content.includes('metaflow') || content.includes('synced') || content.includes('MetaFlow'),
            `Expected provenance header in synced file. File starts with:\n${content.slice(0, 200)}`,
        );
    });

    // ── .vscode/settings.json is unchanged by synchronized-only Apply ─────────

    test('settings.json is not modified when only synchronized files are written', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Apply in synchronized mode (no settings writes for instructions)
        fs.writeFileSync(CONFIG_PATH, configWith({ instructionMode: 'synchronized' }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // settings.json should not have instruction paths in it
        const settings = readSettings();
        const instructionPaths = settings['chat.instructionsFilesLocations'];
        if (instructionPaths && typeof instructionPaths === 'object') {
            const hasAnyPath = Object.keys(instructionPaths as Record<string, boolean>).length > 0;
            // If there are any paths, none should reference sdlc instructions (they're synced, not settings)
            if (hasAnyPath) {
                const hasSdlcPath = Object.keys(instructionPaths as Record<string, boolean>).some(
                    p => p.replace(/\\/g, '/').includes('standards/sdlc'),
                );
                assert.ok(
                    !hasSdlcPath,
                    'chat.instructionsFilesLocations should not reference sdlc instructions when in synchronized mode',
                );
            }
        }
    });
});
