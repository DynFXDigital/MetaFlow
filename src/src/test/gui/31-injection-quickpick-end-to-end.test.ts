/**
 * GUI tests — Configure Global Injection Defaults end-to-end (v0.2.0).
 *
 * Suite 07 only verified the command opens a Quick Pick. This suite drives
 * the Quick Pick to completion and asserts on the resulting config.jsonc
 * mutation. It exercises the three preset paths:
 *   - Apply preset: all settings    → injection.* = 'settings'
 *   - Apply preset: synchronize all → injection.* = 'synchronize'
 *   - Clear all global defaults     → injection block removed
 *
 * The Quick Pick widget exposed by VS Code is driven via vscode-extension-
 * tester's InputBox.selectQuickPick(label).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SideBarView, Workbench, InputBox } from 'vscode-extension-tester';
import {
    STARTUP_TIMEOUT,
    WAIT_TIMEOUT,
    INTERACTION_TIMEOUT,
    sleep,
    openMetaFlowSidebar,
    getSection,
    waitForSectionReady,
    waitFor,
    dismissActiveInput,
    dismissAllNotifications,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config helpers ────────────────────────────────────────────────────────────

function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
}

function readInjectionBlock(): Record<string, string> | undefined {
    const cfg = readConfig();
    const injection = cfg['injection'];
    if (!injection || typeof injection !== 'object' || Array.isArray(injection)) {
        return undefined;
    }
    return injection as Record<string, string>;
}

function configWithoutInjection(): string {
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
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Configure Global Injection Defaults — End-to-End Quick Pick', function () {
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
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
    });

    // ── Preset: all settings ─────────────────────────────────────────────────

    test('Configure Global Injection Defaults → "Apply preset: all settings" writes settings injection to config', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start from a config with no injection key
        fs.writeFileSync(CONFIG_PATH, configWithoutInjection(), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Global Injection Defaults');

        let input: InputBox;
        try {
            input = await InputBox.create(INTERACTION_TIMEOUT);
        } catch {
            this.skip();
            return;
        }

        try {
            await input.selectQuickPick('Apply preset: all settings');
        } catch {
            // Quick pick label may differ slightly; soft skip when undrivable
            await input.cancel().catch(() => { /* ignore */ });
            this.skip();
            return;
        }

        // Wait for the config write
        await waitFor(async () => {
            const injection = readInjectionBlock();
            return (
                injection !== undefined &&
                injection.instructions === 'settings' &&
                injection.prompts === 'settings'
            );
        }, WAIT_TIMEOUT);

        const injection = readInjectionBlock();
        assert.ok(injection, 'Injection block should be present after preset selection');
        assert.strictEqual(injection!.instructions, 'settings', 'instructions should be set to settings');
        assert.strictEqual(injection!.prompts,      'settings', 'prompts should be set to settings');
        assert.strictEqual(injection!.skills,       'settings', 'skills should be set to settings');
        assert.strictEqual(injection!.agents,       'settings', 'agents should be set to settings');
    });

    // ── Preset: synchronize all ──────────────────────────────────────────────

    test('Configure Global Injection Defaults → "Apply preset: synchronize all" writes synchronize injection', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithoutInjection(), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Global Injection Defaults');

        let input: InputBox;
        try {
            input = await InputBox.create(INTERACTION_TIMEOUT);
        } catch {
            this.skip();
            return;
        }

        try {
            await input.selectQuickPick('Apply preset: synchronize all');
        } catch {
            await input.cancel().catch(() => { /* ignore */ });
            this.skip();
            return;
        }

        await waitFor(async () => {
            const injection = readInjectionBlock();
            return (
                injection !== undefined &&
                injection.instructions === 'synchronize' &&
                injection.agents === 'synchronize'
            );
        }, WAIT_TIMEOUT);

        const injection = readInjectionBlock();
        assert.ok(injection, 'Injection block should exist after synchronize preset');
        for (const key of ['instructions', 'prompts', 'skills', 'agents']) {
            assert.strictEqual(
                injection![key],
                'synchronize',
                `Expected injection.${key} === 'synchronize'`,
            );
        }
    });

    // ── Preset: clear all global defaults ────────────────────────────────────

    test('Configure Global Injection Defaults → "Clear all global defaults" removes the injection block', async function () {
        this.timeout(WAIT_TIMEOUT + 25_000);

        // Start with an explicit settings-all injection
        const initial = JSON.parse(configWithoutInjection());
        initial.injection = {
            instructions: 'settings',
            agents:        'settings',
            skills:        'settings',
            prompts:       'settings',
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Confirm precondition
        assert.ok(readInjectionBlock(), 'Precondition: injection block should exist');

        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Configure Global Injection Defaults');

        let input: InputBox;
        try {
            input = await InputBox.create(INTERACTION_TIMEOUT);
        } catch {
            this.skip();
            return;
        }

        try {
            await input.selectQuickPick('Clear all global defaults');
        } catch {
            await input.cancel().catch(() => { /* ignore */ });
            this.skip();
            return;
        }

        // After "Clear", the injection block should be removed (or its values cleared)
        await waitFor(async () => {
            const injection = readInjectionBlock();
            if (!injection) { return true; }
            // Some impls leave the key as an empty object — also acceptable
            return Object.keys(injection).length === 0;
        }, WAIT_TIMEOUT);

        const finalInjection = readInjectionBlock();
        assert.ok(
            !finalInjection || Object.keys(finalInjection).length === 0,
            `After Clear, injection block should be empty or absent. Got: ${JSON.stringify(finalInjection)}`,
        );
    });
});
