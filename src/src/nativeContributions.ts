import {
    BUILT_IN_CAPABILITY_LAYER_PATH,
    BuiltInCapabilityRuntimeState,
    isBuiltInCapabilityEnabled,
    normalizeBuiltInLayerPath,
    resolveBuiltInLayerEnabled,
} from './builtInCapability';

export const METAFLOW_NATIVE_CONTEXT_KEYS = {
    enabled: 'metaflow.builtIn.enabled',
    metaflow: 'metaflow.builtIn.layers.metaflow',
    githubCopilotMetadataAuthoring: 'metaflow.builtIn.layers.githubCopilotMetadataAuthoring',
    claudeCodeMetadataAuthoring: 'metaflow.builtIn.layers.claudeCodeMetadataAuthoring',
    codexMetadataAuthoring: 'metaflow.builtIn.layers.codexMetadataAuthoring',
} as const;

export const BUILT_IN_GITHUB_COPILOT_METADATA_AUTHORING_LAYER =
    'capabilities/metadata-authoring/github-copilot-metadata-authoring';
export const BUILT_IN_CLAUDE_CODE_METADATA_AUTHORING_LAYER =
    'capabilities/metadata-authoring/claude-code-metadata-authoring';
export const BUILT_IN_CODEX_METADATA_AUTHORING_LAYER =
    'capabilities/metadata-authoring/codex-metadata-authoring';

export type NativeContributionContextValues = Record<string, boolean>;

/**
 * Project built-in capability state into VS Code contribution `when` keys.
 * The manifest remains static; these keys control which native entries are
 * currently offered by VS Code/Copilot.
 */
export function buildNativeContributionContextValues(
    state: BuiltInCapabilityRuntimeState,
): NativeContributionContextValues {
    const enabled = isBuiltInCapabilityEnabled(state);
    const layerEnabled = (layerPath: string): boolean =>
        enabled &&
        resolveBuiltInLayerEnabled(state, normalizeBuiltInLayerPath(layerPath));

    return {
        [METAFLOW_NATIVE_CONTEXT_KEYS.enabled]: enabled,
        [METAFLOW_NATIVE_CONTEXT_KEYS.metaflow]: layerEnabled(BUILT_IN_CAPABILITY_LAYER_PATH),
        [METAFLOW_NATIVE_CONTEXT_KEYS.githubCopilotMetadataAuthoring]: layerEnabled(
            BUILT_IN_GITHUB_COPILOT_METADATA_AUTHORING_LAYER,
        ),
        [METAFLOW_NATIVE_CONTEXT_KEYS.claudeCodeMetadataAuthoring]: layerEnabled(
            BUILT_IN_CLAUDE_CODE_METADATA_AUTHORING_LAYER,
        ),
        [METAFLOW_NATIVE_CONTEXT_KEYS.codexMetadataAuthoring]: layerEnabled(
            BUILT_IN_CODEX_METADATA_AUTHORING_LAYER,
        ),
    };
}

export interface NativeContributionDescriptor {
    kind: string;
    name: string;
    detail: string;
}

/**
 * Native VS Code registrations projected from the built-in MetaFlow capability.
 *
 * Keep MetaFlow's repository/capability metadata as the source of truth. This list is
 * the user-facing bridge that explains which native Chat surfaces are available
 * for the built-in capability.
 */
export const METAFLOW_NATIVE_CONTRIBUTIONS: readonly NativeContributionDescriptor[] = [
    {
        kind: 'Chat participant',
        name: '@metaflow',
        detail: 'Native MetaFlow assistant with review, author, and diagnose commands.',
    },
    {
        kind: 'Participant commands',
        name: '/review · /author · /diagnose',
        detail: 'Focused workflows available after invoking @metaflow.',
    },
    {
        kind: 'Custom agents',
        name: 'Metadata stewards',
        detail: 'MetaFlow, Copilot, Claude Code, and Codex metadata-authoring agents.',
    },
    {
        kind: 'Agent Skills',
        name: 'Metadata and reconciliation skills',
        detail: 'Review, authoring, linked-metadata reconciliation, and platform guidance.',
    },
    {
        kind: 'Prompt files',
        name: 'Review and authoring prompts',
        detail: 'Reusable slash-command prompts for review, reconciliation, and scaffolding.',
    },
    {
        kind: 'Instructions',
        name: 'MetaFlow guardrails',
        detail: 'Capability contracts, configuration, prompt-injection defense, and plugin guidance.',
    },
    {
        kind: 'Language model tools',
        name: '#metaflowDiagnostics',
        detail: 'Native diagnostics access for warnings, governance, and remediation hints.',
    },
];
