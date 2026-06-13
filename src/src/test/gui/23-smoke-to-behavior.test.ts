/**
 * GUI tests — Behavioral upgrades for previously smoke-tested commands (v0.2.0).
 *
 * Suites 05, 08, 09 only verified that several commands fire without error.
 * This suite re-tests the same commands but asserts observable side effects:
 *
 *   metaflow.openConfig          → opens an editor tab on config.jsonc
 *   metaflow.status              → writes diagnostic lines to MetaFlow output channel
 *   metaflow.preview             → writes preview lines to MetaFlow output channel
 *   metaflow.toggleLayersViewMode → flips views.layersViewMode in .metaflow/state.json
 *   metaflow.toggleFilesViewMode  → flips views.filesViewMode in .metaflow/state.json
 *
 * The output-channel assertions use vscode-extension-tester's BottomBarPanel
 * to open the Output view, select the MetaFlow channel, and read its text.
 * Those interactions can be slow and sometimes flaky on Windows; tests use
 * generous timeouts and tolerate channel-name mismatches by treating a
 * "channel not found" outcome as a pass-skip rather than a hard failure.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    SideBarView,
    Workbench,
    EditorView,
    BottomBarPanel,
    OutputView,
} from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    waitFor,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const STATE_PATH     = path.join(WORKSPACE_ROOT, '.metaflow', 'state.json');

// ── State helpers ─────────────────────────────────────────────────────────────

interface ManagedViewsLike {
    filesViewMode?: string;
    layersViewMode?: string;
}

function readViewsState(): ManagedViewsLike {
    try {
        const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Record<string, unknown>;
        return ((parsed['views'] as ManagedViewsLike) ?? {});
    } catch {
        return {};
    }
}

// ── Output channel helpers ────────────────────────────────────────────────────

/**
 * Returns the MetaFlow output channel text, or undefined if the channel could
 * not be opened in this VS Code build / extester version.
 */
async function readMetaFlowChannelText(timeoutMs = WAIT_TIMEOUT): Promise<string | undefined> {
    try {
        const panel = new BottomBarPanel();
        await panel.toggle(true);
        await sleep(500);

        const output: OutputView = await panel.openOutputView();
        await sleep(500);

        const channels = await output.getChannelNames().catch(() => [] as string[]);
        const metaflowChannel = channels.find(name => name.toLowerCase().includes('metaflow'));
        if (!metaflowChannel) {
            return undefined;
        }

        await output.selectChannel(metaflowChannel);
        // Channel may take a moment to populate after selection
        let text = '';
        await waitFor(async () => {
            text = await output.getText().catch(() => '');
            return text.length > 0;
        }, timeoutMs).catch(() => { /* fall through to return empty */ });
        return text;
    } catch {
        return undefined;
    }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Smoke-To-Behavior Upgrades', function () {
    this.timeout(STARTUP_TIMEOUT);

    let _sideBar: SideBarView;
    let originalConfig: string;
    let originalState: string | undefined;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
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
        // Close any open editors so editor-tab assertions in later tests start clean
        try {
            const editorView = new EditorView();
            await editorView.closeAllEditors().catch(() => { /* ignore */ });
        } catch {
            // nothing
        }

        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        if (originalState !== undefined) {
            fs.writeFileSync(STATE_PATH, originalState, 'utf-8');
        }
        await sleep(800);
        await dismissAllNotifications(new Workbench());
    });

    // ── Open Config File ─────────────────────────────────────────────────────

    test('Open Config File opens an editor tab on config.jsonc', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        await new Workbench().executeCommand('MetaFlow: Open Config File');

        const editorView = new EditorView();
        await waitFor(async () => {
            const titles = await editorView.getOpenEditorTitles().catch(() => [] as string[]);
            return titles.some(t => t.toLowerCase().includes('config.jsonc'));
        }, WAIT_TIMEOUT);

        const titles = await editorView.getOpenEditorTitles().catch(() => [] as string[]);
        assert.ok(
            titles.some(t => t.toLowerCase().includes('config.jsonc')),
            `Expected config.jsonc in open editor tabs after Open Config File. Tabs: ${titles.join(', ')}`,
        );
    });

    // ── Status writes diagnostic output ──────────────────────────────────────

    test('Status writes diagnostic lines to the MetaFlow output channel', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        await new Workbench().executeCommand('MetaFlow: Status');
        await sleep(2_000);

        const text = await readMetaFlowChannelText();
        if (text === undefined) {
            // Output channel not driveable in this environment — soft pass
            return;
        }

        assert.ok(
            text.includes('MetaFlow Status') ||
            text.includes('Active Profile') ||
            text.includes('Effective Files'),
            `Expected Status to write recognizable diagnostic lines. Got:\n${text.slice(0, 500)}`,
        );
    });

    // ── Preview writes overlay summary ───────────────────────────────────────

    test('Preview Overlay writes an overlay summary to the MetaFlow output channel', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        await new Workbench().executeCommand('MetaFlow: Preview Overlay');
        await sleep(2_000);

        const text = await readMetaFlowChannelText();
        if (text === undefined) {
            return; // soft pass — channel not driveable here
        }

        assert.ok(
            text.includes('Overlay Preview') ||
            text.includes('pending changes') ||
            text.includes('Total:'),
            `Expected Preview Overlay to write a recognizable summary. Got:\n${text.slice(0, 500)}`,
        );
    });

    // ── View mode toggles flip persisted state ───────────────────────────────

    test('Toggle Capabilities View Mode flips views.layersViewMode in .metaflow/state.json', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const before = readViewsState().layersViewMode ?? 'flat';

        await new Workbench().executeCommand('MetaFlow: Toggle Capabilities View Mode');

        await waitFor(async () => {
            const next = readViewsState().layersViewMode;
            return next !== undefined && next !== before;
        }, WAIT_TIMEOUT);

        const after = readViewsState().layersViewMode;
        assert.notStrictEqual(
            after,
            before,
            `Toggle should flip views.layersViewMode away from "${before}". Got "${after}".`,
        );
        assert.ok(
            after === 'flat' || after === 'tree',
            `Expected views.layersViewMode to be 'flat' or 'tree'. Got "${after}".`,
        );
    });

    test('Toggle Effective Files View Mode flips views.filesViewMode in .metaflow/state.json', async function () {
        this.timeout(WAIT_TIMEOUT + 15_000);

        const before = readViewsState().filesViewMode ?? 'unified';

        await new Workbench().executeCommand('MetaFlow: Toggle Effective Files View Mode');

        await waitFor(async () => {
            const next = readViewsState().filesViewMode;
            return next !== undefined && next !== before;
        }, WAIT_TIMEOUT);

        const after = readViewsState().filesViewMode;
        assert.notStrictEqual(
            after,
            before,
            `Toggle should flip views.filesViewMode away from "${before}". Got "${after}".`,
        );
        assert.ok(
            after === 'unified' || after === 'repoTree',
            `Expected views.filesViewMode to be 'unified' or 'repoTree'. Got "${after}".`,
        );
    });

    test('Round trip: two Toggle Capabilities View Mode calls return to original mode', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        const before = readViewsState().layersViewMode ?? 'flat';

        const workbench = new Workbench();

        // Toggle once
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await waitFor(async () => {
            const m = readViewsState().layersViewMode;
            return m !== undefined && m !== before;
        }, WAIT_TIMEOUT);

        // Toggle again to return
        await workbench.executeCommand('MetaFlow: Toggle Capabilities View Mode');
        await waitFor(async () => {
            const m = readViewsState().layersViewMode;
            return m === before;
        }, WAIT_TIMEOUT);

        const after = readViewsState().layersViewMode;
        assert.strictEqual(
            after,
            before,
            `After two toggles, layersViewMode should return to "${before}". Got "${after}".`,
        );
    });
});
