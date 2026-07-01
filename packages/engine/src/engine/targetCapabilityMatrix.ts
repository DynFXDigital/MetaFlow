import {
    ProjectionTarget,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportStatus,
} from './types';

type MatrixSeed = Omit<TargetCapabilityMatrixEntry, 'adapterVersion' | 'target'>;

const CODEX_ADAPTER_VERSION = 'codex-v0.1';
const GITHUB_COPILOT_ADAPTER_VERSION = 'github-copilot-v0.1';

function row(
    concept: MatrixSeed['concept'],
    support: TargetCapabilitySupportStatus,
    nativeSurfaces: string[],
    notes: string[],
    authorityImplications: string[] = [],
    evidence: string[] = [],
): MatrixSeed {
    return {
        concept,
        support,
        nativeSurfaces,
        notes,
        authorityImplications,
        evidence,
    };
}

const CODEX_MATRIX: MatrixSeed[] = [
    row(
        'instructions',
        'supported',
        ['AGENTS.md', 'AGENTS.override.md'],
        ['Root project instructions materialize as guarded repository-root Codex files.'],
        [],
        ['RUN-023'],
    ),
    row(
        'skills',
        'supported',
        ['.agents/skills/<skill-id>/SKILL.md'],
        [
            'Canonical MetaFlow skills project to Codex repository skills without known semantic loss.',
        ],
        [],
        ['RUN-028', 'RUN-029', 'RUN-030'],
    ),
    row(
        'agents',
        'partial',
        ['.codex/agents/*.toml'],
        [
            'Target-native Codex agent files are materialized safely when authored.',
            'Canonical MetaFlow agent profiles project to Codex custom-agent TOML according to target adapter materialization gates.',
        ],
        ['Agent files can imply tool or model authority and require policy review.'],
        ['RUN-024', 'RUN-042'],
    ),
    row(
        'projectConfig',
        'partial',
        ['.codex/config.toml', '.metaflow/project-config/*.json'],
        [
            'Canonical MetaFlow Codex project configs project to Codex TOML according to target adapter materialization gates.',
            'Codex project configs are loaded by Codex only in trusted projects and cannot override provider, profile, notification, or telemetry keys.',
        ],
        [
            'Project configuration can alter sandbox, approval, hooks, MCP, model, and search behavior and requires explicit review.',
        ],
        ['RUN-024', 'RUN-043'],
    ),
    row(
        'mcpServers',
        'partial',
        ['.metaflow/mcp/*.json', 'Codex MCP configuration and runtime MCP server registry'],
        [
            'Canonical MCP server metadata is parsed and reported for adapter review.',
            'Codex supports MCP at runtime through project config and user config.',
            'Canonical MetaFlow stdio and Streamable HTTP MCP server metadata projects to Codex project config according to target adapter materialization gates.',
            'Canonical project config and supported MCP sections share one Codex project config file when each concept is managed by the target adapter.',
            'Projected MCP options include command arguments, literal environment, forwarded environment variables, working directory, bearer-token environment mapping, HTTP headers, OAuth scopes and resource, timeouts, enablement, requirement flags, tool allow and deny lists, and tool approval modes.',
        ],
        ['MCP servers require explicit tool, secret, and network authority review.'],
        ['RUN-033', 'RUN-045', 'RUN-046', 'RUN-047', 'RUN-048', 'RUN-050'],
    ),
    row(
        'hooks',
        'partial',
        ['.metaflow/hooks/*.json', '.codex/hooks.json'],
        [
            'Canonical hook metadata is parsed and reported for adapter review.',
            'Target-native Codex hook policy files are materialized safely when authored.',
            'Supported canonical MetaFlow command lifecycle hooks project to Codex hook JSON according to target adapter materialization gates.',
            'Unsupported canonical hook forms remain report-only adapter metadata.',
        ],
        ['Hooks execute code or commands and require explicit trust and sandbox review.'],
        ['RUN-024', 'RUN-034', 'RUN-044', 'RUN-049'],
    ),
    row(
        'packageManifests',
        'supported',
        ['.codex-plugin/plugin.json', '.agents/plugins/marketplace.json'],
        [
            'Codex plugin manifests and local marketplace entries are generated separately from Copilot plugin metadata.',
        ],
        ['Third-party plugin packages must be treated as trusted code.'],
        ['RUN-025', 'RUN-026', 'RUN-027'],
    ),
    row(
        'policyGrants',
        'partial',
        ['.metaflow/policies/*.json'],
        [
            'Canonical policy grant metadata is parsed and reported for adapter review.',
            'Policy grants do not directly grant Codex runtime authority.',
        ],
        ['Authority-sensitive projections remain guarded until explicit harness adapters exist.'],
        ['RUN-032'],
    ),
    row(
        'executionSurfaces',
        'partial',
        ['.metaflow/execution/*.json', 'local Codex CLI', 'Codex Cloud'],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Codex execution surface selection remains a runtime workflow until explicit projection adapters exist.',
        ],
        [
            'Execution surface selection changes filesystem, network, credential, and approval boundaries.',
        ],
        ['RUN-035'],
    ),
    row(
        'memoryScopes',
        'partial',
        ['.metaflow/memory/*.json'],
        [
            'Canonical memory scope metadata is parsed and reported for adapter review.',
            'Codex memory behavior remains a runtime workflow until explicit projection adapters exist.',
        ],
        ['Persistent memory requires explicit authorization and retention policy.'],
        ['RUN-036'],
    ),
    row(
        'localCloudHandoff',
        'runtime-only',
        ['Codex CLI', 'Codex Cloud'],
        [
            'Local to cloud handoff is a Codex runtime workflow and is not represented by generated MetaFlow files.',
        ],
        ['Cloud delegation changes data residency, credential, and audit boundaries.'],
    ),
    row(
        'issuePrOperation',
        'runtime-only',
        ['Codex review', 'Codex Cloud task workflows'],
        [
            'Issue, PR, and review operation depends on Codex runtime integrations rather than static repository metadata.',
        ],
        ['Repository write, review, and CI authority require explicit policy.'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'Codex CLI smoke runs'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Codex evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-027', 'RUN-030', 'RUN-037'],
    ),
];

const GITHUB_COPILOT_MATRIX: MatrixSeed[] = [
    row(
        'instructions',
        'supported',
        ['.github/instructions/**', '.github/copilot-instructions.md'],
        [
            'Copilot instruction metadata is supported through existing plugin/settings and synchronized-file flows.',
        ],
        [],
        ['RUN-022'],
    ),
    row(
        'skills',
        'supported',
        ['skills/<skill-id>/SKILL.md', '.github/skills/**'],
        ['Canonical MetaFlow skills project to Copilot skill packaging paths.'],
        [],
        ['RUN-028', 'RUN-029'],
    ),
    row(
        'agents',
        'supported',
        ['.github/agents/*.agent.md', 'agents/*.agent.md'],
        [
            'Copilot agent metadata participates in existing plugin-mode classification and packaging.',
            'Canonical MetaFlow agent profiles project to GitHub Copilot custom-agent Markdown profiles with optional agent-local MCP server frontmatter.',
        ],
        ['Agents can imply tool or repository authority and require policy review.'],
        ['RUN-022', 'RUN-051'],
    ),
    row(
        'projectConfig',
        'unsupported',
        [],
        [
            'Codex project config is target-specific.',
            'GitHub Copilot uses separate host settings and agent-plugin surfaces instead of Codex project TOML.',
        ],
        ['Project configuration authority must be represented through the target harness controls.'],
    ),
    row(
        'mcpServers',
        'partial',
        ['.metaflow/mcp/*.json', 'GitHub Copilot repository MCP settings', '.github/agents/*.agent.md'],
        [
            'Canonical MCP server metadata is parsed and reported for adapter review.',
            'Copilot repository-wide MCP configuration remains a GitHub settings operation.',
            'Canonical MCP server metadata referenced by canonical agent profiles projects into GitHub Copilot custom-agent frontmatter.',
        ],
        ['MCP servers require explicit tool, secret, and network authority review.'],
        ['RUN-033', 'RUN-051'],
    ),
    row(
        'hooks',
        'partial',
        ['.metaflow/hooks/*.json', 'hooks/**', 'chat.hookFilesLocations'],
        [
            'Canonical hook metadata is parsed and reported for adapter review.',
            'Hook files can be surfaced through existing settings injection, but canonical hook projection is not implemented.',
        ],
        ['Hooks execute code or commands and require explicit trust and sandbox review.'],
        ['RUN-034'],
    ),
    row(
        'packageManifests',
        'supported',
        ['plugin.json', '.github/plugin/marketplace.json'],
        [
            'Copilot agent-plugin manifests and marketplace generation remain separate from Codex plugin metadata.',
        ],
        ['Third-party plugin packages must be treated as trusted code.'],
        ['RUN-025', 'RUN-026'],
    ),
    row(
        'policyGrants',
        'partial',
        ['.metaflow/policies/*.json'],
        [
            'Canonical policy grant metadata is parsed and reported for adapter review.',
            'Policy grants do not directly grant GitHub Copilot runtime authority.',
        ],
        ['Authority-sensitive projections remain guarded until explicit harness adapters exist.'],
        ['RUN-032'],
    ),
    row(
        'executionSurfaces',
        'partial',
        ['.metaflow/execution/*.json', 'GitHub Copilot host runtime', 'GitHub cloud agent workflows'],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Copilot and GitHub execution surface selection remains a runtime workflow until explicit projection adapters exist.',
        ],
        ['Execution surface selection changes repository, organization, and CI authority.'],
        ['RUN-035'],
    ),
    row(
        'memoryScopes',
        'partial',
        ['.metaflow/memory/*.json'],
        [
            'Canonical memory scope metadata is parsed and reported for adapter review.',
            'Copilot memory behavior remains a runtime workflow until explicit projection adapters exist.',
        ],
        ['Persistent memory requires explicit authorization and retention policy.'],
        ['RUN-036'],
    ),
    row(
        'localCloudHandoff',
        'runtime-only',
        ['GitHub Copilot host runtime', 'GitHub Agent HQ'],
        [
            'Local to cloud handoff is a Copilot/GitHub runtime workflow and is not represented by generated MetaFlow files.',
        ],
        ['Cloud delegation changes repository, organization, credential, and audit boundaries.'],
    ),
    row(
        'issuePrOperation',
        'runtime-only',
        ['GitHub issues', 'GitHub pull requests', 'GitHub Agent HQ'],
        [
            'Issue and PR operation depends on GitHub runtime integrations rather than static repository metadata.',
        ],
        ['Repository write, review, and CI authority require explicit policy.'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'extension integration tests'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Copilot and GitHub evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-026', 'RUN-037'],
    ),
];

const MATRIX_BY_TARGET: Record<string, { adapterVersion: string; rows: MatrixSeed[] }> = {
    codex: { adapterVersion: CODEX_ADAPTER_VERSION, rows: CODEX_MATRIX },
    'github-copilot': {
        adapterVersion: GITHUB_COPILOT_ADAPTER_VERSION,
        rows: GITHUB_COPILOT_MATRIX,
    },
};

export function getTargetCapabilityMatrix(
    targets: ProjectionTarget[] = ['codex', 'github-copilot'],
): TargetCapabilityMatrixEntry[] {
    const targetSet = new Set(targets);
    const entries: TargetCapabilityMatrixEntry[] = [];
    for (const target of ['codex', 'github-copilot'] as const) {
        if (!targetSet.has(target)) {
            continue;
        }
        const matrix = MATRIX_BY_TARGET[target];
        entries.push(
            ...matrix.rows.map((entry) => ({
                target,
                adapterVersion: matrix.adapterVersion,
                ...entry,
            })),
        );
    }
    return entries;
}
