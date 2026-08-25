/**
 * GUI tests — Config schema validation and migration edge cases (v0.2.0).
 *
 * Closes coverage gaps for config schema handling:
 *   - Implicit / missing compatibilityVersion (migration to current)
 *   - Legacy compatibilityVersion: 1 (migration to current)
 *   - Invalid compatibilityVersion (0, negative, future)
 *   - Multi-repo with duplicate ids
 *   - Config missing both metadataRepo and metadataRepos
 *
 * The extension surfaces these via warning notifications and capability
 * warnings; the tests verify the extension does not crash and that the
 * sidebar remains accessible after each invalid state.
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
    waitForNotification,
    dismissAllNotifications,
    dismissActiveInput,
    restoreGoldenConfig,
} from './helpers/metaflowGuiHelpers';

// ── Paths ─────────────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH    = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');

// ── Config builders ───────────────────────────────────────────────────────────

function configWithoutCompatibility(): string {
    // No compatibilityVersion at all — should be migrated to current
    return JSON.stringify(
        {
            metadataRepos: [{
                id: 'primary',
                localPath: '.ai/ai-metadata',
                capabilities: [
                    { path: 'standards/sdlc', enabled: true },
                ],
            }],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
        },
        null,
        2,
    );
}

function configWithCompatibility(version: number): string {
    return JSON.stringify(
        {
            metadataRepos: [{
                id: 'primary',
                localPath: '.ai/ai-metadata',
                capabilities: [
                    { path: 'standards/sdlc', enabled: true },
                ],
            }],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
            compatibilityVersion: version,
        },
        null,
        2,
    );
}

function configWithDuplicateIds(): string {
    return JSON.stringify(
        {
            metadataRepos: [
                {
                    id: 'duplicated-id',
                    localPath: '.ai/ai-metadata',
                    capabilities: [{ path: 'standards/sdlc', enabled: true }],
                },
                {
                    id: 'duplicated-id',
                    localPath: '.ai/ai-metadata',
                    capabilities: [{ path: 'company/core', enabled: true }],
                },
            ],
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
            compatibilityVersion: 2,
        },
        null,
        2,
    );
}

function configMissingRepos(): string {
    return JSON.stringify(
        {
            // No metadataRepos AND no metadataRepo
            profiles: { default: { enable: ['**/*'] } },
            activeProfile: 'default',
            compatibilityVersion: 2,
        },
        null,
        2,
    );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite('Config Schema and Migration', function () {
    this.timeout(STARTUP_TIMEOUT);

    let sideBar: SideBarView;
    let originalConfig: string;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);
        restoreGoldenConfig(CONFIG_PATH);
        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        sideBar = await openMetaFlowSidebar();
        const section = await getSection(sideBar, 'Capabilities');
        // A fresh host late in a full batched run can need more than the normal
        // interaction timeout to finish extension activation and migration.
        await waitForSectionReady(section, STARTUP_TIMEOUT);
    });

    afterEach(async function () {
        await dismissActiveInput();
        await dismissAllNotifications(new Workbench());
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
        await sleep(1_500);
    });

    // ── Implicit / missing compatibilityVersion ──────────────────────────────

    test('Config without compatibilityVersion is accepted (migration to current)', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithoutCompatibility(), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        // Extension must remain functional
        const capSection   = await getSection(sideBar, 'Capabilities');
        const filesSection = await getSection(sideBar, 'Effective Files');
        assert.ok(capSection,   'Capabilities section missing after config without compatibilityVersion');
        assert.ok(filesSection, 'Effective Files section missing after config without compatibilityVersion');
    });

    test('Config with compatibilityVersion: 1 (legacy) does not crash extension', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCompatibility(1), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after compatibilityVersion: 1');
    });

    // ── Invalid compatibilityVersion ─────────────────────────────────────────

    test('Config with compatibilityVersion: 0 surfaces an invalid-config warning', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCompatibility(0), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const warning = await waitForNotification(workbench, 'invalid', WAIT_TIMEOUT);
        assert.ok(
            warning,
            'Expected an "invalid" warning notification for compatibilityVersion: 0',
        );

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after invalid compatibilityVersion');
    });

    test('Config with compatibilityVersion: 999 (future) surfaces an invalid-config warning', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithCompatibility(999), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const warning = await waitForNotification(workbench, 'invalid', WAIT_TIMEOUT);
        assert.ok(
            warning,
            'Expected an "invalid" warning notification for compatibilityVersion: 999',
        );

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after future compatibilityVersion');
    });

    // ── Duplicate repo ids ───────────────────────────────────────────────────

    test('Multi-repo config with duplicate ids does not crash the extension', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configWithDuplicateIds(), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(3_000);

        const capSection    = await getSection(sideBar, 'Capabilities');
        const filesSection  = await getSection(sideBar, 'Effective Files');
        const aiMetaSection = await getSection(sideBar, 'AI Metadata');
        assert.ok(capSection,    'Capabilities missing after duplicate-id config');
        assert.ok(filesSection,  'Effective Files missing after duplicate-id config');
        assert.ok(aiMetaSection, 'AI Metadata missing after duplicate-id config');
    });

    // ── Missing both metadataRepo and metadataRepos ─────────────────────────

    test('Config missing both metadataRepo and metadataRepos surfaces invalid warning', async function () {
        this.timeout(WAIT_TIMEOUT + 20_000);

        fs.writeFileSync(CONFIG_PATH, configMissingRepos(), 'utf-8');
        const workbench = new Workbench();
        await workbench.executeCommand('MetaFlow: Refresh');
        await sleep(2_000);

        const warning = await waitForNotification(workbench, 'invalid', WAIT_TIMEOUT);
        assert.ok(
            warning,
            'Expected an "invalid" warning notification when both metadataRepo and metadataRepos are missing',
        );

        const capSection = await getSection(sideBar, 'Capabilities');
        assert.ok(capSection, 'Capabilities section missing after repos-less config');
    });
});
