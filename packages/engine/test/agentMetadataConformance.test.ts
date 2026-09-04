import * as assert from 'node:assert';
import * as path from 'node:path';
import {
    auditAgentMetadataConformance,
    classifyAgentMetadataPath,
    planAgentMetadataMigration,
    projectConfigForAgentMetadataAudit,
    projectAgentPluginV1Path,
} from '../src/engine/agentMetadataConformance';
import type { AgentPluginCompatibilityInspection } from '../src/engine/agentPluginCompatibility';
import type { LayerContent } from '../src/engine/types';

function inspection(
    rootPath: string,
    options: {
        profile?: AgentPluginCompatibilityInspection['profile'];
        validManifest?: boolean;
        extensions?: Readonly<Record<string, unknown>>;
    } = {},
): AgentPluginCompatibilityInspection {
    return {
        pluginRoot: rootPath,
        profile: options.profile ?? 'agent-plugins-v1',
        validManifest: options.validManifest ?? true,
        manifest: {
            name: 'sample.plugin',
            ...(options.extensions ? { extensions: options.extensions } : {}),
        },
        validSkills: [],
        validMcpServers: [],
        skills: [],
        mcpServers: [],
        recognizedHostFields: [],
        diagnostics: [],
    };
}

function layer(
    relativePaths: readonly string[],
    compatibility?: AgentPluginCompatibilityInspection,
): LayerContent {
    const rootPath = path.resolve('fixture', 'capability');
    return {
        layerId: 'repo/capability',
        rootPath,
        files: relativePaths.map((relativePath) => ({
            relativePath,
            absolutePath: path.join(rootPath, ...relativePath.split('/')),
        })),
        ...(compatibility ? { agentPluginCompatibilityInspection: compatibility } : {}),
    };
}

describe('Agent metadata semantic conformance', () => {
    it('audits inactive configured capabilities without mutating runtime profile state', () => {
        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/metadata' }],
            layerSources: [
                { repoId: 'primary', path: 'active', enabled: true },
                { repoId: 'primary', path: 'inactive', enabled: false },
            ],
        };

        const projected = projectConfigForAgentMetadataAudit(config);
        assert.deepStrictEqual(
            projected.layerSources?.map((source) => source.enabled),
            [true, true],
        );
        assert.deepStrictEqual(
            config.layerSources.map((source) => source.enabled),
            [true, false],
        );
    });

    it('projects legacy Copilot paths into the v1 client namespace without changing kind', () => {
        assert.strictEqual(
            projectAgentPluginV1Path('.github/prompts/review.prompt.md'),
            'com.github.copilot/prompts/review.prompt.md',
        );
        assert.strictEqual(
            projectAgentPluginV1Path('.github/commands/review.md'),
            'com.github.copilot/commands/review.md',
        );
        assert.strictEqual(
            projectAgentPluginV1Path('.github/instructions/typescript.instructions.md'),
            'com.github.copilot/rules/typescript.instructions.md',
        );
        assert.strictEqual(
            projectAgentPluginV1Path('.github/agents/reviewer.agent.md'),
            'com.github.copilot/agents/reviewer.agent.md',
        );
        assert.strictEqual(
            projectAgentPluginV1Path('hooks.json'),
            'com.github.copilot/hooks/hooks.json',
        );
        assert.strictEqual(
            projectAgentPluginV1Path('.github/skills/testing/SKILL.md'),
            'skills/testing/SKILL.md',
        );
    });

    it('keeps AGENTS.md entirely outside this classifier and migration surface', () => {
        const classification = classifyAgentMetadataPath('nested/AGENTS.md');
        assert.strictEqual(classification.standardCoverage, 'not-applicable');
        assert.strictEqual(projectAgentPluginV1Path('nested/AGENTS.md'), undefined);
        assert.deepStrictEqual(planAgentMetadataMigration([classification]).candidates, []);
    });

    it('distinguishes portable constructs, conformant client extensions, and no-equivalent metadata', () => {
        const skill = classifyAgentMetadataPath('skills/testing/SKILL.md');
        const extension = classifyAgentMetadataPath('com.github.copilot/hooks/hooks.json');
        const prompt = classifyAgentMetadataPath('.github/prompts/review.prompt.md');

        assert.strictEqual(skill.standardCoverage, 'portable');
        assert.strictEqual(skill.vendorDependency, 'none');
        assert.strictEqual(extension.standardCoverage, 'client-extension');
        assert.strictEqual(extension.vendorDependency, 'github-copilot');
        assert.strictEqual(prompt.standardCoverage, 'no-equivalent');
        assert.strictEqual(prompt.suggestedStandardConstruct, 'skill');
        assert.strictEqual(prompt.migrationLoss, 'semantic-review');
    });

    it('keeps compatibility and prefer-standard quiet while audit-standard emits warnings', () => {
        const rootPath = path.resolve('fixture', 'capability');
        const source = layer(
            [
                'plugin.json',
                'skills/testing/SKILL.md',
                'com.github.copilot/hooks/hooks.json',
                '.github/prompts/review.prompt.md',
            ],
            inspection(rootPath, {
                extensions: { 'com.github.copilot': { hooks: 'hooks/hooks.json' } },
            }),
        );

        assert.deepStrictEqual(
            auditAgentMetadataConformance([source], 'compatibility').diagnostics,
            [],
        );
        assert.deepStrictEqual(
            auditAgentMetadataConformance([source], 'prefer-standard').diagnostics,
            [],
        );
        const audit = auditAgentMetadataConformance([source], 'audit-standard');
        assert.ok(
            audit.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_VENDOR_EXTENSION_NONPORTABLE',
            ),
        );
        assert.ok(
            audit.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE',
            ),
        );
        assert.ok(
            audit.diagnostics.some(
                (entry) => entry.code === 'AGENT_METADATA_NO_STANDARD_EQUIVALENT',
            ),
        );
        assert.deepStrictEqual(audit.summary, {
            total: 4,
            portable: 2,
            clientExtensions: 1,
            legacyHost: 0,
            noEquivalent: 1,
            invalid: 0,
            standardConformancePercent: 75,
            portablePercent: 50,
        });
    });

    it('uses package inspection to distinguish legacy and invalid manifests', () => {
        const rootPath = path.resolve('fixture', 'capability');
        const legacy = auditAgentMetadataConformance(
            [layer(['plugin.json'], inspection(rootPath, { profile: 'legacy-host' }))],
            'audit-standard',
        );
        const invalid = auditAgentMetadataConformance(
            [
                layer(
                    ['plugin.json'],
                    inspection(rootPath, { profile: 'invalid', validManifest: false }),
                ),
            ],
            'audit-standard',
        );

        assert.strictEqual(legacy.summary.legacyHost, 1);
        assert.ok(
            legacy.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_LEGACY_MANIFEST'),
        );
        assert.strictEqual(invalid.summary.invalid, 1);
        assert.ok(
            invalid.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_PACKAGE_INVALID'),
        );
    });

    it('blocks migration until every semantic candidate has an explicit decision', () => {
        const prompt = classifyAgentMetadataPath('.github/prompts/review.prompt.md', {
            layerId: 'repo/capability',
        });
        const first = planAgentMetadataMigration([prompt]);
        assert.strictEqual(first.blocked, true);
        assert.strictEqual(first.unresolvedCandidateIds.length, 1);

        const id = first.candidates[0].id;
        const add = planAgentMetadataMigration([prompt], {
            [id]: 'add-standard-alongside',
        });
        assert.strictEqual(add.blocked, false);
        assert.strictEqual(add.operations[0].action, 'manual-authoring');
        assert.strictEqual(add.operations[0].targetPath, undefined);

        const replace = planAgentMetadataMigration([prompt], {
            [id]: 'replace-with-disclosed-loss',
        });
        assert.strictEqual(replace.operations[0].action, 'manual-authoring-and-remove-source');
        assert.strictEqual(replace.operations[0].disclosedLoss, 'semantic-review');
    });
});
