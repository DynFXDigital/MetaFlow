/**
 * CLI integration tests.
 *
 * Exercises the full MetaFlow CLI workflow end-to-end using temporary
 * workspaces with real filesystem operations.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import packageMetadata from '../package.json';
import { createTestWorkspace, runCli, standardConfig, TestWorkspace } from './helpers';
import { startWatch, WatchCycleResult } from '../src/commands/watch';
import { promoteAuto } from '../src/commands/promote';
import { execSync } from 'child_process';

// ── Helpers ────────────────────────────────────────────────────────

const STANDARD_LAYERS = {
    'company/core': [
        { relativePath: 'skills/testing/SKILL.md', content: '# Testing Skill\nTest content.' },
        { relativePath: 'agents/reviewer.agent.md', content: '# Reviewer Agent\nReview code.' },
        {
            relativePath: 'instructions/coding.md',
            content: '# Coding Instructions\nWrite clean code.',
        },
        { relativePath: 'prompts/review.prompt.md', content: '# Review Prompt\nReview the PR.' },
    ],
};

function synchronizedPath(relativePath: string, layer = 'company/core', repo = 'default'): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const dir = path.posix.dirname(normalized);
    const base = path.posix.basename(normalized);
    const layerToken = layer.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const prefixed = `_${repo}-${layerToken}__${base}`;
    return dir === '.' ? prefixed : `${dir}/${prefixed}`;
}

function originalSynchronizedPath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

function createMcpHandoffWorkspace(): TestWorkspace {
    return createTestWorkspace({
        config: standardConfig(),
        layers: {
            'company/core': [
                {
                    relativePath: '.metaflow/mcp/github.json',
                    content: JSON.stringify({
                        schemaVersion: 'metaflow.mcpServer/v1',
                        id: 'github',
                        transport: 'stdio',
                        invocation: {
                            command: 'github-mcp-server',
                            args: ['stdio'],
                        },
                        requiredSecrets: ['GITHUB_TOKEN'],
                        policyGrants: ['github-pr-read'],
                    }),
                },
            ],
        },
    });
}

function createPackageMarketplaceWorkspace(): TestWorkspace {
    return createTestWorkspace({
        config: standardConfig(),
        layers: {
            'company/core': [
                {
                    relativePath: '.metaflow/packages/release-operations.json',
                    content: JSON.stringify({
                        schemaVersion: 'metaflow.package/v1',
                        id: 'release-operations',
                        name: 'Release Operations',
                        kind: 'agent-plugin',
                        targets: {
                            codex: {
                                pluginName: 'release-operations',
                                enabled: true,
                            },
                            'github-copilot': {
                                pluginName: 'release-operations',
                                enabled: false,
                            },
                        },
                        marketplaceEntries: [
                            {
                                target: 'codex',
                                packageName: 'release-operations',
                                title: 'Release Operations',
                                summary: 'Release workflow package.',
                                publisher: 'DynFX',
                                categories: ['release'],
                                keywords: ['codex', 'automation'],
                            },
                            {
                                target: 'github-copilot',
                                packageName: 'release-operations',
                                title: 'Release Operations',
                                categories: ['release'],
                                keywords: ['copilot'],
                            },
                        ],
                        runtimeValidation: [
                            {
                                target: 'codex',
                                concepts: ['packageManifests', 'sideEffectMcpRuntime'],
                                harness: 'Codex CLI',
                                adapterVersion: 'codex-v0.1',
                                scenario: 'Generated package appears in local marketplace.',
                                status: 'passed',
                                evidence: ['RUN-056'],
                                limitations: ['Cloud package installation is runtime-only.'],
                            },
                            {
                                target: 'github-copilot',
                                harness: 'GitHub Copilot',
                                adapterVersion: 'github-copilot-v0.0',
                                scenario: 'Marketplace listing reviewed.',
                                status: 'partial',
                            },
                        ],
                    }),
                },
            ],
        },
    });
}

// ── Init command ───────────────────────────────────────────────────

describe('CLI: init', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should create .metaflow/config.jsonc in an empty workspace', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['init', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created:'));

        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        assert.ok(fs.existsSync(configPath), '.metaflow/config.jsonc should exist');

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.ok(config.metadataRepos, 'config should have metadataRepos');
        assert.ok(config.metadataRepos[0].capabilities, 'config should have grouped capabilities');
    });

    it('should refuse to overwrite existing config without --force', async () => {
        ws = createTestWorkspace({ config: standardConfig() });
        const result = await runCli(['init', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('already exists'));
    });

    it('should overwrite existing config with --force', async () => {
        ws = createTestWorkspace({ config: standardConfig() });
        const result = await runCli(['init', '--force', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created:'));
    });
});

// ── Status command ─────────────────────────────────────────────────

describe('CLI: status', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should display overlay status with file counts', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Config:'), 'should show config path');
        assert.ok(result.stdout.includes('Capabilities:'), 'should show configured capabilities');
        assert.ok(result.stdout.includes('Profile: default'), 'should show active profile');
        assert.ok(result.stdout.includes('Injection:'), 'should show injection mode summary');
        assert.ok(
            result.stdout.includes('Settings Entries:'),
            'should show settings entry summary',
        );
        assert.ok(
            result.stdout.includes('chat.instructionsFilesLocations'),
            'should show injected settings keys',
        );
        assert.ok(result.stdout.includes('Sources:'), 'should show provenance source summary');
        assert.ok(result.stdout.includes('Files:'), 'should show file count');
    });

    it('should fail gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
    });

    it('should include capability metadata when CAPABILITY.md is present', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'CAPABILITY.md',
                        content: [
                            '---',
                            'name: SDLC Traceability',
                            'description: Traceability metadata capability.',
                            'license: MIT',
                            '---',
                        ].join('\n'),
                    },
                    {
                        relativePath: 'instructions/coding.md',
                        content: '# Coding Instructions',
                    },
                ],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Capabilities: 1'));
        assert.ok(result.stdout.includes('SDLC Traceability'));
        assert.ok(result.stdout.includes('Traceability metadata capability.'));
        assert.ok(result.stdout.includes('license: MIT'));
    });

    it('should include canonical capability manifest details in status output', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.metaflow/capability.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.capability/v1',
                            id: 'metadata-authoring.codex',
                            name: 'Codex Metadata Authoring',
                            summary: 'Helps agents author Codex-compatible metadata.',
                            domain: 'metadata-authoring',
                            kind: 'agent-plugin',
                            lifecycle: 'draft',
                            owners: ['metaflow'],
                            components: {
                                agents: ['codex-steward'],
                                skills: ['codex-metadata'],
                                packages: ['codex-metadata-authoring'],
                            },
                            targets: {
                                codex: {
                                    enabled: true,
                                    support: 'partial',
                                    requiredPolicyGrants: ['github-pr-read'],
                                    validationEvidence: ['RUN-052'],
                                    notes: ['Runtime integrations require harness evidence.'],
                                },
                                'github-copilot': { enabled: false },
                            },
                            packages: ['codex-metadata-authoring'],
                        }),
                    },
                    {
                        relativePath: 'instructions/coding.md',
                        content: '# Coding Instructions',
                    },
                ],
            },
        });

        const textResult = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes('Codex Metadata Authoring'));
        assert.ok(
            textResult.stdout.includes(
                'Metadata: domain=metadata-authoring; kind=agent-plugin; lifecycle=draft',
            ),
        );
        assert.ok(textResult.stdout.includes('Owners: metaflow'));
        assert.ok(textResult.stdout.includes('Components: agents=codex-steward'));
        assert.ok(textResult.stdout.includes('skills=codex-metadata'));
        assert.ok(textResult.stdout.includes('Targets: codex=enabled'));
        assert.ok(textResult.stdout.includes('support=partial'));
        assert.ok(textResult.stdout.includes('grants=github-pr-read'));
        assert.ok(textResult.stdout.includes('evidence=RUN-052'));
        assert.ok(textResult.stdout.includes('notes=1'));
        assert.ok(textResult.stdout.includes('github-copilot=disabled'));
        assert.ok(textResult.stdout.includes('Packages: codex-metadata-authoring'));
        assert.ok(textResult.stdout.includes('Target Capability Support: 82'));
        assert.ok(
            textResult.stdout.includes(
                'codex (codex-v0.1): partial=12, runtime-only=26, supported=3',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Runtime-only support boundaries: 42 rows require operator or harness evidence; codex=26 see docs/CODEX-SUPPORT.md; github-copilot=16 see README.md.',
            ),
        );

        const jsonResult = await runCli(['status', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        const capability = data.resolvedCapabilities.find(
            (entry: { id?: string }) => entry.id === 'metadata-authoring.codex',
        );
        assert.ok(capability, 'expected canonical capability in JSON status output');
        assert.strictEqual(capability.lifecycle, 'draft');
        assert.deepStrictEqual(capability.owners, ['metaflow']);
        assert.deepStrictEqual(capability.components.skills, ['codex-metadata']);
        assert.strictEqual(capability.targets.codex.enabled, true);
        assert.strictEqual(capability.targets.codex.support, 'partial');
        assert.deepStrictEqual(capability.targets.codex.requiredPolicyGrants, ['github-pr-read']);
        assert.deepStrictEqual(capability.targets.codex.validationEvidence, ['RUN-052']);
        assert.deepStrictEqual(capability.targets.codex.notes, [
            'Runtime integrations require harness evidence.',
        ]);
        assert.deepStrictEqual(capability.packages, ['codex-metadata-authoring']);
        assert.strictEqual(data.targetCapabilitySupport.entries, 82);
        const codexTargetSupport = data.targetCapabilitySupport.targets.find(
            (entry: { target: string }) => entry.target === 'codex',
        );
        assert.strictEqual(codexTargetSupport.adapterVersion, 'codex-v0.1');
        assert.strictEqual(codexTargetSupport.counts.partial, 12);
        assert.strictEqual(codexTargetSupport.counts['runtime-only'], 26);
        assert.strictEqual(codexTargetSupport.counts.supported, 3);
        assert.deepStrictEqual(data.targetCapabilitySupport.supportReference, {
            runtimeOnlyCount: 42,
            targets: [
                {
                    target: 'codex',
                    runtimeOnlyCount: 26,
                    documentation: 'docs/CODEX-SUPPORT.md',
                },
                {
                    target: 'github-copilot',
                    runtimeOnlyCount: 16,
                    documentation: 'README.md',
                },
            ],
        });
    });

    it('should include warning file path for malformed capability manifest', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'CAPABILITY.md',
                        content: [
                            '---',
                            'name SDLC Traceability',
                            'description: Missing colon in previous line causes warning',
                            '---',
                        ].join('\n'),
                    },
                    {
                        relativePath: 'instructions/coding.md',
                        content: '# Coding Instructions',
                    },
                ],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);
        const manifestPath = path.join(
            ws.root,
            '.ai',
            'ai-metadata',
            'company',
            'core',
            'CAPABILITY.md',
        );

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('CAPABILITY_FRONTMATTER_LINE_INVALID'));
        assert.ok(result.stdout.includes(manifestPath));
    });
});

// ── Preview command ────────────────────────────────────────────────

describe('CLI: preview', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should list effective files and pending adds', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['preview', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Effective files:'));
        // synchronized files should show up
        assert.ok(result.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));
        assert.ok(result.stdout.includes(synchronizedPath('agents/reviewer.agent.md')));
        // settings files should appear too (they're in effective list)
        assert.ok(result.stdout.includes('instructions/coding.md'));
        assert.ok(
            result.stdout.includes(' @ '),
            'preview should include human-readable source provenance',
        );
        assert.ok(result.stdout.includes('Summary:'), 'preview should show classification summary');
        assert.ok(
            result.stdout.includes('Settings Entries:'),
            'preview should show settings entry summary',
        );
        assert.ok(
            result.stdout.includes('Sources:'),
            'preview should show aggregated provenance sources',
        );
    });

    it('shows target and lossiness metadata for canonical MetaFlow skill projections', async () => {
        const canonicalSkillPath = '.metaflow/skills/release-readiness/SKILL.md';
        const canonicalInstructionPath = '.metaflow/instructions/release-policy.md';
        const instructionPath = 'instructions/release-policy.md';
        const canonicalPromptPath = '.metaflow/prompts/review.md';
        const promptPath = 'prompts/review.md';
        const codexSkillPath = '.agents/skills/release-readiness/SKILL.md';
        const codexInstructionsPath = 'AGENTS.md';
        const policyGrantPath = '.metaflow/policies/github-pr-read.json';
        const mcpServerPath = '.metaflow/mcp/github.json';
        const hookPath = '.metaflow/hooks/release-gate.json';
        const executionProfilePath = '.metaflow/execution/local.json';
        const prExecutionProfilePath = '.metaflow/execution/pr-review.json';
        const githubActionExecutionProfilePath = '.metaflow/execution/github-action.json';
        const appServerExecutionProfilePath = '.metaflow/execution/app-server.json';
        const sdkExecutionProfilePath = '.metaflow/execution/sdk.json';
        const memoryScopePath = '.metaflow/memory/repo-decisions.json';
        const evaluationProfilePath = '.metaflow/evaluation/release-gate.json';
        const agentProfilePath = '.metaflow/agents/reviewer.json';
        const codexAgentPath = '.codex/agents/reviewer.toml';
        const codexProjectConfigPath = '.metaflow/project-config/codex.json';
        const codexConfigPath = '.codex/config.toml';
        const targetAdapterPath = '.metaflow/targets/codex.json';
        ws = createTestWorkspace({
            config: {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/core'],
            },
            layers: {
                'company/core': [
                    {
                        relativePath: canonicalSkillPath,
                        content: '# Release Readiness',
                    },
                    {
                        relativePath: '.metaflow/skills/release-readiness/skill.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.skill/v1',
                            id: 'release-readiness',
                            name: 'Release Readiness',
                            entrypoint: 'SKILL.md',
                            appliesTo: ['release', 'validation'],
                            risk: 'governed',
                            targets: ['codex', 'github-copilot'],
                            description: 'Validates release evidence before publication.',
                        }),
                    },
                    {
                        relativePath: canonicalInstructionPath,
                        content: '# Release Policy',
                    },
                    {
                        relativePath: '.metaflow/instructions/release-policy.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.instruction/v1',
                            id: 'release-policy',
                            name: 'Release Policy',
                            entrypoint: 'release-policy.md',
                            appliesTo: ['release', 'governance'],
                            risk: 'governed',
                            targets: ['codex', 'github-copilot'],
                            description: 'Guides release evidence review.',
                        }),
                    },
                    {
                        relativePath: canonicalPromptPath,
                        content: '# Review Prompt',
                    },
                    {
                        relativePath: '.metaflow/prompts/review.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.prompt/v1',
                            id: 'review',
                            name: 'Review Prompt',
                            entrypoint: 'review.md',
                            appliesTo: ['review'],
                            risk: 'standard',
                            targets: ['github-copilot'],
                            description: 'Prompts release metadata review.',
                        }),
                    },
                    {
                        relativePath: codexInstructionsPath,
                        content: '# Repository Guidance',
                    },
                    {
                        relativePath: policyGrantPath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.policyGrant/v1',
                            id: 'github-pr-read',
                            authority: 'github.pullRequest.read',
                            approval: 'auto',
                            scope: { repository: 'current' },
                            audit: true,
                        }),
                    },
                    {
                        relativePath: mcpServerPath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.mcpServer/v1',
                            id: 'github',
                            transport: 'stdio',
                            invocation: { command: 'github-mcp-server', args: ['stdio'] },
                            requiredSecrets: ['GITHUB_TOKEN'],
                            capabilityCategory: 'source-control',
                            policyGrants: ['github-pr-read'],
                        }),
                    },
                    {
                        relativePath: hookPath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.hook/v1',
                            id: 'release-gate',
                            triggerPhase: 'preToolUse',
                            invocationType: 'command',
                            command: 'npm',
                            args: ['test'],
                            scope: 'workspace',
                            failureBehavior: 'block',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: executionProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.executionProfile/v1',
                            id: 'local',
                            surface: 'localWorkstation',
                            isolation: 'workspace-write',
                            runner: 'codex-cli',
                            workingDirectory: '.',
                            timeoutSeconds: 900,
                            requiredSecrets: ['OPENAI_API_KEY'],
                            environment: { NODE_ENV: 'test' },
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: prExecutionProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.executionProfile/v1',
                            id: 'pr-review',
                            surface: 'issuePrNative',
                            isolation: 'cloud-sandbox',
                            runner: 'codex-github-review',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            description: 'Run Codex issue and pull request workflows.',
                        }),
                    },
                    {
                        relativePath: githubActionExecutionProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.executionProfile/v1',
                            id: 'github-action',
                            surface: 'githubAction',
                            isolation: 'cloud-sandbox',
                            runner: 'openai/codex-action@v1',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            description: 'Run Codex in GitHub Actions.',
                        }),
                    },
                    {
                        relativePath: appServerExecutionProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.executionProfile/v1',
                            id: 'app-server',
                            surface: 'appServer',
                            isolation: 'workspace-write',
                            runner: 'codex app-server',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            description: 'Embed Codex app-server in a product surface.',
                        }),
                    },
                    {
                        relativePath: sdkExecutionProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.executionProfile/v1',
                            id: 'sdk',
                            surface: 'sdkEmbedded',
                            isolation: 'workspace-write',
                            runner: '@openai/codex-sdk',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            description: 'Embed Codex through the SDK.',
                        }),
                    },
                    {
                        relativePath: memoryScopePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.memoryScope/v1',
                            id: 'repo-decisions',
                            scopeType: 'repository',
                            storage: 'persistent',
                            retention: '180d',
                            sharing: 'repository-maintainers',
                            readPolicy: 'maintainers-only',
                            writePolicy: 'approved-agents',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: evaluationProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.evaluationProfile/v1',
                            id: 'release-gate',
                            evaluationType: 'regressionGate',
                            command: 'npm',
                            args: ['run', 'gate:quick'],
                            successCriteria: 'Gate exits 0 with no failing tests.',
                            artifacts: ['doc/ftr/latest.md'],
                            evidenceKind: 'harnessRuntime',
                            harness: 'Codex CLI',
                            adapterVersion: 'codex-v0.1',
                            scenario: 'Generated Codex metadata passes the release gate.',
                            validationCommand: 'npm run gate:quick',
                            evidence: ['RUN-060'],
                            limitations: ['Hosted Codex Cloud execution is not covered.'],
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: agentProfilePath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.agentProfile/v1',
                            id: 'reviewer',
                            name: 'Reviewer',
                            description: 'Reviews implementation changes.',
                            developerInstructions: 'Review the diff and report risks.',
                            nicknameCandidates: ['reviewer'],
                            model: 'gpt-5-codex',
                            sandboxMode: 'workspace-write',
                            tools: ['read', 'search', 'github/get_pull_request'],
                            mcpServers: ['github'],
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: codexProjectConfigPath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.codexProjectConfig/v1',
                            id: 'default',
                            settings: {
                                model: 'gpt-5-codex',
                                approvalPolicy: 'on-request',
                                sandboxMode: 'workspace-write',
                                webSearch: 'cached',
                            },
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            notes: ['Requires trusted project review.'],
                        }),
                    },
                    {
                        relativePath: targetAdapterPath,
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.targetAdapter/v1',
                            id: 'codex-default',
                            target: 'codex',
                            enabled: true,
                            adapterVersion: 'codex-v0.1',
                            materializationMode: 'candidate',
                            concepts: {
                                agents: 'managed',
                                hooks: 'managed',
                                skills: 'managed',
                                instructions: 'candidate',
                                mcpServers: 'report-only',
                                projectConfig: 'managed',
                            },
                            requiredPolicyGrants: ['github-pr-read'],
                            validationStatus: 'runtimeVerified',
                            validationEvidence: ['RUN-030'],
                            notes: ['Root instructions stay candidate-only.'],
                        }),
                    },
                ],
            },
        });

        const textResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes(`[codex] ${codexSkillPath}`));
        assert.ok(textResult.stdout.includes(`[github-copilot] ${instructionPath}`));
        assert.ok(textResult.stdout.includes(`[github-copilot] ${promptPath}`));
        assert.ok(textResult.stdout.includes('lossiness=none'));
        assert.ok(
            textResult.stdout.includes(
                'adapter=codex-default; mode=managed; validation=runtimeVerified',
            ),
        );
        assert.ok(textResult.stdout.includes('skip [codex] AGENTS.md (target-adapter-candidate)'));
        assert.ok(textResult.stdout.includes('MetaFlow source projected to Codex'));
        assert.ok(textResult.stdout.includes('MetaFlow source projected to GitHub Copilot'));
        assert.ok(textResult.stdout.includes('target adapter concept skills'));
        assert.ok(textResult.stdout.includes('Target Capability Matrix:'));
        assert.ok(textResult.stdout.includes('codex (codex-v0.1):'));
        assert.ok(textResult.stdout.includes('agents=partial'));
        assert.ok(textResult.stdout.includes('skills=supported'));
        assert.ok(textResult.stdout.includes('policyGrants=partial'));
        assert.ok(
            textResult.stdout.includes(
                'Runtime-only support boundaries: 42 rows require operator or harness evidence; codex=26 see docs/CODEX-SUPPORT.md; github-copilot=16 see README.md.',
            ),
        );
        assert.ok(textResult.stdout.includes('Policy Grants: 1'));
        assert.ok(textResult.stdout.includes('github-pr-read [github]'));
        assert.ok(textResult.stdout.includes('approval=auto audit=true'));
        assert.ok(textResult.stdout.includes('MCP Servers: 1'));
        assert.ok(textResult.stdout.includes('github [stdio] category=source-control'));
        assert.ok(textResult.stdout.includes('grants=github-pr-read'));
        assert.ok(textResult.stdout.includes('secrets=GITHUB_TOKEN'));
        assert.ok(textResult.stdout.includes('GitHub Copilot MCP Handoff:'));
        assert.ok(
            textResult.stdout.includes(
                '.vscode/mcp.json (1/1 servers supported, operator review required)',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'github: supported secrets=GITHUB_TOKEN grants=github-pr-read',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'github: Requires operator-provided secrets: GITHUB_TOKEN.',
            ),
        );
        assert.ok(textResult.stdout.includes('mcpServers=partial'));
        assert.ok(textResult.stdout.includes('Hooks: 1'));
        assert.ok(
            textResult.stdout.includes(
                'release-gate [preToolUse/command] failure=block scope=workspace',
            ),
        );
        assert.ok(textResult.stdout.includes('targets=codex'));
        assert.ok(textResult.stdout.includes('Execution Profiles: 5'));
        assert.ok(
            textResult.stdout.includes(
                'local [localWorkstation/workspace-write] runner=codex-cli timeout=900s',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'pr-review [issuePrNative/cloud-sandbox] runner=codex-github-review',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'github-action [githubAction/cloud-sandbox] runner=openai/codex-action@v1',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'app-server [appServer/workspace-write] runner=codex app-server',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'sdk [sdkEmbedded/workspace-write] runner=@openai/codex-sdk',
            ),
        );
        assert.ok(textResult.stdout.includes('secrets=OPENAI_API_KEY'));
        assert.ok(textResult.stdout.includes('environment: NODE_ENV=test'));
        assert.ok(textResult.stdout.includes('Memory Scopes: 1'));
        assert.ok(
            textResult.stdout.includes(
                'repo-decisions [repository/persistent] retention=180d sharing=repository-maintainers',
            ),
        );
        assert.ok(textResult.stdout.includes('readPolicy: maintainers-only'));
        assert.ok(textResult.stdout.includes('writePolicy: approved-agents'));
        assert.ok(textResult.stdout.includes('Evaluation Profiles: 1'));
        assert.ok(
            textResult.stdout.includes(
                'release-gate [regressionGate] command=npm artifacts=doc/ftr/latest.md evidenceKind=harnessRuntime harness=Codex CLI adapter=codex-v0.1',
            ),
        );
        assert.ok(textResult.stdout.includes('args: run gate:quick'));
        assert.ok(
            textResult.stdout.includes(
                'successCriteria: Gate exits 0 with no failing tests.',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'scenario: Generated Codex metadata passes the release gate.',
            ),
        );
        assert.ok(textResult.stdout.includes('validationCommand: npm run gate:quick'));
        assert.ok(textResult.stdout.includes('evidence: RUN-060'));
        assert.ok(
            textResult.stdout.includes(
                'limitations: Hosted Codex Cloud execution is not covered.',
            ),
        );
        assert.ok(textResult.stdout.includes('Agent Profiles: 1'));
        assert.ok(
            textResult.stdout.includes(
                'reviewer [Reviewer] model=gpt-5-codex sandbox=workspace-write tools=read,search,github/get_pull_request mcpServers=github grants=github-pr-read targets=codex',
            ),
        );
        assert.ok(textResult.stdout.includes('description: Reviews implementation changes.'));
        assert.ok(textResult.stdout.includes('Instruction Manifests: 1'));
        assert.ok(
            textResult.stdout.includes(
                'release-policy [Release Policy] entrypoint=release-policy.md risk=governed appliesTo=release,governance targets=codex,github-copilot',
            ),
        );
        assert.ok(textResult.stdout.includes('description: Guides release evidence review.'));
        assert.ok(textResult.stdout.includes('Prompt Manifests: 1'));
        assert.ok(
            textResult.stdout.includes(
                'review [Review Prompt] entrypoint=review.md risk=standard appliesTo=review targets=github-copilot',
            ),
        );
        assert.ok(textResult.stdout.includes('description: Prompts release metadata review.'));
        assert.ok(textResult.stdout.includes('Skill Manifests: 1'));
        assert.ok(
            textResult.stdout.includes(
                'release-readiness [Release Readiness] entrypoint=SKILL.md risk=governed appliesTo=release,validation targets=codex,github-copilot',
            ),
        );
        assert.ok(
            textResult.stdout.includes('description: Validates release evidence before publication.'),
        );
        assert.ok(textResult.stdout.includes('Codex Project Configs: 1'));
        assert.ok(
            textResult.stdout.includes(
                'default model=gpt-5-codex approval=on-request sandbox=workspace-write webSearch=cached grants=github-pr-read targets=codex',
            ),
        );
        assert.ok(textResult.stdout.includes('note: Requires trusted project review.'));
        assert.ok(textResult.stdout.includes('Target Adapters: 1'));
        assert.ok(
            textResult.stdout.includes(
                'codex-default [codex] enabled mode=candidate validation=runtimeVerified version=codex-v0.1 grants=github-pr-read evidence=RUN-030',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'concepts: agents=managed, hooks=managed, instructions=candidate, mcpServers=report-only, projectConfig=managed, skills=managed',
            ),
        );
        assert.ok(textResult.stdout.includes('note: Root instructions stay candidate-only.'));
        assert.ok(textResult.stdout.includes('Adapter Readiness Reports: 2'));
        assert.ok(textResult.stdout.includes('codex (codex-v0.1):'));
        assert.ok(
            textResult.stdout.includes(
                'boundary: [localCloudHandoff] Codex localCloudHandoff is runtime-only; repository metadata projection cannot make it operational without operator or harness evidence. See docs/CODEX-SUPPORT.md.',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Codex policy grant github-pr-read (github.pullRequest.read) requires runtime authority review',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Codex MCP server github requires target runtime MCP configuration',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Codex evaluation profile release-gate (regressionGate) requires evaluation runner or check integration. evidenceKind=harnessRuntime harness=Codex CLI adapter=codex-v0.1 scenario="Generated Codex metadata passes the release gate." limitations=Hosted Codex Cloud execution is not covered.',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Codex agent profile reviewer requires target custom-agent review before operational use',
            ),
        );
        assert.ok(
            textResult.stdout.includes(
                'Codex project config default requires trusted-project and target configuration review before operational use',
            ),
        );
        assert.ok(textResult.stdout.includes('github-copilot (github-copilot-v0.1):'));

        const jsonResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        const codexChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === codexSkillPath,
        );
        const instruction = data.effectiveFiles.find(
            (file: { relativePath: string }) => file.relativePath === instructionPath,
        );
        const prompt = data.effectiveFiles.find(
            (file: { relativePath: string }) => file.relativePath === promptPath,
        );
        const codexInstructionsChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === codexInstructionsPath,
        );
        const codexAgentChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === codexAgentPath,
        );
        const codexConfigChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === codexConfigPath,
        );
        const codexHookChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === '.codex/hooks.json',
        );
        assert.strictEqual(codexChange.sourceRelativePath, canonicalSkillPath);
        assert.strictEqual(codexChange.projection.target, 'codex');
        assert.strictEqual(codexChange.projection.sourceFormat, 'metaflow');
        assert.strictEqual(codexChange.projection.lossiness, 'none');
        assert.strictEqual(codexChange.projection.pathTransformed, true);
        assert.strictEqual(codexChange.projection.targetAdapterConcept, 'skills');
        assert.strictEqual(codexChange.projection.targetAdapterId, 'codex-default');
        assert.strictEqual(codexChange.projection.targetAdapterVersion, 'codex-v0.1');
        assert.strictEqual(codexChange.projection.targetAdapterMaterializationMode, 'managed');
        assert.strictEqual(codexChange.projection.targetAdapterValidationStatus, 'runtimeVerified');
        assert.deepStrictEqual(codexChange.projection.targetAdapterValidationEvidence, ['RUN-030']);
        assert.deepStrictEqual(codexChange.projection.targetAdapterRequiredPolicyGrants, [
            'github-pr-read',
        ]);
        assert.strictEqual(instruction.sourceRelativePath, canonicalInstructionPath);
        assert.strictEqual(instruction.projection.sourceFormat, 'metaflow');
        assert.strictEqual(instruction.projection.target, 'github-copilot');
        assert.strictEqual(instruction.projection.lossiness, 'none');
        assert.strictEqual(instruction.projection.targetAdapterConcept, 'instructions');
        assert.strictEqual(prompt.sourceRelativePath, canonicalPromptPath);
        assert.strictEqual(prompt.projection.sourceFormat, 'metaflow');
        assert.strictEqual(prompt.projection.target, 'github-copilot');
        assert.strictEqual(prompt.projection.lossiness, 'none');
        assert.strictEqual(prompt.projection.targetAdapterConcept, 'prompts');
        assert.strictEqual(codexInstructionsChange.action, 'skip');
        assert.strictEqual(codexInstructionsChange.reason, 'target-adapter-candidate');
        assert.strictEqual(
            codexInstructionsChange.projection.targetAdapterMaterializationMode,
            'candidate',
        );
        assert.strictEqual(codexAgentChange.sourceRelativePath, agentProfilePath);
        assert.strictEqual(codexAgentChange.action, 'add');
        assert.strictEqual(codexAgentChange.projection.target, 'codex');
        assert.strictEqual(codexAgentChange.projection.sourceFormat, 'metaflow');
        assert.strictEqual(codexAgentChange.projection.lossiness, 'none');
        assert.strictEqual(codexAgentChange.projection.targetAdapterConcept, 'agents');
        assert.strictEqual(codexAgentChange.projection.targetAdapterMaterializationMode, 'managed');
        assert.strictEqual(codexConfigChange.sourceRelativePath, codexProjectConfigPath);
        assert.strictEqual(codexConfigChange.action, 'add');
        assert.strictEqual(codexConfigChange.projection.target, 'codex');
        assert.strictEqual(codexConfigChange.projection.sourceFormat, 'metaflow');
        assert.strictEqual(codexConfigChange.projection.lossiness, 'none');
        assert.strictEqual(codexConfigChange.projection.targetAdapterConcept, 'projectConfig');
        assert.strictEqual(
            codexConfigChange.projection.targetAdapterMaterializationMode,
            'managed',
        );
        assert.strictEqual(codexHookChange.sourceRelativePath, '.metaflow/hooks');
        assert.strictEqual(codexHookChange.action, 'add');
        assert.strictEqual(codexHookChange.projection.target, 'codex');
        assert.strictEqual(codexHookChange.projection.sourceFormat, 'metaflow');
        assert.strictEqual(codexHookChange.projection.lossiness, 'lossy');
        assert.strictEqual(codexHookChange.projection.targetAdapterConcept, 'hooks');
        assert.strictEqual(codexHookChange.projection.targetAdapterMaterializationMode, 'managed');
        assert.strictEqual(data.summary.policyGrants, 1);
        assert.strictEqual(data.summary.mcpServers, 1);
        assert.strictEqual(data.summary.githubCopilotMcpHandoff, 1);
        assert.strictEqual(data.summary.hooks, 1);
        assert.strictEqual(data.summary.executionProfiles, 5);
        assert.strictEqual(data.summary.memoryScopes, 1);
        assert.strictEqual(data.summary.evaluationProfiles, 1);
        assert.strictEqual(data.summary.agentProfiles, 1);
        assert.strictEqual(data.summary.instructionManifests, 1);
        assert.strictEqual(data.summary.promptManifests, 1);
        assert.strictEqual(data.summary.skills, 1);
        assert.strictEqual(data.summary.codexProjectConfigs, 1);
        assert.strictEqual(data.summary.targetAdapters, 1);
        assert.strictEqual(data.summary.adapterReports, 2);
        assert.strictEqual(data.policyGrants[0].id, 'github-pr-read');
        assert.strictEqual(data.policyGrants[0].authority, 'github.pullRequest.read');
        assert.strictEqual(data.policyGrants[0].category, 'github');
        assert.strictEqual(data.policyGrants[0].approval, 'auto');
        assert.deepStrictEqual(data.policyGrants[0].scope, { repository: 'current' });
        assert.strictEqual(data.policyGrants[0].audit, true);
        assert.strictEqual(data.policyGrants[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.mcpServers[0].id, 'github');
        assert.strictEqual(data.mcpServers[0].transport, 'stdio');
        assert.deepStrictEqual(data.mcpServers[0].invocation, {
            command: 'github-mcp-server',
            args: ['stdio'],
        });
        assert.deepStrictEqual(data.mcpServers[0].requiredSecrets, ['GITHUB_TOKEN']);
        assert.strictEqual(data.mcpServers[0].capabilityCategory, 'source-control');
        assert.deepStrictEqual(data.mcpServers[0].policyGrants, ['github-pr-read']);
        assert.strictEqual(data.mcpServers[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.githubCopilotMcpHandoff.destination, '.vscode/mcp.json');
        assert.strictEqual(data.githubCopilotMcpHandoff.managed, false);
        assert.strictEqual(data.githubCopilotMcpHandoff.requiresOperatorReview, true);
        assert.strictEqual(data.githubCopilotMcpHandoff.servers[0].id, 'github');
        assert.strictEqual(data.githubCopilotMcpHandoff.servers[0].supported, true);
        assert.deepStrictEqual(
            JSON.parse(data.githubCopilotMcpHandoff.content).servers.github,
            {
                type: 'stdio',
                command: 'github-mcp-server',
                args: ['stdio'],
            },
        );
        assert.ok(
            data.githubCopilotMcpHandoff.warnings.some((warning: string) =>
                warning.includes('Requires operator-provided secrets: GITHUB_TOKEN'),
            ),
        );
        assert.strictEqual(data.hooks[0].id, 'release-gate');
        assert.strictEqual(data.hooks[0].triggerPhase, 'preToolUse');
        assert.strictEqual(data.hooks[0].invocationType, 'command');
        assert.strictEqual(data.hooks[0].command, 'npm');
        assert.deepStrictEqual(data.hooks[0].args, ['test']);
        assert.strictEqual(data.hooks[0].scope, 'workspace');
        assert.strictEqual(data.hooks[0].failureBehavior, 'block');
        assert.deepStrictEqual(data.hooks[0].policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(data.hooks[0].targets, ['codex']);
        assert.strictEqual(data.hooks[0].sourceLayer, 'primary/company/core');
        const localExecutionProfile = data.executionProfiles.find(
            (profile: { id: string }) => profile.id === 'local',
        );
        assert.strictEqual(localExecutionProfile.id, 'local');
        assert.strictEqual(localExecutionProfile.surface, 'localWorkstation');
        assert.strictEqual(localExecutionProfile.isolation, 'workspace-write');
        assert.strictEqual(localExecutionProfile.runner, 'codex-cli');
        assert.strictEqual(localExecutionProfile.workingDirectory, '.');
        assert.strictEqual(localExecutionProfile.timeoutSeconds, 900);
        assert.deepStrictEqual(localExecutionProfile.requiredSecrets, ['OPENAI_API_KEY']);
        assert.deepStrictEqual(localExecutionProfile.environment, { NODE_ENV: 'test' });
        assert.deepStrictEqual(localExecutionProfile.policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(localExecutionProfile.targets, ['codex']);
        assert.strictEqual(localExecutionProfile.sourceLayer, 'primary/company/core');
        const prExecutionProfile = data.executionProfiles.find(
            (profile: { id: string }) => profile.id === 'pr-review',
        );
        assert.strictEqual(prExecutionProfile.surface, 'issuePrNative');
        assert.strictEqual(prExecutionProfile.isolation, 'cloud-sandbox');
        assert.strictEqual(prExecutionProfile.runner, 'codex-github-review');
        const githubActionExecutionProfile = data.executionProfiles.find(
            (profile: { id: string }) => profile.id === 'github-action',
        );
        assert.strictEqual(githubActionExecutionProfile.surface, 'githubAction');
        assert.strictEqual(githubActionExecutionProfile.isolation, 'cloud-sandbox');
        assert.strictEqual(githubActionExecutionProfile.runner, 'openai/codex-action@v1');
        const appServerExecutionProfile = data.executionProfiles.find(
            (profile: { id: string }) => profile.id === 'app-server',
        );
        assert.strictEqual(appServerExecutionProfile.surface, 'appServer');
        assert.strictEqual(appServerExecutionProfile.isolation, 'workspace-write');
        assert.strictEqual(appServerExecutionProfile.runner, 'codex app-server');
        const sdkExecutionProfile = data.executionProfiles.find(
            (profile: { id: string }) => profile.id === 'sdk',
        );
        assert.strictEqual(sdkExecutionProfile.surface, 'sdkEmbedded');
        assert.strictEqual(sdkExecutionProfile.isolation, 'workspace-write');
        assert.strictEqual(sdkExecutionProfile.runner, '@openai/codex-sdk');
        assert.strictEqual(data.memoryScopes[0].id, 'repo-decisions');
        assert.strictEqual(data.memoryScopes[0].scopeType, 'repository');
        assert.strictEqual(data.memoryScopes[0].storage, 'persistent');
        assert.strictEqual(data.memoryScopes[0].retention, '180d');
        assert.strictEqual(data.memoryScopes[0].sharing, 'repository-maintainers');
        assert.strictEqual(data.memoryScopes[0].readPolicy, 'maintainers-only');
        assert.strictEqual(data.memoryScopes[0].writePolicy, 'approved-agents');
        assert.deepStrictEqual(data.memoryScopes[0].policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(data.memoryScopes[0].targets, ['codex']);
        assert.strictEqual(data.memoryScopes[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.evaluationProfiles[0].id, 'release-gate');
        assert.strictEqual(data.evaluationProfiles[0].evaluationType, 'regressionGate');
        assert.strictEqual(data.evaluationProfiles[0].command, 'npm');
        assert.deepStrictEqual(data.evaluationProfiles[0].args, ['run', 'gate:quick']);
        assert.strictEqual(
            data.evaluationProfiles[0].successCriteria,
            'Gate exits 0 with no failing tests.',
        );
        assert.deepStrictEqual(data.evaluationProfiles[0].artifacts, ['doc/ftr/latest.md']);
        assert.strictEqual(data.evaluationProfiles[0].evidenceKind, 'harnessRuntime');
        assert.strictEqual(data.evaluationProfiles[0].harness, 'Codex CLI');
        assert.strictEqual(data.evaluationProfiles[0].adapterVersion, 'codex-v0.1');
        assert.strictEqual(
            data.evaluationProfiles[0].scenario,
            'Generated Codex metadata passes the release gate.',
        );
        assert.strictEqual(data.evaluationProfiles[0].validationCommand, 'npm run gate:quick');
        assert.deepStrictEqual(data.evaluationProfiles[0].evidence, ['RUN-060']);
        assert.deepStrictEqual(data.evaluationProfiles[0].limitations, [
            'Hosted Codex Cloud execution is not covered.',
        ]);
        assert.deepStrictEqual(data.evaluationProfiles[0].policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(data.evaluationProfiles[0].targets, ['codex']);
        assert.strictEqual(data.evaluationProfiles[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.agentProfiles[0].id, 'reviewer');
        assert.strictEqual(data.agentProfiles[0].name, 'Reviewer');
        assert.strictEqual(data.agentProfiles[0].model, 'gpt-5-codex');
        assert.strictEqual(data.agentProfiles[0].sandboxMode, 'workspace-write');
        assert.deepStrictEqual(data.agentProfiles[0].tools, [
            'read',
            'search',
            'github/get_pull_request',
        ]);
        assert.deepStrictEqual(data.agentProfiles[0].mcpServers, ['github']);
        assert.deepStrictEqual(data.agentProfiles[0].policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(data.agentProfiles[0].targets, ['codex']);
        assert.strictEqual(data.agentProfiles[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.instructionManifests[0].id, 'release-policy');
        assert.strictEqual(data.instructionManifests[0].name, 'Release Policy');
        assert.strictEqual(data.instructionManifests[0].contentType, 'instruction');
        assert.strictEqual(data.instructionManifests[0].entrypoint, 'release-policy.md');
        assert.strictEqual(data.instructionManifests[0].risk, 'governed');
        assert.deepStrictEqual(data.instructionManifests[0].appliesTo, [
            'release',
            'governance',
        ]);
        assert.deepStrictEqual(data.instructionManifests[0].targets, [
            'codex',
            'github-copilot',
        ]);
        assert.deepStrictEqual(data.instructionManifests[0].warnings, []);
        assert.strictEqual(data.instructionManifests[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.promptManifests[0].id, 'review');
        assert.strictEqual(data.promptManifests[0].name, 'Review Prompt');
        assert.strictEqual(data.promptManifests[0].contentType, 'prompt');
        assert.strictEqual(data.promptManifests[0].entrypoint, 'review.md');
        assert.strictEqual(data.promptManifests[0].risk, 'standard');
        assert.deepStrictEqual(data.promptManifests[0].appliesTo, ['review']);
        assert.deepStrictEqual(data.promptManifests[0].targets, ['github-copilot']);
        assert.deepStrictEqual(data.promptManifests[0].warnings, []);
        assert.strictEqual(data.promptManifests[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.skills[0].id, 'release-readiness');
        assert.strictEqual(data.skills[0].name, 'Release Readiness');
        assert.strictEqual(data.skills[0].entrypoint, 'SKILL.md');
        assert.strictEqual(data.skills[0].risk, 'governed');
        assert.deepStrictEqual(data.skills[0].appliesTo, ['release', 'validation']);
        assert.deepStrictEqual(data.skills[0].targets, ['codex', 'github-copilot']);
        assert.deepStrictEqual(data.skills[0].warnings, []);
        assert.strictEqual(data.skills[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.codexProjectConfigs[0].id, 'default');
        assert.strictEqual(data.codexProjectConfigs[0].settings.model, 'gpt-5-codex');
        assert.strictEqual(data.codexProjectConfigs[0].settings.approvalPolicy, 'on-request');
        assert.strictEqual(data.codexProjectConfigs[0].settings.sandboxMode, 'workspace-write');
        assert.deepStrictEqual(data.codexProjectConfigs[0].policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(data.codexProjectConfigs[0].targets, ['codex']);
        assert.deepStrictEqual(data.codexProjectConfigs[0].notes, [
            'Requires trusted project review.',
        ]);
        assert.strictEqual(data.codexProjectConfigs[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.targetAdapters[0].id, 'codex-default');
        assert.strictEqual(data.targetAdapters[0].target, 'codex');
        assert.strictEqual(data.targetAdapters[0].enabled, true);
        assert.strictEqual(data.targetAdapters[0].adapterVersion, 'codex-v0.1');
        assert.strictEqual(data.targetAdapters[0].materializationMode, 'candidate');
        assert.deepStrictEqual(data.targetAdapters[0].concepts, {
            agents: 'managed',
            hooks: 'managed',
            skills: 'managed',
            instructions: 'candidate',
            mcpServers: 'report-only',
            projectConfig: 'managed',
        });
        assert.deepStrictEqual(data.targetAdapters[0].requiredPolicyGrants, ['github-pr-read']);
        assert.strictEqual(data.targetAdapters[0].validationStatus, 'runtimeVerified');
        assert.deepStrictEqual(data.targetAdapters[0].validationEvidence, ['RUN-030']);
        assert.deepStrictEqual(data.targetAdapters[0].notes, [
            'Root instructions stay candidate-only.',
        ]);
        assert.strictEqual(data.targetAdapters[0].sourceLayer, 'primary/company/core');
        const codexSkillSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'skills',
        );
        assert.strictEqual(codexSkillSupport.adapterVersion, 'codex-v0.1');
        assert.strictEqual(codexSkillSupport.support, 'supported');
        assert.ok(
            codexSkillSupport.nativeSurfaces.includes('.metaflow/skills/<skill-id>/skill.json'),
        );
        assert.ok(
            codexSkillSupport.evidence.includes('RUN-030'),
            'Codex skill support should point to the live canonical consumer smoke',
        );
        assert.deepStrictEqual(data.targetCapabilitySupportReference, {
            runtimeOnlyCount: 42,
            targets: [
                {
                    target: 'codex',
                    runtimeOnlyCount: 26,
                    documentation: 'docs/CODEX-SUPPORT.md',
                },
                {
                    target: 'github-copilot',
                    runtimeOnlyCount: 16,
                    documentation: 'README.md',
                },
            ],
        });
        const codexPromptSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'prompts',
        );
        assert.strictEqual(codexPromptSupport.support, 'partial');
        assert.ok(codexPromptSupport.nativeSurfaces.includes('.metaflow/prompts/*.json'));
        assert.ok(
            codexPromptSupport.nativeSurfaces.includes(
                '~/.codex/prompts/*.md (deprecated local-only)',
            ),
        );
        assert.ok(
            codexPromptSupport.notes.some((note: string) =>
                note.includes('Shared reusable Codex workflows should be represented as skills'),
            ),
        );
        const codexMemoryRuntimeSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'memoryRuntime',
        );
        assert.strictEqual(codexMemoryRuntimeSupport.support, 'runtime-only');
        assert.ok(codexMemoryRuntimeSupport.nativeSurfaces.includes('Codex Memories'));
        assert.ok(
            codexMemoryRuntimeSupport.notes.some((note: string) =>
                note.includes('cannot enable Memories'),
            ),
        );
        const copilotPromptSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'github-copilot' && entry.concept === 'prompts',
        );
        assert.strictEqual(copilotPromptSupport.support, 'supported');
        assert.ok(copilotPromptSupport.nativeSurfaces.includes('.metaflow/prompts/*.json'));
        const codexAgentSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'agents',
        );
        assert.strictEqual(codexAgentSupport.support, 'partial');
        assert.ok(codexAgentSupport.evidence.includes('RUN-042'));
        const codexProjectConfigSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'projectConfig',
        );
        assert.strictEqual(codexProjectConfigSupport.support, 'partial');
        assert.ok(codexProjectConfigSupport.evidence.includes('RUN-043'));
        const codexPolicySupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'policyGrants',
        );
        assert.strictEqual(codexPolicySupport.support, 'partial');
        assert.ok(codexPolicySupport.authorityImplications.length > 0);
        const codexMcpSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'mcpServers',
        );
        assert.strictEqual(codexMcpSupport.support, 'partial');
        assert.ok(codexMcpSupport.evidence.includes('RUN-033'));
        assert.ok(codexMcpSupport.evidence.includes('RUN-050'));
        assert.ok(codexMcpSupport.evidence.includes('RUN-052'));
        assert.ok(
            codexMcpSupport.notes.some((note: string) => note.includes('OAuth login')),
        );
        const codexHookSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'hooks',
        );
        assert.strictEqual(codexHookSupport.support, 'partial');
        assert.ok(codexHookSupport.evidence.includes('RUN-034'));
        assert.ok(codexHookSupport.evidence.includes('RUN-044'));
        assert.ok(codexHookSupport.evidence.includes('RUN-049'));
        const codexExecutionSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'executionSurfaces',
        );
        assert.strictEqual(codexExecutionSupport.support, 'partial');
        assert.ok(codexExecutionSupport.evidence.includes('RUN-035'));
        const codexMemorySupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'memoryScopes',
        );
        assert.strictEqual(codexMemorySupport.support, 'partial');
        assert.ok(codexMemorySupport.evidence.includes('RUN-036'));
        const codexEvaluationSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'evaluationSupport',
        );
        assert.strictEqual(codexEvaluationSupport.support, 'partial');
        assert.ok(codexEvaluationSupport.evidence.includes('RUN-037'));
        const codexEvaluationRuntimeSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'evaluationRuntime',
        );
        assert.strictEqual(codexEvaluationRuntimeSupport.support, 'runtime-only');
        assert.ok(codexEvaluationRuntimeSupport.evidence.includes('RUN-068'));
        assert.ok(
            codexEvaluationRuntimeSupport.notes.some((note: string) =>
                note.includes('cannot execute benchmark tasks'),
            ),
        );
        const codexAdapterReport = data.adapterReports.find(
            (report: { target: string }) => report.target === 'codex',
        );
        assert.deepStrictEqual(codexAdapterReport.managedMetadata, {
            instructions: 1,
            prompts: 0,
            agentProfiles: 1,
            codexProjectConfigs: 1,
            policyGrants: 1,
            mcpServers: 1,
            hooks: 1,
            executionProfiles: 5,
            memoryScopes: 1,
            evaluationProfiles: 1,
            packageManifests: 0,
            tools: 0,
        });
        assert.ok(
            codexAdapterReport.supportBoundaries.some(
                (boundary: { concept: string; documentation: string; message: string }) =>
                    boundary.concept === 'localCloudHandoff' &&
                    boundary.documentation === 'docs/CODEX-SUPPORT.md' &&
                    boundary.message.includes('runtime-only'),
            ),
        );
        assert.ok(
            codexAdapterReport.actionItems.some(
                (item: { concept: string; metadataId: string; message: string; evidence: string[] }) =>
                    item.concept === 'evaluationSupport' &&
                    item.metadataId === 'release-gate' &&
                    item.message.includes('evaluation runner or check integration') &&
                    item.message.includes('evidenceKind=harnessRuntime') &&
                    item.message.includes('harness=Codex CLI') &&
                    item.message.includes(
                        'scenario="Generated Codex metadata passes the release gate."',
                    ) &&
                    item.evidence.includes('RUN-060'),
            ),
        );
        assert.ok(codexAdapterReport.evidence.includes('RUN-037'));
        assert.ok(codexAdapterReport.evidence.includes('RUN-060'));
        assert.ok(codexAdapterReport.evidence.includes('RUN-042'));
        assert.ok(codexAdapterReport.evidence.includes('RUN-043'));
        assert.ok(codexAdapterReport.evidence.includes('RUN-044'));
        const copilotAdapterReport = data.adapterReports.find(
            (report: { target: string }) => report.target === 'github-copilot',
        );
        assert.strictEqual(copilotAdapterReport.managedMetadata.hooks, 0);
        assert.strictEqual(copilotAdapterReport.managedMetadata.executionProfiles, 0);
        assert.strictEqual(copilotAdapterReport.managedMetadata.policyGrants, 1);
        assert.ok(
            copilotAdapterReport.actionItems.some(
                (item: { concept: string; metadataId: string }) =>
                    item.concept === 'mcpServers' && item.metadataId === 'github',
            ),
        );
    });

    it('shows target adapter warning diagnostics in preview text and JSON', async () => {
        ws = createTestWorkspace({
            config: {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/core'],
            },
            layers: {
                'company/core': [
                    {
                        relativePath: '.metaflow/targets/codex.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.targetAdapter/v1',
                            id: 'codex-default',
                            target: 'codex',
                            enabled: true,
                            materializationMode: 'candidate',
                            concepts: {
                                localCloudHandoff: 'managed',
                                projectConfig: 'managed',
                                skills: 'managed',
                            },
                            validationStatus: 'runtimeVerified',
                        }),
                    },
                ],
            },
        });

        const textResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes('Target Adapters: 1'));
        assert.ok(textResult.stdout.includes('TARGET_ADAPTER_VERSION_RECOMMENDED'));
        assert.ok(textResult.stdout.includes('TARGET_ADAPTER_POLICY_GRANTS_RECOMMENDED'));
        assert.ok(textResult.stdout.includes('TARGET_ADAPTER_CONCEPT_SUPPORT_UNAVAILABLE'));
        assert.ok(textResult.stdout.includes('TARGET_ADAPTER_VALIDATION_EVIDENCE_RECOMMENDED'));

        const jsonResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        const warningCodes = data.targetAdapters[0].warnings.map(
            (warning: { code: string }) => warning.code,
        );
        assert.ok(warningCodes.includes('TARGET_ADAPTER_VERSION_RECOMMENDED'));
        assert.ok(warningCodes.includes('TARGET_ADAPTER_POLICY_GRANTS_RECOMMENDED'));
        assert.ok(warningCodes.includes('TARGET_ADAPTER_CONCEPT_SUPPORT_UNAVAILABLE'));
        assert.ok(warningCodes.includes('TARGET_ADAPTER_VALIDATION_EVIDENCE_RECOMMENDED'));
    });

    it('shows canonical package manifests in preview output', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.metaflow/policies/github-pr-read.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.policyGrant/v1',
                            id: 'github-pr-read',
                            authority: 'github.pullRequest.read',
                            approval: 'auto',
                            audit: true,
                        }),
                    },
                    {
                        relativePath: '.metaflow/packages/release-operations.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.package/v1',
                            id: 'release-operations',
                            name: 'Release Operations',
                            kind: 'agent-plugin',
                            agents: ['release-steward'],
                            skills: ['release-readiness'],
                            tools: ['create-pr'],
                            mcpServers: ['github'],
                            hooks: ['release-gate'],
                            policyGrants: ['github-pr-read'],
                            targets: {
                                codex: {
                                    pluginName: 'release-operations',
                                    enabled: true,
                                },
                                'github-copilot': {
                                    pluginName: 'release-operations',
                                },
                            },
                            marketplaceEntries: [
                                {
                                    target: 'codex',
                                    packageName: 'release-operations',
                                    title: 'Release Operations',
                                    summary: 'Release workflow package.',
                                    publisher: 'DynFX',
                                    categories: ['release'],
                                    keywords: ['codex', 'automation'],
                                },
                            ],
                            validationEvidence: ['RUN-055'],
                            runtimeValidation: [
                                {
                                    target: 'codex',
                                    concepts: ['packageManifests', 'sideEffectMcpRuntime'],
                                    harness: 'Codex CLI',
                                    adapterVersion: 'codex-v0.1',
                                    scenario: 'Generated package appears in local marketplace.',
                                    status: 'passed',
                                    command: 'codex plugin list',
                                    evidence: ['RUN-056'],
                                    limitations: ['Cloud package installation is runtime-only.'],
                                },
                                {
                                    target: 'github-copilot',
                                    harness: 'GitHub Copilot',
                                    adapterVersion: 'github-copilot-v0.0',
                                    scenario: 'Marketplace listing reviewed.',
                                    status: 'partial',
                                },
                            ],
                            description: 'Release workflow package.',
                        }),
                    },
                ],
            },
        });

        const textResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes('Package Manifests: 1'));
        assert.ok(textResult.stdout.includes('release-operations [agent-plugin]'));
        assert.ok(textResult.stdout.includes('targets=codex=release-operations:enabled'));
        assert.ok(textResult.stdout.includes('components: agents=release-steward'));
        assert.ok(textResult.stdout.includes('skills=release-readiness'));
        assert.ok(textResult.stdout.includes('tools=create-pr'));
        assert.ok(textResult.stdout.includes('marketplaceEntry: codex'));
        assert.ok(textResult.stdout.includes('package=release-operations'));
        assert.ok(textResult.stdout.includes('categories=release'));
        assert.ok(textResult.stdout.includes('runtimeValidation: codex/Codex CLI passed'));
        assert.ok(
            textResult.stdout.includes('concepts=packageManifests,sideEffectMcpRuntime'),
        );
        assert.ok(textResult.stdout.includes('evidence=RUN-056'));
        assert.ok(textResult.stdout.includes('PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH'));
        assert.ok(textResult.stdout.includes('PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED'));
        assert.ok(textResult.stdout.includes('PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED'));
        assert.ok(textResult.stdout.includes('PACKAGE_TARGET_CONCEPT_PARTIAL'));
        assert.ok(textResult.stdout.includes('[packageManifests]'));

        const jsonResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        assert.strictEqual(data.summary.packageManifests, 1);
        assert.strictEqual(data.packageManifests[0].id, 'release-operations');
        assert.strictEqual(data.packageManifests[0].targets.codex.enabled, true);
        assert.strictEqual(data.packageManifests[0].marketplaceEntries[0].target, 'codex');
        assert.strictEqual(
            data.packageManifests[0].marketplaceEntries[0].packageName,
            'release-operations',
        );
        assert.strictEqual(data.packageManifests[0].runtimeValidation[0].target, 'codex');
        assert.strictEqual(data.packageManifests[0].runtimeValidation[0].evidence[0], 'RUN-056');
        const packageWarningCodes = data.packageManifests[0].warnings.map(
            (warning: { code: string }) => warning.code,
        );
        assert.ok(packageWarningCodes.includes('PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH'));
        assert.ok(packageWarningCodes.includes('PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED'));
        assert.ok(packageWarningCodes.includes('PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED'));
        assert.ok(
            packageWarningCodes.includes('PACKAGE_TARGET_CONCEPT_PARTIAL'),
        );
        assert.ok(
            data.adapterReports.some(
                (report: { managedMetadata: { packageManifests?: number } }) =>
                    report.managedMetadata.packageManifests === 1,
            ),
        );
        const codexReport = data.adapterReports.find(
            (report: { target: string }) => report.target === 'codex',
        );
        assert.ok(
            codexReport.actionItems.some(
                (item: {
                    concept: string;
                    metadataId: string;
                    message: string;
                    evidence: string[];
                }) =>
                    item.concept === 'packageManifests' &&
                    item.metadataId === 'release-operations' &&
                    item.message.includes('Required package policy grants: github-pr-read') &&
                    item.message.includes('Validation evidence: RUN-055') &&
                    item.message.includes('Codex CLI/codex-v0.1 passed') &&
                    item.message.includes('concepts=packageManifests,sideEffectMcpRuntime') &&
                    item.message.includes('Marketplace entries: codex/release-operations') &&
                    item.evidence.includes('RUN-056'),
            ),
        );
        assert.ok(
            codexReport.actionItems.some(
                (item: { concept: string; metadataId: string; message: string }) =>
                    item.concept === 'packageManifests' &&
                    item.metadataId === 'release-operations' &&
                    item.message.includes('PACKAGE_TARGET_CONCEPT_PARTIAL'),
            ),
        );
    });

    it('shows canonical tool metadata in preview output', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.metaflow/policies/github-pr-read.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.policyGrant/v1',
                            id: 'github-pr-read',
                            authority: 'github.pullRequest.read',
                            approval: 'auto',
                            audit: true,
                        }),
                    },
                    {
                        relativePath: '.metaflow/tools/create-pr.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.tool/v1',
                            id: 'create-pr',
                            kind: 'mcp',
                            mcpServer: 'github',
                            mcpTool: 'create_pull_request',
                            policyGrants: ['github-pr-read'],
                            targets: ['codex'],
                            executionProfiles: ['local'],
                            inputSchema: { type: 'object' },
                            description: 'Create a pull request through GitHub MCP.',
                        }),
                    },
                ],
            },
        });

        const textResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes('Tools: 1'));
        assert.ok(textResult.stdout.includes('create-pr [mcp]'));
        assert.ok(textResult.stdout.includes('mcp=github.create_pull_request'));
        assert.ok(textResult.stdout.includes('grants=github-pr-read'));
        assert.ok(textResult.stdout.includes('[tools]'));

        const jsonResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        assert.strictEqual(data.summary.tools, 1);
        assert.strictEqual(data.tools[0].id, 'create-pr');
        assert.strictEqual(data.tools[0].mcpServer, 'github');
        assert.ok(
            data.adapterReports.some(
                (report: { target: string; managedMetadata: { tools?: number } }) =>
                    report.target === 'codex' && report.managedMetadata.tools === 1,
            ),
        );
    });

    it('shows target metadata for canonical MCP server Codex projection', async () => {
        ws = createTestWorkspace({
            config: {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/mcp'],
            },
            layers: {
                'company/mcp': [
                    {
                        relativePath: '.metaflow/policies/github-pr-read.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.policyGrant/v1',
                            id: 'github-pr-read',
                            authority: 'github.pullRequest.read',
                            approval: 'auto',
                            audit: true,
                        }),
                    },
                    {
                        relativePath: '.metaflow/mcp/github.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.mcpServer/v1',
                            id: 'github',
                            transport: 'stdio',
                            invocation: { command: 'github-mcp-server', args: ['stdio'] },
                            requiredSecrets: ['GITHUB_TOKEN'],
                            capabilityCategory: 'source-control',
                            policyGrants: ['github-pr-read'],
                        }),
                    },
                    {
                        relativePath: '.metaflow/mcp/docs.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.mcpServer/v1',
                            id: 'docs',
                            transport: 'streamable-http',
                            endpoint: 'https://mcp.example.test/mcp',
                            bearerTokenEnvVar: 'DOCS_MCP_TOKEN',
                            httpHeaders: { 'X-Client': 'metaflow' },
                            oauthScopes: ['docs.read'],
                            startupTimeoutSeconds: 20,
                            enabledTools: ['search'],
                            defaultToolsApprovalMode: 'prompt',
                            policyGrants: ['github-pr-read'],
                        }),
                    },
                    {
                        relativePath: '.metaflow/targets/codex.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.targetAdapter/v1',
                            id: 'codex-default',
                            target: 'codex',
                            enabled: true,
                            adapterVersion: 'codex-v0.1',
                            materializationMode: 'candidate',
                            concepts: { mcpServers: 'managed' },
                            requiredPolicyGrants: ['github-pr-read'],
                            validationStatus: 'runtimeVerified',
                            validationEvidence: ['RUN-045'],
                        }),
                    },
                ],
            },
        });

        const textResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(textResult.exitCode, 0);
        assert.ok(textResult.stdout.includes('[codex] .codex/config.toml'));
        assert.ok(textResult.stdout.includes('lossiness=lossy'));
        assert.ok(textResult.stdout.includes('target adapter concept mcpServers'));
        assert.ok(textResult.stdout.includes('adapter=codex-default; mode=managed'));

        const jsonResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(jsonResult.stdout);
        const codexConfigChange = data.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === '.codex/config.toml',
        );
        assert.strictEqual(codexConfigChange.action, 'add');
        assert.strictEqual(codexConfigChange.sourceRelativePath, '.metaflow/mcp');
        assert.strictEqual(codexConfigChange.projection.target, 'codex');
        assert.strictEqual(codexConfigChange.projection.sourceFormat, 'metaflow');
        assert.strictEqual(codexConfigChange.projection.lossiness, 'lossy');
        assert.strictEqual(codexConfigChange.projection.targetAdapterConcept, 'mcpServers');
        assert.strictEqual(
            codexConfigChange.projection.targetAdapterMaterializationMode,
            'managed',
        );
        const codexMcpSupport = data.targetCapabilityMatrix.find(
            (entry: { target: string; concept: string }) =>
                entry.target === 'codex' && entry.concept === 'mcpServers',
        );
        assert.ok(codexMcpSupport.evidence.includes('RUN-045'));
    });

    it('applies merged Codex config TOML for managed project config and MCP sections', async () => {
        ws = createTestWorkspace({
            config: {
                metadataRepo: { localPath: '.ai/ai-metadata' },
                layers: ['company/codex'],
            },
            layers: {
                'company/codex': [
                    {
                        relativePath: '.metaflow/project-config/codex.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.codexProjectConfig/v1',
                            id: 'default',
                            settings: {
                                model: 'gpt-5-codex',
                                approvalPolicy: 'on-request',
                                sandboxMode: 'workspace-write',
                            },
                            targets: ['codex'],
                        }),
                    },
                    {
                        relativePath: '.metaflow/policies/github-pr-read.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.policyGrant/v1',
                            id: 'github-pr-read',
                            authority: 'github.pullRequest.read',
                            approval: 'auto',
                            audit: true,
                        }),
                    },
                    {
                        relativePath: '.metaflow/mcp/github.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.mcpServer/v1',
                            id: 'github',
                            transport: 'stdio',
                            invocation: { command: 'github-mcp-server', args: ['stdio'] },
                            requiredSecrets: ['GITHUB_TOKEN'],
                            policyGrants: ['github-pr-read'],
                        }),
                    },
                    {
                        relativePath: '.metaflow/mcp/docs.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.mcpServer/v1',
                            id: 'docs',
                            transport: 'streamable-http',
                            endpoint: 'https://mcp.example.test/mcp',
                            bearerTokenEnvVar: 'DOCS_MCP_TOKEN',
                            httpHeaders: { 'X-Client': 'metaflow' },
                            oauthScopes: ['docs.read'],
                            startupTimeoutSeconds: 20,
                            enabledTools: ['search'],
                            defaultToolsApprovalMode: 'prompt',
                            policyGrants: ['github-pr-read'],
                        }),
                    },
                    {
                        relativePath: '.metaflow/targets/codex.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.targetAdapter/v1',
                            id: 'codex-default',
                            target: 'codex',
                            enabled: true,
                            adapterVersion: 'codex-v0.1',
                            materializationMode: 'candidate',
                            concepts: { projectConfig: 'managed', mcpServers: 'managed' },
                            requiredPolicyGrants: ['github-pr-read'],
                            validationStatus: 'runtimeVerified',
                            validationEvidence: ['RUN-046'],
                        }),
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        const previewData = JSON.parse(previewResult.stdout);
        const codexConfigChange = previewData.pendingChanges.find(
            (change: { relativePath: string }) => change.relativePath === '.codex/config.toml',
        );
        assert.strictEqual(codexConfigChange.action, 'add');
        assert.strictEqual(codexConfigChange.sourceRelativePath, '.metaflow/mcp');
        assert.strictEqual(codexConfigChange.projection.lossiness, 'lossy');
        assert.strictEqual(codexConfigChange.projection.targetAdapterConcept, 'mcpServers');
        assert.strictEqual(
            codexConfigChange.projection.targetAdapterMaterializationMode,
            'managed',
        );

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        const written = fs.readFileSync(path.join(ws.root, '.codex', 'config.toml'), 'utf-8');
        assert.ok(written.includes('model = "gpt-5-codex"'));
        assert.ok(written.includes('approval_policy = "on-request"'));
        assert.ok(written.includes('sandbox_mode = "workspace-write"'));
        assert.ok(written.includes('[mcp_servers.github]'));
        assert.ok(written.includes('command = "github-mcp-server"'));
        assert.ok(written.includes('env_vars = ["GITHUB_TOKEN"]'));
        assert.ok(written.includes('[mcp_servers.docs]'));
        assert.ok(written.includes('url = "https://mcp.example.test/mcp"'));
        assert.ok(written.includes('bearer_token_env_var = "DOCS_MCP_TOKEN"'));
        assert.ok(written.includes('http_headers = { "X-Client" = "metaflow" }'));
        assert.ok(written.includes('scopes = ["docs.read"]'));
        assert.ok(written.includes('startup_timeout_sec = 20'));
        assert.ok(written.includes('enabled_tools = ["search"]'));
        assert.ok(written.includes('default_tools_approval_mode = "prompt"'));
    });

    it('should show no files for empty overlay', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: { 'company/core': [] },
        });

        const result = await runCli(['preview', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No files in overlay'));
    });

    it('should preserve original relative paths when fileNamingStrategy is original-unless-conflict', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
            layers: STANDARD_LAYERS,
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(
            previewResult.stdout.includes(originalSynchronizedPath('skills/testing/SKILL.md')),
        );
        assert.ok(!previewResult.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(fs.existsSync(path.join(ws.root, '.github', 'skills', 'testing', 'SKILL.md')));

        const validateResult = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(validateResult.exitCode, 0);
    });

    it('should fail preview and apply with the same remap message after prefixed outputs already exist', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const initialApply = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(initialApply.exitCode, 0);

        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const previewResult = await runCli(['preview', '-w', ws.root]);
        const applyResult = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(previewResult.exitCode, 1);
        assert.strictEqual(applyResult.exitCode, 1);
        assert.ok(previewResult.stderr.includes('Automatic migration is not supported'));
        assert.ok(applyResult.stderr.includes('Automatic migration is not supported'));
    });

    it('exits early when the config cannot be loaded', async () => {
        ws = createTestWorkspace({});
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ not valid jsonc',
            'utf-8',
        );

        const result = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('emits a JSON error object when preview fails in --json mode', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const initialApply = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(initialApply.exitCode, 0);

        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.ok(typeof data.error === 'string' && data.error.length > 0);
    });

    it('emits structured JSON conflicts for guarded native destination failures', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'AGENTS.md',
                        content: '# Managed Guidance',
                    },
                ],
            },
        });
        fs.writeFileSync(path.join(ws.root, 'AGENTS.md'), '# User Guidance', 'utf-8');

        const result = await runCli(['preview', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.ok(typeof data.error === 'string' && data.error.length > 0);
        assert.strictEqual(data.conflicts.length, 1);
        assert.strictEqual(data.conflicts[0].kind, 'guarded-native-destination');
        assert.strictEqual(data.conflicts[0].destinationRelativePath, 'AGENTS.md');
        assert.ok(
            data.conflicts[0].remediation.includes(
                'target adapter concept to candidate, report-only, or disabled',
            ),
        );
    });

    it('prints surfaced capability conflict warnings', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ layers: ['company/core', 'company/extra'] }),
            layers: {
                'company/core': [{ relativePath: 'skills/dup/SKILL.md', content: 'A' }],
                'company/extra': [{ relativePath: 'skills/dup/SKILL.md', content: 'B' }],
            },
        });

        const result = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Warnings ('), result.stdout);
        assert.ok(result.stdout.includes('CAPABILITY_CONFLICT'), result.stdout);
    });
});

// ── Export command ─────────────────────────────────────────────────

describe('CLI: export-copilot-mcp', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should print GitHub Copilot MCP JSON content to stdout', async () => {
        ws = createMcpHandoffWorkspace();
        const result = await runCli(['export-copilot-mcp', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.deepStrictEqual(JSON.parse(result.stdout), {
            servers: {
                github: {
                    type: 'stdio',
                    command: 'github-mcp-server',
                    args: ['stdio'],
                },
            },
        });
        assert.ok(
            result.stderr.includes(
                'Warning: github: Requires operator-provided secrets: GITHUB_TOKEN.',
            ),
        );
    });

    it('should print the full handoff object with --json', async () => {
        ws = createMcpHandoffWorkspace();
        const result = await runCli(['export-copilot-mcp', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.target, 'github-copilot');
        assert.strictEqual(data.destination, '.vscode/mcp.json');
        assert.strictEqual(data.managed, false);
        assert.strictEqual(data.requiresOperatorReview, true);
        assert.strictEqual(data.servers[0].id, 'github');
        assert.strictEqual(data.servers[0].supported, true);
    });

    it('should write to an explicit output path and protect existing files', async () => {
        ws = createMcpHandoffWorkspace();
        const outputPath = path.join(ws.root, 'exports', 'mcp.json');

        const writeResult = await runCli([
            'export-copilot-mcp',
            '--out',
            'exports/mcp.json',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(writeResult.exitCode, 0);
        assert.ok(writeResult.stdout.includes('Wrote GitHub Copilot MCP handoff: exports'));
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(outputPath, 'utf-8')), {
            servers: {
                github: {
                    type: 'stdio',
                    command: 'github-mcp-server',
                    args: ['stdio'],
                },
            },
        });

        const blockedResult = await runCli([
            'export-copilot-mcp',
            '--out',
            'exports/mcp.json',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(blockedResult.exitCode, 1);
        assert.ok(blockedResult.stderr.includes('Output file already exists'));

        const forceResult = await runCli([
            'export-copilot-mcp',
            '--out',
            'exports/mcp.json',
            '--force',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(forceResult.exitCode, 0);
    });
});

describe('CLI: export-package-marketplace', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should print compact package marketplace candidates to stdout', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli(['export-package-marketplace', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.marketplaces.codex[0].packageId, 'release-operations');
        assert.strictEqual(data.marketplaces.codex[0].packageName, 'release-operations');
        assert.strictEqual(data.marketplaces.codex[0].title, 'Release Operations');
        assert.strictEqual(data.marketplaces['github-copilot'][0].target, 'github-copilot');
        assert.ok(
            result.stderr.includes(
                'PACKAGE_MARKETPLACE_TARGET_DISABLED',
            ),
        );
        assert.ok(
            result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_TARGET_DISABLED'),
        );
        assert.ok(
            result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH'),
        );
        assert.ok(
            result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED'),
        );
        assert.ok(
            result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED'),
        );
        assert.ok(
            result.stderr.includes('PACKAGE_MARKETPLACE_CODEX_PLUGIN_MANIFEST_MISSING'),
        );
    });

    it('should print the full package marketplace review object with --json', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli(['export-package-marketplace', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.managed, false);
        assert.strictEqual(data.requiresOperatorReview, true);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].sourceLayer, 'primary/company/core');
        assert.strictEqual(data.entries[0].runtimeValidation[0].evidence[0], 'RUN-056');
        const warningText = data.warnings.join('\n');
        assert.ok(
            warningText.includes('PACKAGE_MARKETPLACE_TARGET_DISABLED'),
        );
        assert.ok(
            warningText.includes('PACKAGE_RUNTIME_VALIDATION_TARGET_DISABLED'),
        );
        assert.ok(
            warningText.includes('PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH'),
        );
        assert.ok(
            warningText.includes('PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED'),
        );
        assert.ok(
            warningText.includes('PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED'),
        );
        assert.ok(
            warningText.includes('PACKAGE_MARKETPLACE_CODEX_PLUGIN_MANIFEST_MISSING'),
        );
    });

    it('should filter package marketplace entries by target', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli([
            'export-package-marketplace',
            '--target',
            'codex',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.marketplaces.codex.length, 1);
        assert.strictEqual(data.marketplaces['github-copilot'], undefined);
        assert.ok(!result.stderr.includes('PACKAGE_MARKETPLACE_TARGET_DISABLED'));
        assert.ok(!result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_TARGET_DISABLED'));
        assert.ok(!result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_ADAPTER_VERSION_MISMATCH'));
        assert.ok(!result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_EVIDENCE_RECOMMENDED'));
        assert.ok(!result.stderr.includes('PACKAGE_RUNTIME_VALIDATION_SOURCE_RECOMMENDED'));
    });

    it('should export Codex marketplace-shaped package candidates', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli([
            'export-package-marketplace',
            '--format',
            'codex-marketplace',
            '--marketplace-name',
            'Release Packages',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.name, 'release-packages');
        assert.deepStrictEqual(data.plugins, [
            {
                name: 'release-operations',
                source: {
                    source: 'local',
                    path: './.ai/ai-metadata/company/core',
                },
                policy: {
                    installation: 'AVAILABLE',
                    authentication: 'ON_INSTALL',
                },
                category: 'release',
                interface: {
                    displayName: 'Release Operations',
                    description: 'Release workflow package.',
                },
            },
        ]);
        assert.ok(!result.stderr.includes('PACKAGE_MARKETPLACE_TARGET_DISABLED'));
    });

    it('should export GitHub Copilot marketplace-shaped package candidates', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli([
            'export-package-marketplace',
            '--format',
            'github-copilot-marketplace',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.name, 'metaflow-marketplace');
        assert.strictEqual(data.owner.name, path.basename(ws.root));
        assert.deepStrictEqual(data.plugins, [
            {
                name: 'release-operations',
                source: './.ai/ai-metadata/company/core',
            },
        ]);
        assert.ok(result.stderr.includes('PACKAGE_MARKETPLACE_TARGET_DISABLED'));
    });

    it('should reject host-shaped package marketplace exports for mismatched targets', async () => {
        ws = createPackageMarketplaceWorkspace();
        const result = await runCli([
            'export-package-marketplace',
            '--format',
            'codex-marketplace',
            '--target',
            'github-copilot',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('only supports target "codex"'));
    });

    it('should write package marketplace exports to an explicit output path', async () => {
        ws = createPackageMarketplaceWorkspace();
        const outputPath = path.join(ws.root, 'exports', 'package-marketplace.json');

        const writeResult = await runCli([
            'export-package-marketplace',
            '--out',
            'exports/package-marketplace.json',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(writeResult.exitCode, 0);
        assert.ok(writeResult.stdout.includes('Wrote package marketplace export: exports'));
        assert.strictEqual(
            JSON.parse(fs.readFileSync(outputPath, 'utf-8')).marketplaces.codex[0].packageId,
            'release-operations',
        );

        const blockedResult = await runCli([
            'export-package-marketplace',
            '--out',
            'exports/package-marketplace.json',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(blockedResult.exitCode, 1);
        assert.ok(blockedResult.stderr.includes('Output file already exists'));

        const forceResult = await runCli([
            'export-package-marketplace',
            '--out',
            'exports/package-marketplace.json',
            '--force',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(forceResult.exitCode, 0);
    });

    it('should fail when no package marketplace entries are configured', async () => {
        ws = createTestWorkspace({ config: standardConfig() });
        const result = await runCli(['export-package-marketplace', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('No package marketplace entries are configured'));
    });
});

describe('CLI: target-support', () => {
    it('prints filtered target support rows without requiring workspace config', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--support',
            'runtime-only',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Target Support Matrix: 26'));
        assert.ok(
            result.stdout.includes(
                'Runtime-only support boundaries: 26 rows require operator or harness evidence; codex=26 see docs/CODEX-SUPPORT.md.',
            ),
        );
        assert.ok(result.stdout.includes('codex/chronicleRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/appshotsRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/recordReplayRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/importRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/modelProviderRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/enterprisePolicyRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/agentRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/automationRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/authenticationRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/appConnectorRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/cloudEnvironmentRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/localCloudHandoff: runtime-only'));
        assert.ok(result.stdout.includes('codex/issuePrOperation: runtime-only'));
        assert.ok(result.stdout.includes('codex/reviewRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/remoteConnectionRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/remoteMcpRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/oauthMcpRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/permissionRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/sideEffectMcpRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/pluginRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/memoryRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/browserRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/chromeRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/computerUseRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/sitesRuntime: runtime-only'));
        assert.ok(result.stdout.includes('codex/evaluationRuntime: runtime-only'));
    });

    it('prints concept-specific Codex support guide references', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'tools',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/tools: partial'));
        assert.ok(result.stdout.includes('docs: docs/CODEX-TOOL-AUTHORITY-GUIDE.md'));
    });

    it('prints evaluation runtime evidence support in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'evaluationSupport',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/evaluationSupport: partial'));
        assert.ok(
            result.stdout.includes(
                'Evaluation profiles can distinguish static projection checks from harness-native runtime evaluations',
            ),
        );
        assert.ok(result.stdout.includes('evidence: RUN-027, RUN-030, RUN-037, RUN-060'));
    });

    it('prints evaluation runtime execution boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'evaluationRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/evaluationRuntime: runtime-only'));
        assert.ok(result.stdout.includes('harness benchmark runs'));
        assert.ok(
            result.stdout.includes(
                'cannot execute benchmark tasks, create hosted evaluation environments',
            ),
        );
        assert.ok(result.stdout.includes('evidence: RUN-068'));
    });

    it('prints plugin runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'pluginRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/pluginRuntime: runtime-only'));
        assert.ok(result.stdout.includes('installed Codex plugins'));
        assert.ok(result.stdout.includes('cannot install plugins into Codex'));
        assert.ok(result.stdout.includes('evidence: RUN-069'));
    });

    it('prints cloud environment runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'cloudEnvironmentRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/cloudEnvironmentRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex Cloud environments'));
        assert.ok(result.stdout.includes('setup scripts'));
        assert.ok(result.stdout.includes('internet access policy'));
        assert.ok(result.stdout.includes('evidence: RUN-070'));
    });

    it('prints app connector runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'appConnectorRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/appConnectorRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex Slack app'));
        assert.ok(result.stdout.includes('Codex Linear connector'));
        assert.ok(result.stdout.includes('link user accounts'));
        assert.ok(result.stdout.includes('evidence: RUN-071'));
    });

    it('prints agent runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'agentRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/agentRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex subagent workflows'));
        assert.ok(result.stdout.includes('cannot spawn subagents'));
        assert.ok(result.stdout.includes('inherited runtime authority'));
        assert.ok(result.stdout.includes('evidence: RUN-072'));
    });

    it('prints automation runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'automationRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/automationRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex app automations'));
        assert.ok(result.stdout.includes('cannot create or update scheduled automations'));
        assert.ok(result.stdout.includes('run unattended'));
        assert.ok(result.stdout.includes('evidence: RUN-073'));
    });

    it('prints authentication runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'authenticationRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/authenticationRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex sign-in session'));
        assert.ok(result.stdout.includes('OpenAI API key authentication'));
        assert.ok(result.stdout.includes('cannot sign in users'));
        assert.ok(result.stdout.includes('evidence: RUN-074'));
    });

    it('prints permission runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'permissionRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/permissionRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex sandbox enforcement'));
        assert.ok(result.stdout.includes('approval prompts'));
        assert.ok(result.stdout.includes('cannot grant runtime permissions'));
        assert.ok(result.stdout.includes('evidence: RUN-075'));
    });

    it('prints enterprise policy runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'enterprisePolicyRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/enterprisePolicyRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex managed configuration'));
        assert.ok(result.stdout.includes('cloud-managed requirements.toml policies'));
        assert.ok(result.stdout.includes('cannot assign Codex Admin roles'));
        assert.ok(result.stdout.includes('evidence: RUN-079'));
    });

    it('prints review runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'reviewRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/reviewRuntime: runtime-only'));
        assert.ok(result.stdout.includes('GitHub-triggered @codex review'));
        assert.ok(result.stdout.includes('automatic Codex code review'));
        assert.ok(result.stdout.includes('cannot open the review pane'));
        assert.ok(result.stdout.includes('evidence: RUN-076'));
    });

    it('prints remote connection runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'remoteConnectionRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/remoteConnectionRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex mobile remote control'));
        assert.ok(result.stdout.includes('Codex SSH host projects'));
        assert.ok(result.stdout.includes('cannot pair devices'));
        assert.ok(result.stdout.includes('evidence: RUN-077'));
    });

    it('prints Chronicle runtime boundaries in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'chronicleRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/chronicleRuntime: runtime-only'));
        assert.ok(result.stdout.includes('Codex Chronicle'));
        assert.ok(result.stdout.includes('macOS Screen Recording permission'));
        assert.ok(result.stdout.includes('cannot enable Memories'));
        assert.ok(result.stdout.includes('evidence: RUN-078'));
    });

    it('prints Codex programmatic execution support in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'executionSurfaces',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/executionSurfaces: partial'));
        assert.ok(result.stdout.includes('Codex GitHub Action'));
        assert.ok(result.stdout.includes('Codex app-server'));
        assert.ok(result.stdout.includes('Codex SDK'));
        assert.ok(
            result.stdout.includes(
                'Execution profiles can classify issue/PR-native, GitHub Action, app-server, SDK-embedded',
            ),
        );
        assert.ok(result.stdout.includes('evidence: RUN-035, RUN-052, RUN-062'));
    });

    it('prints Codex command rules support in target-support output', async () => {
        const result = await runCli([
            'target-support',
            '--target',
            'codex',
            '--concept',
            'commandRules',
        ]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('codex/commandRules: partial'));
        assert.ok(result.stdout.includes('.codex/rules/*.rules'));
        assert.ok(result.stdout.includes('Codex execpolicy check'));
        assert.ok(result.stdout.includes('evidence: RUN-024, RUN-064'));
    });

    it('prints target support rows as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--concept',
            'mcpServers',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.generatedBy, 'metaflow target-support');
        assert.strictEqual(data.filters.target, 'codex');
        assert.strictEqual(data.filters.concept, 'mcpServers');
        assert.strictEqual(data.summary.entries, 1);
        assert.strictEqual(data.summary.targets.codex, 1);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].concept, 'mcpServers');
        assert.strictEqual(data.entries[0].support, 'partial');
        assert.strictEqual(data.entries[0].documentation, 'docs/CODEX-SUPPORT.md');
        assert.ok(data.entries[0].notes.some((note: string) => note.includes('Side-effecting MCP')));
    });

    it('prints evaluation runtime evidence support as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--concept',
            'evaluationSupport',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].concept, 'evaluationSupport');
        assert.strictEqual(data.entries[0].support, 'partial');
        assert.ok(data.entries[0].evidence.includes('RUN-060'));
        assert.ok(
            data.entries[0].notes.some((note: string) =>
                note.includes('harness-native runtime evaluations'),
            ),
        );
    });

    it('prints evaluation runtime execution boundaries as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--concept',
            'evaluationRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].concept, 'evaluationRuntime');
        assert.strictEqual(data.entries[0].support, 'runtime-only');
        assert.ok(data.entries[0].evidence.includes('RUN-068'));
        assert.ok(
            data.entries[0].notes.some((note: string) =>
                note.includes('cannot execute benchmark tasks'),
            ),
        );
    });

    it('prints plugin runtime boundaries as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--concept',
            'pluginRuntime',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].concept, 'pluginRuntime');
        assert.strictEqual(data.entries[0].support, 'runtime-only');
        assert.ok(data.entries[0].evidence.includes('RUN-069'));
        assert.ok(
            data.entries[0].notes.some((note: string) =>
                note.includes('cannot install plugins into Codex'),
            ),
        );
    });

    it('prints Codex package support guide references as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--concept',
            'packageManifests',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.entries[0].target, 'codex');
        assert.strictEqual(data.entries[0].concept, 'packageManifests');
        assert.strictEqual(
            data.entries[0].documentation,
            'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
        );
    });

    it('prints target support runtime-only documentation references as JSON', async () => {
        const result = await runCli([
            'target-support',
            '--json',
            '--target',
            'codex',
            '--support',
            'runtime-only',
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.deepStrictEqual(data.supportReference, {
            runtimeOnlyCount: 26,
            targets: [
                {
                    target: 'codex',
                    runtimeOnlyCount: 26,
                    documentation: 'docs/CODEX-SUPPORT.md',
                },
            ],
        });
    });

    it('rejects unknown support filters', async () => {
        const result = await runCli(['target-support', '--support', 'complete']);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('--support must be one of'));
    });
});

describe('CLI: codex-support-boundaries', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('prints Codex support boundaries as Markdown without requiring workspace config', async () => {
        const result = await runCli(['codex-support-boundaries']);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('# Codex Support Boundaries'));
        assert.ok(result.stdout.includes('Generated by `metaflow codex-support-boundaries`.'));
        assert.ok(result.stdout.includes('## File-Backed and Reviewable Surfaces'));
        assert.ok(result.stdout.includes('## Runtime-Only Codex Surfaces'));
        assert.ok(result.stdout.includes('agentRuntime'));
        assert.ok(result.stdout.includes('automationRuntime'));
        assert.ok(result.stdout.includes('authenticationRuntime'));
        assert.ok(result.stdout.includes('permissionRuntime'));
        assert.ok(result.stdout.includes('reviewRuntime'));
        assert.ok(result.stdout.includes('remoteConnectionRuntime'));
        assert.ok(result.stdout.includes('chronicleRuntime'));
        assert.ok(result.stdout.includes('appConnectorRuntime'));
        assert.ok(result.stdout.includes('cloudEnvironmentRuntime'));
        assert.ok(result.stdout.includes('localCloudHandoff'));
        assert.ok(result.stdout.includes('issuePrOperation'));
        assert.ok(result.stdout.includes('remoteMcpRuntime'));
        assert.ok(result.stdout.includes('oauthMcpRuntime'));
        assert.ok(result.stdout.includes('sideEffectMcpRuntime'));
        assert.ok(result.stdout.includes('memoryRuntime'));
        assert.ok(result.stdout.includes('browserRuntime'));
        assert.ok(result.stdout.includes('chromeRuntime'));
        assert.ok(result.stdout.includes('computerUseRuntime'));
        assert.ok(result.stdout.includes('sitesRuntime'));
        assert.ok(result.stdout.includes('evaluationRuntime'));
        assert.ok(result.stdout.includes('pluginRuntime'));
        assert.ok(result.stdout.includes('## Not Achievable By Repository Projection Alone'));
        assert.ok(result.stdout.includes('Creating Codex Cloud environments'));
        assert.ok(result.stdout.includes('Enabling Codex Memories'));
        assert.ok(result.stdout.includes('MCP OAuth'));
        assert.ok(result.stdout.includes('## Related Operator Guides'));
        assert.ok(result.stdout.includes('docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md'));
        assert.ok(result.stdout.includes('docs/CODEX-TOOL-AUTHORITY-GUIDE.md'));
    });

    it('prints Codex support boundaries as JSON', async () => {
        const result = await runCli(['codex-support-boundaries', '--json']);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.generatedBy, 'metaflow codex-support-boundaries');
        assert.strictEqual(data.runtimeOnlyCount, 26);
        assert.ok(
            data.fileBackedRows.some(
                (entry: { target: string; concept: string; support: string }) =>
                    entry.target === 'codex' &&
                    entry.concept === 'skills' &&
                    entry.support === 'supported',
            ),
        );
        assert.deepStrictEqual(
            data.runtimeOnlyRows.map((entry: { concept: string }) => entry.concept).sort(),
            [
                'agentRuntime',
                'appConnectorRuntime',
                'appshotsRuntime',
                'authenticationRuntime',
                'automationRuntime',
                'browserRuntime',
                'chromeRuntime',
                'chronicleRuntime',
                'cloudEnvironmentRuntime',
                'computerUseRuntime',
                'enterprisePolicyRuntime',
                'evaluationRuntime',
                'importRuntime',
                'issuePrOperation',
                'localCloudHandoff',
                'memoryRuntime',
                'modelProviderRuntime',
                'oauthMcpRuntime',
                'permissionRuntime',
                'pluginRuntime',
                'recordReplayRuntime',
                'remoteConnectionRuntime',
                'remoteMcpRuntime',
                'reviewRuntime',
                'sideEffectMcpRuntime',
                'sitesRuntime',
            ],
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Creating Codex Cloud environments'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Enabling Codex Memories'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Enabling Chronicle'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Creating Appshots'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Recording UI actions'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Launching the Codex import flow'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Selecting active Codex model providers'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Signing in users'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Granting runtime permissions'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Assigning enterprise roles'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Opening Codex review panes'),
            ),
        );
        assert.ok(
            data.notAchievableByRepositoryProjection.some((item: string) =>
                item.includes('Pairing remote devices'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Cloud or channel delegation'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('App connector runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Agent runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Automation runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Authentication runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Permission runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Enterprise policy runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Review runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Remote connection runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Chronicle runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Appshots runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Record & Replay runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Import runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Model provider runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Cloud environment runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Memory runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Browser, Chrome, Computer Use, and Sites runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Evaluation runtime'),
            ),
        );
        assert.ok(
            data.runtimeEvidenceExpected.some((item: string) =>
                item.includes('Plugin runtime'),
            ),
        );
        assert.deepStrictEqual(data.relatedGuides, [
            'docs/CODEX-SUPPORT.md',
            'docs/CODEX-OPERATOR-WALKTHROUGH.md',
            'docs/CODEX-PACKAGE-MAINTAINER-GUIDE.md',
            'docs/CODEX-TOOL-AUTHORITY-GUIDE.md',
        ]);
        assert.ok(data.content.includes('# Codex Support Boundaries'));
        assert.ok(data.content.includes('## Runtime Evidence Expected'));
    });

    it('writes Codex support boundaries to an explicit output path', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const outputPath = path.join(ws.root, 'reports', 'codex-support-boundaries.md');

        const writeResult = await runCli([
            'codex-support-boundaries',
            '--out',
            'reports/codex-support-boundaries.md',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(writeResult.exitCode, 0);
        assert.ok(writeResult.stdout.includes('Wrote Codex support boundaries report: reports'));
        assert.ok(fs.readFileSync(outputPath, 'utf-8').includes('# Codex Support Boundaries'));

        const blockedResult = await runCli([
            'codex-support-boundaries',
            '--out',
            'reports/codex-support-boundaries.md',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(blockedResult.exitCode, 1);
        assert.ok(blockedResult.stderr.includes('Output file already exists'));

        const forceResult = await runCli([
            'codex-support-boundaries',
            '--out',
            'reports/codex-support-boundaries.md',
            '--force',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(forceResult.exitCode, 0);
    });

    it('writes Codex support boundaries JSON to an explicit output path', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const outputPath = path.join(ws.root, 'reports', 'codex-support-boundaries.json');

        const result = await runCli([
            'codex-support-boundaries',
            '--json',
            '--out',
            'reports/codex-support-boundaries.json',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        assert.strictEqual(data.generatedBy, 'metaflow codex-support-boundaries');
        assert.strictEqual(data.runtimeOnlyCount, 26);
        assert.strictEqual(data.runtimeOnlyRows.length, 26);
        assert.ok(data.notAchievableByRepositoryProjection.length > 0);
    });

    it('rejects Codex support boundary output paths outside the workspace', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli([
            'codex-support-boundaries',
            '--out',
            '../codex-support-boundaries.md',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Output path must stay within the workspace'));
    });
});

describe('CLI: migration-suggestions', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('prints review-only canonical migration suggestions for legacy and host-native metadata', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'CAPABILITY.md',
                        content: '# Release Operations\nRelease workflows.',
                    },
                    {
                        relativePath: 'instructions/release.instructions.md',
                        content: '# Release Instructions\nRun release checks.',
                    },
                    {
                        relativePath: '.github/prompts/review.prompt.md',
                        content: '# Review Prompt\nReview this change.',
                    },
                    {
                        relativePath: '.agents/skills/release-readiness/SKILL.md',
                        content: '# Release Readiness\nCheck release readiness.',
                    },
                    {
                        relativePath: '.codex/config.toml',
                        content: 'model = "gpt-5-codex"\n',
                    },
                ],
            },
        });

        const result = await runCli(['migration-suggestions', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('MetaFlow Migration Suggestions'));
        assert.ok(result.stdout.includes('Writes files: no'));
        assert.ok(result.stdout.includes('CAPABILITY.md -> .metaflow/README.md'));
        assert.ok(
            result.stdout.includes(
                'instructions/release.instructions.md -> .metaflow/instructions/release.md',
            ),
        );
        assert.ok(
            result.stdout.includes(
                '.github/prompts/review.prompt.md -> .metaflow/prompts/review.md',
            ),
        );
        assert.ok(
            result.stdout.includes(
                '.agents/skills/release-readiness/SKILL.md -> .metaflow/skills/release-readiness/SKILL.md',
            ),
        );
        assert.ok(
            result.stdout.includes('.codex/config.toml -> .metaflow/project-config/default.json'),
        );
    });

    it('prints migration suggestions as JSON and flags duplicate canonical copies', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.agents/skills/release-readiness/SKILL.md',
                        content: '# Release Readiness\nCheck release readiness.',
                    },
                    {
                        relativePath: '.metaflow/skills/release-readiness/SKILL.md',
                        content: '# Release Readiness\nCheck release readiness.',
                    },
                ],
            },
        });

        const result = await runCli(['migration-suggestions', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.generatedBy, 'metaflow migration-suggestions');
        assert.strictEqual(data.managed, false);
        assert.strictEqual(data.writesFiles, false);
        assert.strictEqual(data.summary.suggestions, 1);
        assert.strictEqual(data.summary.duplicates, 1);
        assert.strictEqual(data.summary.byCanonicalKind.skill, 1);
        assert.strictEqual(data.suggestions[0].action, 'review-duplicate');
        assert.strictEqual(data.suggestions[0].sourceFormat, 'codex');
        assert.strictEqual(data.suggestions[0].lossiness, 'none');
        assert.ok(
            data.warnings[0].includes(
                '.agents/skills/release-readiness/SKILL.md maps to .metaflow/skills/release-readiness/SKILL.md',
            ),
        );
    });

    it('reports no migration suggestions for canonical-only metadata', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.metaflow/skills/release-readiness/SKILL.md',
                        content: '# Release Readiness\nCheck release readiness.',
                    },
                ],
            },
        });

        const result = await runCli(['migration-suggestions', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Suggestions: 0'));
        assert.ok(result.stdout.includes('No legacy or host-native metadata migration suggestions found.'));
    });

    it('writes migration suggestion reports to explicit output paths', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'AGENTS.md',
                        content: '# Agent Instructions\nUse repository guidance.',
                    },
                ],
            },
        });
        const markdownPath = path.join(ws.root, 'reports', 'migration-suggestions.md');
        const jsonPath = path.join(ws.root, 'reports', 'migration-suggestions.json');

        const markdownResult = await runCli([
            'migration-suggestions',
            '--out',
            'reports/migration-suggestions.md',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(markdownResult.exitCode, 0);
        assert.ok(
            markdownResult.stdout.includes(
                'Wrote migration suggestions report: reports',
            ),
        );
        assert.ok(
            fs
                .readFileSync(markdownPath, 'utf-8')
                .includes('AGENTS.md -> .metaflow/instructions/agents.md'),
        );

        const blockedResult = await runCli([
            'migration-suggestions',
            '--out',
            'reports/migration-suggestions.md',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(blockedResult.exitCode, 1);
        assert.ok(blockedResult.stderr.includes('Output file already exists'));

        const forceResult = await runCli([
            'migration-suggestions',
            '--out',
            'reports/migration-suggestions.md',
            '--force',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(forceResult.exitCode, 0);

        const jsonResult = await runCli([
            'migration-suggestions',
            '--json',
            '--out',
            'reports/migration-suggestions.json',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(jsonResult.exitCode, 0);
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        assert.strictEqual(data.generatedBy, 'metaflow migration-suggestions');
        assert.strictEqual(data.suggestions[0].canonicalPath, '.metaflow/instructions/agents.md');
    });

    it('rejects migration suggestion output paths outside the workspace', async () => {
        ws = createTestWorkspace({ config: standardConfig(), layers: STANDARD_LAYERS });

        const result = await runCli([
            'migration-suggestions',
            '--out',
            '../migration-suggestions.md',
            '-w',
            ws.root,
        ]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Output path must stay within the workspace'));
    });
});

// ── Apply command ──────────────────────────────────────────────────

describe('CLI: apply', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should synchronize classified files to .github/', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Done:'));

        // Synchronized files should exist in .github/
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        assert.ok(fs.existsSync(skillPath), 'skill file should be synchronized');
        assert.ok(fs.existsSync(agentPath), 'agent file should be synchronized');

        // Should have provenance header
        const skillContent = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(skillContent.includes('metaflow:provenance'), 'should have provenance header');
        assert.ok(skillContent.includes('# Testing Skill'), 'should preserve original content');

        // Settings files should NOT be synchronized into .github
        const instrPath = path.join(ws.root, '.github', 'instructions', 'coding.md');
        assert.ok(!fs.existsSync(instrPath), 'settings file should not be synchronized');
    });

    it('should create managed state after apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        assert.ok(fs.existsSync(statePath), 'managed state should be created');

        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.strictEqual(state.version, 1);
        assert.ok(
            state.files[synchronizedPath('skills/testing/SKILL.md')],
            'state should track skill file',
        );
        assert.ok(
            state.files[synchronizedPath('agents/reviewer.agent.md')],
            'state should track agent file',
        );
        assert.strictEqual(
            state.files[synchronizedPath('skills/testing/SKILL.md')].sourceRelativePath,
            'skills/testing/SKILL.md',
        );
    });

    it('should be idempotent — second apply produces same output', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // First apply
        const r1 = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(r1.exitCode, 0);

        // Read file content after first apply
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        const contentAfterFirst = fs.readFileSync(skillPath, 'utf-8');

        // Second apply (updates the provenance timestamp, but body is same)
        const r2 = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(r2.exitCode, 0);

        // The file should still exist and contain the original body
        const contentAfterSecond = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(contentAfterSecond.includes('# Testing Skill'));
    });

    it('should synchronize Codex repository skills to root .agents/skills', async () => {
        const codexSkillPath = '.agents/skills/codex-metadata/SKILL.md';
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: codexSkillPath,
                        content: '# Codex Metadata\nCodex repository guidance.',
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes(codexSkillPath));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(applyResult.stdout.includes(`write  [codex] ${codexSkillPath}`));

        const rootSkillPath = path.join(ws.root, '.agents', 'skills', 'codex-metadata', 'SKILL.md');
        assert.ok(fs.existsSync(rootSkillPath), 'Codex skill should be synchronized at repo root');
        assert.ok(
            !fs.existsSync(
                path.join(ws.root, '.github', '.agents', 'skills', 'codex-metadata', 'SKILL.md'),
            ),
            'Codex skill should not be nested under .github',
        );

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.ok(state.files[codexSkillPath], 'state should track the root Codex skill');
        assert.strictEqual(state.files[codexSkillPath].projectionTarget, 'codex');

        const cleanResult = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(cleanResult.exitCode, 0);
        assert.ok(cleanResult.stdout.includes(`remove [codex] ${codexSkillPath}`));
        assert.ok(!fs.existsSync(rootSkillPath), 'clean should remove the managed Codex skill');
    });

    it('should synchronize Codex project instructions to root AGENTS.md', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'AGENTS.md',
                        content: '# Repository Guidance\nCodex project instructions.',
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes('AGENTS.md'));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);

        const rootGuidancePath = path.join(ws.root, 'AGENTS.md');
        assert.ok(
            fs.existsSync(rootGuidancePath),
            'Codex project instructions should be synchronized at repo root',
        );
        assert.ok(
            !fs.existsSync(path.join(ws.root, '.github', 'AGENTS.md')),
            'Codex project instructions should not be nested under .github',
        );

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.ok(state.files['AGENTS.md'], 'state should track root Codex project instructions');
    });

    it('should synchronize Codex project config without inline provenance', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.codex/config.toml',
                        content: 'sandbox_mode = "workspace-write"\n',
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes('.codex/config.toml'));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);

        const rootConfigPath = path.join(ws.root, '.codex', 'config.toml');
        assert.ok(
            fs.existsSync(rootConfigPath),
            'Codex project config should be synchronized at repo root',
        );
        assert.ok(
            !fs.existsSync(path.join(ws.root, '.github', '.codex', 'config.toml')),
            'Codex project config should not be nested under .github',
        );

        const written = fs.readFileSync(rootConfigPath, 'utf-8');
        assert.strictEqual(written, 'sandbox_mode = "workspace-write"\n');
        assert.ok(!written.includes('metaflow:provenance'));

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.ok(state.files['.codex/config.toml'], 'state should track Codex project config');
    });

    it('should synchronize Codex worktree include without inline provenance', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.worktreeinclude',
                        content: '.env.local\nconfig/secrets.json\n',
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes('.worktreeinclude'));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);

        const rootIncludePath = path.join(ws.root, '.worktreeinclude');
        assert.ok(
            fs.existsSync(rootIncludePath),
            'Codex worktree include should be synchronized at repo root',
        );
        assert.ok(
            !fs.existsSync(path.join(ws.root, '.github', '.worktreeinclude')),
            'Codex worktree include should not be nested under .github',
        );

        const written = fs.readFileSync(rootIncludePath, 'utf-8');
        assert.strictEqual(written, '.env.local\nconfig/secrets.json\n');
        assert.ok(!written.includes('metaflow:provenance'));

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.ok(state.files['.worktreeinclude'], 'state should track Codex worktree include');
        assert.strictEqual(state.files['.worktreeinclude'].projectionTarget, 'codex');
    });

    it('should keep managed Codex command rules candidate-only without policy grants', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.codex/rules/release.rules',
                        content:
                            'prefix_rule(\n  pattern = ["gh", "pr", "view"],\n  decision = "prompt",\n)\n',
                    },
                    {
                        relativePath: '.metaflow/targets/codex.json',
                        content: JSON.stringify({
                            schemaVersion: 'metaflow.targetAdapter/v1',
                            id: 'codex-default',
                            target: 'codex',
                            enabled: true,
                            adapterVersion: 'codex-v0.1',
                            materializationMode: 'candidate',
                            concepts: { commandRules: 'managed' },
                            validationStatus: 'staticVerified',
                            validationEvidence: ['RUN-065'],
                        }),
                    },
                ],
            },
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(
            previewResult.stdout.includes(
                'skip [codex] .codex/rules/release.rules (target-adapter-candidate)',
            ),
        );
        const jsonPreviewResult = await runCli(['preview', '-w', ws.root, '--json']);
        assert.strictEqual(jsonPreviewResult.exitCode, 0);
        const previewData = JSON.parse(jsonPreviewResult.stdout);
        const commandRuleChange = previewData.pendingChanges.find(
            (change: { relativePath: string }) =>
                change.relativePath === '.codex/rules/release.rules',
        );
        assert.strictEqual(commandRuleChange?.projection.targetAdapterConcept, 'commandRules');
        assert.strictEqual(
            commandRuleChange?.projection.targetAdapterMaterializationMode,
            'candidate',
        );

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(
            applyResult.stdout.includes('skip   [codex] .codex/rules/release.rules'),
        );
        assert.ok(
            applyResult.stderr.includes(
                'Skipped .codex/rules/release.rules: target adapter materialization mode candidate',
            ),
        );
        assert.ok(!fs.existsSync(path.join(ws.root, '.codex', 'rules', 'release.rules')));
    });
});

// ── Drift detection + promote ──────────────────────────────────────

describe('CLI: drift and promote', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should detect no drift on clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No locally modified files'));
    });

    it('should detect drift after manual file edit (exit code 2)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply first
        await runCli(['apply', '-w', ws.root]);

        // Manually edit a managed file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'I was locally modified by the user.\n');

        // Promote should detect drift
        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 2);
        assert.ok(result.stdout.includes('locally modified'));
        assert.ok(result.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));
    });

    it('should skip drifted files on re-apply (without --force)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually edit
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Locally modified.\n');

        // Re-apply should skip the drifted file
        const result = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('skip'));

        // Drifted content should be preserved
        const content = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(content.includes('Locally modified'));
    });

    it('should overwrite drifted files with --force', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually edit
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Locally modified.\n');

        // Force apply should overwrite
        const result = await runCli(['apply', '--force', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        // Content should be restored from source
        const content = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(content.includes('# Testing Skill'));
    });
});

// ── Clean command ──────────────────────────────────────────────────

describe('CLI: clean', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should remove all managed files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply first
        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        assert.ok(fs.existsSync(skillPath), 'file should exist after apply');

        // Clean
        const result = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Done:'));
        assert.ok(!fs.existsSync(skillPath), 'file should be removed after clean');
    });

    it('should not remove drifted files during clean', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Modify a file to cause drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'User content.\n');

        // Clean should skip the drifted file
        const result = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(fs.existsSync(skillPath), 'drifted file should be preserved');
        assert.ok(result.stdout.includes('skip'));
    });
});

// ── Profile command ────────────────────────────────────────────────

describe('CLI: profile', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should list available profiles', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'list', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('default'));
        assert.ok(result.stdout.includes('(active)'));
        assert.ok(result.stdout.includes('lean'));
    });

    it('should set active profile', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'set', 'lean', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('"lean"'));

        // Verify config file was updated
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(config.activeProfile, 'lean');
    });

    it('should reject unknown profile name', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'set', 'nonexistent', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('not found'));
    });

    it('profile switch should affect synchronization', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with default profile (all files)
        await runCli(['apply', '-w', ws.root]);
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        assert.ok(fs.existsSync(agentPath), 'agent file should exist with default profile');

        // Switch to lean profile (disables agents/**) and re-apply
        await runCli(['profile', 'set', 'lean', '-w', ws.root]);
        await runCli(['apply', '-w', ws.root]);

        // After lean profile, agent file should be removed (no longer in overlay)
        assert.ok(!fs.existsSync(agentPath), 'agent file should be removed with lean profile');
    });
});

// ── Full lifecycle ─────────────────────────────────────────────────

describe('CLI: full lifecycle', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('init → status → preview → apply → promote → clean', async () => {
        // 1. Start with empty workspace + metadata repo
        ws = createTestWorkspace({
            layers: STANDARD_LAYERS,
        });

        // 2. Init a config
        const initResult = await runCli(['init', '-w', ws.root]);
        assert.strictEqual(initResult.exitCode, 0);

        // 3. Overwrite with our standard config (init creates a template)
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, JSON.stringify(standardConfig(), null, 2), 'utf-8');

        // 4. Status
        const statusResult = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(statusResult.exitCode, 0);
        assert.ok(statusResult.stdout.includes('Files:'));

        // 5. Preview
        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes('Effective files:'));

        // 6. Apply
        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(applyResult.stdout.includes('Done:'));

        // 7. Promote (should be clean)
        const promoteResult = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(promoteResult.exitCode, 0);
        assert.ok(promoteResult.stdout.includes('No locally modified'));

        // 8. Clean
        const cleanResult = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(cleanResult.exitCode, 0);
        assert.ok(cleanResult.stdout.includes('Done:'));
    });
});

// ── JSON output ────────────────────────────────────────────────────

describe('CLI: --json output', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('status --json returns valid JSON', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.ok(data.configPath);
        assert.strictEqual(data.activeProfile, 'default');
        assert.strictEqual(data.injection.modes.instructions, 'settings');
        assert.ok(Array.isArray(data.injection.settingsEntries));
        assert.ok(Array.isArray(data.sources));
        assert.ok(typeof data.files.total === 'number');
        assert.ok(typeof data.files.settings === 'number');
        assert.ok(typeof data.files.synchronized === 'number');
    });

    it('preview --json returns valid JSON with files and changes', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.ok(Array.isArray(data.effectiveFiles));
        assert.ok(Array.isArray(data.pendingChanges));
        assert.ok(data.effectiveFiles.length > 0);

        // Check structure
        const first = data.effectiveFiles[0];
        assert.ok(first.relativePath);
        assert.ok(first.classification);
        assert.ok(first.sourceLayer);
    });
});

// ── Error handling ─────────────────────────────────────────────────

describe('CLI: error handling', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should handle missing metadata repo gracefully', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            // No layers created — repo path doesn't exist on disk
            noRepo: true,
        });

        // Status should still work (0 files)
        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Files:'));
    });

    it('should handle invalid JSON config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{ invalid json {{', 'utf-8');

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });

    it('should show help text', async () => {
        const result = await runCli(['--help']);
        assert.ok(result.stdout.includes('metaflow'));
        assert.ok(result.stdout.includes('status'));
        assert.ok(result.stdout.includes('apply'));
        assert.ok(result.stdout.includes('clean'));
        assert.ok(result.stdout.includes('validate'));
    });

    it('should show version', async () => {
        const result = await runCli(['--version']);
        assert.ok(result.stdout.includes(packageMetadata.version));
    });
});

// ── Validate command (CI) ──────────────────────────────────────────

describe('CLI: validate', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should pass validation after clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('passed'));
        assert.ok(result.stdout.includes('Target Capability Support: 82'));
        assert.ok(
            result.stdout.includes(
                'Runtime-only support boundaries: 42 rows require operator or harness evidence',
            ),
        );
    });

    it('should fail validation when drifted', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually modify a managed file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'User edits.\n');

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('failed'));
        assert.ok(result.stdout.includes('drifted'));
    });

    it('should fail validation when files are missing (never applied)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't apply — validate should detect unmanaged files
        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('unmanaged'));
    });

    it('validate --json returns structured result', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, true);
        assert.strictEqual(data.summary.drifted, 0);
        assert.strictEqual(data.summary.missing, 0);
        assert.strictEqual(data.summary.unmanaged, 0);
        assert.strictEqual(data.summary.stale, 0);
        assert.strictEqual(data.targetCapabilitySupport.entries, 82);
        assert.ok(
            data.targetCapabilitySupport.targets.some(
                (entry: { target: string; counts: Record<string, number> }) =>
                    entry.target === 'codex' && entry.counts['runtime-only'] === 26,
            ),
        );
        assert.strictEqual(data.targetCapabilitySupport.supportReference.runtimeOnlyCount, 42);
    });

    it('validate --json shows drift details', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Drift a file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Drifted!\n');

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, false);
        assert.strictEqual(data.summary.drifted, 1);
        assert.ok(data.drifted.includes(synchronizedPath('skills/testing/SKILL.md')));
    });

    it('validate includes repo-wide copilot instructions in expected synchronized files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        const beforeApply = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(beforeApply.exitCode, 1);
        const beforeData = JSON.parse(beforeApply.stdout);
        assert.ok(beforeData.unmanaged.includes('copilot-instructions.md'));

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(path.join(ws.root, '.github', 'copilot-instructions.md'), 'local edit');

        const afterDrift = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(afterDrift.exitCode, 1);
        const afterData = JSON.parse(afterDrift.stdout);
        assert.ok(afterData.drifted.includes('copilot-instructions.md'));
    });
});

// ── Multi-repo ─────────────────────────────────────────────────────

describe('CLI: multi-repo', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should resolve layers from multiple repos', async () => {
        // Create a workspace with two separate metadata repos
        ws = createTestWorkspace({});

        // Create repo A
        const repoA = path.join(ws.root, 'repos', 'company-metadata');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(
            path.join(repoA, 'core', 'skills', 'testing.md'),
            '# Company Testing Skill',
        );

        // Create repo B
        const repoB = path.join(ws.root, 'repos', 'team-metadata');
        fs.mkdirSync(path.join(repoB, 'team', 'agents'), { recursive: true });
        fs.writeFileSync(
            path.join(repoB, 'team', 'agents', 'reviewer.md'),
            '# Team Reviewer Agent',
        );

        // Write multi-repo config
        const config = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company-metadata' },
                { id: 'team', localPath: 'repos/team-metadata' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core' },
                { repoId: 'team', path: 'team' },
            ],
            injection: {
                skills: 'synchronize',
                agents: 'synchronize',
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        // Status should show both repos
        const statusResult = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(statusResult.exitCode, 0);
        assert.ok(statusResult.stdout.includes('Repos:'));

        // Apply should synchronize files from both repos
        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing.md', 'core', 'company'),
        );
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.md', 'team', 'team'),
        );
        assert.ok(fs.existsSync(skillPath), 'company skill should be synchronized');
        assert.ok(fs.existsSync(agentPath), 'team agent should be synchronized');

        // Validate should pass
        const validateResult = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(validateResult.exitCode, 0);
    });

    it('multi-repo later layer overrides earlier for same path', async () => {
        ws = createTestWorkspace({});

        // Repo A: base skill
        const repoA = path.join(ws.root, 'repos', 'base');
        fs.mkdirSync(path.join(repoA, 'layer', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'layer', 'skills', 'shared.md'), '# Base version');

        // Repo B: override same skill
        const repoB = path.join(ws.root, 'repos', 'override');
        fs.mkdirSync(path.join(repoB, 'layer', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoB, 'layer', 'skills', 'shared.md'), '# Override version');

        const config = {
            metadataRepos: [
                { id: 'base', localPath: 'repos/base' },
                { id: 'override', localPath: 'repos/override' },
            ],
            layerSources: [
                { repoId: 'base', path: 'layer' },
                { repoId: 'override', path: 'layer' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        await runCli(['apply', '-w', ws.root]);

        const content = fs.readFileSync(
            path.join(
                ws.root,
                '.github',
                synchronizedPath('skills/shared.md', 'layer', 'override'),
            ),
            'utf-8',
        );
        assert.ok(content.includes('Override version'), 'later layer should win');
    });
});

// ── Coverage-targeted tests ────────────────────────────────────────

describe('CLI: coverage - validate edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should report missing files when managed file is deleted from disk', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Delete a managed file from .github/
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.unlinkSync(skillPath);

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('missing'), 'should report missing files');
    });

    it('should report stale files when overlay shrinks after apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with all files
        await runCli(['apply', '-w', ws.root]);

        // Remove a layer source file from the metadata repo so it's no longer in the overlay
        const agentSource = path.join(
            ws.metadataRepo,
            'company',
            'core',
            'agents',
            'reviewer.agent.md',
        );
        fs.unlinkSync(agentSource);

        // Validate should detect stale files (agents tracked but no longer in overlay)
        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('stale'), 'should report stale files');
    });

    it('exits early when the config cannot be loaded', async () => {
        ws = createTestWorkspace({});
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ not valid jsonc',
            'utf-8',
        );

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('reports a validation error as text when overlay resolution throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('reports a validation error as JSON when overlay resolution throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, false);
        assert.ok(typeof data.error === 'string' && data.error.length > 0);
    });
});

describe('CLI: coverage - promote edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('standard promote with no managed files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't apply — no managed state yet
        // promote (non-auto) should say "No managed files"
        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No managed files'));
    });

    it('promoteAuto with multi-repo config (no single metadataRepo)', () => {
        ws = createTestWorkspace({});

        // Create multi-repo config with no single metadataRepo
        const config = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company-metadata' }],
            layerSources: [{ repoId: 'company', path: 'core' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        // Create managed state manually to get past "no managed files"
        const stateDir = path.join(ws.root, '.metaflow');
        fs.mkdirSync(stateDir, { recursive: true });
        const state = {
            version: 1,
            files: { 'skills/test.md': { hash: 'abc', sourceLayer: 'core', appliedAt: '' } },
        };
        fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state));

        // Create the synchronized file with different content to simulate drift
        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('not a git repository'));
    });

    it('promoteAuto reports a config load failure', () => {
        ws = createTestWorkspace({});

        // Invalid JSONC so loadConfig fails.
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ this is not valid json',
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/test.md': { hash: 'abc', sourceLayer: 'core', appliedAt: '' },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('Cannot load config'), result.error);
    });

    it('promoteAuto refuses drift spanning multiple metadata repositories', () => {
        ws = createTestWorkspace({});

        const config = {
            metadataRepos: [
                { id: 'repoA', localPath: 'repos/a' },
                { id: 'repoB', localPath: 'repos/b' },
            ],
            layerSources: [
                { repoId: 'repoA', path: 'core' },
                { repoId: 'repoB', path: 'core' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/a.md': {
                    hash: 'abc',
                    sourceLayer: 'repoA/core',
                    sourceRepo: 'repoA',
                    appliedAt: '',
                },
                'skills/b.md': {
                    hash: 'def',
                    sourceLayer: 'repoB/core',
                    sourceRepo: 'repoB',
                    appliedAt: '',
                },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'a.md'), 'drifted a');
        fs.writeFileSync(path.join(matDir, 'b.md'), 'drifted b');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('multiple metadata repositories'), result.error);
    });

    it('promoteAuto cannot determine the repo path when the source repo is unresolved', () => {
        ws = createTestWorkspace({});

        const config = {
            metadataRepos: [
                { id: 'repoA', localPath: 'repos/a' },
                { id: 'repoB', localPath: 'repos/b' },
            ],
            layerSources: [{ repoId: 'repoA', path: 'core' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/test.md': {
                    hash: 'abc',
                    sourceLayer: 'ghost/core',
                    sourceRepo: 'ghost',
                    appliedAt: '',
                },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('Cannot determine metadata repo path'), result.error);
    });

    it('promote --auto --json with error shows error in JSON', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply, then drift a file
        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        // Don't init git — promote --auto should fail with "not a git repo"
        const result = await runCli(['promote', '--auto', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.committed, false);
        assert.ok(data.error);
    });

    it('promote --auto without --json shows error text on failure', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        // No git init — should fail
        const result = await runCli(['promote', '--auto', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('not a git'));
    });

    it('promote --auto success without --json shows branch and file list', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Init git in metadata repo
        execSync('git init', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git add .', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git commit -m "initial" --allow-empty', { cwd: ws.metadataRepo, stdio: 'pipe' });

        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = await runCli([
            'promote',
            '--auto',
            '--branch',
            'display-test',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created branch: display-test'));
        assert.ok(result.stdout.includes('Promoted'));
        assert.ok(result.stdout.includes('committed'));
    });
});

describe('CLI: coverage - status edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should display repo URL and commit when provided', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                metadataRepo: {
                    localPath: '.ai/ai-metadata',
                    url: 'https://github.com/org/metadata.git',
                    commit: 'abc1234',
                },
            }),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('URL:'));
        assert.ok(result.stdout.includes('https://github.com/org/metadata.git'));
        assert.ok(result.stdout.includes('Commit:'));
        assert.ok(result.stdout.includes('abc1234'));
    });

    it('prints surfaced capability conflict warnings', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ layers: ['company/core', 'company/extra'] }),
            layers: {
                'company/core': [{ relativePath: 'skills/dup/SKILL.md', content: 'A' }],
                'company/extra': [{ relativePath: 'skills/dup/SKILL.md', content: 'B' }],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Warnings:'), result.stdout);
        assert.ok(result.stdout.includes('CAPABILITY_CONFLICT'), result.stdout);
    });
});

describe('CLI: coverage - profile edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should handle config with no profiles defined', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ profiles: undefined, activeProfile: undefined }),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'list', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No profiles defined'));
    });

    it('profile list fails gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['profile', 'list', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });

    it('profile set fails gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['profile', 'set', 'default', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });
});

// ── Watch command ──────────────────────────────────────────────────

describe('CLI: watch', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('startWatch triggers apply cycle on metadata change', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Do an initial apply so managed state exists
        runCli(['apply', '-w', ws.root]).then(() => {
            const cycles: WatchCycleResult[] = [];
            let changeTimer: ReturnType<typeof setTimeout> | undefined;
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    if (changeTimer) {
                        clearTimeout(changeTimer);
                        changeTimer = undefined;
                    }
                    cycles.push(result);
                    // After a cycle fires, verify and close
                    handle.close();
                    assert.ok(cycles.length >= 1, 'should have at least 1 cycle');
                    assert.strictEqual(cycles[0].error, undefined);
                    done();
                },
            });

            // Trigger a change in the metadata repo
            changeTimer = setTimeout(() => {
                const newFile = path.join(
                    ws.metadataRepo,
                    'company',
                    'core',
                    'skills',
                    'new-skill.md',
                );
                fs.writeFileSync(newFile, '# New Skill\nAdded during watch.');
            }, 100);
        });
    });

    it('startWatch reports errors for invalid config', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply initially...
        runCli(['apply', '-w', ws.root]).then(() => {
            let changeTimer: ReturnType<typeof setTimeout> | undefined;
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    if (changeTimer) {
                        clearTimeout(changeTimer);
                        changeTimer = undefined;
                    }
                    handle.close();
                    assert.ok(result.error, 'should report error');
                    done();
                },
            });

            // Corrupt the config
            changeTimer = setTimeout(() => {
                const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.writeFileSync(configPath, '{ invalid {{', 'utf-8');
            }, 100);
        });
    });

    it('close() stops the watcher', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const handle = startWatch(ws.root, {
            debounceMs: 50,
            force: false,
        });

        // Should not throw
        handle.close();
        handle.close(); // close is idempotent
    });

    it('watch command appears in help', async () => {
        const result = await runCli(['--help']);
        assert.ok(result.stdout.includes('watch'));
    });

    it('startWatch with multi-repo config watches all repos', (done) => {
        ws = createTestWorkspace({});

        // Create two repos
        const repoA = path.join(ws.root, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const repoB = path.join(ws.root, 'repos', 'team');
        fs.mkdirSync(path.join(repoB, 'team', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoB, 'team', 'skills', 'b.md'), '# B');

        const config = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company' },
                { id: 'team', localPath: 'repos/team' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core' },
                { repoId: 'team', path: 'team' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const cycles: WatchCycleResult[] = [];
        let changeTimer: ReturnType<typeof setTimeout> | undefined;
        const handle = startWatch(ws.root, {
            debounceMs: 50,
            force: false,
            onCycle(result) {
                if (changeTimer) {
                    clearTimeout(changeTimer);
                    changeTimer = undefined;
                }
                cycles.push(result);
                handle.close();
                assert.ok(cycles.length >= 1);
                done();
            },
        });

        // Trigger change in second repo
        changeTimer = setTimeout(() => {
            fs.writeFileSync(path.join(repoB, 'team', 'skills', 'new.md'), '# New');
        }, 100);
    });

    // ── New coverage tests for watch.ts gaps ─────────────────────────

    it('startWatch catches unexpected exceptions from apply and reports them via onCycle', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Make .github a regular file so apply's fs.mkdirSync throws ENOTDIR
        const githubPath = path.join(ws.root, '.github');
        fs.writeFileSync(githubPath, 'not-a-directory');
        let changeTimer: ReturnType<typeof setTimeout> | undefined;

        const handle = startWatch(ws.root, {
            debounceMs: 50,
            onCycle(result) {
                if (changeTimer) {
                    clearTimeout(changeTimer);
                    changeTimer = undefined;
                }
                handle.close();
                assert.ok(result.error, 'should capture the thrown exception as error');
                done();
            },
        });

        // Trigger a debounced apply cycle via config file change
        changeTimer = setTimeout(() => {
            const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
            fs.appendFileSync(configPath, ' ');
        }, 30);
    });

    it('startWatch gracefully swallows fs.watch failure on config file', () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');

        // Patch the underlying CommonJS require('fs') module so fs.watch throws
        // for the config file path. The __createBinding getter in the compiled
        // __importStar wrapper delegates to require('fs')['watch'], so this patch
        // is visible to watch.ts without modifying its import binding.
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, ...rest: any[]): fs.FSWatcher {
            if (p === configPath) {
                throw new Error('simulated fs.watch failure on config file');
            }
            return origWatch.apply(fsMod, [p, ...rest] as any);
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        let handle: { close(): void } | undefined;
        try {
            // startWatch must NOT throw — the catch block at lines 88-90 swallows the error
            handle = startWatch(ws.root, { debounceMs: 100 });
        } finally {
            fsMod.watch = origWatch; // always restore
            handle?.close();
        }
        // reaching here without throw is the assertion
    });

    it('startWatch gracefully swallows fs.watch failure for multi-repo directory', () => {
        ws = createTestWorkspace({});

        const repoPath = path.join(ws.root, 'repos', 'meta');
        fs.mkdirSync(repoPath, { recursive: true });
        fs.writeFileSync(path.join(repoPath, 'skill.md'), '# Skill');

        const config = {
            metadataRepos: [{ id: 'meta', localPath: 'repos/meta' }],
            layerSources: [{ repoId: 'meta', path: '.' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, ...rest: any[]): fs.FSWatcher {
            if (p === repoPath) {
                throw new Error('simulated recursive fs.watch failure for repo directory');
            }
            return origWatch.apply(fsMod, [p, ...rest] as any);
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        let handle: { close(): void } | undefined;
        try {
            // startWatch must NOT throw — the catch block at lines 124-125 swallows the error
            handle = startWatch(ws.root, { debounceMs: 100 });
        } finally {
            fsMod.watch = origWatch;
            handle?.close();
        }
    });

    it('watch CLI command exits with error code 1 when config is invalid', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{ invalid json }', 'utf-8');

        const result = await runCli(['watch', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'), 'should print config error message to stderr');
    });

    it('watch CLI command prints watching message, performs initial apply, and handles cycles', function (done) {
        this.timeout(5000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Patch require('fs').watch to produce non-persistent watchers and capture
        // them for deterministic cleanup, preventing the test process from hanging.
        const createdWatchers: fs.FSWatcher[] = [];
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, opts: any, cb: any): fs.FSWatcher {
            const safeOpts = {
                ...(typeof opts === 'object' && opts !== null ? opts : {}),
                persistent: false,
            };
            const w = (origWatch as any)(p, safeOpts, cb);
            createdWatchers.push(w);
            return w;
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        function cleanup(err?: unknown): void {
            fsMod.watch = origWatch;
            for (const w of createdWatchers) {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            }
            done(err);
        }

        // Do an initial apply so the workspace has managed files
        runCli(['apply', '-w', ws.root])
            .then(() => runCli(['watch', '-w', ws.root]))
            .then((result) => {
                assert.strictEqual(result.exitCode, 0);
                assert.ok(
                    result.stdout.includes('Watching for changes'),
                    'should log watching heading',
                );
                assert.ok(
                    result.stdout.includes('Initial apply:'),
                    'should log initial apply summary',
                );

                // Trigger a file change so the onCycle callback (lines 187-195) executes
                const configFilePath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.appendFileSync(configFilePath, ' ');

                // Wait long enough for debounce (300 ms default) + cycle to complete
                setTimeout(() => cleanup(), 700);
            })
            .catch((err: unknown) => cleanup(err));
    });

    it('watch CLI command onCycle handler logs error when config becomes invalid mid-watch', function (done) {
        this.timeout(5000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const createdWatchers2: fs.FSWatcher[] = [];
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod2: any = require('fs');
        const origWatch2: typeof fs.watch = fsMod2.watch;
        fsMod2.watch = function (p: string, opts: any, cb: any): fs.FSWatcher {
            const safeOpts = {
                ...(typeof opts === 'object' && opts !== null ? opts : {}),
                persistent: false,
            };
            const w = (origWatch2 as any)(p, safeOpts, cb);
            createdWatchers2.push(w);
            return w;
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        function cleanup2(err?: unknown): void {
            fsMod2.watch = origWatch2;
            for (const w of createdWatchers2) {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            }
            done(err);
        }

        runCli(['watch', '-w', ws.root])
            .then((result) => {
                assert.strictEqual(result.exitCode, 0);

                // Corrupt the config so the next cycle produces result.error, covering
                // the console.error branch (line 189) inside onCycle in registerWatchCommand
                const configFilePath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.writeFileSync(configFilePath, '{ invalid json }', 'utf-8');

                // Wait for debounce + error cycle to complete
                setTimeout(() => cleanup2(), 700);
            })
            .catch((err: unknown) => cleanup2(err));
    });

    it('watch CLI command exits with error code 1 when the initial apply throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with the default strategy, then switch to original-unless-conflict so the
        // next overlay resolution throws an unsupported-migration error during initial apply.
        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        // The command returns before starting any watchers, so no cleanup is required.
        const result = await runCli(['watch', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });
});

// ── Promote --auto ─────────────────────────────────────────────────

describe('CLI: promote --auto', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    function gitInit(dir: string): void {
        execSync('git init', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
        // Initial commit so we can create branches
        execSync('git add .', { cwd: dir, stdio: 'pipe' });
        execSync('git commit -m "initial" --allow-empty', { cwd: dir, stdio: 'pipe' });
    }

    it('should report no drifted files when clean', () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = promoteAuto(ws.root, {});
        // No managed state yet, so no files to check
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('No managed files'));
    });

    it('should report no drift after clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('No drifted'));
    });

    it('should create branch and commit drifted files', async function () {
        this.timeout(15000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Init git in metadata repo
        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift a file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Improved Testing Skill\nUpdated locally.');

        const result = promoteAuto(ws.root, {
            branch: 'test-promote',
            message: 'test: promote drifted files',
        });

        assert.strictEqual(result.committed, true);
        assert.strictEqual(result.branch, 'test-promote');
        assert.ok(result.filesPromoted.length > 0);
        assert.ok(result.filesPromoted.includes(synchronizedPath('skills/testing/SKILL.md')));
        assert.strictEqual(result.error, undefined);

        // Verify the file was written to the source layer in the repo
        const promotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            'skills',
            'testing',
            'SKILL.md',
        );
        assert.ok(fs.existsSync(promotedFile), 'promoted file should exist in repo');

        const content = fs.readFileSync(promotedFile, 'utf-8');
        assert.ok(content.includes('Improved Testing Skill'), 'promoted content matches drift');
        assert.ok(!content.includes('metaflow:provenance'), 'provenance header stripped');

        // Verify git branch was created
        const branch = execSync('git branch --show-current', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        assert.strictEqual(branch, 'test-promote');
    });

    it('promotes repo-wide copilot instructions back under the authored .github root', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.github', 'copilot-instructions.md'),
            '# Updated Repo-wide Copilot Instructions',
        );

        const result = promoteAuto(ws.root, {
            noBranch: true,
            message: 'test: promote repo-wide instructions',
        });

        assert.strictEqual(result.committed, true);
        assert.ok(result.filesPromoted.includes('copilot-instructions.md'));

        const promotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            '.github',
            'copilot-instructions.md',
        );
        assert.ok(fs.existsSync(promotedFile), 'promoted file should stay under .github');
        assert.ok(
            fs
                .readFileSync(promotedFile, 'utf-8')
                .includes('Updated Repo-wide Copilot Instructions'),
        );
    });

    it('should fall back to tracked synchronized relative path for older managed state files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        delete state.files[synchronizedPath('skills/testing/SKILL.md')].sourceRelativePath;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Older State Fallback');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, true);
        const fallbackPromotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            synchronizedPath('skills/testing/SKILL.md').replace(/\//g, path.sep),
        );
        assert.ok(
            fs.existsSync(fallbackPromotedFile),
            'older state fallback should keep prior target path behavior',
        );
    });

    it('promote --auto --no-branch commits on current branch', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, true);
        assert.ok(result.filesPromoted.length > 0);

        // Should still be on the default branch (main or master)
        const branch = execSync('git branch --show-current', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        // Should NOT be a promote/* branch
        assert.ok(!branch.startsWith('promote/'), 'should stay on original branch');
    });

    it('promote --auto accepts quoted commit messages without shell escaping issues', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const commitMessage = 'test: promote "quoted" drifted files';
        const result = promoteAuto(ws.root, {
            noBranch: true,
            message: commitMessage,
        });

        assert.strictEqual(result.committed, true);

        const loggedMessage = execSync('git log -1 --pretty=%B', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        assert.strictEqual(loggedMessage, commitMessage);
    });

    it('promote --auto fails for non-git metadata repo', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't init git — metadata repo is not a git repo
        await runCli(['apply', '-w', ws.root]);

        // Drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('not a git'), result.error);
    });

    it('promote --auto --json returns structured result via CLI', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        fs.writeFileSync(agentPath, '# Updated Agent');

        const result = await runCli([
            'promote',
            '--auto',
            '--json',
            '--branch',
            'json-test',
            '-w',
            ws.root,
        ]);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.committed, true);
        assert.strictEqual(data.branch, 'json-test');
        assert.ok(data.filesPromoted.length > 0);
        assert.strictEqual(data.error, undefined);
    });

    it('promote --auto reports no files could be promoted when source layer metadata is missing', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        // Strip the sourceLayer from every tracked file so promotion has no target.
        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const key of Object.keys(state.files)) {
            delete state.files[key].sourceLayer;
        }
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, false);
        assert.deepStrictEqual(result.filesPromoted, []);
        assert.ok(result.error?.includes('No files could be promoted'), result.error);
    });

    it('promote --auto skips files whose authored path escapes the layer root', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        // Force an unsafe authored relative path on every tracked file.
        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const key of Object.keys(state.files)) {
            state.files[key].sourceRelativePath = '../escape.md';
        }
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, false);
        assert.deepStrictEqual(result.filesPromoted, []);
        assert.ok(result.error?.includes('No files could be promoted'), result.error);
    });

    it('promote --auto returns the git error when branch creation fails', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);
        // Pre-create the target branch so `git checkout -b` fails inside promoteAuto.
        execSync('git branch collision', { cwd: ws.metadataRepo, stdio: 'pipe' });

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = promoteAuto(ws.root, { branch: 'collision' });

        assert.strictEqual(result.committed, false);
        assert.strictEqual(result.branch, 'collision');
        assert.ok(result.error && result.error.length > 0);
    });
});
