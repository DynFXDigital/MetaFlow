/**
 * Shared page-object helpers for MetaFlow vscode-extension-tester GUI tests.
 */

import * as assert from 'assert';
import {
    ActivityBar,
    SideBarView,
    ViewSection,
    TreeItem,
    Workbench,
    InputBox,
    Notification,
} from 'vscode-extension-tester';

export const STARTUP_TIMEOUT = 90_000;
export const WAIT_TIMEOUT = 30_000;
export const INTERACTION_TIMEOUT = 15_000;

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
 * Opens the MetaFlow activity bar icon and returns the SideBarView.
 */
export async function openMetaFlowSidebar(): Promise<SideBarView> {
    const activityBar = new ActivityBar();
    const control = await activityBar.getViewControl('MetaFlow');
    assert.ok(control, 'MetaFlow activity bar entry not found');
    return control.openView() as Promise<SideBarView>;
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
    return Promise.all(
        items.map((item) =>
            (item as TreeItem)
                .getText()
                .catch(() => ''),
        ),
    );
}

/**
 * Waits until a section is expanded and shows real content (no "Loading..." items).
 */
export async function waitForSectionReady(
    section: ViewSection,
    timeoutMs = WAIT_TIMEOUT,
): Promise<void> {
    await expandSection(section);
    await waitFor(async () => {
        const texts = await getVisibleItemTexts(section);
        return (
            texts.length > 0 &&
            texts.every((t) => t.length > 0 && !t.includes('Loading'))
        );
    }, timeoutMs);
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
    const texts = await getVisibleItemTexts(section);
    return texts.some((t) => t.toLowerCase().includes(textFragment.toLowerCase()));
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
export async function hasNotification(
    workbench: Workbench,
    fragment: string,
): Promise<boolean> {
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
