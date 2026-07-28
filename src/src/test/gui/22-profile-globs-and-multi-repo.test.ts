// GUI tests — Atomic capability selection and multi-repo overlay.
//
// Verifies the canonical compatibilityVersion 3 model: metadataRepos contains
// repository descriptors, while the active profile atomically selects complete
// capabilities through repo-qualified enabledCapabilities references.
//
// Each selected capability contributes all of its artifact types:
//   primary:standards/sdlc → testing, test-agent, test-skill
//   primary:company/core   → coding, review.prompt
//
// Multi-repo configs allow combining several metadata sources. The test
// workspace has two local metadata directories (.ai/ai-metadata and
// .ai/secondary-metadata), and the extension must handle multiple entries
// without crashing and merge their effective files correctly.
//
// Signal: the Effective Files and AI Metadata trees (host-independent). The
// derived `chat.*` settings keys are NOT asserted here — VS Code's config
// editing service in the ExTester host rejects those programmatic writes (see
// 15-settings-injection.test.ts); the exact settings key→path mapping is covered
// by the engine unit tests for `computeSettingsEntries`.
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
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Atomic capability fixtures ───────────────────────────────────────────────

const CORE_CAPABILITY = 'primary:company/core';
const SDLC_CAPABILITY = 'primary:standards/sdlc';
const CORE_ARTIFACTS = ['coding', 'review.prompt'] as const;
const SDLC_ARTIFACTS = ['testing', 'test-agent', 'test-skill'] as const;
const ALL_ARTIFACTS = [...SDLC_ARTIFACTS, ...CORE_ARTIFACTS] as const;

function configWithCapabilities(enabledCapabilities: readonly string[]): string {
    return JSON.stringify(
        {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                },
            ],
            profiles: {
                selected: { enabledCapabilities: [...enabledCapabilities] },
            },
            activeProfile: 'selected',
            compatibilityVersion: 3,
            injection: {
                instructions: 'settings',
                agents: 'settings',
                skills: 'settings',
                prompts: 'settings',
            },
        },
        null,
        2,
    );
}

async function expectEffectiveArtifacts(
    sideBar: SideBarView,
    present: readonly string[],
    absent: readonly string[],
): Promise<void> {
    for (const artifact of present) {
        await waitForEffectiveFiles(sideBar, artifact);
        assert.ok(
            await effectiveFilesContains(sideBar, artifact),
            `Expected "${artifact}" in Effective Files`,
        );
    }
    for (const artifact of absent) {
        await waitForEffectiveFiles(sideBar, artifact, false);
        assert.ok(
            !(await effectiveFilesContains(sideBar, artifact)),
            `Expected "${artifact}" to be absent from Effective Files`,
        );
    }
}

// ── Multi-repo config builder ─────────────────────────────────────────────────

function multiRepoConfig(opts: { primaryEnabled?: boolean; secondaryEnabled?: boolean }): string {
    const { primaryEnabled = true, secondaryEnabled = true } = opts;
    return JSON.stringify(
        {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    enabled: primaryEnabled,
                    capabilities: [
                        { path: 'company/core', enabled: false },
                        { path: 'standards/sdlc', enabled: true },
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
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            profiles: {
                default: { enable: ['**/*'] },
            },
            activeProfile: 'default',
            compatibilityVersion: 2,
            injection: {
                instructions: 'settings',
                agents: 'settings',
                skills: 'settings',
                prompts: 'settings',
            },
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Atomic Capability Selection and Multi-Repo Overlay', function () {
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

    // ── Atomic capability selection ─────────────────────────────────────────

    test('Selecting only standards/sdlc surfaces all SDLC artifacts and no core artifacts', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCapabilities([SDLC_CAPABILITY]), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await expectEffectiveArtifacts(sideBar, SDLC_ARTIFACTS, CORE_ARTIFACTS);
    });

    test('Selecting only company/core surfaces all core artifacts and no SDLC artifacts', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCapabilities([CORE_CAPABILITY]), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await expectEffectiveArtifacts(sideBar, CORE_ARTIFACTS, SDLC_ARTIFACTS);
    });

    test('Selecting both capabilities surfaces all five fixture artifacts', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(
            CONFIG_PATH,
            configWithCapabilities([CORE_CAPABILITY, SDLC_CAPABILITY]),
            'utf-8',
        );
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await expectEffectiveArtifacts(sideBar, ALL_ARTIFACTS, []);
    });

    test('Selecting no capabilities surfaces none of the fixture artifacts', async function () {
        this.timeout(WAIT_TIMEOUT * 2 + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCapabilities([]), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Apply Overlay');

        await expectEffectiveArtifacts(sideBar, [], ALL_ARTIFACTS);
    });

    // ── Multi-repo overlay ───────────────────────────────────────────────────

    test('Two metadataRepos entries do not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, multiRepoConfig({}), 'utf-8');
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must remain functional
        const capSection = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');
        const aiMetaSection = await getSection(sideBar, 'AI Metadata');
        assert.ok(capSection, 'Capabilities section missing after applying multi-repo config');
        assert.ok(filesSection, 'Effective Files section missing after applying multi-repo config');
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
