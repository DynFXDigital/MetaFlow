/**
 * GUI tests — Synchronized output content verification (v0.2.0).
 *
 * Verifies that Apply Overlay in synchronize mode produces the correct files
 * in .github/, that disabled capabilities contribute nothing, and that
 * toggling capability state changes the output on the next Apply.
 *
 * These tests deliberately modify the injection mode to 'synchronize' because
 * the test-workspace default is 'settings' (no files written). After each test
 * the original config is restored and Apply is run once more to let the
 * synchronizer clean up the managed files it wrote.
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

const SOURCE_TESTING_MD = path.join(
    WORKSPACE_ROOT, '.ai', 'ai-metadata', 'standards', 'sdlc', 'instructions', 'testing.md',
);
const SOURCE_CODING_MD = path.join(
    WORKSPACE_ROOT, '.ai', 'ai-metadata', 'company', 'core', 'instructions', 'coding.md',
);

const PROVENANCE_MARKER = '<!-- metaflow:provenance';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recursively returns paths of all files in `dir` that contain the MetaFlow
 * provenance header, identifying them as synchronizer-managed output.
 */
function findMetaFlowSyncedFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) { return results; }

    function walk(d: string): void {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else {
                try {
                    if (fs.readFileSync(fullPath, 'utf-8').includes(PROVENANCE_MARKER)) {
                        results.push(fullPath);
                    }
                } catch { /* skip unreadable files */ }
            }
        }
    }
    walk(dir);
    return results;
}

/** Returns true if any file in `filePaths` contains `text`. */
function anyFileContains(filePaths: string[], text: string): boolean {
    return filePaths.some(fp => {
        try { return fs.readFileSync(fp, 'utf-8').includes(text); }
        catch { return false; }
    });
}

/** Removes all MetaFlow-managed synced files and empty artifact directories. */
function cleanSyncedFiles(): void {
    for (const fp of findMetaFlowSyncedFiles(GITHUB_DIR)) {
        try { fs.unlinkSync(fp); } catch { /* ignore */ }
    }
    for (const dir of ['instructions', 'agents', 'skills', 'prompts', 'hooks']) {
        const dp = path.join(GITHUB_DIR, dir);
        try {
            if (fs.existsSync(dp) && fs.readdirSync(dp).length === 0) { fs.rmdirSync(dp); }
        } catch { /* ignore */ }
    }
}

/**
 * Builds a config JSONC that sets all artifact types to 'synchronize' mode.
 * `coreEnabled` and `sdlcEnabled` control per-capability enabled state.
 */
function syncModeConfig(opts: { coreEnabled?: boolean; sdlcEnabled?: boolean } = {}): string {
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
                instructions: 'synchronize',
                agents:       'synchronize',
                skills:       'synchronize',
                prompts:      'synchronize',
            },
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Synchronized Output Content Verification', function () {
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
        // Restore settings mode so the synchronizer removes its previously written files.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        // Belt-and-suspenders: directly remove any remaining synced files.
        cleanSyncedFiles();
        await dismissAllNotifications(new Workbench());
        await sleep(500);
    });

    // ── Apply writes the right files ──────────────────────────────────────────

    test('Apply writes files from the enabled capability to .github/', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const uniqueLine = fs.readFileSync(SOURCE_TESTING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';

        fs.writeFileSync(CONFIG_PATH, syncModeConfig(), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => findMetaFlowSyncedFiles(GITHUB_DIR).length > 0, WAIT_TIMEOUT);

        assert.ok(
            anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), uniqueLine),
            `Expected a synced file to contain: "${uniqueLine}"`,
        );
    });

    test('Apply writes no files from a disabled capability', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const uniqueLine = fs.readFileSync(SOURCE_CODING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';

        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ coreEnabled: false }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        assert.ok(
            !anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), uniqueLine),
            `Did not expect a synced file to contain: "${uniqueLine}" (company/core is disabled)`,
        );
    });

    test('Both enabled capabilities each contribute files when both are on', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const testingLine = fs.readFileSync(SOURCE_TESTING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';
        const codingLine = fs.readFileSync(SOURCE_CODING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';

        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ coreEnabled: true, sdlcEnabled: true }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => findMetaFlowSyncedFiles(GITHUB_DIR).length >= 2, WAIT_TIMEOUT);

        const files = findMetaFlowSyncedFiles(GITHUB_DIR);
        assert.ok(anyFileContains(files, testingLine), 'Expected standards/sdlc content');
        assert.ok(anyFileContains(files, codingLine),  'Expected company/core content');
    });

    // ── Toggle changes output ─────────────────────────────────────────────────

    test('Enabling a disabled capability adds its content to synced output', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        const codingLine = fs.readFileSync(SOURCE_CODING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';

        // First pass: core disabled
        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ coreEnabled: false }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        assert.ok(
            !anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), codingLine),
            'company/core content must not be present while disabled',
        );

        // Second pass: enable core
        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ coreEnabled: true }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        assert.ok(
            anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), codingLine),
            `Expected company/core content after enabling. Unique line: "${codingLine}"`,
        );
    });

    test('Disabling an enabled capability removes its content from synced output', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        const testingLine = fs.readFileSync(SOURCE_TESTING_MD, 'utf-8')
            .split('\n').find(l => l.trim().length > 0) ?? '';

        // First pass: sdlc enabled
        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ sdlcEnabled: true }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(async () => anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), testingLine), WAIT_TIMEOUT);

        // Second pass: disable sdlc
        fs.writeFileSync(CONFIG_PATH, syncModeConfig({ sdlcEnabled: false }), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        assert.ok(
            !anyFileContains(findMetaFlowSyncedFiles(GITHUB_DIR), testingLine),
            `Expected standards/sdlc content to be absent after disabling. Unique line: "${testingLine}"`,
        );
    });

    // ── Provenance headers ────────────────────────────────────────────────────

    test('Every synchronized file carries a MetaFlow provenance header', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        fs.writeFileSync(CONFIG_PATH, syncModeConfig(), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => findMetaFlowSyncedFiles(GITHUB_DIR).length > 0, WAIT_TIMEOUT);

        for (const fp of findMetaFlowSyncedFiles(GITHUB_DIR)) {
            const content = fs.readFileSync(fp, 'utf-8');
            assert.ok(
                content.startsWith(PROVENANCE_MARKER),
                `Expected provenance header at top of ${path.basename(fp)}`,
            );
        }
    });

    test('Synchronized files contain the original source content after the provenance header', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const testingContent = fs.readFileSync(SOURCE_TESTING_MD, 'utf-8').trim();

        fs.writeFileSync(CONFIG_PATH, syncModeConfig(), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => findMetaFlowSyncedFiles(GITHUB_DIR).length > 0, WAIT_TIMEOUT);

        const matchingFile = findMetaFlowSyncedFiles(GITHUB_DIR).find(fp =>
            fs.readFileSync(fp, 'utf-8').includes(testingContent),
        );
        assert.ok(matchingFile, 'Expected a synced file to contain the full source content');
    });

    // ── Clean removes synced files ────────────────────────────────────────────

    test('Applying with no synchronized capabilities removes previously written files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 15_000);

        // Write files
        fs.writeFileSync(CONFIG_PATH, syncModeConfig(), 'utf-8');
        await sleep(2_000);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(async () => findMetaFlowSyncedFiles(GITHUB_DIR).length > 0, WAIT_TIMEOUT);

        const filesBeforeCount = findMetaFlowSyncedFiles(GITHUB_DIR).length;
        assert.ok(filesBeforeCount > 0, 'Precondition: synced files should exist');

        // Switch back to settings mode and Apply — synchronizer should remove its managed files
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        const filesAfterCount = findMetaFlowSyncedFiles(GITHUB_DIR).length;
        assert.strictEqual(filesAfterCount, 0, 'Expected all synced files to be removed after switching to settings mode');
    });
});
