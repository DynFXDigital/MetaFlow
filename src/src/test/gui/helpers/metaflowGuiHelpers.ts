/**
 * Shared page-object helpers for MetaFlow vscode-extension-tester GUI tests.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    ActivityBar,
    SideBarView,
    ViewSection,
    TreeItem,
    Workbench,
    InputBox,
    Notification,
    EditorView,
    VSBrowser,
    By,
    Key,
} from 'vscode-extension-tester';

const WELCOME_OVERLAY_SELECTOR = '.onboarding-a-overlay, .welcomeOverlay, .getting-started';

export const STARTUP_TIMEOUT = 90_000;
export const WAIT_TIMEOUT = 30_000;
export const INTERACTION_TIMEOUT = 15_000;

// ── Golden config (cross-suite contamination guard) ────────────────────────────

/**
 * Authoritative pristine workspace config, kept as an immutable sibling file
 * `config.golden.jsonc` next to the live `config.jsonc`.
 *
 * Suites must seed their restore baseline from this golden copy rather than
 * snapshotting the live file in `before()`. A live snapshot trusts the previous
 * suite to have cleaned up; when a prior afterEach throws it leaves config.jsonc
 * dirty, the next suite captures that dirty state as its "original", and the
 * contamination chains across the whole run. Reading the golden file removes
 * that trust dependency.
 */
function goldenPathFor(configPath: string): string {
    return path.join(path.dirname(configPath), 'config.golden.jsonc');
}

/** Derives the workspace `.vscode/settings.json` path from the live config path. */
function settingsPathFor(configPath: string): string {
    // config lives at <workspace>/.metaflow/config.jsonc
    const workspaceRoot = path.dirname(path.dirname(configPath));
    return path.join(workspaceRoot, '.vscode', 'settings.json');
}

/**
 * Derives the ExTester sandbox **user** settings path from the live config path.
 *
 * `chat.pluginLocations` is the one injected key MetaFlow writes to USER scope
 * (`ConfigurationTarget.Global`) — VS Code's Copilot plugin discovery only honors
 * it there, not at workspace scope (see `resolveSettingsEntryTarget`). The GUI
 * runner stores user settings at `<srcRoot>/.vscode-test/gui/settings/User/settings.json`,
 * where `<srcRoot>` is the parent of the test workspace.
 */
export function userSettingsPathFor(configPath: string): string {
    const workspaceRoot = path.dirname(path.dirname(configPath));
    const srcRoot = path.dirname(workspaceRoot);
    return path.join(srcRoot, '.vscode-test', 'gui', 'settings', 'User', 'settings.json');
}

/** Deletes every `chat.*` key from a single settings JSON file. Non-`chat.` keys are preserved. */
function clearChatKeysInFile(settingsPath: string): void {
    let settings: Record<string, unknown>;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
        return; // missing or unparseable — nothing to clear
    }
    let changed = false;
    for (const key of Object.keys(settings)) {
        if (key.startsWith('chat.')) {
            delete settings[key];
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4), 'utf-8');
    }
}

/** Returns the immutable pristine config contents for the given live config path. */
export function readGoldenConfig(configPath: string): string {
    return fs.readFileSync(goldenPathFor(configPath), 'utf-8');
}

/**
 * Removes MetaFlow's injected `chat.*` keys from BOTH the workspace and the
 * sandbox user settings files.
 *
 * Apply does not prune orphaned settings keys when an artifact's classification
 * changes (e.g. a prior suite ran in `settings` mode and left
 * `chat.instructionsFilesLocations` behind). Those stale keys survive into the
 * next suite and break assertions like "default classification does NOT write
 * chat.instructionsFilesLocations". The same contamination applies to
 * `chat.pluginLocations`, which lives in user scope. Clearing both files
 * restores the pristine (no-injection) settings baseline so each suite's Apply
 * output is observed in isolation. Non-`chat.` keys are preserved.
 */
export function clearInjectedSettings(configPath: string): void {
    clearChatKeysInFile(settingsPathFor(configPath));
    clearChatKeysInFile(userSettingsPathFor(configPath));
}

/**
 * Resets the workspace MetaFlow output state to pristine: restores the live
 * config from the immutable golden copy and clears injected `chat.*` settings
 * keys. Suites call this in `before()` so they never trust the previous suite's
 * cleanup — see the golden-config note above and [[clearInjectedSettings]].
 */
export function restoreGoldenConfig(configPath: string): void {
    fs.writeFileSync(configPath, readGoldenConfig(configPath), 'utf-8');
    clearInjectedSettings(configPath);
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `condition` until it returns true or throws after `timeoutMs`.
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    timeoutMs = WAIT_TIMEOUT,
    intervalMs = 500,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            if (await condition()) {
                return;
            }
        } catch {
            // condition threw — keep polling
        }
        await sleep(intervalMs);
    }
    throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// ── Sidebar helpers ───────────────────────────────────────────────────────────

/**
 * Dismisses the "Welcome to Visual Studio Code" walkthrough that VS Code opens
 * on a fresh test profile. On recent builds it renders as a modal overlay
 * (`role=dialog aria-modal=true`, class `onboarding-a-overlay`), NOT as an
 * editor — so `closeAllEditors()` alone does not remove it, and its modal
 * backdrop intercepts activity-bar clicks. We escalate: close editors, press
 * Escape, then force-remove the overlay node from the DOM as a last resort.
 * Idempotent and best-effort: a no-op when nothing is open.
 */
export async function dismissWelcomeOverlay(): Promise<void> {
    try {
        await new EditorView().closeAllEditors();
    } catch {
        // No editors open (or already dismissed) — safe to ignore.
    }

    const driver = VSBrowser.instance.driver;

    // Press Escape if a welcome overlay is present.
    try {
        const present = await driver.findElements(By.css(WELCOME_OVERLAY_SELECTOR));
        if (present.length > 0) {
            await driver.actions().sendKeys(Key.ESCAPE).perform();
            await sleep(400);
        }
    } catch {
        // ignore — overlay query/escape is best-effort
    }

    // If it's still there, rip it out of the DOM so it can't intercept clicks.
    try {
        const stillPresent = await driver.findElements(By.css(WELCOME_OVERLAY_SELECTOR));
        if (stillPresent.length > 0) {
            await driver.executeScript(
                `document.querySelectorAll(${JSON.stringify(WELCOME_OVERLAY_SELECTOR)})` +
                    `.forEach((el) => el.remove());`,
            );
            await sleep(200);
        }
    } catch {
        // ignore — DOM removal is best-effort
    }
}

/**
 * Dismisses any open modal dialog (`.monaco-dialog-box`, custom dialog style).
 *
 * A single stray modal — e.g. VS Code's "Command 'Git: Toggle Git Blame Editor
 * Decoration' resulted in an error … command not found" box — sits on top of
 * the whole window and intercepts every subsequent click, which cascades into
 * "element not visible" timeouts across all later suites in a long run. We press
 * Escape (non-destructive: dismisses an error/OK dialog without confirming any
 * action), then force-remove the node as a last resort. Best-effort no-op when
 * no dialog is present.
 */
export async function dismissModalDialogs(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    // `.monaco-dialog-modal-block` is the full-window backdrop that intercepts
    // every click; `.monaco-dialog-box` is the dialog content nested inside it.
    // Match (and, as a last resort, remove) both — removing only the box leaves
    // the dimmed backdrop in place, which keeps blocking subsequent tree clicks.
    const SELECTOR = '.monaco-dialog-modal-block, .monaco-dialog-box';
    try {
        const present = await driver.findElements(By.css(SELECTOR));
        if (present.length > 0) {
            await driver.actions().sendKeys(Key.ESCAPE).perform();
            await sleep(300);
        }
    } catch {
        // best-effort — query/escape may race with the dialog closing
    }
    try {
        const stillPresent = await driver.findElements(By.css(SELECTOR));
        if (stillPresent.length > 0) {
            await driver.executeScript(
                `document.querySelectorAll(${JSON.stringify(SELECTOR)})` +
                    `.forEach((el) => el.remove());`,
            );
            await sleep(200);
        }
    } catch {
        // best-effort — DOM removal is a last resort
    }
}

/**
 * Dismisses a stray quick-input widget (Command Palette / InputBox / quick pick)
 * or open context menu left behind by an interaction test.
 *
 * These are the dominant cross-suite cascade source in a long run: a Filter test
 * that opens an InputBox but errors before cancelling, or a context-menu test
 * that leaves `.monaco-menu` open, parks a focused widget on top of the window.
 * Every later `executeCommand` then opens the palette *behind* it (or the menu
 * intercepts clicks), producing "Waiting until element is visible" timeouts and
 * stale `.monaco-menu` NoSuchElementErrors across all subsequent suites. Escape
 * is non-destructive — it cancels an input/menu without confirming any action.
 * Sent twice to collapse a nested quick pick. Best-effort no-op when nothing is
 * open.
 */
export async function dismissTransientChrome(): Promise<void> {
    const driver = VSBrowser.instance.driver;
    // `.quick-input-widget` backs the palette, InputBox and quick pick; the
    // context menu renders inside `.context-view` / `.monaco-menu`.
    const SELECTOR = '.quick-input-widget, .monaco-menu, .context-view';
    try {
        const present = await driver.findElements(By.css(SELECTOR));
        if (present.length > 0) {
            await driver.actions().sendKeys(Key.ESCAPE).perform();
            await sleep(150);
            await driver.actions().sendKeys(Key.ESCAPE).perform();
            await sleep(150);
        }
    } catch {
        // best-effort — query/escape may race with the widget closing
    }
}

/**
 * Clears transient UI that accumulates over a long ExTester run and would block
 * later interactions: modal dialogs, stray quick-input/context menus, then
 * notification toasts, then the welcome overlay. Safe to call repeatedly;
 * intended for an afterEach root hook and at the start of each suite's sidebar
 * open.
 */
export async function dismissBlockingUi(): Promise<void> {
    await dismissModalDialogs();
    await dismissTransientChrome();
    try {
        await dismissAllNotifications(new Workbench());
    } catch {
        // best-effort
    }
    await dismissWelcomeOverlay();
}

/**
 * Opens the MetaFlow activity bar icon and returns the SideBarView.
 * Retries once after re-dismissing the welcome overlay if the first click is
 * intercepted by a modal backdrop.
 */
export async function openMetaFlowSidebar(): Promise<SideBarView> {
    await dismissModalDialogs();
    await dismissWelcomeOverlay();
    // On a cold-start host the extension's activity-bar entry only appears once
    // activation finishes. Poll for it (up to STARTUP_TIMEOUT) so the first
    // suite in a batch waits for activation instead of asserting on an empty bar.
    let control: Awaited<ReturnType<ActivityBar['getViewControl']>> | undefined;
    await waitFor(async () => {
        control = await new ActivityBar().getViewControl('MetaFlow');
        return Boolean(control);
    }, STARTUP_TIMEOUT);
    assert.ok(control, 'MetaFlow activity bar entry not found');
    let sideBar: SideBarView;
    try {
        sideBar = (await control.openView()) as SideBarView;
    } catch {
        // A modal backdrop likely intercepted the click — dismiss and retry once.
        await dismissWelcomeOverlay();
        await sleep(300);
        sideBar = (await control.openView()) as SideBarView;
    }

    // CI can render the contributed view containers before the activation-time
    // refresh has populated tree state. Run the command explicitly once after
    // opening the sidebar so tests wait on real data, not VS Code activation
    // event ordering.
    try {
        await new Workbench().executeCommand('MetaFlow: Refresh');
    } catch {
        // If the command palette races command registration, the following
        // section readiness wait still provides a useful failure point.
    }

    return sideBar;
}

/**
 * Gets a named section from an open MetaFlow SideBarView.
 */
export async function getSection(sideBar: SideBarView, title: string): Promise<ViewSection> {
    return sideBar.getContent().getSection(title);
}

/**
 * Expands a section if it is currently collapsed.
 */
export async function expandSection(section: ViewSection): Promise<void> {
    if (!(await section.isExpanded())) {
        await section.expand();
    }
}

/**
 * Returns visible item label texts from a section.
 */
export async function getVisibleItemTexts(section: ViewSection): Promise<string[]> {
    const items = await section.getVisibleItems();
    return Promise.all(items.map((item) => (item as TreeItem).getText().catch(() => '')));
}

/**
 * Recursively expands every collapsible item in a section so nested children
 * are rendered. In the default tree view mode the Capabilities tree groups
 * capabilities under path-segment folders (e.g. `standards` → leaf `sdlc`),
 * so leaves are only present in the DOM once their parent group is expanded.
 * This makes the full capability set findable by `findItemByText` /
 * `sectionContainsText`. Idempotent (already-expanded items are skipped, so
 * repeat calls are cheap) and best-effort per item.
 */
export async function expandAllItems(section: ViewSection, maxPasses = 8): Promise<void> {
    for (let pass = 0; pass < maxPasses; pass++) {
        const items = await section.getVisibleItems();
        let expandedAny = false;
        for (const item of items) {
            const treeItem = item as TreeItem;
            try {
                if ((await treeItem.isExpandable()) && !(await treeItem.isExpanded())) {
                    await treeItem.expand();
                    expandedAny = true;
                }
            } catch {
                // item went stale or refused to expand — keep going
            }
        }
        if (!expandedAny) {
            return;
        }
    }
}

/**
 * Waits until a section is expanded and shows real content (no "Loading..." items).
 */
export async function waitForSectionReady(
    section: ViewSection,
    timeoutMs = WAIT_TIMEOUT,
): Promise<void> {
    await expandSection(section);
    let latestTexts: string[] = [];
    await waitFor(async () => {
        latestTexts = await getVisibleItemTexts(section);
        return (
            latestTexts.length > 0 &&
            latestTexts.every((t) => t.length > 0 && !t.includes('Loading'))
        );
    }, timeoutMs).catch(async (err: unknown) => {
        const title = await section.getTitle().catch(() => '<unknown section>');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            `${message}; section "${title}" visible items: ${latestTexts.join(', ') || '<none>'}`,
        );
    });
    // Reveal nested children (tree-mode capability groups) so all leaves are findable.
    await expandAllItems(section);
}

/**
 * Polls until a tree item whose label contains `textFragment` appears in `section`.
 */
export async function findItemByText(
    section: ViewSection,
    textFragment: string,
    timeoutMs = INTERACTION_TIMEOUT,
): Promise<TreeItem> {
    let found: TreeItem | undefined;
    await waitFor(async () => {
        await expandAllItems(section);
        const items = await section.getVisibleItems();
        for (const item of items) {
            const text = await (item as TreeItem).getText().catch(() => '');
            if (text.toLowerCase().includes(textFragment.toLowerCase())) {
                found = item as TreeItem;
                return true;
            }
        }
        return false;
    }, timeoutMs);
    // waitFor throws if condition never met, so found is always set here
    return found!;
}

/**
 * Returns true if any visible item in `section` contains `textFragment`.
 */
export async function sectionContainsText(
    section: ViewSection,
    textFragment: string,
): Promise<boolean> {
    await expandAllItems(section);
    const texts = await getVisibleItemTexts(section);
    return texts.some((t) => t.toLowerCase().includes(textFragment.toLowerCase()));
}

// ── Effective Files (overlay output) helpers ──────────────────────────────────

/**
 * Host-independent check for overlay output. The Effective Files tree reflects
 * the resolved overlay (which artifacts a given config surfaces) regardless of
 * whether VS Code persisted the derived `chat.*` settings keys — those settings
 * writes are rejected by the ExTester host's config editing service, so reading
 * `.vscode/settings.json` is not a usable signal here. The exact settings
 * key→path mapping is verified host-independently by the engine unit tests
 * (`computeSettingsEntries`); these GUI checks verify the end-to-end behavior
 * that a capability/profile change is reflected in the overlay output.
 *
 * Re-fetches and re-expands the section each call so it tolerates the
 * virtualized tree dropping leaves out of the rendered DOM.
 */
export async function effectiveFilesContains(
    sideBar: SideBarView,
    fileFragment: string,
): Promise<boolean> {
    const section = await getSection(sideBar, 'Effective Files');
    await expandSection(section);
    return sectionContainsText(section, fileFragment);
}

/**
 * Polls until the Effective Files tree contains (or, when `present` is false, no
 * longer contains) `fileFragment`. Defaults to a doubled wait budget because a
 * refresh+render of the virtualized tree under host load occasionally exceeds
 * the 30s default (see harness notes). Throws if the condition is never met.
 */
export async function waitForEffectiveFiles(
    sideBar: SideBarView,
    fileFragment: string,
    present = true,
    timeoutMs = WAIT_TIMEOUT * 2,
): Promise<void> {
    await waitFor(
        async () => (await effectiveFilesContains(sideBar, fileFragment)) === present,
        timeoutMs,
    );
}

// ── Command helpers ───────────────────────────────────────────────────────────

/**
 * Executes a VS Code command via the Command Palette.
 * Pass the full command title, e.g. 'MetaFlow: Create Profile'.
 */
export async function runCommand(label: string): Promise<void> {
    await new Workbench().executeCommand(label);
}

/**
 * Dismisses the current InputBox / quick pick if one is open.
 */
export async function dismissActiveInput(): Promise<void> {
    try {
        const input = await InputBox.create(2_000);
        await input.cancel();
    } catch {
        // no input open — that's fine
    }
}

// ── Notification helpers ──────────────────────────────────────────────────────

/**
 * Polls until a notification whose message includes `fragment` appears.
 * Returns the notification, or undefined if none appeared within the timeout.
 */
export async function waitForNotification(
    workbench: Workbench,
    fragment: string,
    timeoutMs = INTERACTION_TIMEOUT,
): Promise<Notification | undefined> {
    let found: Notification | undefined;
    try {
        await waitFor(async () => {
            const notes = await workbench.getNotifications();
            for (const n of notes) {
                const msg = await n.getMessage().catch(() => '');
                if (msg.toLowerCase().includes(fragment.toLowerCase())) {
                    found = n;
                    return true;
                }
            }
            return false;
        }, timeoutMs);
    } catch {
        // timed out — found stays undefined
    }
    return found;
}

/**
 * Dismisses all currently visible notifications, ignoring errors.
 */
export async function dismissAllNotifications(workbench: Workbench): Promise<void> {
    try {
        const notes = await workbench.getNotifications();
        for (const n of notes) {
            await n.dismiss().catch(() => {
                /* ignore */
            });
        }
    } catch {
        // ignore
    }
}

/**
 * Returns true if any currently visible notification message includes `fragment`.
 */
export async function hasNotification(workbench: Workbench, fragment: string): Promise<boolean> {
    try {
        const notes = await workbench.getNotifications();
        for (const n of notes) {
            const msg = await n.getMessage().catch(() => '');
            if (msg.toLowerCase().includes(fragment.toLowerCase())) {
                return true;
            }
        }
    } catch {
        // ignore
    }
    return false;
}
