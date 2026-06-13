/**
 * GUI tests — Hooks configuration end-to-end health (v0.2.0).
 *
 * Hooks are file-path scripts referenced from the config.hooks block, not an
 * artifact directory like instructions/agents/skills. The settings injector
 * writes their paths to chat.hookFilesLocations.
 *
 * This GUI suite does NOT assert chat.hookFilesLocations. Two reasons:
 *   1. Hooks are not overlay artifacts — they never appear in the Effective
 *      Files tree, so there is no host-independent UI signal for them.
 *   2. VS Code's config editing service in the ExTester host rejects the
 *      programmatic `chat.*` writes, so the settings file is never populated in
 *      this host (see 15-settings-injection.test.ts for the full evidence).
 *
 * The chat.hookFilesLocations key/value behavior is owned host-independently by
 * the engine unit tests in packages/engine/test/coverageGaps.test.ts:
 *   - emits chat.hookFilesLocations for absolute hook paths
 *   - keeps a workspace-relative hook path relative (no drive letter)
 *   - includes both preApply and postApply paths
 *   - omits chat.hookFilesLocations when no hooks are configured
 *
 * What this GUI suite verifies (host-independent, end-to-end): a config that
 * declares hooks does not break activation or the overlay — Apply still
 * resolves a healthy overlay and the extension's views stay navigable. This is
 * the only hooks behavior observable through the VS Code UI.
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

function configWithHooks(opts: {
    preApply?: string;
    postApply?: string;
}): string {
    const base: Record<string, unknown> = {
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
        injection: {
            instructions: 'settings',
            agents:        'settings',
            skills:        'settings',
            prompts:       'settings',
        },
    };
    const hooks: Record<string, string> = {};
    if (opts.preApply)  { hooks['preApply']  = opts.preApply; }
    if (opts.postApply) { hooks['postApply'] = opts.postApply; }
    if (Object.keys(hooks).length > 0) {
        base['hooks'] = hooks;
    }
    return JSON.stringify(base, null, 2);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Hooks Configuration End-to-End Health', function () {
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
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── hooks.preApply ───────────────────────────────────────────────────────

    test('Config with hooks.preApply applies cleanly and keeps the overlay healthy', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({ preApply: 'scripts/pre-apply.sh' }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // A hooks block must not break overlay resolution: sdlc artifacts still surface.
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Overlay should still surface sdlc instructions (testing) with a hooks.preApply configured',
        );
    });

    // ── hooks.preApply + hooks.postApply ─────────────────────────────────────

    test('Config with both preApply and postApply applies cleanly', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({
                preApply:  'scripts/pre-apply.sh',
                postApply: 'scripts/post-apply.sh',
            }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Overlay should still surface sdlc instructions (testing) with both hooks configured',
        );
    });

    // ── Adding then removing the hooks block ─────────────────────────────────

    test('Adding then removing the hooks block leaves the extension healthy', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 25_000);

        // Step 1: config with hooks
        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({ preApply: 'scripts/pre-apply.sh' }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitForEffectiveFiles(sideBar, 'testing');

        // Step 2: rewrite config without hooks
        fs.writeFileSync(CONFIG_PATH, configWithHooks({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        // The overlay must remain intact and the views navigable after the hooks block is removed.
        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Overlay should remain healthy after the hooks block is removed',
        );
        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section must remain accessible after removing the hooks block');
    });
});
