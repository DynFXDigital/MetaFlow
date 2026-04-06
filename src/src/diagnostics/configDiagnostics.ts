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
    result: ConfigLoadResult,
): void {
    const configPath = result.configPath;
    if (result.ok) {
        if (configPath) {
            collection.delete(vscode.Uri.file(configPath));
        }
        return;
    }

    if (!configPath) {
        // No file to attach diagnostics to — nothing to show in Problems panel.
        return;
    }
    const configUri = vscode.Uri.file(configPath);
    const diagnostics: vscode.Diagnostic[] = result.errors.map((err) => {
        const line = err.line ?? 0;
        const col = err.column ?? 0;
        const range = new vscode.Range(line, col, line, col + 1);
        const diagnostic = new vscode.Diagnostic(
            range,
            err.message,
            vscode.DiagnosticSeverity.Error,
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

/** A single serialized config diagnostic entry — plain JSON-compatible. */
export interface ConfigDiagnosticEntry {
    file: string;
    message: string;
    /** Mirrors vscode.DiagnosticSeverity numeric values (0=Error, 1=Warning, 2=Information, 3=Hint). */
    severity: number;
    startLine: number;
    startColumn: number;
    source?: string;
}

/**
 * Serialize all entries in a diagnostic collection to a plain JSON-compatible array.
 * The returned array is a new snapshot — mutating it does not affect the collection.
 *
 * @param collection The diagnostic collection to snapshot.
 */
export function getDiagnosticsSnapshot(
    collection: vscode.DiagnosticCollection,
): ConfigDiagnosticEntry[] {
    const entries: ConfigDiagnosticEntry[] = [];
    collection.forEach((uri, diagnostics) => {
        for (const d of diagnostics) {
            entries.push({
                file: uri.fsPath,
                message: d.message,
                severity: d.severity,
                startLine: d.range.start.line,
                startColumn: d.range.start.character,
                source: d.source,
            });
        }
    });
    return entries;
}
