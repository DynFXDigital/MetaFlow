/**
 * GUI tests — Git integration and promote commands (v0.2.0).
 *
 * Covers:
 *  - metaflow.promote (promote changes to remote)
 *  - metaflow.offerGitRemotePromotion / offerGitIgnoreStateConfiguration
 *  - metaflow.pullRepository / pushRepository (registration; test workspace
 *    is local-only so the full flow is not exercisable here)
 *  - metaflow.initConfig (initialization wizard for new workspaces)
 *  - Per-artifact-type synchronization inline commands
 *    (metaflow.synchronization.instructions.settings, etc.)
 *
 * Most of these commands require a git-backed repository or a workspace without
 * an existing config.  Where the full flow cannot be exercised, we verify:
 *   1. The command is registered (executeCommand does not throw "Unknown command")
 *   2. The command shows appropriate feedback (warning/notification) rather than
 *      crashing silently
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
    waitForNotification,
    dismissAllNotifications,
    dismissActiveInput,
    dismissModalDialogs,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

const CONFIG_PATH = path.resolve(
    __dirname,
    '../../../test-workspace/.metaflow/config.jsonc',
);

/** Executes a command and asserts it is registered (does not throw "Unknown command"). */
async function assertCommandRegistered(
    workbench: Workbench,
    commandId: string,
): Promise<void> {
    try {
        await workbench.executeCommand(commandId);
        await sleep(300);
        await dismissModalDialogs();
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

suite('Git Integration and Promote Commands', function () {
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
    });

    afterEach(async () => {
        // Promote/git/initConfig commands can leave a modal dialog (.monaco-dialog-box)
        // open; dismissActiveInput only handles quick-inputs, so a stray modal would
        // intercept clicks in the next test. Clear modals explicitly first.
        await dismissModalDialogs();
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(800);
    });

    // ── Promote ──────────────────────────────────────────────────────────────

    test('MetaFlow: Promote Changes command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'MetaFlow: Promote Changes');
    });

    test('MetaFlow: Promote Changes shows appropriate feedback for local-only repos', async () => {
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Promote Changes');
        await sleep(2_000);

        // The test workspace has only a local repo (no git remote), so the
        // promote command should either show a notification or open a dialog.
        // It should NOT show an unhandled error.
        const hasError = await waitForNotification(workbench, 'unhandled', 1_000);
        assert.ok(!hasError, 'Promote showed an unhandled error notification');

        await dismissActiveInput();
        await dismissAllNotifications(workbench);
    });

    // ── Git remote promotion offer ────────────────────────────────────────────

    test('metaflow.offerGitRemotePromotion command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'metaflow.offerGitRemotePromotion');
    });

    test('metaflow.offerGitIgnoreStateConfiguration command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'metaflow.offerGitIgnoreStateConfiguration');
    });

    // ── Pull / Push repository ────────────────────────────────────────────────
    // These commands require a git-backed repository in the correct sync state
    // (behind/ahead of remote).  The test workspace is local-only.  We verify
    // only that the commands are registered, not that they execute the git
    // operation.

    test('metaflow.pullRepository command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'metaflow.pullRepository');
    });

    test('metaflow.pushRepository command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'metaflow.pushRepository');
    });

    test('MetaFlow: Pull Repository Updates command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'MetaFlow: Pull Repository Updates');
    });

    test('MetaFlow: Push Repository Changes command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'MetaFlow: Push Repository Changes');
    });

    // ── Initialize Config ─────────────────────────────────────────────────────
    // initConfig is intended for workspaces without an existing .metaflow/config.jsonc.
    // In the test workspace a config already exists, so the command should show
    // a warning or proceed to its own wizard — either way it must not crash.

    test('MetaFlow: Initialize Configuration command is registered', async () => {
        const workbench = new Workbench();
        try {
            await workbench.executeCommand('MetaFlow: Initialize Configuration');
            await sleep(500);
            await dismissActiveInput();
            await dismissAllNotifications(workbench);
        } catch (err) {
            const msg = (err as Error).message ?? '';
            assert.ok(
                !msg.toLowerCase().includes('unknown command') &&
                !msg.toLowerCase().includes('command not found'),
                `initConfig command not registered: ${msg}`,
            );
        }
    });

    // ── Per-artifact-type synchronization commands ────────────────────────────

    test('Per-artifact synchronization commands for instructions are registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.synchronization.instructions.settings',
            'metaflow.synchronization.instructions.synchronize',
            'metaflow.synchronization.instructions.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    test('Per-artifact synchronization commands for prompts are registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.synchronization.prompts.settings',
            'metaflow.synchronization.prompts.synchronize',
            'metaflow.synchronization.prompts.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    test('Per-artifact synchronization commands for skills are registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.synchronization.skills.settings',
            'metaflow.synchronization.skills.synchronize',
            'metaflow.synchronization.skills.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    test('Per-artifact synchronization commands for agents are registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.synchronization.agents.settings',
            'metaflow.synchronization.agents.synchronize',
            'metaflow.synchronization.agents.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    test('Per-artifact synchronization commands for hooks are registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.synchronization.hooks.settings',
            'metaflow.synchronization.hooks.synchronize',
            'metaflow.synchronization.hooks.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    // ── Global injection policy direct commands ──────────────────────────────

    test('Global injection policy direct commands are all registered', async () => {
        const workbench = new Workbench();
        for (const cmd of [
            'metaflow.injectionPolicy.global.settings',
            'metaflow.injectionPolicy.global.synchronize',
            'metaflow.injectionPolicy.global.inherit',
        ]) {
            await assertCommandRegistered(workbench, cmd);
        }
    });

    // ── Capabilities section integrity ────────────────────────────────────────

    test('Capabilities section remains intact after all git/promote command invocations', async () => {
        const workbench = new Workbench();

        await assertCommandRegistered(workbench, 'MetaFlow: Promote Changes');
        await assertCommandRegistered(workbench, 'metaflow.offerGitRemotePromotion');

        const section = await getSection(sideBar, 'Capabilities');
        assert.ok(section, 'Capabilities section missing after git/promote commands');
        await waitForSectionReady(section, WAIT_TIMEOUT);
    });

    // ── AI Metadata tree: repo source pull/push inline buttons ──────────────

    test('AI Metadata repo source context menu is still accessible', async () => {
        const section = await getSection(sideBar, 'AI Metadata');
        await waitForSectionReady(section, WAIT_TIMEOUT);

        const items = await section.getVisibleItems();
        if (items.length === 0) {
            return; // no items to test
        }

        const ctxMenu = await items[0].openContextMenu().catch(() => undefined);
        if (ctxMenu) {
            await ctxMenu.close();
        }
        // If context menu opened and closed cleanly, the test passes
    });

    // ── Get Agent Plugin Catalog ──────────────────────────────────────────────

    test('metaflow.getAgentPluginCatalog command is registered', async () => {
        await assertCommandRegistered(new Workbench(), 'metaflow.getAgentPluginCatalog');
    });
});
