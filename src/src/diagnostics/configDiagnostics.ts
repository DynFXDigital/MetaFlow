/**
 * Config diagnostics provider.
 *
 * Reports config parse/validation errors via VS Code diagnostic collection.
 * The collection is created externally (in extension.ts) and passed in.
 */

import * as vscode from 'vscode';
import {
    ConfigLoadResult,
    GovernanceComplianceResult,
    GovernanceContractLoadResult,
} from '@metaflow/engine';

function mapSeverity(value: 'error' | 'warning' | 'warn' | undefined): vscode.DiagnosticSeverity {
    return value === 'warning' || value === 'warn'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
}

export interface SupplementalConfigDiagnostic {
    message: string;
    code?: string | number;
    severity?: 'error' | 'warning' | 'warn';
}

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
            mapSeverity(err.severity),
        );
        diagnostic.source = 'MetaFlow';
        if (err.code) {
            diagnostic.code = err.code;
        }
        return diagnostic;
    });
    collection.set(configUri, diagnostics);
}

export function publishConfigWarningDiagnostics(
    collection: vscode.DiagnosticCollection,
    configPath: string | undefined,
    warnings: SupplementalConfigDiagnostic[],
): void {
    if (!configPath) {
        return;
    }

    const configUri = vscode.Uri.file(configPath);
    if (warnings.length === 0) {
        collection.delete(configUri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = warnings.map((warning) => {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            warning.message,
            mapSeverity(warning.severity ?? 'warning'),
        );
        diagnostic.source = 'MetaFlow';
        if (warning.code !== undefined) {
            diagnostic.code = warning.code;
        }
        return diagnostic;
    });

    collection.set(configUri, diagnostics);
}

export function publishGovernanceDiagnostics(
    collection: vscode.DiagnosticCollection,
    result: GovernanceContractLoadResult,
): void {
    const contractPath = result.contractPath;
    if (result.ok) {
        if (contractPath) {
            collection.delete(vscode.Uri.file(contractPath));
        }
        return;
    }

    if (!contractPath) {
        return;
    }

    const contractUri = vscode.Uri.file(contractPath);
    const diagnostics: vscode.Diagnostic[] = result.errors.map((err) => {
        const line = err.line ?? 0;
        const col = err.column ?? 0;
        const range = new vscode.Range(line, col, line, col + 1);
        const diagnostic = new vscode.Diagnostic(range, err.message, mapSeverity(err.severity));
        diagnostic.source = 'MetaFlow';
        if (err.code) {
            diagnostic.code = err.code;
        }
        return diagnostic;
    });
    collection.set(contractUri, diagnostics);
}

export function publishGovernanceComplianceDiagnostics(
    collection: vscode.DiagnosticCollection,
    contractPath: string | undefined,
    result: GovernanceComplianceResult,
): void {
    if (!contractPath) {
        return;
    }

    const contractUri = vscode.Uri.file(contractPath);
    if (result.status !== 'non-compliant') {
        collection.delete(contractUri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = result.violations.map((violation) => {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 1),
            violation.message,
            mapSeverity(violation.severity),
        );
        diagnostic.source = 'MetaFlow';
        diagnostic.code = violation.id;
        return diagnostic;
    });

    collection.set(contractUri, diagnostics);
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
    code?: string | number;
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
                ...(typeof d.code === 'string' || typeof d.code === 'number'
                    ? { code: d.code }
                    : {}),
            });
        }
    });
    return entries;
}
