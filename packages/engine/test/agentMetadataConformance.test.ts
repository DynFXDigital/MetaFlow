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
import type { CapabilityWarning, LayerContent } from '../src/engine/types';

function inspection(
    rootPath: string,
    options: {
        profile?: AgentPluginCompatibilityInspection['profile'];
        validManifest?: boolean;
        extensions?: Readonly<Record<string, unknown>>;
        diagnostics?: readonly CapabilityWarning[];
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
        diagnostics: options.diagnostics ?? [],
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
            projectAgentPluginV1Path('.github/copilot-instructions.md'),
            'com.github.copilot/rules/copilot-instructions.md',
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
        for (const unsafePath of [
            '/.github/prompts/review.prompt.md',
            'C:\\metadata\\.github\\prompts\\review.prompt.md',
            '.github/prompts/../agents/reviewer.agent.md',
            '.github/prompts//review.prompt.md',
        ]) {
            assert.strictEqual(projectAgentPluginV1Path(unsafePath), undefined, unsafePath);
        }
    });

    it('plans every supported legacy package relocation without semantic conversion', () => {
        const cases = [
            {
                source: '.github/prompts/review.prompt.md',
                target: 'com.github.copilot/prompts/review.prompt.md',
                kind: 'prompt',
                activation: 'user-invoked',
                scope: 'host-defined',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/commands/review.md',
                target: 'com.github.copilot/commands/review.md',
                kind: 'command',
                activation: 'user-invoked',
                scope: 'host-defined',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/instructions/typescript.instructions.md',
                target: 'com.github.copilot/rules/typescript.instructions.md',
                kind: 'instruction',
                activation: 'always-on-or-scoped',
                scope: 'directory-or-file-pattern',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/rules/typescript.md',
                target: 'com.github.copilot/rules/typescript.md',
                kind: 'rule',
                activation: 'always-on-or-scoped',
                scope: 'directory-or-file-pattern',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/copilot-instructions.md',
                target: 'com.github.copilot/rules/copilot-instructions.md',
                kind: 'instruction',
                activation: 'always-on-or-scoped',
                scope: 'directory-or-file-pattern',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/agents/reviewer.agent.md',
                target: 'com.github.copilot/agents/reviewer.agent.md',
                kind: 'agent',
                activation: 'host-selected',
                scope: 'host-defined',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: 'hooks.json',
                target: 'com.github.copilot/hooks/hooks.json',
                kind: 'hook',
                activation: 'event-driven',
                scope: 'host-defined',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/hooks/scripts/check.js',
                target: 'com.github.copilot/hooks/scripts/check.js',
                kind: 'hook',
                activation: 'event-driven',
                scope: 'host-defined',
                sourceCoverage: 'no-equivalent',
                targetCoverage: 'client-extension',
                semanticLoss: 'semantic-review',
            },
            {
                source: '.github/skills/testing/SKILL.md',
                target: 'skills/testing/SKILL.md',
                kind: 'skill',
                activation: 'model-or-user-invoked',
                scope: 'plugin',
                sourceCoverage: 'legacy-host',
                targetCoverage: 'portable',
                semanticLoss: 'none',
            },
        ] as const;

        for (const entry of cases) {
            const classification = classifyAgentMetadataPath(entry.source, {
                layerId: 'repo/capability',
            });
            assert.strictEqual(classification.artifactKind, entry.kind, entry.source);
            assert.strictEqual(classification.activation, entry.activation, entry.source);
            assert.strictEqual(classification.scope, entry.scope, entry.source);
            assert.strictEqual(classification.standardCoverage, entry.sourceCoverage, entry.source);
            assert.strictEqual(classification.migrationLoss, entry.semanticLoss, entry.source);
            assert.strictEqual(classification.projectedV1Path, entry.target, entry.source);
            assert.strictEqual(
                classification.projectedV1Coverage,
                entry.targetCoverage,
                entry.source,
            );
            assert.strictEqual(classification.packagingProjectionLoss, 'none', entry.source);

            const pending = planAgentMetadataMigration([classification]);
            const id = pending.candidates[0].id;
            assert.strictEqual(pending.blocked, true, entry.source);

            const add = planAgentMetadataMigration([classification], {
                [id]: 'add-standard-alongside',
            }).operations[0];
            assert.strictEqual(add.action, 'project-copy', entry.source);
            assert.strictEqual(add.targetPath, entry.target, entry.source);
            assert.strictEqual(add.targetCoverage, entry.targetCoverage, entry.source);
            assert.strictEqual(add.disclosedLoss, 'none', entry.source);

            const replace = planAgentMetadataMigration([classification], {
                [id]: 'replace-with-disclosed-loss',
            }).operations[0];
            assert.strictEqual(replace.action, 'project-and-remove-source', entry.source);
            assert.strictEqual(replace.targetPath, entry.target, entry.source);
            assert.strictEqual(replace.targetCoverage, entry.targetCoverage, entry.source);
            assert.strictEqual(replace.disclosedLoss, 'known-loss', entry.source);

            const keep = planAgentMetadataMigration([classification], {
                [id]: 'keep-vendor',
            }).operations[0];
            assert.strictEqual(keep.action, 'keep', entry.source);
            assert.strictEqual(keep.targetPath, undefined, entry.source);
            assert.strictEqual(keep.targetCoverage, undefined, entry.source);
            assert.strictEqual(keep.disclosedLoss, 'not-applicable', entry.source);
        }
    });

    it('blocks colliding package projections instead of reporting them as safe', () => {
        const instruction = classifyAgentMetadataPath(
            '.github/instructions/typescript.instructions.md',
            { layerId: 'repo/capability' },
        );
        const rule = classifyAgentMetadataPath('.github/rules/typescript.instructions.md', {
            layerId: 'repo/capability',
        });
        const instructionId = planAgentMetadataMigration([instruction]).candidates[0].id;
        const ruleId = planAgentMetadataMigration([rule]).candidates[0].id;

        const conflicted = planAgentMetadataMigration([instruction, rule], {
            [instructionId]: 'add-standard-alongside',
            [ruleId]: 'add-standard-alongside',
        });
        assert.strictEqual(conflicted.blocked, true);
        assert.deepStrictEqual(conflicted.unresolvedCandidateIds, []);
        assert.deepStrictEqual(conflicted.conflicts, [
            {
                code: 'projection-target-conflict',
                layerId: 'repo/capability',
                targetPath: 'com.github.copilot/rules/typescript.instructions.md',
                sourcePaths: [instruction.sourcePath, rule.sourcePath],
                candidateIds: [instructionId, ruleId],
            },
        ]);

        const resolved = planAgentMetadataMigration([instruction, rule], {
            [instructionId]: 'add-standard-alongside',
            [ruleId]: 'keep-vendor',
        });
        assert.strictEqual(resolved.blocked, false);
        assert.deepStrictEqual(resolved.conflicts, []);

        const audit = auditAgentMetadataConformance(
            [
                layer([
                    '.github/instructions/typescript.instructions.md',
                    '.github/rules/typescript.instructions.md',
                ]),
            ],
            'audit-standard',
        );
        assert.ok(
            audit.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_PROJECTION_TARGET_CONFLICT',
            ),
        );
        assert.strictEqual(
            audit.diagnostics.filter(
                (entry) => entry.code === 'AGENT_PLUGIN_SAFE_RELOCATION_AVAILABLE',
            ).length,
            0,
        );
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
        assert.strictEqual(prompt.projectedV1Coverage, 'client-extension');
        assert.strictEqual(prompt.packagingProjectionLoss, 'none');
    });

    it('counts inline client extension manifest data as conformant but nonportable', () => {
        const rootPath = path.resolve('fixture', 'capability');
        const copilot = auditAgentMetadataConformance(
            [
                layer(
                    ['plugin.json'],
                    inspection(rootPath, {
                        extensions: { 'com.github.copilot': { hooks: 'hooks/hooks.json' } },
                    }),
                ),
            ],
            'audit-standard',
        );
        const copilotManifestExtension = copilot.classifications.find(
            (entry) => entry.artifactKind === 'client-extension',
        );

        assert.strictEqual(copilotManifestExtension?.standardCoverage, 'client-extension');
        assert.strictEqual(copilotManifestExtension?.vendorDependency, 'github-copilot');
        assert.strictEqual(copilotManifestExtension?.extensionNamespace, 'com.github.copilot');
        assert.deepStrictEqual(copilot.summary, {
            total: 2,
            portable: 1,
            clientExtensions: 1,
            legacyHost: 0,
            noEquivalent: 0,
            invalid: 0,
            standardConformancePercent: 100,
            portablePercent: 50,
        });
        assert.ok(
            copilot.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_VENDOR_EXTENSION_NONPORTABLE',
            ),
        );

        const otherHost = auditAgentMetadataConformance(
            [
                layer(
                    ['plugin.json'],
                    inspection(rootPath, {
                        extensions: { 'com.example.client': { enabled: true } },
                    }),
                ),
            ],
            'prefer-standard',
        );
        assert.strictEqual(
            otherHost.classifications.find((entry) => entry.artifactKind === 'client-extension')
                ?.vendorDependency,
            'other-host',
        );
        assert.deepStrictEqual(otherHost.diagnostics, []);

        const extensionFile = classifyAgentMetadataPath('com.example.client/config/settings.json');
        assert.strictEqual(extensionFile.artifactKind, 'client-extension');
        assert.strictEqual(extensionFile.standardCoverage, 'client-extension');
        assert.strictEqual(extensionFile.vendorDependency, 'other-host');
        assert.strictEqual(extensionFile.extensionNamespace, 'com.example.client');

        const fileBackedOtherHost = auditAgentMetadataConformance(
            [
                layer(
                    ['plugin.json', 'com.example.client/config/settings.json'],
                    inspection(rootPath),
                ),
            ],
            'audit-standard',
        );
        const fileExtensionDiagnostic = fileBackedOtherHost.diagnostics.find(
            (entry) => entry.code === 'AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE',
        );
        assert.ok(fileExtensionDiagnostic?.message.includes('com.example.client'));
        assert.ok(!fileExtensionDiagnostic?.message.includes('GitHub Copilot'));

        const malformedNamespace = auditAgentMetadataConformance(
            [
                layer(
                    ['plugin.json'],
                    inspection(rootPath, {
                        extensions: { 'not-a-namespace': { enabled: true } },
                    }),
                ),
            ],
            'audit-standard',
        );
        const malformedExtension = malformedNamespace.classifications.find(
            (entry) => entry.artifactKind === 'client-extension',
        );
        assert.strictEqual(malformedExtension?.standardCoverage, 'invalid');
        assert.strictEqual(malformedExtension?.vendorDependency, 'unknown');
        assert.deepStrictEqual(malformedNamespace.summary, {
            total: 2,
            portable: 1,
            clientExtensions: 0,
            legacyHost: 0,
            noEquivalent: 0,
            invalid: 1,
            standardConformancePercent: 50,
            portablePercent: 50,
        });
        assert.strictEqual(
            malformedNamespace.diagnostics.find(
                (entry) => entry.code === 'AGENT_PLUGIN_EXTENSION_NAMESPACE_INVALID',
            )?.severity,
            'warning',
        );
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
        assert.ok(
            audit.diagnostics.some(
                (entry) => entry.code === 'AGENT_METADATA_MIGRATION_LOSS_REVIEW',
            ),
        );
        assert.ok(
            audit.diagnostics.some(
                (entry) =>
                    entry.code === 'AGENT_PLUGIN_SAFE_RELOCATION_AVAILABLE' &&
                    entry.message.includes('com.github.copilot/prompts/review.prompt.md'),
            ),
        );
        assert.deepStrictEqual(audit.summary, {
            total: 5,
            portable: 2,
            clientExtensions: 2,
            legacyHost: 0,
            noEquivalent: 1,
            invalid: 0,
            standardConformancePercent: 80,
            portablePercent: 40,
        });
    });

    it('uses package inspection to distinguish legacy and invalid manifests', () => {
        const rootPath = path.resolve('fixture', 'capability');
        const legacy = auditAgentMetadataConformance(
            [layer([], inspection(rootPath, { profile: 'legacy-host' }))],
            'audit-standard',
        );
        const invalid = auditAgentMetadataConformance(
            [layer([], inspection(rootPath, { profile: 'invalid', validManifest: false }))],
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
        assert.strictEqual(
            invalid.diagnostics.find((entry) => entry.code === 'AGENT_PLUGIN_PACKAGE_INVALID')
                ?.severity,
            'error',
        );
    });

    it('reports invalid strict-v1 components as errors and excludes them from conformance', () => {
        const rootPath = path.resolve('fixture', 'capability');
        const skillPath = path.join(rootPath, 'skills', 'broken', 'SKILL.md');
        const source = layer(
            ['plugin.json', 'skills/broken/SKILL.md'],
            inspection(rootPath, {
                diagnostics: [
                    {
                        code: 'AGENT_PLUGIN_SKILL_INVALID',
                        message:
                            'Skill "broken" does not satisfy Agent Skills metadata requirements.',
                        filePath: skillPath,
                        severity: 'warning',
                    },
                ],
            }),
        );

        const compatibility = auditAgentMetadataConformance([source], 'compatibility');
        assert.deepStrictEqual(compatibility.diagnostics, []);
        assert.strictEqual(
            compatibility.classifications.find(
                (entry) => entry.sourcePath === 'skills/broken/SKILL.md',
            )?.standardCoverage,
            'invalid',
        );

        const audit = auditAgentMetadataConformance([source], 'audit-standard');
        assert.deepStrictEqual(audit.summary, {
            total: 2,
            portable: 1,
            clientExtensions: 0,
            legacyHost: 0,
            noEquivalent: 0,
            invalid: 1,
            standardConformancePercent: 50,
            portablePercent: 50,
        });
        assert.strictEqual(
            audit.diagnostics.find((entry) => entry.code === 'AGENT_PLUGIN_SKILL_INVALID')
                ?.severity,
            'error',
        );
        assert.strictEqual(
            audit.diagnostics.find((entry) => entry.code === 'AGENT_PLUGIN_PACKAGE_INVALID')
                ?.severity,
            'error',
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
        assert.strictEqual(add.operations[0].action, 'project-copy');
        assert.strictEqual(
            add.operations[0].targetPath,
            'com.github.copilot/prompts/review.prompt.md',
        );
        assert.strictEqual(add.operations[0].targetCoverage, 'client-extension');
        assert.strictEqual(add.operations[0].disclosedLoss, 'none');

        const replace = planAgentMetadataMigration([prompt], {
            [id]: 'replace-with-disclosed-loss',
        });
        assert.strictEqual(replace.operations[0].action, 'project-and-remove-source');
        assert.strictEqual(
            replace.operations[0].targetPath,
            'com.github.copilot/prompts/review.prompt.md',
        );
        assert.strictEqual(replace.operations[0].disclosedLoss, 'known-loss');

        const keep = planAgentMetadataMigration([prompt], {
            [id]: 'keep-vendor',
        });
        assert.strictEqual(keep.operations[0].action, 'keep');
        assert.strictEqual(keep.operations[0].targetPath, undefined);
        assert.strictEqual(keep.operations[0].disclosedLoss, 'not-applicable');
    });
});
