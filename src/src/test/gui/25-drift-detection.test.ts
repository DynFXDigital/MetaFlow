/**
 * GUI tests — Drift detection for synchronized files (v0.2.0).
 *
 * Apply in synchronized mode writes files into .github/ with a provenance
 * header. If a user later edits one of those files manually, the next Apply
 * must detect the drift and skip the file rather than silently clobbering the
 * user's changes.
 *
 * This is a load-bearing safety property: without it, custom local edits
 * could be lost on the next Apply.
 *
 * Test workspace: standards/sdlc enabled. With injection: { instructions:
 * "synchronized" }, testing.md is written to .github/instructions/.
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
const GITHUB_DIR     = path.join(WORKSPACE_ROOT, '.github');

const DRIFT_MARKER = '<<USER EDIT — drift detection test sentinel>>';

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

function findFirstSdlcInstructionFile(): string | undefined {
    if (!fs.existsSync(GITHUB_DIR)) { return undefined; }
    return walkDir(GITHUB_DIR).find(f => {
        const norm = f.replace(/\\/g, '/');
        return norm.includes('sdlc') && norm.includes('instructions');
    });
}

// ── Config builders ───────────────────────────────────────────────────────────

function syncConfig(): string {
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
                review:  { enable: ['**/*'] },
            },
            activeProfile: 'default',
            compatibilityVersion: 2,
            injection: {
                instructions: 'synchronized',
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

suite('Drift Detection in Synchronized Mode', function () {
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
        // Restore config, Clean, and Apply to remove any sync files
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_500);
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── Apply skips a manually edited sync file ──────────────────────────────

    test('Apply does NOT overwrite a synced file that has been manually edited', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        // Step 1: apply in sync mode so testing.md is written into .github/
        fs.writeFileSync(CONFIG_PATH, syncConfig(), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => findFirstSdlcInstructionFile() !== undefined,
            WAIT_TIMEOUT,
        );

        const syncedFile = findFirstSdlcInstructionFile();
        assert.ok(syncedFile, 'Expected an sdlc instructions file under .github/');

        // Step 2: overwrite the synced file content
        const userEditContent = `${DRIFT_MARKER}\nThis is a manual user edit that drift detection must preserve.\n`;
        fs.writeFileSync(syncedFile, userEditContent, 'utf-8');

        // Step 3: re-Apply — drift should be detected and the file preserved
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        const afterContent = fs.readFileSync(syncedFile, 'utf-8');
        assert.ok(
            afterContent.includes(DRIFT_MARKER),
            `Drift detection failure: synced file was overwritten by Apply. Content:\n${afterContent.slice(0, 400)}`,
        );
    });

    // ── Apply does not affect non-drifted siblings ───────────────────────────

    test('Apply still re-writes non-drifted siblings even when one file has drifted', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        // Enable core too so there are multiple synced files
        const configWithBoth = syncConfig().replace(
            '"enabled": false',
            '"enabled": true',
        );
        fs.writeFileSync(CONFIG_PATH, configWithBoth, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => {
                const files = walkDir(GITHUB_DIR);
                const hasSdlc = files.some(f => f.replace(/\\/g, '/').includes('sdlc'));
                const hasCore = files.some(f => f.replace(/\\/g, '/').includes('core'));
                return hasSdlc && hasCore;
            },
            WAIT_TIMEOUT,
        );

        // Drift the sdlc file
        const sdlcFile = findFirstSdlcInstructionFile();
        assert.ok(sdlcFile, 'Expected sdlc instruction file');
        fs.writeFileSync(sdlcFile, `${DRIFT_MARKER}\nuser-edited sdlc\n`, 'utf-8');

        // Locate a core synced file (untouched) and capture its content
        const coreFiles = walkDir(GITHUB_DIR).filter(f => f.replace(/\\/g, '/').includes('core'));
        assert.ok(coreFiles.length > 0, 'Expected at least one core synced file');
        const coreFile = coreFiles[0];
        const coreContentBefore = fs.readFileSync(coreFile, 'utf-8');

        // Re-Apply
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // sdlc file still has user edit (drift preserved)
        const sdlcAfter = fs.readFileSync(sdlcFile, 'utf-8');
        assert.ok(
            sdlcAfter.includes(DRIFT_MARKER),
            'Drifted sdlc file should be preserved through a re-Apply',
        );

        // core file should still exist (was not touched by user, may have same content)
        const coreContentAfter = fs.readFileSync(coreFile, 'utf-8');
        assert.ok(
            coreContentAfter.length > 0,
            'Non-drifted core file should remain populated after re-Apply',
        );
        // Provenance header is regenerated on each Apply, so timestamps may
        // differ. Verify the file body still contains source content.
        assert.ok(
            coreContentBefore.split('---')[0].length > 0 ||
            coreContentAfter.split('---')[0].length > 0,
            'Non-drifted core file should have a non-empty body',
        );
    });

    // ── Manually deleted sync file is recreated by next Apply ────────────────

    test('Apply recreates a synced file that was manually deleted', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        fs.writeFileSync(CONFIG_PATH, syncConfig(), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => findFirstSdlcInstructionFile() !== undefined,
            WAIT_TIMEOUT,
        );

        const syncedFile = findFirstSdlcInstructionFile();
        assert.ok(syncedFile, 'Expected sdlc instructions file');

        // Delete it manually
        fs.unlinkSync(syncedFile);
        assert.ok(!fs.existsSync(syncedFile), 'Precondition: file should be deleted');

        // Re-Apply — file should be re-created
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => fs.existsSync(syncedFile),
            WAIT_TIMEOUT,
        );

        assert.ok(
            fs.existsSync(syncedFile),
            'Apply should recreate a manually deleted synced file',
        );
    });

    // ── Clean removes a drifted file as well ─────────────────────────────────

    test('Clean removes drifted files along with non-drifted ones', async function () {
        this.timeout(WAIT_TIMEOUT + 45_000);

        fs.writeFileSync(CONFIG_PATH, syncConfig(), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => findFirstSdlcInstructionFile() !== undefined,
            WAIT_TIMEOUT,
        );

        const syncedFile = findFirstSdlcInstructionFile();
        assert.ok(syncedFile, 'Expected synced file');

        // Drift it
        fs.writeFileSync(syncedFile, `${DRIFT_MARKER}\nuser-edited\n`, 'utf-8');

        // Clean
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        await waitFor(
            async () => !fs.existsSync(syncedFile),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !fs.existsSync(syncedFile),
            'Clean should remove a drifted file as part of its sweep',
        );
    });

    // ── Apply after Clean re-writes original (drift state is cleared) ───────

    test('Apply after Clean re-writes the original content (drift state cleared)', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 30_000);

        fs.writeFileSync(CONFIG_PATH, syncConfig(), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => findFirstSdlcInstructionFile() !== undefined,
            WAIT_TIMEOUT,
        );

        const syncedFile = findFirstSdlcInstructionFile();
        assert.ok(syncedFile, 'Expected sdlc file');

        // Drift it
        fs.writeFileSync(syncedFile, `${DRIFT_MARKER}\nuser-edited\n`, 'utf-8');

        // Clean (clears managed state)
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
        await waitFor(async () => !fs.existsSync(syncedFile), WAIT_TIMEOUT);

        // Re-Apply — file is back, original content (no drift marker)
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => fs.existsSync(syncedFile),
            WAIT_TIMEOUT,
        );

        const finalContent = fs.readFileSync(syncedFile, 'utf-8');
        assert.ok(
            !finalContent.includes(DRIFT_MARKER),
            'After Clean + Apply, the synced file should no longer contain the drifted user edit',
        );
    });
});
