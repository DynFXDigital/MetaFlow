import { normalizeInputPath } from './configPathUtils';
import { CapabilitySource, LayerSource, MetaFlowConfig } from './configSchema';
import { GovernanceCapabilityRef, GovernanceContract, GovernanceSeverity } from './governanceContract';

export type GovernanceComplianceStatus = 'not-applicable' | 'compliant' | 'non-compliant';

export type GovernanceViolationCode =
    | 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING'
    | 'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED'
    | 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED';

export type GovernanceViolationRule =
    | 'requiredCapabilities'
    | 'defaultOnCapabilities'
    | 'allowedProfiles';

export type GovernanceCapabilityObservedState =
    | 'active'
    | 'repo-missing'
    | 'repo-disabled'
    | 'capability-missing'
    | 'capability-disabled';

export interface GovernanceViolation {
    id: string;
    code: GovernanceViolationCode;
    rule: GovernanceViolationRule;
    severity: GovernanceSeverity;
    message: string;
    repoId?: string;
    path?: string;
    profileId?: string;
    observedState?: GovernanceCapabilityObservedState;
}

export interface GovernanceComplianceResult {
    status: GovernanceComplianceStatus;
    severity: GovernanceSeverity;
    activeProfile?: string;
    activeProfileLocked: boolean;
    allowedProfiles: string[];
    lockedProfiles: string[];
    violations: GovernanceViolation[];
}

function normalizeCapabilityPath(pathValue: string): string {
    const normalized = normalizeInputPath(pathValue).replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}

function buildCapabilityKey(repoId: string, capabilityPath: string): string {
    return `${repoId}::${normalizeCapabilityPath(capabilityPath)}`;
}

function sortUniqueStrings(values: string[] | undefined): string[] {
    return Array.from(new Set(values ?? [])).sort((left, right) => left.localeCompare(right));
}

function compareCapabilityRefs(left: GovernanceCapabilityRef, right: GovernanceCapabilityRef): number {
    const byRepo = left.repoId.localeCompare(right.repoId);
    if (byRepo !== 0) {
        return byRepo;
    }

    return normalizeCapabilityPath(left.path).localeCompare(normalizeCapabilityPath(right.path));
}

function collectLayerSources(config: MetaFlowConfig): LayerSource[] {
    if (config.layerSources && config.layerSources.length > 0) {
        return config.layerSources.map((layerSource) => ({
            ...layerSource,
            path: normalizeCapabilityPath(layerSource.path),
        }));
    }

    if (config.metadataRepos && config.metadataRepos.length > 0) {
        return config.metadataRepos.flatMap((repo) =>
            (repo.capabilities ?? []).map((capability: CapabilitySource) => ({
                repoId: repo.id,
                path: normalizeCapabilityPath(capability.path),
                ...(capability.enabled !== undefined ? { enabled: capability.enabled } : {}),
            })),
        );
    }

    if (config.metadataRepo && config.layers) {
        return config.layers.map((layerPath) => ({
            repoId: 'primary',
            path: normalizeCapabilityPath(layerPath),
            enabled: true,
        }));
    }

    return [];
}

function collectRepoEnabledState(config: MetaFlowConfig): Map<string, boolean> {
    const repoEnabledById = new Map<string, boolean>();

    if (config.metadataRepos && config.metadataRepos.length > 0) {
        for (const repo of config.metadataRepos) {
            repoEnabledById.set(repo.id, repo.enabled !== false);
        }
        return repoEnabledById;
    }

    if (config.metadataRepo) {
        repoEnabledById.set('primary', true);
    }

    return repoEnabledById;
}

function collectCapabilityEnabledState(config: MetaFlowConfig): Map<string, boolean> {
    const capabilityEnabledByKey = new Map<string, boolean>();

    for (const layerSource of collectLayerSources(config)) {
        const key = buildCapabilityKey(layerSource.repoId, layerSource.path);
        const nextEnabled = layerSource.enabled !== false;
        capabilityEnabledByKey.set(key, (capabilityEnabledByKey.get(key) ?? false) || nextEnabled);
    }

    return capabilityEnabledByKey;
}

function resolveObservedState(
    ref: GovernanceCapabilityRef,
    repoEnabledById: Map<string, boolean>,
    capabilityEnabledByKey: Map<string, boolean>,
): GovernanceCapabilityObservedState {
    const key = buildCapabilityKey(ref.repoId, ref.path);
    const repoPresent = repoEnabledById.has(ref.repoId);
    const repoEnabled = repoEnabledById.get(ref.repoId) ?? false;

    if (!repoPresent) {
        return 'repo-missing';
    }

    if (!repoEnabled) {
        return 'repo-disabled';
    }

    if (!capabilityEnabledByKey.has(key)) {
        return 'capability-missing';
    }

    if (!capabilityEnabledByKey.get(key)) {
        return 'capability-disabled';
    }

    return 'active';
}

function describeObservedState(state: GovernanceCapabilityObservedState): string {
    switch (state) {
        case 'repo-missing':
            return 'the metadata repository is not configured';
        case 'repo-disabled':
            return 'the metadata repository is disabled';
        case 'capability-missing':
            return 'the capability is not projected into the active runtime state';
        case 'capability-disabled':
            return 'the capability is disabled in the active runtime state';
        case 'active':
        default:
            return 'the capability is active';
    }
}

function buildCapabilityViolation(
    code: Extract<
        GovernanceViolationCode,
        'GOVERNANCE_REQUIRED_CAPABILITY_MISSING' | 'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED'
    >,
    rule: Extract<GovernanceViolationRule, 'requiredCapabilities' | 'defaultOnCapabilities'>,
    ref: GovernanceCapabilityRef,
    severity: GovernanceSeverity,
    observedState: GovernanceCapabilityObservedState,
): GovernanceViolation {
    const normalizedPath = normalizeCapabilityPath(ref.path);
    const label = `${ref.repoId}/${normalizedPath}`;
    const action =
        code === 'GOVERNANCE_REQUIRED_CAPABILITY_MISSING'
            ? 'Required capability'
            : 'Default-on capability';

    return {
        id: `${code}::${ref.repoId}::${normalizedPath}`,
        code,
        rule,
        severity,
        message: `${action} "${label}" is not active because ${describeObservedState(observedState)}.`,
        repoId: ref.repoId,
        path: normalizedPath,
        observedState,
    };
}

function buildAllowedProfileViolation(
    activeProfile: string | undefined,
    allowedProfiles: string[],
    severity: GovernanceSeverity,
): GovernanceViolation {
    const normalizedProfileId = activeProfile && activeProfile.trim().length > 0 ? activeProfile : '__none__';
    const allowedProfilesLabel = allowedProfiles.join(', ');
    const message = activeProfile
        ? `Active profile "${activeProfile}" is not allowed by governance. Allowed profiles: ${allowedProfilesLabel}.`
        : `No active profile is selected. Allowed profiles: ${allowedProfilesLabel}.`;

    return {
        id: `GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::${normalizedProfileId}`,
        code: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED',
        rule: 'allowedProfiles',
        severity,
        message,
        profileId: activeProfile,
    };
}

export function evaluateGovernanceCompliance(
    contract: GovernanceContract | undefined,
    config: MetaFlowConfig,
): GovernanceComplianceResult {
    const allowedProfiles = sortUniqueStrings(contract?.allowedProfiles);
    const lockedProfiles = sortUniqueStrings(contract?.lockedProfiles);
    const severity = contract?.severity ?? 'warn';
    const activeProfile = config.activeProfile;

    if (!contract) {
        return {
            status: 'not-applicable',
            severity,
            activeProfile,
            activeProfileLocked: false,
            allowedProfiles,
            lockedProfiles,
            violations: [],
        };
    }

    const repoEnabledById = collectRepoEnabledState(config);
    const capabilityEnabledByKey = collectCapabilityEnabledState(config);
    const violations: GovernanceViolation[] = [];

    for (const ref of [...(contract.requiredCapabilities ?? [])].sort(compareCapabilityRefs)) {
        const observedState = resolveObservedState(ref, repoEnabledById, capabilityEnabledByKey);
        if (observedState === 'active') {
            continue;
        }

        violations.push(
            buildCapabilityViolation(
                'GOVERNANCE_REQUIRED_CAPABILITY_MISSING',
                'requiredCapabilities',
                ref,
                severity,
                observedState,
            ),
        );
    }

    for (const ref of [...(contract.defaultOnCapabilities ?? [])].sort(compareCapabilityRefs)) {
        const observedState = resolveObservedState(ref, repoEnabledById, capabilityEnabledByKey);
        if (observedState === 'active') {
            continue;
        }

        violations.push(
            buildCapabilityViolation(
                'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED',
                'defaultOnCapabilities',
                ref,
                severity,
                observedState,
            ),
        );
    }

    if (allowedProfiles.length > 0 && (!activeProfile || !allowedProfiles.includes(activeProfile))) {
        violations.push(buildAllowedProfileViolation(activeProfile, allowedProfiles, severity));
    }

    violations.sort((left, right) => left.id.localeCompare(right.id));

    return {
        status: violations.length > 0 ? 'non-compliant' : 'compliant',
        severity,
        activeProfile,
        activeProfileLocked: Boolean(activeProfile && lockedProfiles.includes(activeProfile)),
        allowedProfiles,
        lockedProfiles,
        violations,
    };
}