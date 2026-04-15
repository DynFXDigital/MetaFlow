import type {
    ConfigError,
    GovernanceComplianceResult,
    GovernanceContract,
    GovernanceViolation,
} from '@metaflow/engine';
import { normalizeInputPath } from '@metaflow/engine';

export interface GovernanceUiState {
    governanceContract?: GovernanceContract;
    governanceContractErrors?: ConfigError[];
    governanceCompliance?: GovernanceComplianceResult;
}

export interface ProfileGovernanceProjection {
    descriptionFlags: string[];
    tooltipLines: string[];
    iconId?: string;
}

export interface RepoGovernanceProjection {
    descriptionQualifiers: string[];
    tooltipLines: string[];
}

export interface CapabilityGovernanceProjection {
    descriptionFlags: string[];
    summary?: string;
    detailLines: string[];
    variant?: 'info' | 'warning' | 'error';
    isGoverned: boolean;
    hasViolations: boolean;
}

function normalizeCapabilityPath(pathValue: string): string {
    const normalized = normalizeInputPath(pathValue).replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}

function normalizeRepoId(repoId: string | undefined): string {
    return repoId?.trim() || 'primary';
}

function normalizeErrorCode(error: ConfigError): string | undefined {
    if (typeof error.code === 'string' && error.code.trim().length > 0) {
        return error.code.trim();
    }

    if (typeof error.code === 'number') {
        return String(error.code);
    }

    return undefined;
}

function formatConfigError(error: ConfigError): string {
    const code = normalizeErrorCode(error);
    return code ? `[${code}] ${error.message}` : error.message;
}

function formatViolation(violation: GovernanceViolation): string {
    return `[${violation.id}] ${violation.message}`;
}

function buildGovernanceStatusSummary(state: GovernanceUiState): string | undefined {
    const contractErrors = state.governanceContractErrors ?? [];
    if (contractErrors.length > 0) {
        return `Governance: invalid (${contractErrors.length} contract diagnostic(s))`;
    }

    const compliance = state.governanceCompliance;
    if (!compliance) {
        return undefined;
    }

    if (compliance.status === 'not-applicable') {
        return 'Governance: not configured';
    }

    return `Governance: ${compliance.status} (severity: ${compliance.severity})`;
}

function buildGovernanceStateDetailLines(state: GovernanceUiState): string[] {
    const contractErrors = state.governanceContractErrors ?? [];
    if (contractErrors.length > 0) {
        return contractErrors.map(formatConfigError);
    }

    const compliance = state.governanceCompliance;
    if (!compliance) {
        return [];
    }

    const lines: string[] = [];

    if (compliance.allowedProfiles.length > 0) {
        lines.push(`Governance Allowed Profiles: ${compliance.allowedProfiles.join(', ')}`);
    }

    if (compliance.lockedProfiles.length > 0) {
        lines.push(`Governance Locked Profiles: ${compliance.lockedProfiles.join(', ')}`);
    }

    if (compliance.activeProfileLocked) {
        lines.push('Governance Active Profile Lock: active');
    }

    if (compliance.violations.length > 0) {
        lines.push(`Governance Violations: ${compliance.violations.length}`);
        lines.push(...compliance.violations.map(formatViolation));
    }

    return lines;
}

function matchesCapabilityRef(
    repoId: string | undefined,
    layerPath: string,
    candidateRepoId: string | undefined,
    candidatePath: string | undefined,
): boolean {
    if (!candidatePath) {
        return false;
    }

    return (
        normalizeRepoId(repoId) === normalizeRepoId(candidateRepoId) &&
        normalizeCapabilityPath(layerPath) === normalizeCapabilityPath(candidatePath)
    );
}

function getCapabilityRuleLabels(
    repoId: string | undefined,
    layerPath: string,
    contract: GovernanceContract | undefined,
): string[] {
    const labels: string[] = [];

    if (
        contract?.requiredCapabilities?.some((ref) =>
            matchesCapabilityRef(repoId, layerPath, ref.repoId, ref.path),
        )
    ) {
        labels.push('required capability');
    }

    if (
        contract?.defaultOnCapabilities?.some((ref) =>
            matchesCapabilityRef(repoId, layerPath, ref.repoId, ref.path),
        )
    ) {
        labels.push('default-on capability');
    }

    return labels;
}

function getCapabilityViolations(
    repoId: string | undefined,
    layerPath: string,
    compliance: GovernanceComplianceResult | undefined,
): GovernanceViolation[] {
    if (!compliance) {
        return [];
    }

    return compliance.violations.filter((violation) =>
        matchesCapabilityRef(repoId, layerPath, violation.repoId, violation.path),
    );
}

function countGovernedCapabilitiesForRepo(
    repoId: string | undefined,
    contract: GovernanceContract | undefined,
): number {
    if (!contract) {
        return 0;
    }

    const normalizedRepoId = normalizeRepoId(repoId);
    const keys = new Set<string>();
    for (const ref of contract.requiredCapabilities ?? []) {
        if (normalizeRepoId(ref.repoId) === normalizedRepoId) {
            keys.add(`${normalizedRepoId}::${normalizeCapabilityPath(ref.path)}`);
        }
    }
    for (const ref of contract.defaultOnCapabilities ?? []) {
        if (normalizeRepoId(ref.repoId) === normalizedRepoId) {
            keys.add(`${normalizedRepoId}::${normalizeCapabilityPath(ref.path)}`);
        }
    }

    return keys.size;
}

export function buildProfileGovernanceProjection(
    profileId: string,
    isActive: boolean,
    state: GovernanceUiState,
): ProfileGovernanceProjection {
    const compliance = state.governanceCompliance;
    const isLocked = compliance?.lockedProfiles.includes(profileId) ?? false;
    const descriptionFlags: string[] = [];
    const tooltipLines: string[] = [];

    if (isLocked) {
        descriptionFlags.push('governance locked');
    }

    if (isActive && compliance?.status === 'non-compliant') {
        descriptionFlags.push('governance non-compliant');
    }

    if (isActive) {
        const summary = buildGovernanceStatusSummary(state);
        if (summary) {
            tooltipLines.push(summary);
        }
        tooltipLines.push(...buildGovernanceStateDetailLines(state));
    } else if (isLocked && compliance?.lockedProfiles.length) {
        tooltipLines.push(`Governance Locked Profiles: ${compliance.lockedProfiles.join(', ')}`);
    }

    const iconId =
        isActive && compliance?.status === 'non-compliant'
            ? compliance.severity === 'error'
                ? 'error'
                : 'warning'
            : isLocked
              ? 'lock-small'
              : undefined;

    return {
        descriptionFlags,
        tooltipLines,
        iconId,
    };
}

export function buildRepoGovernanceProjection(
    repoId: string | undefined,
    state: GovernanceUiState,
): RepoGovernanceProjection {
    const contractErrors = state.governanceContractErrors ?? [];
    if (contractErrors.length > 0) {
        return {
            descriptionQualifiers: [],
            tooltipLines: [],
        };
    }

    const compliance = state.governanceCompliance;
    const repoViolations = (compliance?.violations ?? []).filter(
        (violation) => normalizeRepoId(violation.repoId) === normalizeRepoId(repoId),
    );

    if (repoViolations.length > 0) {
        return {
            descriptionQualifiers: [
                `governance ${repoViolations.length} violation${repoViolations.length === 1 ? '' : 's'}`,
            ],
            tooltipLines: [
                `Governance: non-compliant (severity: ${compliance?.severity ?? 'warn'})`,
                `Governance Violations: ${repoViolations.length}`,
                ...repoViolations.map(formatViolation),
            ],
        };
    }

    const governedCount = countGovernedCapabilitiesForRepo(repoId, state.governanceContract);
    if (governedCount > 0) {
        return {
            descriptionQualifiers: ['governed'],
            tooltipLines: [`Governed capabilities: ${governedCount}`],
        };
    }

    return {
        descriptionQualifiers: [],
        tooltipLines: [],
    };
}

export function buildCapabilityGovernanceProjection(
    repoId: string | undefined,
    layerPath: string,
    state: GovernanceUiState,
): CapabilityGovernanceProjection {
    const contractErrors = state.governanceContractErrors ?? [];
    if (contractErrors.length > 0) {
        return {
            descriptionFlags: [],
            detailLines: [],
            isGoverned: false,
            hasViolations: false,
        };
    }

    const ruleLabels = getCapabilityRuleLabels(repoId, layerPath, state.governanceContract);
    const violations = getCapabilityViolations(repoId, layerPath, state.governanceCompliance);

    if (violations.length > 0) {
        return {
            descriptionFlags: ['governance non-compliant'],
            summary: `Governance: non-compliant (severity: ${state.governanceCompliance?.severity ?? state.governanceContract?.severity ?? 'warn'})`,
            detailLines: [
                ...ruleLabels.map((label) => `Governance Rule: ${label}`),
                `Governance Violations: ${violations.length}`,
                ...violations.map(formatViolation),
            ],
            variant:
                state.governanceCompliance?.severity === 'error' ? 'error' : 'warning',
            isGoverned: true,
            hasViolations: true,
        };
    }

    if (ruleLabels.length > 0) {
        return {
            descriptionFlags: ['governed'],
            summary: `Governance: compliant (severity: ${state.governanceCompliance?.severity ?? state.governanceContract?.severity ?? 'warn'})`,
            detailLines: ruleLabels.map((label) => `Governance Rule: ${label}`),
            variant: 'info',
            isGoverned: true,
            hasViolations: false,
        };
    }

    return {
        descriptionFlags: [],
        detailLines: [],
        isGoverned: false,
        hasViolations: false,
    };
}

export function buildConfigGovernanceWarnings(state: GovernanceUiState): string[] {
    const summary = buildGovernanceStatusSummary(state);
    if (!summary) {
        return [];
    }

    if ((state.governanceContractErrors ?? []).length > 0) {
        return [summary];
    }

    if (
        state.governanceCompliance?.status === 'non-compliant' &&
        state.governanceCompliance.violations.some((violation) => !violation.repoId)
    ) {
        return [summary];
    }

    return [];
}