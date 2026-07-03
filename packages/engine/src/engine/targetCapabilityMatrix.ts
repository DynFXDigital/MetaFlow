import {
    ProjectionTarget,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportReference,
    TargetCapabilitySupportStatus,
} from './types';

type MatrixSeed = Omit<TargetCapabilityMatrixEntry, 'adapterVersion' | 'documentation' | 'target'> & {
    documentation?: string;
};

const CODEX_ADAPTER_VERSION = 'codex-v0.1';
const GITHUB_COPILOT_ADAPTER_VERSION = 'github-copilot-v0.1';

export interface CodexSupportBoundariesDocument {
    generatedBy: string;
    runtimeOnlyCount: number;
    fileBackedRows: TargetCapabilityMatrixEntry[];
    runtimeOnlyRows: TargetCapabilityMatrixEntry[];
    notAchievableByRepositoryProjection: string[];
    runtimeEvidenceExpected: string[];
    relatedGuides: string[];
    content: string;
}

function row(
    concept: MatrixSeed['concept'],
    support: TargetCapabilitySupportStatus,
    nativeSurfaces: string[],
    notes: string[],
    authorityImplications: string[] = [],
    evidence: string[] = [],
    documentation?: string,
): MatrixSeed {
    return {
        concept,
        support,
        nativeSurfaces,
        notes,
        authorityImplications,
        evidence,
        ...(documentation ? { documentation } : {}),
    };
}

const CODEX_MATRIX: MatrixSeed[] = [
    row(
        'instructions',
        'supported',
        [
            '.metaflow/instructions/*.json',
            '.metaflow/instructions/*.md',
            'AGENTS.md',
            'AGENTS.override.md',
        ],
        [
            'Canonical MetaFlow instruction files project to shared instruction artifacts.',
            'Root project instructions materialize as guarded repository-root Codex files.',
        ],
        [],
        ['RUN-023'],
    ),
    row(
        'prompts',
        'partial',
        ['.metaflow/prompts/*.json', '.metaflow/prompts/*.md', 'prompts/*.md'],
        [
            'Canonical MetaFlow prompt files project to shared prompt artifacts.',
            'Codex does not expose a direct repository prompt-file surface equivalent to GitHub Copilot prompts.',
        ],
        [],
        ['RUN-052'],
    ),
    row(
        'skills',
        'supported',
        [
            '.metaflow/skills/<skill-id>/skill.json',
            '.metaflow/skills/<skill-id>/SKILL.md',
            '.agents/skills/<skill-id>/SKILL.md',
        ],
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
            'Codex loads project-scoped custom agents as subagent configuration layers, but installed Codex CLI 0.142.3 does not expose a non-interactive custom-agent activation flag or debug prompt-input proof for repo-local agent TOML.',
        ],
        ['Agent files can imply tool or model authority and require policy review.'],
        ['RUN-024', 'RUN-042', 'RUN-055'],
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
            'Codex supports MCP at runtime through CLI and IDE shared project or user config.',
            'Canonical MetaFlow stdio and Streamable HTTP MCP server metadata projects to Codex project config according to target adapter materialization gates.',
            'Canonical project config and supported MCP sections share one Codex project config file when each concept is managed by the target adapter.',
            'Projected MCP options include command arguments, literal environment, forwarded environment variables, working directory, bearer-token environment mapping, HTTP headers, OAuth scopes and resource, timeouts, enablement, requirement flags, tool allow and deny lists, and tool approval modes.',
            'Side-effecting MCP tools, OAuth login, remote stdio, Streamable HTTP reachability, and agent-phase network access remain runtime concerns that require harness-native evidence.',
        ],
        [
            'MCP servers require explicit tool, secret, approval, OAuth callback, and network authority review.',
        ],
        ['RUN-033', 'RUN-045', 'RUN-046', 'RUN-047', 'RUN-048', 'RUN-050', 'RUN-052'],
    ),
    row(
        'tools',
        'partial',
        ['.metaflow/tools/*.json', 'Codex MCP tools', 'local commands', 'HTTP tools'],
        [
            'Canonical tool metadata is parsed and reported for adapter review.',
            'MetaFlow tool manifests describe callable surfaces and policy requirements but do not grant Codex runtime tool access.',
            'Command, MCP, HTTP, and manual tools remain operational only when the target harness has matching configured authority.',
        ],
        [
            'Tool use requires explicit command, MCP, network, secret, approval, and sandbox authority review.',
        ],
        ['RUN-052'],
        'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
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
        ['.metaflow/packages/*.json', '.codex-plugin/plugin.json', '.agents/plugins/marketplace.json'],
        [
            'Codex plugin manifests and local marketplace entries are generated separately from Copilot plugin metadata.',
        ],
        ['Third-party plugin packages must be treated as trusted code.'],
        ['RUN-025', 'RUN-026', 'RUN-027'],
        'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
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
            'Codex cloud environments use hosted containers, setup scripts, environment variables, secret handling, and agent internet-access controls outside repository metadata projection.',
        ],
        [
            'Execution surface selection changes filesystem, network, credential, and approval boundaries.',
        ],
        ['RUN-035', 'RUN-052'],
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
        ['Codex CLI', 'Codex IDE extension', 'Codex app', 'Codex Cloud'],
        [
            'Local to cloud handoff is a Codex runtime workflow and is not represented by generated MetaFlow files.',
            'CLI, IDE extension, and Codex app share local configuration layers, but cloud delegation depends on configured cloud environments and account/workspace access.',
        ],
        ['Cloud delegation changes data residency, credential, and audit boundaries.'],
        ['RUN-052'],
    ),
    row(
        'issuePrOperation',
        'runtime-only',
        ['Codex review', 'Codex GitHub integration', 'Codex Slack integration', 'Codex Linear integration', 'Codex Cloud task workflows'],
        [
            'Issue, PR, and review operation depends on Codex runtime integrations rather than static repository metadata.',
            'GitHub review, Slack, and Linear flows require configured connectors, repository environments, and user or workspace authorization outside MetaFlow projection.',
        ],
        ['Repository write, review, and CI authority require explicit policy.'],
        ['RUN-052'],
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
        [
            '.metaflow/instructions/*.json',
            '.metaflow/instructions/*.md',
            '.github/instructions/**',
            '.github/copilot-instructions.md',
        ],
        [
            'Canonical MetaFlow instruction files project to Copilot-compatible instruction artifacts.',
            'Copilot instruction metadata is supported through existing plugin/settings and synchronized-file flows.',
        ],
        [],
        ['RUN-022'],
    ),
    row(
        'prompts',
        'supported',
        [
            '.metaflow/prompts/*.json',
            '.metaflow/prompts/*.md',
            'prompts/*.md',
            '.github/prompts/**',
        ],
        ['Canonical MetaFlow prompt files project to Copilot-compatible prompt artifacts.'],
        [],
        ['RUN-022'],
    ),
    row(
        'skills',
        'supported',
        [
            '.metaflow/skills/<skill-id>/skill.json',
            '.metaflow/skills/<skill-id>/SKILL.md',
            'skills/<skill-id>/SKILL.md',
            '.github/skills/**',
        ],
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
            'MetaFlow reports a reviewable `.vscode/mcp.json` handoff candidate for supported canonical MCP servers and leaves application to the operator.',
            'Canonical MCP server metadata referenced by canonical agent profiles projects into GitHub Copilot custom-agent frontmatter.',
        ],
        ['MCP servers require explicit tool, secret, and network authority review.'],
        ['RUN-033', 'RUN-051'],
    ),
    row(
        'tools',
        'partial',
        ['.metaflow/tools/*.json', 'GitHub Copilot MCP tools', 'local commands', 'HTTP tools'],
        [
            'Canonical tool metadata is parsed and reported for adapter review.',
            'MetaFlow tool manifests describe callable surfaces and policy requirements but do not grant GitHub Copilot runtime tool access.',
            'Command, MCP, HTTP, and manual tools remain operational only when the target harness has matching configured authority.',
        ],
        ['Tool use requires explicit command, MCP, network, secret, and approval authority review.'],
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
        ['.metaflow/packages/*.json', 'plugin.json', '.github/plugin/marketplace.json'],
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

const MATRIX_BY_TARGET: Record<
    string,
    { adapterVersion: string; documentation: string; rows: MatrixSeed[] }
> = {
    codex: {
        adapterVersion: CODEX_ADAPTER_VERSION,
        documentation: 'docs/CODEX-SUPPORT.md',
        rows: CODEX_MATRIX,
    },
    'github-copilot': {
        adapterVersion: GITHUB_COPILOT_ADAPTER_VERSION,
        documentation: 'README.md',
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
                documentation: entry.documentation ?? matrix.documentation,
                ...entry,
            })),
        );
    }
    return entries;
}

export function buildTargetCapabilitySupportReference(
    entries: TargetCapabilityMatrixEntry[],
): TargetCapabilitySupportReference | undefined {
    const runtimeOnlyRows = entries.filter((entry) => entry.support === 'runtime-only');
    if (runtimeOnlyRows.length === 0) {
        return undefined;
    }

    const referencesByTarget = new Map<string, { count: number; documentation: string }>();
    for (const entry of runtimeOnlyRows) {
        const existing = referencesByTarget.get(entry.target);
        referencesByTarget.set(entry.target, {
            count: (existing?.count ?? 0) + 1,
            documentation: existing?.documentation ?? entry.documentation,
        });
    }

    return {
        runtimeOnlyCount: runtimeOnlyRows.length,
        targets: Array.from(referencesByTarget.entries())
            .sort((left, right) =>
                left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
            )
            .map(([target, reference]) => ({
                target,
                runtimeOnlyCount: reference.count,
                documentation: reference.documentation,
        })),
    };
}

export function buildCodexSupportBoundariesDocument(options?: {
    generatedBy?: string;
}): CodexSupportBoundariesDocument {
    const generatedBy = options?.generatedBy ?? 'metaflow codex-support-boundaries';
    const codexRows = getTargetCapabilityMatrix(['codex']).sort((left, right) =>
        left.concept.localeCompare(right.concept, undefined, { sensitivity: 'base' }),
    );
    const runtimeOnlyRows = codexRows.filter((entry) => entry.support === 'runtime-only');
    const supportedRows = codexRows.filter((entry) => entry.support !== 'runtime-only');
    const relatedGuides = [
        'docs/CODEX-SUPPORT.md',
        'docs/CODEX-OPERATOR-WALKTHROUGH.md',
        'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
        'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
    ];
    const notAchievableByRepositoryProjection = [
        'Creating or approving ChatGPT workspace connectors.',
        'Installing Slack, Linear, GitHub, or other Codex-connected apps in a workspace.',
        'Creating Codex Cloud environments or setting cloud task secrets.',
        'Authenticating GitHub CLI, Codex, Slack, Linear, MCP OAuth, or marketplace plugin installs.',
        'Granting shell, browser, network, credential, memory, or external-service authority from package metadata alone.',
        'Proving hosted Codex Cloud, channel delegation, GitHub review, PR feedback, or remote MCP behavior without a harness-native run.',
    ];
    const runtimeEvidenceExpected = [
        'Local file discovery: Codex CLI, IDE extension, or app smoke evidence against the generated workspace.',
        'Cloud or channel delegation: hosted task or connector evidence showing environment, repository, result, and limitations.',
        'MCP runtime: startup, login where applicable, tool listing, tool approval behavior, and one target tool call in the intended environment.',
        'Package marketplace readiness: reviewable candidate output, policy grants, runtime validation records, and operator acceptance.',
    ];
    const lines: string[] = [
        '# Codex Support Boundaries',
        '',
        `Generated by \`${generatedBy}\`.`,
        '',
        'MetaFlow projects file-backed Codex surfaces and reports harness-owned runtime surfaces. Repository metadata does not create hosted environments, connect external accounts, grant credentials, or prove side-effecting tool behavior.',
        '',
        '## File-Backed and Reviewable Surfaces',
        '',
        '| Concept | Support | Native surfaces |',
        '| --- | --- | --- |',
    ];

    for (const row of supportedRows) {
        lines.push(
            `| ${row.concept} | ${row.support} | ${row.nativeSurfaces.join('<br>')} |`,
        );
    }

    lines.push(
        '',
        '## Runtime-Only Codex Surfaces',
        '',
        '| Concept | Native surfaces | Boundary |',
        '| --- | --- | --- |',
    );

    for (const row of runtimeOnlyRows) {
        lines.push(
            `| ${row.concept} | ${row.nativeSurfaces.join('<br>')} | ${row.notes.join(' ')} |`,
        );
    }

    lines.push(
        '',
        '## Not Achievable By Repository Projection Alone',
        '',
        ...notAchievableByRepositoryProjection.map((item) => `- ${item}`),
        '',
        '## Runtime Evidence Expected',
        '',
        ...runtimeEvidenceExpected.map((item) => `- ${item}`),
        '',
        '## Related Operator Guides',
        '',
        ...relatedGuides.map((guide) => `- ${guide}`),
        '',
    );

    return {
        generatedBy,
        runtimeOnlyCount: runtimeOnlyRows.length,
        fileBackedRows: supportedRows,
        runtimeOnlyRows,
        notAchievableByRepositoryProjection,
        runtimeEvidenceExpected,
        relatedGuides,
        content: `${lines.join('\n')}\n`,
    };
}
