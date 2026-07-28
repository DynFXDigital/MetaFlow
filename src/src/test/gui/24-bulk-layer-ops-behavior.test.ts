/**
 * GUI tests — Behavioral coverage for bulk capability operations (v0.2.0).
 *
 * Suite 05 only verified that Select All / Deselect All execute without
 * throwing. This suite confirms the commands persist their effect to
 * config.jsonc and that the Effective Files tree converges to the expected
 * state afterwards.
 *
 * Both commands operate on the entire capability set when no item arg is
 * provided. Because the fixture has an active profile, the commands persist
 * repo-qualified capability references in that profile's
 * `enabledCapabilities`; metadataRepos[] remains a list of repository
 * descriptors.
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
    waitFor,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config helpers ────────────────────────────────────────────────────────────

const CORE_CAPABILITY = 'primary:company/core';
const SDLC_CAPABILITY = 'primary:standards/sdlc';
const ALL_CAPABILITIES = [CORE_CAPABILITY, SDLC_CAPABILITY] as const;

interface ProfileEntry {
    enabledCapabilities?: string[];
}

interface ConfigShape {
    activeProfile?: string;
    profiles?: Record<string, ProfileEntry>;
}

function readConfig(): ConfigShape {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as ConfigShape;
}

/** Canonical capability selections recorded on the currently active profile. */
function readActiveProfileEnabledCapabilities(): string[] | undefined {
    const cfg = readConfig();
    if (!cfg.activeProfile) {
        return undefined;
    }
    return cfg.profiles?.[cfg.activeProfile]?.enabledCapabilities;
}

function activeProfileHasExactly(expected: readonly string[]): boolean {
    const actual = readActiveProfileEnabledCapabilities();
    return (
        actual !== undefined &&
        actual.length === expected.length &&
        expected.every((reference) => actual.includes(reference))
    );
}

function configWith(opts: { coreEnabled?: boolean; sdlcEnabled?: boolean }): string {
    const { coreEnabled = false, sdlcEnabled = true } = opts;
    const enabledCapabilities = [
        ...(coreEnabled ? [CORE_CAPABILITY] : []),
        ...(sdlcEnabled ? [SDLC_CAPABILITY] : []),
    ];
    return JSON.stringify(
        {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                },
            ],
            profiles: {
                default: { enabledCapabilities },
                review: { enabledCapabilities: [...enabledCapabilities] },
            },
            activeProfile: 'default',
            compatibilityVersion: 3,
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
        restoreGoldenConfig(CONFIG_PATH);
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

    // ── Deselect All clears the active profile selection ─────────────────────

    test('Deselect All clears active profile enabledCapabilities in config.jsonc', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Baseline: sdlc enabled, core disabled
        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Confirm precondition
        const before = readActiveProfileEnabledCapabilities();
        assert.ok(
            before?.includes(SDLC_CAPABILITY),
            `Precondition: ${SDLC_CAPABILITY} should be selected before Deselect All`,
        );

        await new Workbench().executeCommand('MetaFlow: Deselect All');

        await waitFor(async () => activeProfileHasExactly([]), WAIT_TIMEOUT);

        assert.deepStrictEqual(
            readActiveProfileEnabledCapabilities(),
            [],
            'Deselect All should leave the active profile with no enabled capabilities',
        );
    });

    test('Deselect All empties the Effective Files tree', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 30_000);

        fs.writeFileSync(CONFIG_PATH, configWith({}), 'utf-8');
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Precondition: testing.md visible.
        await waitForEffectiveFiles(sideBar, 'testing');

        await new Workbench().executeCommand('MetaFlow: Deselect All');

        await waitForEffectiveFiles(sideBar, 'testing', false);

        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Effective Files should be empty after Deselect All',
        );
    });

    // ── Select All fills the active profile selection ────────────────────────

    test('Select All writes every capability to active profile enabledCapabilities', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start with everything disabled
        fs.writeFileSync(
            CONFIG_PATH,
            configWith({ coreEnabled: false, sdlcEnabled: false }),
            'utf-8',
        );
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        assert.ok(
            activeProfileHasExactly([]),
            'Precondition: active profile enabledCapabilities must be empty before Select All',
        );

        await new Workbench().executeCommand('MetaFlow: Select All');

        await waitFor(async () => activeProfileHasExactly(ALL_CAPABILITIES), WAIT_TIMEOUT);

        assert.deepStrictEqual(
            readActiveProfileEnabledCapabilities(),
            [...ALL_CAPABILITIES],
            'Select All should select both repo-qualified capabilities on the active profile',
        );
    });

    test('Select All from empty state restores files to Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // Start with everything disabled
        fs.writeFileSync(
            CONFIG_PATH,
            configWith({ coreEnabled: false, sdlcEnabled: false }),
            'utf-8',
        );
        await sleep(1_500);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        // Precondition: empty Effective Files
        await waitForEffectiveFiles(sideBar, 'testing', false);

        await new Workbench().executeCommand('MetaFlow: Select All');

        await waitForEffectiveFiles(sideBar, 'testing');

        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
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
        await waitFor(async () => activeProfileHasExactly([]), WAIT_TIMEOUT);

        await workbench.executeCommand('MetaFlow: Select All');
        await waitFor(async () => activeProfileHasExactly(ALL_CAPABILITIES), WAIT_TIMEOUT);

        assert.deepStrictEqual(
            readActiveProfileEnabledCapabilities(),
            [...ALL_CAPABILITIES],
            'Round trip should end with both repo-qualified capabilities selected',
        );
    });
});
