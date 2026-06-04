/**
 * GUI tests — Default (plugin/prompts) classification end-to-end (v0.2.0).
 *
 * The default injection classification is:
 *   - instructions/agents/skills → 'plugin'  → chat.pluginLocations (one entry
 *     per capability root, USER scope)
 *   - prompts                    → 'settings' → chat.promptFilesLocations
 *
 * WHICH chat.* key a given classification populates (and the exact path→true
 * pluginLocations shape) is NOT asserted here. Two reasons:
 *   1. VS Code's config editing service in the ExTester host rejects those
 *      programmatic `chat.*` writes, so the settings files are never populated
 *      in this host (see 15-settings-injection.test.ts for the full evidence).
 *   2. That mapping is pure engine logic and is owned host-independently by the
 *      engine unit tests:
 *        - packages/engine/test/engine.test.ts
 *            `classifySingle('.github/instructions/…', undefined) === 'plugin'`
 *            `classifySingle('.github/prompts/…',      undefined) === 'settings'`
 *            + per-key computeSettingsEntries mapping (instructions/prompts/
 *              agents/skills → their chat.* keys)
 *        - packages/engine/test/coverageGaps.test.ts
 *            computePluginRootPaths (capability-root resolution) and
 *            `computeSettingsEntries emits chat.pluginLocations` with value
 *            `{ <root>: true }`
 *
 * What this GUI suite verifies (host-independent, end-to-end): under the DEFAULT
 * classification, Apply produces a healthy overlay (artifacts surface in
 * Effective Files) and synchronizes NOTHING to .github/ — the observable
 * consequence of plugin/settings (not synchronize) classification.
 *
 * Test workspace artifacts used (Effective Files basenames):
 *   standards/sdlc (enabled): testing, test-agent, test-skill
 *   company/core (disabled):  coding, review.prompt
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
const GITHUB_DIR     = path.join(WORKSPACE_ROOT, '.github');

// ── File helpers ──────────────────────────────────────────────────────────────

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
    instructions?: 'plugin' | 'settings' | 'synchronize';
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
    if (!omitInjectionKey && opts.instructions) {
        base['injection'] = { instructions: opts.instructions };
    }
    return JSON.stringify(base, null, 2);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Default Classification (Plugin/Prompts) End-to-End', function () {
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
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);
        await workbench.executeCommand('MetaFlow: Apply Overlay');
        await sleep(3_000);
        await dismissAllNotifications(workbench);
    });

    // ── Default classification surfaces a healthy overlay ────────────────────

    test('Default config (no injection key) surfaces sdlc artifacts in the overlay', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Default classification should still surface sdlc instructions (testing) in the overlay',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Default classification should still surface sdlc agents (test-agent) in the overlay',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-skill'),
            'Default classification should still surface sdlc skills (test-skill) in the overlay',
        );
    });

    test('Default config surfaces the prompts artifact when core is enabled', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // company/core has prompts/review.prompt.md; prompts default to settings
        // delivery but are still part of the overlay.
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true, coreEnabled: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'review.prompt');
        assert.ok(
            await effectiveFilesContains(sideBar, 'review.prompt'),
            'Default classification should surface the core prompt artifact (review.prompt) when core is enabled',
        );
    });

    // ── Default classification synchronizes nothing to .github/ ──────────────

    test('Default classification does not write any files into .github/', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

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

    test('Explicit instructions: "plugin" keeps the artifact in the overlay and writes no .github/ files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Clean Synchronized Files');
        await sleep(2_000);
        await dismissAllNotifications(workbench);

        fs.writeFileSync(CONFIG_PATH, buildConfig({ instructions: 'plugin' }), 'utf-8');
        await workbench.executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Explicit plugin classification should keep the instruction artifact (testing) in the overlay',
        );
        assert.ok(
            !anyGithubFileMatchesFragment('sdlc'),
            'Explicit plugin classification should not write sdlc files to .github/',
        );
    });

    // ── Disabling a capability removes its artifacts from the overlay ─────────

    test('Disabling sdlc removes its artifacts from the overlay under default classification', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Baseline: sdlc enabled with default classification
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');
        await waitForEffectiveFiles(sideBar, 'testing');

        // Disable sdlc
        fs.writeFileSync(CONFIG_PATH, buildConfig({ omitInjectionKey: true, sdlcEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing', false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected sdlc artifacts removed from the overlay after disabling sdlc',
        );
    });
});
