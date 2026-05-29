// GUI tests — Partial profile glob filtering and multi-repo overlay (v0.2.0).
//
// Closes coverage gaps left by suite 19 (which only tests enable: ["all"] and
// enable: []) and by all prior suites (which only test single-repo configs).
//
// Partial profile globs let users narrow the overlay to a specific artifact
// type, e.g. enable: ["instructions/<glob>"] surfaces only instruction files.
// The settings injector then only writes the keys for that artifact type.
//
// Multi-repo configs allow combining several metadata sources. The test
// workspace has one local metadata directory, but the schema supports an
// arbitrary number of entries — the extension must handle multiple entries
// without crashing and merge their effective files correctly.
//
// Test workspace artifacts used:
//   - standards/sdlc/instructions/testing.md
//   - standards/sdlc/agents/test-agent.agent.md
//   - standards/sdlc/skills/test-skill/
//   - company/core/instructions/coding.md
//   - company/core/prompts/review.prompt.md

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
const SETTINGS_PATH  = path.join(WORKSPACE_ROOT, '.vscode', 'settings.json');

// ── Settings helpers ──────────────────────────────────────────────────────────

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

// ── Config builders ───────────────────────────────────────────────────────────

function configWithProfile(enable: string[]): string {
    return JSON.stringify(
        {
            metadataRepos: [{
                id: 'primary',
                localPath: '.ai/ai-metadata',
                capabilities: [
                    { path: 'company/core',   enabled: true },
                    { path: 'standards/sdlc', enabled: true },
                ],
            }],
            profiles: {
                narrow: { enable },
            },
            activeProfile: 'narrow',
            compatibilityVersion: 2,
            injection: {
                instructions: 'settings',
                agents:        'settings',
                skills:        'settings',
                prompts:       'settings',
            },
        },
        null,
        2,
    );
}

function multiRepoConfig(opts: {
    primaryEnabled?: boolean;
    secondaryEnabled?: boolean;
}): string {
    const { primaryEnabled = true, secondaryEnabled = true } = opts;
    return JSON.stringify(
        {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: primaryEnabled,
                    capabilities: [
                        { path: 'company/core',   enabled: false },
                        { path: 'standards/sdlc', enabled: true  },
                    ],
                },
                {
                    id: 'secondary',
                    localPath: '.ai/ai-metadata',
                    enabled: secondaryEnabled,
                    capabilities: [
                        { path: 'company/core',   enabled: true  },
                        { path: 'standards/sdlc', enabled: false },
                    ],
                },
            ],
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
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Profile Glob Filtering and Multi-Repo Overlay', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Effective Files');
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

    // ── Partial profile globs ────────────────────────────────────────────────

    test('Profile enable [instructions/**] surfaces instruction files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return sectionContainsText(filesSection, 'testing');
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'Expected testing.md (an instruction file) to appear under enable: [instructions/**]',
        );
    });

    test('Profile enable [instructions/**] only writes chat.instructionsFilesLocations, not agents or skills', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'chat.instructionsFilesLocations should contain sdlc instructions',
        );
        assert.ok(
            !settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc'),
            'chat.agentFilesLocations should not contain sdlc paths under enable: [instructions/**]',
        );
        assert.ok(
            !settingsContainsPath('chat.agentSkillsLocations', 'standards/sdlc'),
            'chat.agentSkillsLocations should not contain sdlc paths under enable: [instructions/**]',
        );
    });

    test('Profile enable [agents/**] only surfaces agent files', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['agents/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            'chat.agentFilesLocations should contain sdlc agents under enable: [agents/**]',
        );
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'chat.instructionsFilesLocations should NOT contain sdlc paths under enable: [agents/**]',
        );
    });

    test('Profile enable [instructions/**, agents/**] surfaces both but not skills', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**', 'agents/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(async () => {
            return (
                settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc') &&
                settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc')
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc/instructions'),
            'Expected sdlc instructions in settings',
        );
        assert.ok(
            settingsContainsPath('chat.agentFilesLocations', 'standards/sdlc/agents'),
            'Expected sdlc agents in settings',
        );
        assert.ok(
            !settingsContainsPath('chat.agentSkillsLocations', 'standards/sdlc'),
            'Expected NO sdlc skills paths under enable: [instructions/**, agents/**]',
        );
    });

    test('Profile enable [prompts/**] only surfaces prompts when a capability with prompts is enabled', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        // company/core has prompts/review.prompt.md; we must enable core for this to surface
        const config = JSON.stringify(
            {
                metadataRepos: [{
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    capabilities: [
                        { path: 'company/core',   enabled: true },
                        { path: 'standards/sdlc', enabled: true },
                    ],
                }],
                profiles: {
                    narrow: { enable: ['prompts/**'] },
                },
                activeProfile: 'narrow',
                compatibilityVersion: 2,
                injection: {
                    instructions: 'settings',
                    agents:        'settings',
                    skills:        'settings',
                    prompts:       'settings',
                },
            },
            null,
            2,
        );
        fs.writeFileSync(CONFIG_PATH, config, 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitFor(
            async () => settingsContainsPath('chat.promptFilesLocations', 'company/core'),
            WAIT_TIMEOUT,
        );

        assert.ok(
            settingsContainsPath('chat.promptFilesLocations', 'company/core/prompts'),
            'chat.promptFilesLocations should contain core prompts under enable: [prompts/**]',
        );
        assert.ok(
            !settingsContainsPath('chat.instructionsFilesLocations', 'standards/sdlc'),
            'chat.instructionsFilesLocations should not be populated under enable: [prompts/**]',
        );
    });

    // ── Multi-repo overlay ───────────────────────────────────────────────────

    test('Two metadataRepos entries do not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must remain functional
        const capSection   = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');
        const aiMetaSection = await getSection(sideBar, 'AI Metadata');
        assert.ok(capSection,    'Capabilities section missing after applying multi-repo config');
        assert.ok(filesSection,  'Effective Files section missing after applying multi-repo config');
        assert.ok(aiMetaSection, 'AI Metadata section missing after applying multi-repo config');
    });

    test('Multi-repo config: AI Metadata tree shows both repo source ids', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        const aiMetaSection = await getSection(sideBar, 'AI Metadata');
        await waitFor(async () => {
            await expandSection(aiMetaSection);
            return (
                (await sectionContainsText(aiMetaSection, 'primary')) &&
                (await sectionContainsText(aiMetaSection, 'secondary'))
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(aiMetaSection, 'primary'),
            'AI Metadata should show the primary repo source',
        );
        assert.ok(
            await sectionContainsText(aiMetaSection, 'secondary'),
            'AI Metadata should show the secondary repo source',
        );
    });

    test('Multi-repo config: disabling one repo removes its capabilities from Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Phase 1: both repos enabled — testing.md (from primary/sdlc) AND coding.md (from secondary/core) visible
        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        const filesSection = await getSection(sideBar, 'Effective Files');
        await waitFor(async () => {
            await expandSection(filesSection);
            return (
                (await sectionContainsText(filesSection, 'testing')) &&
                (await sectionContainsText(filesSection, 'coding'))
            );
        }, WAIT_TIMEOUT);

        // Phase 2: disable secondary — coding.md should disappear, testing.md should remain
        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({ secondaryEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitFor(async () => {
            await expandSection(filesSection);
            return (
                (await sectionContainsText(filesSection, 'testing')) &&
                !(await sectionContainsText(filesSection, 'coding'))
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(filesSection, 'testing'),
            'testing.md (from primary repo) should still be visible when only secondary is disabled',
        );
        assert.ok(
            !(await sectionContainsText(filesSection, 'coding')),
            'coding.md (from secondary repo) should be removed after disabling secondary repo',
        );
    });
});
