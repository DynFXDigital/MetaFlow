/**
 * GUI tests — Plugin classification and prompts settings injection (v0.2.0).
 *
 * Closes coverage gaps for the default injection classification:
 *   - instructions/agents/skills default to 'plugin' → chat.pluginLocations
 *   - prompts default to 'settings' → chat.promptFilesLocations
 *
 * Prior settings-injection tests (15, 18) only exercised explicit
 * injection: { instructions: 'settings', ... } configs. The default mode is
 * the path most new users will actually take, so it deserves direct coverage.
 *
 * Plugin classification writes ONE entry per capability root (e.g.,
 * '.ai/ai-metadata/standards/sdlc') to chat.pluginLocations, regardless of how
 * many instructions/agents/skills files exist underneath it. VS Code then
 * scans the entire capability root.
 *
 * Test workspace artifacts used:
 *   - standards/sdlc/instructions/testing.md
 *   - standards/sdlc/agents/test-agent.agent.md
 *   - standards/sdlc/skills/test-skill/
 *   - company/core/instructions/coding.md
 *   - company/core/prompts/review.prompt.md
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
    const walk = (d: string): string[] => {
        const out: string[] = [];
        try {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const full = path.join(d, e.name);
                if (e.isDirectory()) { out.push(...walk(full)); }
                else                 { out.push(full); }
            }
        } catch { /* nothing */ }
        return out;
    };
    return walk(GITHUB_DIR).some(f => f.replace(/\\/g, '/').includes(fragment));
}

// ── Config builders ───────────────────────────────────────────────────────────

interface ConfigOpts {
    coreEnabled?: boolean;
    sdlcEnabled?: boolean;
    instructions?: 'plugin' | 'settings' | 'synchronized';
    agents?: 'plugin' | 'settings' | 'synchronized';
    skills?: 'plugin' | 'settings' | 'synchronized';
    prompts?: 'plugin' | 'settings' | 'synchronized';
    omitInjectionKey?: boolean;
}

function buildConfig(opts: ConfigOpts): string {
    const { coreEnabled = false, sdlcEnabled = true, omitInjectionKey = false } = opts;
    const base: Record<string, unknown> = {
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
    };
    if (!omitInjectionKey) {
        const injection: Record<string, string> = {};
        if (opts.instructions) { injection.instructions = opts.instructions; }
        if (opts.agents)       { injection.agents       = opts.agents; }
        if (opts.skills)       { injection.skills       = opts.skills; }
        if (opts.prompts)      { injection.prompts      = opts.prompts; }
        if (Object.keys(injection).length > 0) {
            base['injection'] = injection;
        }
    }
    return JSON.stringify(base, null, 2);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Plugin Classification and Prompts Settings Injection', function () {
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

    // ── Default classification (no injection key) ────────────────────────────

    test('Default config (no injection key) writes chat.pluginLocations with sdlc capability root', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Clean first to clear any stale settings from a prior test
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            'Expected chat.pluginLocations to contain the standards/sdlc capability root with default classification',
        );
    });

    test('Default config writes chat.promptFilesLocations when core is enabled (prompts default to settings)', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Enable core so review.prompt.md becomes an effective file
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true, coreEnabled: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.promptFilesLocations', 'company/core'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.promptFilesLocations', 'company/core'),
            'Expected chat.promptFilesLocations to contain a company/core path when core is enabled',
        );
    });

    test('Default config does NOT write chat.instructionsFilesLocations (plugin classification)', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // Plugin classification means no per-artifact-type settings key
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'chat.instructionsFilesLocations must not contain sdlc paths under default (plugin) classification',
        );
    });

    // ── Explicit plugin classification ───────────────────────────────────────

    test('Explicit instructions: "plugin" classification writes chat.pluginLocations only', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ instructions: 'plugin' }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            'Plugin classification should write chat.pluginLocations',
        );
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'Plugin classification should not also write chat.instructionsFilesLocations',
        );
    });

    // ── Toggling instructions from plugin to settings ────────────────────────

    test('Switching instructions plugin → settings moves the path between settings keys', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Phase 1: plugin mode → chat.pluginLocations
        fs.writeFileSync(CONFIG_PATH, buildConfig({ instructions: 'plugin' }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Phase 2: switch instructions to settings → chat.instructionsFilesLocations
        fs.writeFileSync(CONFIG_PATH, buildConfig({ instructions: 'settings' }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'After switching to settings mode, the instructions path should be in chat.instructionsFilesLocations',
        );
    });

    // ── Disabling a capability removes its plugin root ───────────────────────

    test('Disabling sdlc removes its capability root from chat.pluginLocations', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        // Baseline: sdlc enabled with default plugin classification
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await waitFor(
            async () => settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        // Disable sdlc
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true, sdlcEnabled: false }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => !settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            !settingsContainsPath('chat.pluginLocations', 'standards/sdlc'),
            'Expected sdlc capability root removed from chat.pluginLocations after disabling sdlc',
        );
    });

    // ── Plugin classification never writes .github/ files ────────────────────

    test('Plugin classification does not write any files into .github/', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true, coreEnabled: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(4_000);

        // Default classification: instructions/agents/skills are plugin, prompts is settings.
        // No artifact is synchronized → .github/ should not receive any sdlc or core content.
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Plugin/settings classification should not write sdlc files to .github/',
        );
        assert.ok(
            !anyGithubFileMatchesFragment('core'),
            'Plugin/settings classification should not write core files to .github/',
        );
    });

    // ── chat.pluginLocations shape ───────────────────────────────────────────

    test('chat.pluginLocations value is a path-to-true map (not an array)', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsHasKey('chat.pluginLocations'),
            WAIT_TIMEOUT,
        );

        const settings = readSettings();
        const value = settings['chat.pluginLocations'];

        assert.ok(
            value !== null && typeof value === 'object' && !Array.isArray(value),
            'chat.pluginLocations should be an object mapping paths to booleans, not an array or scalar',
        );

        const entries = Object.entries(value as Record<string, unknown>);
        assert.ok(entries.length > 0, 'chat.pluginLocations object should have at least one entry');
        for (const [key, val] of entries) {
            assert.strictEqual(typeof key, 'string', 'pluginLocations key must be a string path');
            assert.strictEqual(val, true, `pluginLocations value for ${key} must be the boolean true`);
        }
    });
});
