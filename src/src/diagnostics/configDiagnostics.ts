/**
 * Config diagnostics provider.
 *
 * Reports config parse/validation errors via VS Code diagnostic collection.
 * The collection is created externally (in extension.ts) and passed in.
 */

import * as vscode from 'vscode';
import { ConfigLoadResult } from '@metaflow/engine';

/**
 * Publish config errors as VS Code diagnostics.
 *
 * @param collection The diagnostic collection to publish to.
 * @param result     A failed ConfigLoadResult with errors and optional configPath.
 */
export function publishConfigDiagnostics(
    collection: vscode.DiagnosticCollection,
    result: ConfigLoadResult
): void {
    if (result.ok) { return; }
    const configPath = result.configPath;
    if (!configPath) {
        // No file to attach diagnostics to — nothing to show in Problems panel.
        return;
    }
    const configUri = vscode.Uri.file(configPath);
    const diagnostics: vscode.Diagnostic[] = result.errors.map(err => {
        const line = err.line ?? 0;
        const col = err.column ?? 0;
        const range = new vscode.Range(line, col, line, col + 1);
        const diagnostic = new vscode.Diagnostic(
            range,
            err.message,
            vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'MetaFlow';
        return diagnostic;
    });
    collection.set(configUri, diagnostics);
}

/**
 * Clear all diagnostics from the given collection.
 */
export function clearDiagnostics(collection: vscode.DiagnosticCollection): void {
    collection.clear();
}

/**
 * Dispose is a no-op when the collection is externally managed.
 * Kept for backward compatibility with deactivate().
 */
export function disposeDiagnostics(): void {
    // Collection disposed via context.subscriptions in extension.ts
}
