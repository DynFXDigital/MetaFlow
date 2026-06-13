import * as vscode from 'vscode';
import {
    formatDiagnosticsSnapshotWarningMessage,
    type DiagnosticsSnapshotPayload,
} from '../diagnostics/diagnosticsSnapshot';

export const METAFLOW_DIAGNOSTICS_TOOL_NAME = 'metaflow_diagnostics';

export interface DiagnosticsToolInput {
    refresh?: boolean;
}

function buildDiagnosticsText(snapshot: DiagnosticsSnapshotPayload): string {
    const lines = [
        `MetaFlow diagnostics snapshot: ${snapshot.warnings.length} warning(s), ${snapshot.configDiagnostics.length} config diagnostic(s).`,
    ];

    if (snapshot.warnings.length === 0) {
        lines.push('No active warnings.');
        return lines.join('\n');
    }

    lines.push('Warnings:');
    for (const warning of snapshot.warnings) {
        lines.push(`- ${formatDiagnosticsSnapshotWarningMessage(warning)}`);
        if (warning.remediationHint) {
            lines.push(`  Remediation: ${warning.remediationHint}`);
        }
    }

    return lines.join('\n');
}

export function createDiagnosticsTool(
    getSnapshot: () => DiagnosticsSnapshotPayload,
    refreshIfStale?: () => Promise<void>,
): vscode.LanguageModelTool<DiagnosticsToolInput> {
    return {
        async invoke() {
            await refreshIfStale?.();
            const snapshot = getSnapshot();
            return new vscode.LanguageModelToolResult([
                vscode.LanguageModelDataPart.json(snapshot),
                new vscode.LanguageModelTextPart(buildDiagnosticsText(snapshot)),
            ]);
        },
        prepareInvocation() {
            return {
                invocationMessage: 'Reading MetaFlow diagnostics',
            };
        },
    };
}

export function registerDiagnosticsTool(
    context: vscode.ExtensionContext,
    getSnapshot: () => DiagnosticsSnapshotPayload,
    refreshIfStale?: () => Promise<void>,
): void {
    context.subscriptions.push(
        vscode.lm.registerTool(
            METAFLOW_DIAGNOSTICS_TOOL_NAME,
            createDiagnosticsTool(getSnapshot, refreshIfStale),
        ),
    );
}
