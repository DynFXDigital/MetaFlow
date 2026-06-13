// GUI tests — Partial profile glob filtering and multi-repo overlay (v0.2.0).
//
// Closes coverage gaps left by suite 19 (which only tests enable: ["all"] and
// enable: []) and by all prior suites (which only test single-repo configs).
//
// Partial profile globs let users narrow the overlay to a specific artifact
// type, e.g. enable: ["instructions/<glob>"] surfaces only instruction files.
// Each artifact TYPE has a distinct fixture basename in the Effective Files
// tree, so partial-glob filtering is directly observable there:
//   instructions → testing / coding   agents → test-agent
//   skills       → test-skill          prompts → review.prompt
//
// Multi-repo configs allow combining several metadata sources. The test
// workspace has two local metadata directories (.ai/ai-metadata and
// .ai/secondary-metadata), and the extension must handle multiple entries
// without crashing and merge their effective files correctly.
//
// Signal: the Effective Files and AI Metadata trees (host-independent). The
// derived `chat.*` settings keys are NOT asserted here — VS Code's config
// editing service in the ExTester host rejects those programmatic writes (see
// 15-settings-injection.test.ts); the exact settings key→path mapping (incl.
// which key a given glob populates) is covered by the engine unit tests for
// `computeSettingsEntries`.
//
// Test workspace artifacts used:
//   - standards/sdlc/instructions/testing.md      → tree: testing
//   - standards/sdlc/agents/test-agent.agent.md   → tree: test-agent
//   - standards/sdlc/skills/test-skill/           → tree: test-skill
//   - company/core/instructions/coding.md         → tree: coding
//   - company/core/prompts/review.prompt.md       → tree: review.prompt

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
    effectiveFilesContains,
    waitForEffectiveFiles,
    dismissAllNotifications,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

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
                    // Distinct localPath from primary: two enabled repos resolving to
                    // the SAME localPath is a deliberate fatal config error
                    // ("resolve to the same localPath. Disable or remove one source"),
                    // so a real multi-repo overlay needs separate metadata roots.
                    id: 'secondary',
                    localPath: '.ai/secondary-metadata',
                    enabled: secondaryEnabled,
                    capabilities: [
                        { path: 'company/core', enabled: true },
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
        restoreGoldenConfig(CONFIG_PATH);
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
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected testing.md (an instruction file) to appear under enable: [instructions/**]',
        );
    });

    test('Profile enable [instructions/**] surfaces only instruction artifacts, not agents or skills', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'testing');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc instruction artifact (testing) under enable: [instructions/**]',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'test-agent')),
            'Expected NO sdlc agent artifact (test-agent) under enable: [instructions/**]',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'test-skill')),
            'Expected NO sdlc skills artifact (test-skill) under enable: [instructions/**]',
        );
    });

    test('Profile enable [agents/**] only surfaces agent files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['agents/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'test-agent');
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Expected sdlc agent artifact (test-agent) under enable: [agents/**]',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected NO sdlc instruction artifact (testing) under enable: [agents/**]',
        );
    });

    test('Profile enable [instructions/**, agents/**] surfaces both but not skills', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithProfile(['instructions/**', 'agents/**']), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await waitForEffectiveFiles(sideBar, 'test-agent');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc instruction artifact (testing) under enable: [instructions/**, agents/**]',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'test-agent'),
            'Expected sdlc agent artifact (test-agent) under enable: [instructions/**, agents/**]',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'test-skill')),
            'Expected NO sdlc skills artifact (test-skill) under enable: [instructions/**, agents/**]',
        );
    });

    test('Profile enable [prompts/**] only surfaces prompts when a capability with prompts is enabled', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

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

        await waitForEffectiveFiles(sideBar, 'review.prompt');
        assert.ok(
            await effectiveFilesContains(sideBar, 'review.prompt'),
            'Expected core prompt artifact (review.prompt) under enable: [prompts/**]',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'testing')),
            'Expected NO sdlc instruction artifact (testing) under enable: [prompts/**]',
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

    test('Multi-repo config: AI Metadata tree shows both repo sources', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        // Repo sources are labelled by the localPath basename when the config sets
        // no explicit name and the repo has no manifest: primary → 'ai-metadata',
        // secondary → 'secondary-metadata' (chosen so neither label is a substring
        // of the other, keeping the assertions unambiguous).
        const aiMetaSection = await getSection(sideBar, 'AI Metadata');
        await waitFor(async () => {
            await expandSection(aiMetaSection);
            return (
                (await sectionContainsText(aiMetaSection, 'ai-metadata')) &&
                (await sectionContainsText(aiMetaSection, 'secondary-metadata'))
            );
        }, WAIT_TIMEOUT);

        assert.ok(
            await sectionContainsText(aiMetaSection, 'ai-metadata'),
            'AI Metadata should show the primary repo source (ai-metadata)',
        );
        assert.ok(
            await sectionContainsText(aiMetaSection, 'secondary-metadata'),
            'AI Metadata should show the secondary repo source (secondary-metadata)',
        );
    });

    test('Multi-repo config: disabling one repo removes its capabilities from Effective Files', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        // Merged overlay: testing.md → standards/sdlc (primary), coding.md →
        // company/core (secondary repo, .ai/secondary-metadata). Both fixture files
        // exist on disk, so the merged effective set surfaces `testing` and `coding`.

        // Phase 1: both repos enabled — sdlc (primary) AND core (secondary) surfaced
        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitForEffectiveFiles(sideBar, 'coding');
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'Expected sdlc instruction artifact (testing) from primary repo with both repos enabled',
        );
        assert.ok(
            await effectiveFilesContains(sideBar, 'coding'),
            'Expected core instruction artifact (coding) from secondary repo with both repos enabled',
        );

        // Phase 2: disable secondary — coding should disappear, testing should remain
        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({ secondaryEnabled: false }), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');

        await waitForEffectiveFiles(sideBar, 'coding', false);
        assert.ok(
            await effectiveFilesContains(sideBar, 'testing'),
            'sdlc artifact (testing) from primary repo should remain when only secondary is disabled',
        );
        assert.ok(
            !(await effectiveFilesContains(sideBar, 'coding')),
            'core artifact (coding) from secondary repo should be removed after disabling secondary repo',
        );
    });
});
