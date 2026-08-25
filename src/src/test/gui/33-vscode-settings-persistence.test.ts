/**
 * GUI tests — VS Code Settings editor to canonical MetaFlow config persistence.
 *
 * This suite deliberately drives the packaged extension through VS Code's real
 * Settings editor. Extension Host tests exercise the same configuration API,
 * but they cannot prove that the shipped VSIX and resource-scoped Settings UI
 * are wired to the runtime bundle users actually execute.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    EditorView,
    VSBrowser,
    Workbench,
} from 'vscode-extension-tester';
import { By, until, WebElement } from 'selenium-webdriver';
import { STARTUP_TIMEOUT, WAIT_TIMEOUT, sleep } from './helpers/metaflowGuiHelpers';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../test-workspace');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.metaflow', 'config.jsonc');
const WORKSPACE_SETTINGS_PATH = path.join(WORKSPACE_ROOT, '.vscode', 'settings.json');

const DEFAULT_INJECTION_MODES = {
    instructions: 'plugin',
    prompts: 'settings',
    commands: 'plugin',
    skills: 'plugin',
    agents: 'plugin',
    hooks: 'plugin',
};

type AuthoredConfig = {
    compatibilityVersion?: number;
    injection?: Record<string, string>;
    synchronization?: { repoWideCopilotInstructions?: boolean };
    [key: string]: unknown;
};

function readConfig(): AuthoredConfig {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as AuthoredConfig;
}

async function waitForConfig(
    label: string,
    predicate: (config: AuthoredConfig) => boolean,
): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT;
    let current: AuthoredConfig | undefined;

    while (Date.now() < deadline) {
        try {
            current = readConfig();
            if (predicate(current)) {
                return;
            }
        } catch {
            // A writer can briefly leave the file unavailable between retries.
        }
        await sleep(100);
    }

    assert.fail(`${label}; current config: ${JSON.stringify(current)}`);
}

async function openWorkspaceSettings(): Promise<WebElement> {
    await new EditorView().closeAllEditors().catch(() => undefined);
    const workbench = new Workbench();
    await workbench.executeCommand('Preferences: Open Workspace Settings');
    const driver = VSBrowser.instance.driver;
    const settingsEditor = await driver.wait(
        until.elementLocated(By.css('.settings-editor')),
        WAIT_TIMEOUT,
    );
    await driver.wait(until.elementIsVisible(settingsEditor), WAIT_TIMEOUT);

    const workspaceTab = await settingsEditor.findElement(
        By.css('[role="tab"][aria-label="Workspace"]'),
    );
    assert.strictEqual(
        await workspaceTab.getAttribute('aria-selected'),
        'true',
        'Expected workspace-scoped Settings editor',
    );
    return settingsEditor;
}

async function findSettingById(settingsEditor: WebElement, id: string): Promise<WebElement> {
    const driver = VSBrowser.instance.driver;
    await driver.wait(
        until.elementLocated(By.css('.settings-editor .search-container [role="textbox"]')),
        WAIT_TIMEOUT,
    );
    await driver.actions().sendKeys(id).perform();

    const setting = await driver.wait(async () => {
        const matches = await settingsEditor.findElements(
            By.css(`.setting-item-contents[data-key="${id}"]`),
        );
        if (matches.length === 0 || !(await matches[0].isDisplayed())) {
            return false;
        }
        return matches[0];
    }, WAIT_TIMEOUT);
    assert.ok(setting, `Expected Settings editor entry '${id}'`);
    return setting;
}

async function clickFresh(
    locator: By,
    label: string,
    staleAfterClickMeansSuccess = false,
): Promise<void> {
    const driver = VSBrowser.instance.driver;
    try {
        await driver.wait(async () => {
            let element: WebElement;
            try {
                element = await driver.findElement(locator);
                if (!(await element.isDisplayed())) {
                    return false;
                }
            } catch {
                return false;
            }

            try {
                await element.click();
                return true;
            } catch (error) {
                if (
                    staleAfterClickMeansSuccess &&
                    (error as Error).name === 'StaleElementReferenceError'
                ) {
                    return true;
                }
                // Older VS Code versions re-render a setting row between each UI action.
                return false;
            }
        }, WAIT_TIMEOUT);
    } catch (error) {
        throw new Error(`Timed out clicking ${label}`, { cause: error });
    }
}

async function confirmObjectEdit(
    settingSelector: string,
    key: string,
    value: string,
): Promise<void> {
    const driver = VSBrowser.instance.driver;
    try {
        await driver.wait(async () => {
            try {
                const editRows = await driver.findElements(
                    By.css(`${settingSelector} .setting-list-edit-row`),
                );
                if (editRows.length === 0) {
                    const rows = await driver.findElements(
                        By.css(`${settingSelector} .setting-list-object-row`),
                    );
                    for (const row of rows) {
                        const rowKey = await row
                            .findElement(By.className('setting-list-object-key'))
                            .getText();
                        const rowValue = await row
                            .findElement(By.className('setting-list-object-value'))
                            .getText();
                        if (rowKey === key) {
                            // Current VS Code auto-confirms when a property returns
                            // to its default and then re-renders the object row.
                            return rowValue === value;
                        }
                    }
                    return false;
                }

                const buttons = await driver.findElements(
                    By.css(
                        `${settingSelector} .setting-list-edit-row .setting-list-ok-button`,
                    ),
                );
                if (buttons.length === 0 || !(await buttons[0].isDisplayed())) {
                    return false;
                }
                await buttons[0].click();
                return true;
            } catch {
                return false;
            }
        }, WAIT_TIMEOUT);
    } catch (error) {
        throw new Error(`Timed out confirming ${key}=${value}`, { cause: error });
    }
}

async function setObjectSettingValue(
    settingId: string,
    key: string,
    value: string,
): Promise<void> {
    const driver = VSBrowser.instance.driver;
    const settingSelector = `.setting-item-contents[data-key="${settingId}"]`;
    const index = await driver.wait(async () => {
        const rows = await driver.findElements(
            By.css(`${settingSelector} .setting-list-object-row`),
        );
        for (const row of rows) {
            try {
                const keyElement = await row.findElement(By.className('setting-list-object-key'));
                if ((await keyElement.getText()) === key) {
                    return await row.getAttribute('data-index');
                }
            } catch {
                // Retry from a fresh DOM snapshot after a settings-row render.
            }
        }
        return false;
    }, WAIT_TIMEOUT);
    assert.ok(index, `Could not find object setting row '${key}'`);

    const rowSelector = `${settingSelector} .setting-list-object-row[data-index="${index}"]`;
    await clickFresh(By.css(rowSelector), `${key} row`);
    await clickFresh(By.css(`${rowSelector} [aria-label="Edit Item"]`), `${key} edit`);
    await clickFresh(
        By.css(
            `${settingSelector} .setting-list-edit-row.setting-list-object-row ` +
                `option[value="${value}"]`,
        ),
        `${key}=${value} option`,
        true,
    );
    await confirmObjectEdit(settingSelector, key, value);
}

suite('VS Code Settings Persistence', function () {
    this.timeout(STARTUP_TIMEOUT);

    let originalConfig: string;
    let originalWorkspaceSettings: string | undefined;

    before(async function () {
        this.timeout(STARTUP_TIMEOUT);

        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
        originalWorkspaceSettings = fs.existsSync(WORKSPACE_SETTINGS_PATH)
            ? fs.readFileSync(WORKSPACE_SETTINGS_PATH, 'utf-8')
            : undefined;

        const baseline = JSON.parse(originalConfig) as AuthoredConfig;
        baseline.compatibilityVersion = 4;
        baseline.injection = { ...DEFAULT_INJECTION_MODES };
        baseline.synchronization = { repoWideCopilotInstructions: false };
        fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');

        const workspaceSettings = originalWorkspaceSettings
            ? (JSON.parse(originalWorkspaceSettings) as Record<string, unknown>)
            : {};
        workspaceSettings['metaflow.injection.modes'] = { ...DEFAULT_INJECTION_MODES };
        workspaceSettings['metaflow.synchronization.repoWideCopilotInstructions'] = false;
        fs.mkdirSync(path.dirname(WORKSPACE_SETTINGS_PATH), { recursive: true });
        fs.writeFileSync(
            WORKSPACE_SETTINGS_PATH,
            `${JSON.stringify(workspaceSettings, null, 4)}\n`,
            'utf-8',
        );

        await new Workbench().executeCommand('MetaFlow: Refresh');
        await waitForConfig(
            'Settings persistence baseline did not settle',
            (config) =>
                config.injection?.instructions === 'plugin' &&
                config.synchronization?.repoWideCopilotInstructions === false,
        );
    });

    after(async function () {
        this.timeout(STARTUP_TIMEOUT);

        if (originalWorkspaceSettings === undefined) {
            fs.rmSync(WORKSPACE_SETTINGS_PATH, { force: true });
        } else {
            fs.writeFileSync(WORKSPACE_SETTINGS_PATH, originalWorkspaceSettings, 'utf-8');
        }
        await sleep(1_000);
        await new Workbench().executeCommand('MetaFlow: Refresh');
        await new EditorView().closeAllEditors().catch(() => undefined);
        // Refresh first so settings restoration has settled, then restore the
        // fixture bytes without another command rewriting or reformatting them.
        fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
    });

    test('injection instructions round-trip plugin to settings to plugin', async function () {
        this.timeout(WAIT_TIMEOUT * 3);

        const settingsEditor = await openWorkspaceSettings();
        await findSettingById(
            settingsEditor,
            'metaflow.injection.modes',
        );

        await setObjectSettingValue('metaflow.injection.modes', 'instructions', 'settings');
        await waitForConfig(
            'Settings UI did not persist instructions=settings',
            (config) => config.injection?.instructions === 'settings',
        );

        await setObjectSettingValue('metaflow.injection.modes', 'instructions', 'plugin');
        await waitForConfig(
            'Settings UI did not persist instructions=plugin',
            (config) => config.injection?.instructions === 'plugin',
        );
    });

    test('repository-wide Copilot checkbox persists both checked states', async function () {
        this.timeout(WAIT_TIMEOUT * 3);

        const settingsEditor = await openWorkspaceSettings();
        const initialSetting = await findSettingById(
            settingsEditor,
            'metaflow.synchronization.repoWideCopilotInstructions',
        );
        const checkboxLocator = By.css(
            '.setting-item-contents' +
                '[data-key="metaflow.synchronization.repoWideCopilotInstructions"] ' +
                '[role="checkbox"]' +
                '[aria-label="metaflow.synchronization.repoWideCopilotInstructions"]',
        );
        assert.strictEqual(
            await initialSetting.findElement(By.className('setting-item-description')).getText(),
            'Allow MetaFlow to synchronize the repository-wide .github/copilot-instructions.md file.',
        );
        const initialValue =
            (await VSBrowser.instance.driver
                .findElement(checkboxLocator)
                .getAttribute('aria-checked')) === 'true';

        await clickFresh(checkboxLocator, `Copilot consent=${!initialValue}`);
        await waitForConfig(
            `Settings UI did not persist Copilot consent=${!initialValue}`,
            (config) =>
                config.synchronization?.repoWideCopilotInstructions === !initialValue,
        );

        await clickFresh(checkboxLocator, `Copilot consent=${initialValue}`);
        await waitForConfig(
            `Settings UI did not persist Copilot consent=${initialValue}`,
            (config) => config.synchronization?.repoWideCopilotInstructions === initialValue,
        );
    });
});
