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
        [
            '.metaflow/execution/*.json',
            'local Codex CLI',
            'Codex Cloud',
            'Codex issue/PR workflows',
            'Codex GitHub Action',
            'Codex app-server',
            'Codex SDK',
            'always-on workflow orchestrators',
        ],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Codex execution surface selection remains a runtime workflow until explicit projection adapters exist.',
            'Codex cloud environments use hosted containers, setup scripts, environment variables, secret handling, and agent internet-access controls outside repository metadata projection.',
            'Execution profiles can classify issue/PR-native, GitHub Action, app-server, SDK-embedded, and always-on workflow surfaces without provisioning those runtimes.',
        ],
        [
            'Execution surface selection changes filesystem, network, credential, and approval boundaries.',
        ],
        ['RUN-035', 'RUN-052', 'RUN-062'],
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
        'remoteMcpRuntime',
        'runtime-only',
        ['Codex Streamable HTTP MCP runtime', 'remote MCP endpoints', 'agent network policy'],
        [
            'Remote MCP reachability is a Codex runtime property rather than a repository metadata projection.',
            'Repository metadata can describe Streamable HTTP MCP configuration, but endpoint reachability, TLS, network policy, and hosted-agent access require harness-native validation.',
        ],
        ['Remote MCP access can expose network, credential, data residency, and audit boundaries.'],
        ['RUN-052'],
    ),
    row(
        'oauthMcpRuntime',
        'runtime-only',
        ['Codex MCP OAuth login', 'OAuth callback handling', 'MCP resource authorization'],
        [
            'OAuth MCP login and callback handling are Codex runtime workflows and cannot be proven by static MCP configuration alone.',
            'Repository metadata can describe OAuth scopes and resource metadata, but user login, callback routing, token handling, and account authorization require harness-native validation.',
        ],
        ['OAuth MCP access can grant external-service authority and requires explicit policy review.'],
        ['RUN-052'],
    ),
    row(
        'sideEffectMcpRuntime',
        'runtime-only',
        ['Codex MCP tool approval', 'side-effecting MCP tool calls', 'agent approval policy'],
        [
            'Side-effecting MCP tool behavior depends on Codex runtime approval, sandbox, and configured tool authority.',
            'Repository metadata can describe tool approval policy, but destructive or externally mutating tool behavior requires harness-native runtime evidence before support claims are valid.',
        ],
        ['Side-effecting MCP tools can mutate files, repositories, services, tickets, messages, or external systems.'],
        ['RUN-050', 'RUN-052'],
    ),
    row(
        'browserRuntime',
        'runtime-only',
        ['Codex in-app browser', 'Browser plugin', 'browser comments', 'Browser developer mode'],
        [
            'Codex Browser Use is a runtime plugin workflow rather than a repository metadata projection.',
            'Repository metadata can describe review intent, but website allowlists, browser plugin installation, full CDP access, visual annotations, and page interaction evidence require harness-native validation.',
        ],
        ['Browser runtime access can expose page content, screenshots, network traces, console output, and untrusted web context.'],
        ['RUN-063'],
    ),
    row(
        'chromeRuntime',
        'runtime-only',
        ['Codex Chrome extension', 'Chrome plugin', 'signed-in browser profile'],
        [
            'Codex Chrome use depends on the Chrome plugin, browser extension installation, active browser profile, website allowlists, and user approval.',
            'Repository metadata cannot install the extension, grant website access, read browser history, or prove signed-in browser task behavior.',
        ],
        ['Chrome runtime access can act with the user browser profile and requires website, history, and account-scope review.'],
        ['RUN-063'],
    ),
    row(
        'computerUseRuntime',
        'runtime-only',
        ['Codex Computer Use plugin', 'desktop app control', 'OS-level screen and accessibility permissions'],
        [
            'Computer Use depends on plugin installation, operating system permissions, active desktop state, allowed app decisions, and user approval.',
            'Repository metadata cannot grant screen recording, accessibility, foreground desktop control, locked-use policy, or app-specific approval.',
        ],
        ['Computer Use can operate GUI apps, pointer, keyboard, clipboard, visible secrets, and system state outside repository files.'],
        ['RUN-063'],
    ),
    row(
        'sitesRuntime',
        'runtime-only',
        ['Codex Sites plugin', '.openai/hosting.json', 'hosted site versions and deployments'],
        [
            'Sites publishing depends on the Sites plugin, hosted project provisioning, build compatibility, audience settings, hosted secrets, saved versions, and deployment approval.',
            'Repository metadata can classify hosting intent, but it cannot create hosted project state, set production access, configure hosted secrets, or prove deployment behavior.',
        ],
        ['Sites deployments can publish production URLs, expose data, widen audience access, and bind hosted storage or secrets.'],
        ['RUN-063'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'Codex CLI smoke runs'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Evaluation profiles can distinguish static projection checks from harness-native runtime evaluations with harness, adapter, scenario, evidence, and limitation fields.',
            'Codex evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-027', 'RUN-030', 'RUN-037', 'RUN-060'],
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
        [
            '.metaflow/execution/*.json',
            'GitHub Copilot host runtime',
            'GitHub cloud agent workflows',
            'GitHub issue/PR workflows',
            'GitHub Actions',
            'always-on workflow orchestrators',
        ],
        [
            'Canonical execution profile metadata is parsed and reported for adapter review.',
            'Copilot and GitHub execution surface selection remains a runtime workflow until explicit projection adapters exist.',
            'Execution profiles can classify issue/PR-native, GitHub Actions, SDK-embedded, and always-on workflow surfaces without provisioning those runtimes.',
        ],
        ['Execution surface selection changes repository, organization, and CI authority.'],
        ['RUN-035', 'RUN-062'],
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
        'remoteMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP runtime', 'remote MCP endpoints', 'host network policy'],
        [
            'Remote MCP reachability is a GitHub Copilot runtime property rather than a repository metadata projection.',
            'Repository metadata can describe candidate MCP configuration, but endpoint reachability, TLS, network policy, and host access require harness-native validation.',
        ],
        ['Remote MCP access can expose network, credential, data residency, and audit boundaries.'],
    ),
    row(
        'oauthMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP OAuth login', 'OAuth callback handling', 'MCP resource authorization'],
        [
            'OAuth MCP login and callback handling are GitHub Copilot runtime workflows and cannot be proven by static MCP metadata alone.',
            'Repository metadata can describe OAuth intent, but user login, callback routing, token handling, and account authorization require harness-native validation.',
        ],
        ['OAuth MCP access can grant external-service authority and requires explicit policy review.'],
    ),
    row(
        'sideEffectMcpRuntime',
        'runtime-only',
        ['GitHub Copilot MCP tool approval', 'side-effecting MCP tool calls', 'host approval policy'],
        [
            'Side-effecting MCP tool behavior depends on GitHub Copilot runtime approval and configured tool authority.',
            'Repository metadata can describe tool intent, but destructive or externally mutating tool behavior requires harness-native runtime evidence before support claims are valid.',
        ],
        ['Side-effecting MCP tools can mutate files, repositories, services, tickets, messages, or external systems.'],
    ),
    row(
        'browserRuntime',
        'unsupported',
        [],
        [
            'Codex Browser Use is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Browser runtime authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'chromeRuntime',
        'unsupported',
        [],
        [
            'The Codex Chrome extension is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Chrome profile authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'computerUseRuntime',
        'unsupported',
        [],
        [
            'Codex Computer Use is a Codex app/plugin runtime surface and is not a GitHub Copilot target surface.',
        ],
        ['Desktop automation authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'sitesRuntime',
        'unsupported',
        [],
        [
            'Codex Sites is a Codex app/plugin hosting surface and is not a GitHub Copilot target surface.',
        ],
        ['Hosted deployment authority must be represented through the target harness controls.'],
        ['RUN-063'],
    ),
    row(
        'evaluationSupport',
        'partial',
        ['.metaflow/evaluation/*.json', 'MetaFlow FTR evidence', 'extension integration tests'],
        [
            'Canonical evaluation metadata is parsed and reported for adapter review.',
            'Evaluation profiles can distinguish static projection checks from harness-native runtime evaluations with harness, adapter, scenario, evidence, and limitation fields.',
            'Copilot and GitHub evaluation execution remains a runtime workflow until explicit projection adapters exist.',
        ],
        [],
        ['RUN-026', 'RUN-037', 'RUN-060'],
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
        'Installing or enabling Browser, Chrome, Computer Use, or Sites plugins and their app, website, OS, hosting, or workspace permissions.',
        'Proving hosted Codex Cloud, channel delegation, GitHub review, PR feedback, remote MCP reachability, OAuth MCP login, side-effecting MCP behavior, browser interaction, Chrome profile operation, desktop automation, or Sites deployment without a harness-native run.',
    ];
    const runtimeEvidenceExpected = [
        'Local file discovery: Codex CLI, IDE extension, or app smoke evidence against the generated workspace.',
        'Cloud or channel delegation: hosted task or connector evidence showing environment, repository, result, and limitations.',
        'MCP runtime: startup, remote endpoint reachability, login where applicable, tool listing, tool approval behavior, and one target tool call in the intended environment.',
        'Package marketplace readiness: reviewable candidate output, policy grants, runtime validation records, and operator acceptance.',
        'Browser, Chrome, Computer Use, and Sites runtime: installed plugin or app state, approval scope, target site/app/project identity, representative operation, result, and known limitations.',
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
