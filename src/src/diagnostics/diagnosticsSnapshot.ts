import * as vscode from 'vscode';
import type { ConfigError, GovernanceComplianceResult, GovernanceContract } from '@metaflow/engine';
import {
    formatDiagnosticLocation,
    getDiagnosticsSnapshot,
    type ConfigDiagnosticEntry,
} from './configDiagnostics';

export interface DiagnosticsSnapshotState {
    capabilityWarnings: string[];
    governanceContract?: GovernanceContract;
    governanceContractPath?: string;
    governanceContractErrors: ConfigError[];
    governanceCompliance?: GovernanceComplianceResult;
}

export interface DiagnosticsSnapshotWarning {
    category: 'capability' | 'config' | 'governance';
    message: string;
    code?: string | number;
    severity?: number | 'warn' | 'error';
    file?: string;
    startLine?: number;
    startColumn?: number;
    remediationHint?: string;
}

export interface DiagnosticsSnapshotPayload {
    capabilityWarnings: string[];
    configDiagnostics: ConfigDiagnosticEntry[];
    governance: {
        contractPath?: string;
        validationErrors: ConfigError[];
        compliance?: GovernanceComplianceResult;
    };
    warnings: DiagnosticsSnapshotWarning[];
}

function cloneConfigError(error: ConfigError): ConfigError {
    return {
        message: error.message,
        ...(error.code !== undefined ? { code: error.code } : {}),
        ...(error.severity !== undefined ? { severity: error.severity } : {}),
        ...(error.line !== undefined ? { line: error.line } : {}),
        ...(error.column !== undefined ? { column: error.column } : {}),
    };
}

function cloneGovernanceComplianceResult(
    result: GovernanceComplianceResult | undefined,
): GovernanceComplianceResult | undefined {
    if (!result) {
        return undefined;
    }

    return {
        ...result,
        allowedProfiles: [...result.allowedProfiles],
        lockedProfiles: [...result.lockedProfiles],
        violations: result.violations.map((violation) => ({ ...violation })),
    };
}

function diagnosticRemediationHint(diagnostic: ConfigDiagnosticEntry): string | undefined {
    switch (diagnostic.code) {
        case 'LAYER_PATH_MISSING':
            return 'Create the configured capability path, mount the metadata source, or disable/remove the missing layer from .metaflow/config.jsonc.';
        case 'LAYER_PATH_INVALID':
            return 'Update the configured layer path so it points to a directory, or remove the invalid layer reference.';
        case 'LAYER_PATH_UNREADABLE':
            return 'Fix filesystem permissions or mount/accessibility for the configured layer path.';
        case 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING':
            return 'Add the missing plugin.json package manifest for the agent plugin capability or disable agentPlugin for that capability.';
        default:
            return undefined;
    }
}

function capabilityWarningRemediationHint(message: string): string | undefined {
    if (message.includes('[REPO_PATH_MISSING]')) {
        return 'Create or mount the configured metadata repository path, or update/remove the repo source in .metaflow/config.jsonc.';
    }
    if (message.includes('[REPO_PATH_INVALID]')) {
        return 'Update the metadata repo localPath so it points to a directory.';
    }
    if (message.includes('[REPO_PATH_UNREADABLE]')) {
        return 'Fix filesystem permissions or mount/accessibility for the configured metadata repo path.';
    }
    if (message.includes('[LAYER_SOURCE_REPO_MISSING]')) {
        return 'Add or enable the referenced metadata repo, or remove the layer source that points at it.';
    }
    if (message.includes('[SURFACED_FILE_CONFLICT]')) {
        return 'Review duplicate surfaced file paths and adjust layer ordering, filters, or source content so the effective file is unambiguous.';
    }

    return undefined;
}

function buildWarningSummary(
    capabilityWarnings: string[],
    configDiagnostics: ConfigDiagnosticEntry[],
    compliance: GovernanceComplianceResult | undefined,
): DiagnosticsSnapshotWarning[] {
    const warnings: DiagnosticsSnapshotWarning[] = [];

    for (const warning of capabilityWarnings) {
        warnings.push({
            category: 'capability',
            message: warning,
            remediationHint: capabilityWarningRemediationHint(warning),
        });
    }

    for (const diagnostic of configDiagnostics) {
        warnings.push({
            category: 'config',
            message: diagnostic.message,
            code: diagnostic.code,
            severity: diagnostic.severity,
            file: diagnostic.file,
            startLine: diagnostic.startLine,
            startColumn: diagnostic.startColumn,
            remediationHint: diagnosticRemediationHint(diagnostic),
        });
    }

    if (compliance?.status === 'non-compliant') {
        for (const violation of compliance.violations) {
            warnings.push({
                category: 'governance',
                message: violation.message,
                code: violation.id,
                severity: violation.severity,
                remediationHint:
                    'Align the active profile and enabled capabilities with the governance contract, then refresh MetaFlow diagnostics.',
            });
        }
    }

    return warnings;
}

export function buildDiagnosticsSnapshot(
    state: DiagnosticsSnapshotState,
    diagnosticCollection: vscode.DiagnosticCollection,
): DiagnosticsSnapshotPayload {
    const configDiagnostics = getDiagnosticsSnapshot(diagnosticCollection);
    const compliance = cloneGovernanceComplianceResult(state.governanceCompliance);

    return {
        capabilityWarnings: [...state.capabilityWarnings],
        configDiagnostics,
        governance: {
            contractPath: state.governanceContractPath,
            validationErrors: state.governanceContractErrors.map(cloneConfigError),
            compliance,
        },
        warnings: buildWarningSummary(state.capabilityWarnings, configDiagnostics, compliance),
    };
}

export function formatDiagnosticsSnapshotWarningMessage(
    warning: DiagnosticsSnapshotWarning,
): string {
    if (warning.category === 'capability') {
        return warning.message;
    }

    const codeValue = warning.code !== undefined ? String(warning.code).trim() : '';
    const code =
        codeValue && !warning.message.trim().startsWith(`[${codeValue}]`) ? `[${codeValue}] ` : '';
    const location = warning.file
        ? ` [${formatDiagnosticLocation(warning.file, warning.startLine, warning.startColumn)}]`
        : '';
    return `${code}${warning.message}${location}`;
}
