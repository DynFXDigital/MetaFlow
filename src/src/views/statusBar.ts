/**
 * MetaFlow status bar item.
 *
 * Displays: `MetaFlow: <profile> (<N> files)` with state indicators.
 */

import * as vscode from 'vscode';

export type StatusBarState = 'idle' | 'loading' | 'error' | 'drift';

export interface StatusBarRepoSummary {
    dirtyCount: number;
    updatesCount: number;
    pushableCount: number;
}

let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Create and show the MetaFlow status bar item.
 */
export function createStatusBar(): vscode.StatusBarItem {
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBarItem.command = 'metaflow.switchProfile';
    }
    statusBarItem.show();
    return statusBarItem;
}

/**
 * Update the status bar display.
 *
 * @param state     Current extension state.
 * @param profile   Active profile name (or undefined).
 * @param fileCount Number of effective files.
 */
export function updateStatusBar(
    state: StatusBarState,
    profile?: string,
    fileCount?: number,
    repoSummary?: StatusBarRepoSummary
): void {
    const bar = createStatusBar();
    const profileLabel = profile ?? 'default';
    const count = fileCount ?? 0;
    const repoSuffix = (summary?: StatusBarRepoSummary): string => {
        if (!summary || (summary.dirtyCount === 0 && summary.updatesCount === 0)) {
            return '';
        }
        return ` | Repos: ${summary.dirtyCount} dirty, ${summary.updatesCount} updates`;
    };

    switch (state) {
        case 'idle':
            bar.text = `$(layers) MetaFlow: ${profileLabel} (${count} files)${repoSuffix(repoSummary)}`;
            bar.tooltip = 'MetaFlow — Click to switch profile';
            bar.backgroundColor = undefined;
            break;
        case 'loading':
            bar.text = `$(sync~spin) MetaFlow: Loading...`;
            bar.tooltip = 'MetaFlow — Loading configuration';
            bar.backgroundColor = undefined;
            break;
        case 'error':
            bar.text = `$(warning) MetaFlow: Error`;
            bar.tooltip = 'MetaFlow — Configuration error; check Problems panel';
            bar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
        case 'drift':
            bar.text = `$(info) MetaFlow: ${profileLabel} (${count} files, drift detected)${repoSuffix(repoSummary)}`;
            bar.tooltip = 'MetaFlow — Local edits detected in managed files';
            bar.backgroundColor = undefined;
            break;
    }
}

/**
 * Hide the status bar item.
 */
export function hideStatusBar(): void {
    statusBarItem?.hide();
}

/**
 * Dispose the status bar item.
 */
export function disposeStatusBar(): void {
    if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = undefined;
    }
}
