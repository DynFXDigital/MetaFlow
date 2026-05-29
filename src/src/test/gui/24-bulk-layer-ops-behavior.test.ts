/**
 * GUI tests — Behavioral coverage for bulk capability operations (v0.2.0).
 *
 * Suite 05 only verified that Select All / Deselect All execute without
 * throwing. This suite confirms the commands persist their effect to
 * config.jsonc and that the Effective Files tree converges to the expected
 * state afterwards.
 *
 * Both commands operate on the entire capability set when no item arg is
 * provided. They modify capability `enabled` fields under metadataRepos[].
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
    expandSection,
    waitForSectionReady,
    sectionContainsText,
    waitFor,
    dismissAllNotifications,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config helpers ────────────────────────────────────────────────────────────

interface CapabilityEntry {
    path: string;
    enabled?: boolean;
}

function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
}

function readCapabilities(): CapabilityEntry[] {
    const cfg = readConfig();
    const repos = cfg['metadataRepos'] as Array<{ capabilities?: CapabilityEntry[] }> | undefined;
    if (!repos || repos.length === 0) { return []; }
    return repos[0].capabilities ?? [];
}

function configWith(opts: { coreEnabled?: boolean; sdlcEnabled?: boolean }): string {
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
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Bulk Layer Operations — Behavior', function () {
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
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
        await dismissAllNotifications(new Workbench());
    });

    // ── Deselect All clears capability enabled flags ─────────────────────────

    test('Deselect All writes enabled: false for every capability in config.jsonc', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Baseline: sdlc enabled, core disabled
        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Confirm precondition
        const before = readCapabilities();
        const hasEnabledCap = before.some(c => c.enabled === true);
        assert.ok(hasEnabledCap, 'Precondition: at least one capability should be enabled before Deselect All');

        await new Workbench().executeCommand('MetaFlow: Deselect All');

        await waitFor(async () => {
            const caps = readCapabilities();
            return caps.length > 0 && caps.every(c => c.enabled === false);
        }, WAIT_TIMEOUT);

        const after = readCapabilities();
        assert.ok(after.length >= 2, 'Capabilities array should still have all entries after Deselect All');
        for (const cap of after) {
            assert.strictEqual(
                cap.enabled,
                false,
                `Capability "${cap.path}" should be disabled after Deselect All, got enabled=${cap.enabled}`,
            );
        }
    });

    test('Deselect All empties the Effective Files tree', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Precondition: testing.md visible
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        await new Workbench().executeCommand('MetaFlow: Deselect All');

        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        assert.ok(
            !(await sectionContainsText(filesSection, 'testing')),
            'Effective Files should be empty after Deselect All',
        );
    });

    // ── Select All flips capability enabled flags to true ────────────────────

    test('Select All writes enabled: true for every capability in config.jsonc', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start with everything disabled
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false, sdlcEnabled: false }), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const before = readCapabilities();
        assert.ok(
            before.every(c => c.enabled === false),
            'Precondition: every capability must be disabled before Select All',
        );

        await new Workbench().executeCommand('MetaFlow: Select All');

        await waitFor(async () => {
            const caps = readCapabilities();
            return caps.length > 0 && caps.every(c => c.enabled === true);
        }, WAIT_TIMEOUT);

        const after = readCapabilities();
        assert.ok(after.length >= 2, 'Capabilities array should be preserved');
        for (const cap of after) {
            assert.strictEqual(
                cap.enabled,
                true,
                `Capability "${cap.path}" should be enabled after Select All`,
            );
        }
    });

    test('Select All from empty state restores files to Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start with everything disabled
        fs.writeFileSync(CONFIG_PATH, configWith({ coreEnabled: false, sdlcEnabled: false }), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Precondition: empty Effective Files
        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return !(await sectionContainsText(filesSection, 'testing'));
        }, WAIT_TIMEOUT);

        await new Workbench().executeCommand('MetaFlow: Select All');

        await waitFor(async () => {
            await expandSection(filesSection);
            return (
                (await sectionContainsText(filesSection, 'testing')) ||
                (await sectionContainsText(filesSection, 'coding'))
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            (await sectionContainsText(filesSection, 'testing')) ||
            (await sectionContainsText(filesSection, 'coding')),
            'Effective Files should show files from at least one capability after Select All',
        );
    });

    // ── Round trip ───────────────────────────────────────────────────────────

    test('Deselect All then Select All ends with every capability enabled', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const workbench = new Workbench();

        await workbench.executeCommand('MetaFlow: Deselect All');
        await waitFor(async () => {
            const caps = readCapabilities();
            return caps.length > 0 && caps.every(c => c.enabled === false);
        }, WAIT_TIMEOUT);

        await workbench.executeCommand('MetaFlow: Select All');
        await waitFor(async () => {
            const caps = readCapabilities();
            return caps.length > 0 && caps.every(c => c.enabled === true);
        }, WAIT_TIMEOUT);

        const final = readCapabilities();
        for (const cap of final) {
            assert.strictEqual(
                cap.enabled,
                true,
                `Round trip should end with "${cap.path}" enabled`,
            );
        }
    });
});
