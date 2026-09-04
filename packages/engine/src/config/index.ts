export { loadConfig, loadConfigFromPath, parseAndValidate, validateConfig } from './configLoader';
export {
    persistCurrentCompatibilityConfig,
    persistCompatibilityV4Config,
    withRootSynchronizationAuthorization,
    withReadOnlyRootSynchronizationAuthorization,
    isRootSynchronizationAuthorizationActive,
} from './configMigration';
export {
    loadGovernanceContract,
    loadGovernanceContractFromPath,
    parseAndValidateGovernanceContract,
    validateGovernanceContract,
} from './governanceContract';
export { evaluateGovernanceCompliance } from './governanceCompliance';
export {
    discoverConfigPath,
    discoverGovernanceContractPath,
    normalizeInputPath,
    resolvePathFromWorkspace,
    isWithinBoundary,
} from './configPathUtils';
export {
    CURRENT_CONFIG_COMPATIBILITY_VERSION,
    DEFAULT_AGENT_PLUGIN_DISPOSITION,
    isPiTargetEnabled,
    normalizeConfigShape,
    prefersAgentPluginsStandard,
    resolveAgentPluginDisposition,
    toAuthoredConfig,
} from './configNormalization';
export type {
    MetaFlowConfig,
    MetadataRepo,
    NamedMetadataRepo,
    CapabilitySource,
    LayerSource,
    ProfileConfig,
    ProfileLayerOverride,
    InjectionMode,
    InjectionConfig,
    SyncFileNamingStrategy,
    SettingsInjectionTarget,
    HooksConfig,
    SynchronizationConfig,
    PiTargetConfig,
    MetaFlowTargetsConfig,
    AgentPluginDisposition,
    AgentPluginStandardVersion,
    AgentPluginsConfig,
    ConfigError,
    ConfigLoadResult,
} from './configSchema';
export type { RootSynchronizationAuthorization } from './configMigration';
export type {
    GovernanceCapabilityRef,
    GovernanceContract,
    GovernanceContractLoadResult,
    GovernanceSeverity,
} from './governanceContract';
export type {
    GovernanceComplianceResult,
    GovernanceComplianceStatus,
    GovernanceViolation,
    GovernanceViolationCode,
    GovernanceViolationRule,
    GovernanceCapabilityObservedState,
} from './governanceCompliance';
