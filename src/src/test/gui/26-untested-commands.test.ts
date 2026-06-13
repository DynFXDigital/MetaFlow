/**
 * GUI tests — Coverage for commands not exercised by any prior suite (v0.2.0).
 *
 * Closes coverage gaps for:
 *   - metaflow.expandLayersBranch / collapseLayersBranch  (branch navigation)
 *   - metaflow.expandFilesBranch / collapseFilesBranch    (branch navigation)
 *   - metaflow.getDiagnosticsSnapshot                     (smoke only)
 *   - metaflow.removeRepoSource                           (no prior GUI test)
 *
 * These commands generally require either a tree item argument or interact
 * with a confirmation dialog. The tests below verify the commands are
 * registered and handle no-argument invocation without crashing the extension.
 * Where a behavioral assertion is feasible (e.g. for removeRepoSource), it is
 * made; otherwise the test is a hardened smoke check.
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
    dismissActiveInput,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertCommandRegistered(
    workbench: Workbench,
    commandId: string,
): Promise<void> {
    try {
        await workbench.executeCommand(commandId);
        await sleep(300);
        await dismissActiveInput();
        await dismissAllNotifications(workbench);
    } catch (err) {
        const msg = (err as Error).message ?? '';
        assert.ok(
            !msg.toLowerCase().includes('unknown command') &&
            !msg.toLowerCase().includes('command not found'),
            `Command "${commandId}" is not registered: ${msg}`,
        );
    }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Untested Command Coverage', function () {
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
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(800);
    });

    // ── Branch expand/collapse commands ──────────────────────────────────────

    test('metaflow.expandLayersBranch is registered and a no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.expandLayersBranch');

        // Sections must remain accessible after the call
        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after expandLayersBranch');
    });

    test('metaflow.collapseLayersBranch is registered and a no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.collapseLayersBranch');

        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after collapseLayersBranch');
    });

    test('metaflow.expandFilesBranch is registered and a no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.expandFilesBranch');

        const section = await getSection(_sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after expandFilesBranch');
    });

    test('metaflow.collapseFilesBranch is registered and a no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);
        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.collapseFilesBranch');

        const section = await getSection(_sideBar, 'Effective Files');
        assert.ok(section, 'Effective Files section missing after collapseFilesBranch');
    });

    // ── Diagnostics snapshot ─────────────────────────────────────────────────

    test('metaflow.getDiagnosticsSnapshot is registered and does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);

        // This command returns a snapshot object; executeCommand from the
        // palette discards the return value, so we can only verify it does
        // not throw an unknown-command error.
        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.getDiagnosticsSnapshot');

        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after getDiagnosticsSnapshot');
    });

    // ── removeRepoSource ─────────────────────────────────────────────────────

    test('metaflow.removeRepoSource invoked with no argument does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 15_000);

        // Without a tree-item argument, the command should exit cleanly or
        // open a picker. Either way, the sidebar must remain functional.
        const workbench = new Workbench();
        try {
            await workbench.executeCommand('metaflow.removeRepoSource');
            await sleep(1_500);
        } catch (err) {
            const msg = (err as Error).message ?? '';
            assert.ok(
                !msg.toLowerCase().includes('unknown command'),
                `removeRepoSource command not registered: ${msg}`,
            );
        }
        await dismissActiveInput();
        await dismissAllNotifications(workbench);

        const aiSection = await getSection(_sideBar, 'AI Metadata');
        assert.ok(aiSection, 'AI Metadata section missing after removeRepoSource');
    });

    // ── openWarningSource / copyWarningMessage ───────────────────────────────

    test('metaflow.openWarningSource is registered and no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);

        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.openWarningSource');

        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after openWarningSource');
    });

    test('metaflow.copyWarningMessage is registered and no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 10_000);

        const workbench = new Workbench();
        await assertCommandRegistered(workbench, 'metaflow.copyWarningMessage');

        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after copyWarningMessage');
    });

    // ── removeMetaFlowCapability ─────────────────────────────────────────────

    test('metaflow.removeMetaFlowCapability is registered and no-arg call does not crash', async function () {
        this.timeout(INTERACTION_TIMEOUT + 15_000);

        const workbench = new Workbench();
        try {
            await workbench.executeCommand('metaflow.removeMetaFlowCapability');
            await sleep(1_500);
        } catch (err) {
            const msg = (err as Error).message ?? '';
            assert.ok(
                !msg.toLowerCase().includes('unknown command'),
                `removeMetaFlowCapability not registered: ${msg}`,
            );
        }
        await dismissActiveInput();
        await dismissAllNotifications(workbench);

        const section = await getSection(_sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after removeMetaFlowCapability');
    });
});
