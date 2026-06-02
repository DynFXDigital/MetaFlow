/**
 * GUI tests — Synchronization conflict detection (v0.2.0).
 *
 * The synchronizer detects two kinds of conflicts during planning:
 *
 *   1. Inter-layer collision — two layers produce the same destination path.
 *      With the default 'prefixed' naming strategy this is essentially
 *      impossible (each layer's filename includes a unique repo+layer prefix).
 *      With 'original-unless-conflict' it surfaces collisions explicitly.
 *
 *   2. Unmanaged destination — a destination path is already occupied by a
 *      file outside MetaFlow's managed state. This is the more common case
 *      and protects user-authored content from being overwritten.
 *
 * Both kinds cause Apply to throw a planning error, which the extension
 * surfaces as a 'MetaFlow: …' error notification. This suite verifies that
 * behavior and that switching back to the default strategy resolves the
 * conflict.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SideBarView, Workbench } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    waitFor,
    waitForNotification,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const GITHUB_DIR     = path.join(WORKSPACE_ROOT, '.github');

const UNMANAGED_MARKER = '<<UNMANAGED USER CONTENT — must not be overwritten>>';

// ── File helpers ──────────────────────────────────────────────────────────────

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
    } catch { /* directory may not exist */ }
    return results;
}

function anyGithubFileMatchesFragment(fragment: string): boolean {
    if (!fs.existsSync(GITHUB_DIR)) { return false; }
    return walkDir(GITHUB_DIR).some(f => f.replace(/\\/g, '/').includes(fragment));
}

// ── Config builders ───────────────────────────────────────────────────────────

function syncConfigWithStrategy(strategy: 'prefixed' | 'original-unless-conflict'): string {
    return JSON.stringify(
        {
            metadataRepos: [{
                id: 'primary',
                localPath: '.ai/ai-metadata',
                capabilities: [
                    { path: 'company/core',   enabled: false },
                    { path: 'standards/sdlc', enabled: true  },
                ],
            }],
            profiles: {
                default: { enable: ['**/*'] },
            },
            activeProfile: 'default',
            compatibilityVersion: 2,
            fileNamingStrategy: strategy,
            injection: {
                // NOTE: the config injection *mode* value is 'synchronize'; 'synchronized'
                // is the internal classification and is invalid as a mode (silently falls
                // through to the plugin default, so no files sync to .github).
                instructions: 'synchronize',
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

suite('Sync Conflict Detection', function () {
    this.timeout(STARTUP_TIMEOUT);

    let _sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        _sideBar = await openMetaFlowSidebar();
        const section = await getSection(_sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        // Cleanup: restore config, remove any test sentinel files, Clean and Apply
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);

        // Best-effort removal of any unmanaged conflict file created by tests
        const conflictPath = path.join(GITHUB_DIR, 'instructions', 'testing.md');
        try { fs.rmSync(conflictPath, { force: true }); } catch { /* ignore */ }
        try {
            const instrDir = path.join(GITHUB_DIR, 'instructions');
            if (fs.existsSync(instrDir) && fs.readdirSync(instrDir).length === 0) {
                fs.rmdirSync(instrDir);
            }
        } catch { /* ignore */ }

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── Unmanaged destination conflict surfaces error ────────────────────────

    test('Apply with original-unless-conflict strategy and a pre-existing unmanaged file surfaces a conflict error', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        // Start clean
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Create an unmanaged file at the destination path that
        // original-unless-conflict would target for testing.md.
        const conflictDir  = path.join(GITHUB_DIR, 'instructions');
        const conflictPath = path.join(conflictDir, 'testing.md');
        fs.mkdirSync(conflictDir, { recursive: true });
        fs.writeFileSync(conflictPath, `${UNMANAGED_MARKER}\nThis was authored by the user, not MetaFlow.\n`, 'utf-8');

        // Switch to original-unless-conflict strategy
        fs.writeFileSync(CONFIG_PATH, syncConfigWithStrategy('original-unless-conflict'), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        // The extension should surface an error notification mentioning the conflict
        const errorNotif = await waitForNotification(workbench, 'MetaFlow', INTERACTION_TIMEOUT);
        assert.ok(
            errorNotif,
            'Expected a MetaFlow notification when an unmanaged destination conflict prevents Apply',
        );

        // And the unmanaged file MUST still contain the user's original content
        const finalContent = fs.readFileSync(conflictPath, 'utf-8');
        assert.ok(
            finalContent.includes(UNMANAGED_MARKER),
            `Unmanaged destination file should not be overwritten. Content:\n${finalContent.slice(0, 400)}`,
        );
    });

    // ── Default 'prefixed' strategy avoids conflict ──────────────────────────

    test('Default prefixed strategy avoids the conflict and writes a prefixed file alongside the user file', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Pre-create unmanaged file at the simple path
        const conflictDir  = path.join(GITHUB_DIR, 'instructions');
        const conflictPath = path.join(conflictDir, 'testing.md');
        fs.mkdirSync(conflictDir, { recursive: true });
        fs.writeFileSync(conflictPath, `${UNMANAGED_MARKER}\nUser content.\n`, 'utf-8');

        // Use the default prefixed strategy — sync writes go to a prefixed
        // filename like _default-sdlc__testing.md, so there's no collision.
        fs.writeFileSync(CONFIG_PATH, syncConfigWithStrategy('prefixed'), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        // A prefixed file (containing 'sdlc') should now exist
        await waitFor(
            async () => anyGithubFileMatchesFragment('sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            anyGithubFileMatchesFragment('sdlc'),
            'Prefixed strategy should write a prefixed sdlc file even when an unmanaged testing.md exists',
        );

        // The unmanaged file should still be untouched
        const finalContent = fs.readFileSync(conflictPath, 'utf-8');
        assert.ok(
            finalContent.includes(UNMANAGED_MARKER),
            'Prefixed strategy must not touch the unmanaged user file',
        );
    });

    // ── Removing the unmanaged file unblocks original-unless-conflict ────────

    test('After removing the unmanaged conflict file, original-unless-conflict can Apply successfully', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 30_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        const conflictDir  = path.join(GITHUB_DIR, 'instructions');
        const conflictPath = path.join(conflictDir, 'testing.md');
        fs.mkdirSync(conflictDir, { recursive: true });
        fs.writeFileSync(conflictPath, `${UNMANAGED_MARKER}\n`, 'utf-8');

        // First Apply: conflict — should fail
        fs.writeFileSync(CONFIG_PATH, syncConfigWithStrategy('original-unless-conflict'), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);

        // Remove the conflicting file
        fs.rmSync(conflictPath, { force: true });
        assert.ok(!fs.existsSync(conflictPath), 'Precondition: unmanaged file should be removed before second Apply');

        // Second Apply: should succeed and write the file at the original path
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => fs.existsSync(conflictPath),
            WAIT_TIMEOUT,
        );

        assert.ok(
            fs.existsSync(conflictPath),
            'After removing the unmanaged file, Apply with original-unless-conflict should write testing.md',
        );

        // Verify it now has MetaFlow provenance (so it really is the managed file, not the user file)
        const content = fs.readFileSync(conflictPath, 'utf-8');
        assert.ok(
            !content.includes(UNMANAGED_MARKER),
            'Reapplied file should be the MetaFlow-managed content, not the previously-removed user content',
        );
    });
});
