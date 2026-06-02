/**
 * GUI tests — Hooks file location injection (v0.2.0).
 *
 * Hooks are file-path scripts referenced from the config.hooks block, not
 * an artifact directory like instructions/agents/skills. The settings
 * injector writes the hooks paths to chat.hookFilesLocations.
 *
 * Closes the hooks coverage gap left by prior suites — no GUI test
 * previously verified chat.hookFilesLocations is written or removed.
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
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const SETTINGS_PATH  = path.join(WORKSPACE_ROOT, '.vscode', 'settings.json');

// ── Settings helpers ──────────────────────────────────────────────────────────

function readSettings(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function settingsHasKey(key: string): boolean {
    const settings = readSettings();
    return settings[key] !== undefined && settings[key] !== null;
}

function settingsContainsPath(key: string, fragment: string): boolean {
    const settings = readSettings();
    const value = settings[key] as Record<string, boolean> | undefined;
    if (!value || typeof value !== 'object') { return false; }
    return Object.keys(value).some(p => p.replace(/\\/g, '/').includes(fragment));
}

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

suite('Hooks File Location Injection', function () {
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
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_000);
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── hooks.preApply ───────────────────────────────────────────────────────

    test('Config with hooks.preApply writes chat.hookFilesLocations after Apply', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({ preApply: 'scripts/pre-apply.sh' }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.hookFilesLocations', 'scripts/pre-apply.sh'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.hookFilesLocations', 'scripts/pre-apply.sh'),
            'Expected chat.hookFilesLocations to contain scripts/pre-apply.sh after Apply',
        );
    });

    // ── hooks.preApply + hooks.postApply ─────────────────────────────────────

    test('Config with both preApply and postApply writes both paths into chat.hookFilesLocations', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({
                preApply:  'scripts/pre-apply.sh',
                postApply: 'scripts/post-apply.sh',
            }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => {
                return (
                    settingsContainsPath('chat.hookFilesLocations', 'scripts/pre-apply.sh') &&
                    settingsContainsPath('chat.hookFilesLocations', 'scripts/post-apply.sh')
                );
            },
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.hookFilesLocations', 'scripts/pre-apply.sh'),
            'chat.hookFilesLocations should contain preApply path',
        );
        assert.ok(
            settingsContainsPath('chat.hookFilesLocations', 'scripts/post-apply.sh'),
            'chat.hookFilesLocations should contain postApply path',
        );
    });

    // ── Removing hooks clears the key ────────────────────────────────────────

    test('Removing hooks block from config clears chat.hookFilesLocations after Apply', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 25_000);

        // Step 1: write config with hooks, apply
        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({ preApply: 'scripts/pre-apply.sh' }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.hookFilesLocations', 'scripts/pre-apply.sh'),
            WAIT_TIMEOUT,
        );

        // Step 2: rewrite config without hooks, apply
        fs.writeFileSync(CONFIG_PATH, configWithHooks({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !settingsHasKey('chat.hookFilesLocations'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !settingsHasKey('chat.hookFilesLocations'),
            'chat.hookFilesLocations should be removed once the hooks block is gone',
        );
    });

    // ── Workspace-relative normalization ─────────────────────────────────────

    test('hooks.preApply with a workspace-relative path stays workspace-relative in settings', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const relativePath = '.metaflow/hooks/pre.sh';
        fs.writeFileSync(
            CONFIG_PATH,
            configWithHooks({ preApply: relativePath }),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.hookFilesLocations', '.metaflow/hooks/pre.sh'),
            WAIT_TIMEOUT,
        );

        const settings = readSettings();
        const value = settings['chat.hookFilesLocations'] as Record<string, boolean>;
        const paths = Object.keys(value ?? {}).map(p => p.replace(/\\/g, '/'));
        for (const p of paths) {
            assert.ok(
                !p.includes(':'),
                `Hook location should be workspace-relative (no drive letter). Got: ${p}`,
            );
        }
    });
});
