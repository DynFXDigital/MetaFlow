/**
 * GUI tests — Apply notifications and view-state persistence (v0.2.0).
 *
 * Closes coverage gaps for:
 *   - Apply success notification text (suite 09 only verified absence of
 *     error notification; no positive assertion on the success message)
 *   - .metaflow/state.json view mode persistence across Refresh / Apply / Clean
 *     (suite 23 verified the toggle write but not durability)
 *
 * The Apply success notification only appears when at least one file is
 * written to .github/, which requires synchronized mode. In settings-only
 * mode, the engine writes zero files and the notification is skipped.
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
    hasNotification,
    dismissAllNotifications,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const STATE_PATH     = path.join(WORKSPACE_ROOT, '.metaflow', 'state.json');

// ── State helpers ─────────────────────────────────────────────────────────────

function readViewMode(field: 'filesViewMode' | 'layersViewMode'): string | undefined {
    try {
        const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Record<string, unknown>;
        const views = parsed['views'] as Record<string, unknown> | undefined;
        const value = views?.[field];
        return typeof value === 'string' ? value : undefined;
    } catch {
        return undefined;
    }
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

function settingsOnlyConfig(): string {
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

suite('Apply Notifications and View-State Persistence', function () {
    this.timeout(STARTUP_TIMEOUT);

    let _sideBar: SideBarView;
    let originalConfig: string;
    let originalState: string | undefined;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        try {
            originalState = fs.readFileSync(STATE_PATH, 'utf-8');
        } catch {
            originalState = undefined;
        }
        _sideBar = await openMetaFlowSidebar();
        const section = await getSection(_sideBar, 'Capabilities');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    afterEach(async function () {
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        if (originalState !== undefined) {
            fs.writeFileSync(STATE_PATH, originalState, 'utf-8');
        }
        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── Apply notifications ──────────────────────────────────────────────────

    test('Apply in synchronized mode shows a success notification mentioning the file count', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        // Start clean so Apply actually writes files (not a no-op)
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, syncConfig(), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        // The success notification format is "MetaFlow: Applied N files."
        const notification = await waitForNotification(workbench, 'Applied', INTERACTION_TIMEOUT);
        assert.ok(
            notification,
            'Expected a success notification containing "Applied" after Apply in synchronized mode',
        );
    });

    test('Apply in settings-only mode does NOT show an "Applied N files" notification', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, settingsOnlyConfig(), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        // Give the apply a chance to settle but only briefly — we want to
        // confirm the success toast does NOT appear, so a short wait suffices.
        await sleep(4_000);

        const seen = await hasNotification(workbench, 'Applied');
        assert.ok(
            !seen,
            'No "Applied N files" notification should appear when only settings are injected (no .github/ writes)',
        );
    });

    // ── View-mode persistence ────────────────────────────────────────────────

    test('Layers view mode persists across MetaFlow: Refresh', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const before = readViewMode('layersViewMode') ?? 'flat';

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await waitFor(async () => {
            const m = readViewMode('layersViewMode');
            return m !== undefined && m !== before;
        }, WAIT_TIMEOUT);
        const afterToggle = readViewMode('layersViewMode');

        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const afterRefresh = readViewMode('layersViewMode');
        assert.strictEqual(
            afterRefresh,
            afterToggle,
            `Layers view mode should persist across Refresh. Before toggle="${before}", after toggle="${afterToggle}", after Refresh="${afterRefresh}".`,
        );
    });

    test('Files view mode persists across MetaFlow: Apply Overlay', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        const before = readViewMode('filesViewMode') ?? 'unified';

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Toggle Effective Files View Mode');
        await waitFor(async () => {
            const m = readViewMode('filesViewMode');
            return m !== undefined && m !== before;
        }, WAIT_TIMEOUT);
        const afterToggle = readViewMode('filesViewMode');

        // Apply Overlay (no config change — should not affect view mode)
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        const afterApply = readViewMode('filesViewMode');
        assert.strictEqual(
            afterApply,
            afterToggle,
            `Files view mode should persist across Apply Overlay. After toggle="${afterToggle}", after Apply="${afterApply}".`,
        );
    });

    test('Layers view mode persists across Clean Synchronized Files', async function () {
        this.timeout(WAIT_TIMEOUT + INTERACTION_TIMEOUT + 25_000);

        const before = readViewMode('layersViewMode') ?? 'flat';

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await waitFor(async () => {
            const m = readViewMode('layersViewMode');
            return m !== undefined && m !== before;
        }, WAIT_TIMEOUT);
        const afterToggle = readViewMode('layersViewMode');

        // Clean (may prompt for confirmation; either confirm or accept no-op)
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        const notif = await waitForNotification(
            workbench,
            'Remove all synchronized files',
            INTERACTION_TIMEOUT,
        );
        if (notif) {
            await notif.takeAction('Remove');
            await sleep(2_500);
        }
        await dismissAllNotifications(workbench);
        await sleep(1_500);

        const afterClean = readViewMode('layersViewMode');
        assert.strictEqual(
            afterClean,
            afterToggle,
            `Layers view mode should persist across Clean. After toggle="${afterToggle}", after Clean="${afterClean}".`,
        );
    });
});
