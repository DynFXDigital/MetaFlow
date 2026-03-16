import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EffectiveFile } from '@metaflow/engine';
import {
    assessInstructionScope,
    buildTreeSummaryCache,
    formatSummaryDescription,
    formatSummaryToken,
    getInstructionScopeStatusLabel,
    getInstructionScopeTooltipLines,
    getSummaryTooltipLines,
    summarizeArtifactInstructionScope,
    summarizeArtifactPrefix,
    summarizeDisplayInstructionScope,
    summarizeDisplayPrefix,
    summarizeLayerInstructionScope,
    summarizeLayerPrefix,
    summarizeProfileInstructionScope,
    summarizeProfile,
    summarizeRepoInstructionScope,
    summarizeRepo,
} from '../../treeSummary';

suite('treeSummary', () => {
    let workspaceRoot: string;

    setup(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-tree-summary-'));
    });

    teardown(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    test('buildTreeSummaryCache computes repo, folder, and profile summaries from active and available inventories', async () => {
        const repoRoot = path.join(workspaceRoot, '.ai', 'repo-meta');
        fs.mkdirSync(path.join(repoRoot, '.github', 'instructions'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, '.github', 'prompts'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, '.github', 'agents'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, '.github', 'skills', 'review-skill'), { recursive: true });
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'instructions', 'guide.instructions.md'),
            '# guide\n',
        );
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'prompts', 'review.prompt.md'),
            '# prompt\n',
        );
        fs.writeFileSync(path.join(repoRoot, '.github', 'agents', 'planner.agent.md'), '# agent\n');
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'skills', 'review-skill', 'SKILL.md'),
            '# skill\n',
        );

        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/repo-meta', enabled: true }],
            layerSources: [{ repoId: 'primary', path: '.', enabled: true }],
            profiles: {
                baseline: {},
                lean: { disable: ['agents/**'] },
            },
            activeProfile: 'baseline',
        };

        const baseProfileFiles: EffectiveFile[] = [
            {
                relativePath: 'instructions/guide.instructions.md',
                sourcePath: path.join(repoRoot, '.github', 'instructions', 'guide.instructions.md'),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(repoRoot, '.github', 'prompts', 'review.prompt.md'),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'agents/planner.agent.md',
                sourcePath: path.join(repoRoot, '.github', 'agents', 'planner.agent.md'),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'skills/review-skill/SKILL.md',
                sourcePath: path.join(repoRoot, '.github', 'skills', 'review-skill', 'SKILL.md'),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
        ];

        const effectiveFiles = baseProfileFiles.filter(
            (file) => !file.relativePath.startsWith('agents/'),
        );

        const cache = await buildTreeSummaryCache(
            config,
            workspaceRoot,
            effectiveFiles,
            baseProfileFiles,
            {
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: undefined,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        const repoSummary = summarizeRepo(cache, 'primary');
        assert.strictEqual(repoSummary.totalActive, 3);
        assert.strictEqual(repoSummary.totalAvailable, 4);
        assert.strictEqual(repoSummary.byType.instructions.active, 1);
        assert.strictEqual(repoSummary.byType.instructions.available, 1);
        assert.strictEqual(repoSummary.byType.agents.active, 0);
        assert.strictEqual(repoSummary.byType.agents.available, 1);

        const rootLayerSummary = summarizeLayerPrefix(cache, 'primary', '.');
        assert.strictEqual(rootLayerSummary.totalActive, 3);
        assert.strictEqual(rootLayerSummary.totalAvailable, 4);

        const displayPrefixSummary = summarizeDisplayPrefix(
            cache,
            'primary',
            'skills/review-skill',
        );
        assert.strictEqual(displayPrefixSummary.totalActive, 1);
        assert.strictEqual(displayPrefixSummary.totalAvailable, 1);
        assert.strictEqual(displayPrefixSummary.byType.skills.active, 1);

        const artifactPrefixSummary = summarizeArtifactPrefix(cache, 'skills', 'review-skill');
        assert.strictEqual(artifactPrefixSummary.totalActive, 1);
        assert.strictEqual(artifactPrefixSummary.totalAvailable, 1);

        const baselineSummary = summarizeProfile(cache, 'baseline');
        assert.strictEqual(baselineSummary.totalActive, 4);
        assert.strictEqual(baselineSummary.totalAvailable, 4);

        const leanSummary = summarizeProfile(cache, 'lean');
        assert.strictEqual(leanSummary.totalActive, 3);
        assert.strictEqual(leanSummary.totalAvailable, 4);
        assert.strictEqual(leanSummary.byType.agents.active, 0);
        assert.strictEqual(leanSummary.byType.agents.available, 1);
    });

    test('buildTreeSummaryCache counts available files for nested capability metadata paths', async () => {
        const repoRoot = path.join(workspaceRoot, '.ai', 'repo-meta');
        const capabilityRoot = path.join(repoRoot, 'capabilities', 'planning');
        fs.mkdirSync(path.join(capabilityRoot, '.github', 'instructions'), { recursive: true });
        fs.mkdirSync(path.join(capabilityRoot, '.github', 'prompts'), { recursive: true });
        fs.writeFileSync(
            path.join(capabilityRoot, '.github', 'instructions', 'guide.instructions.md'),
            '# guide\n',
        );
        fs.writeFileSync(
            path.join(capabilityRoot, '.github', 'prompts', 'review.prompt.md'),
            '# prompt\n',
        );

        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/repo-meta', enabled: true }],
            layerSources: [{ repoId: 'primary', path: 'capabilities/planning', enabled: true }],
            profiles: {
                default: {},
            },
            activeProfile: 'default',
        };

        const effectiveFiles: EffectiveFile[] = [
            {
                relativePath: 'instructions/guide.instructions.md',
                sourcePath: path.join(
                    capabilityRoot,
                    '.github',
                    'instructions',
                    'guide.instructions.md',
                ),
                sourceLayer: 'primary/capabilities/planning',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'prompts/review.prompt.md',
                sourcePath: path.join(capabilityRoot, '.github', 'prompts', 'review.prompt.md'),
                sourceLayer: 'primary/capabilities/planning',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
        ];

        const cache = await buildTreeSummaryCache(
            config,
            workspaceRoot,
            effectiveFiles,
            effectiveFiles,
            {
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: undefined,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        const repoSummary = summarizeRepo(cache, 'primary');
        assert.strictEqual(repoSummary.totalActive, 2);
        assert.strictEqual(repoSummary.totalAvailable, 2);
        assert.strictEqual(repoSummary.byType.instructions.available, 1);
        assert.strictEqual(repoSummary.byType.prompts.available, 1);

        const layerSummary = summarizeLayerPrefix(cache, 'primary', 'capabilities/planning');
        assert.strictEqual(layerSummary.totalActive, 2);
        assert.strictEqual(layerSummary.totalAvailable, 2);
    });

    test('buildTreeSummaryCache does not double count projected built-in metadata availability', async () => {
        const builtInRoot = path.join(workspaceRoot, 'built-in-meta');
        fs.mkdirSync(path.join(builtInRoot, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(builtInRoot, '.github', 'instructions', 'metaflow.instructions.md'),
            '# built-in\n',
        );

        const config = {
            metadataRepos: [
                {
                    id: '__metaflow_builtin__',
                    localPath: builtInRoot,
                    enabled: true,
                },
            ],
            layerSources: [
                {
                    repoId: '__metaflow_builtin__',
                    path: '.github',
                    enabled: true,
                },
            ],
            profiles: {
                default: {},
            },
            activeProfile: 'default',
        };

        const effectiveFiles: EffectiveFile[] = [
            {
                relativePath: 'instructions/metaflow.instructions.md',
                sourcePath: path.join(
                    builtInRoot,
                    '.github',
                    'instructions',
                    'metaflow.instructions.md',
                ),
                sourceLayer: '__metaflow_builtin__/.github',
                sourceRepo: builtInRoot,
                classification: 'settings',
            },
        ];

        const cache = await buildTreeSummaryCache(
            config,
            workspaceRoot,
            effectiveFiles,
            effectiveFiles,
            {
                enabled: true,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: builtInRoot,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        const repoSummary = summarizeRepo(cache, '__metaflow_builtin__');
        assert.strictEqual(repoSummary.totalActive, 1);
        assert.strictEqual(repoSummary.totalAvailable, 1);

        const layerSummary = summarizeLayerPrefix(cache, '__metaflow_builtin__', '.github');
        assert.strictEqual(layerSummary.totalActive, 1);
        assert.strictEqual(layerSummary.totalAvailable, 1);
    });

    test('formatSummary helpers preserve compact rows and ordered tooltip lines', () => {
        const summary = {
            totalActive: 2,
            totalAvailable: 5,
            byType: {
                instructions: { active: 1, available: 2 },
                prompts: { active: 0, available: 1 },
                agents: { active: 0, available: 1 },
                skills: { active: 1, available: 1 },
            },
        };

        assert.strictEqual(formatSummaryToken(summary), '2/5');
        assert.strictEqual(formatSummaryDescription(undefined, summary), '(2/5)');
        assert.strictEqual(
            formatSummaryDescription('repo-path', summary, ['active']),
            'repo-path (2/5, active)',
        );
        assert.deepStrictEqual(getSummaryTooltipLines(summary), [
            'Instructions: 1/2 active',
            'Prompts: 0/1 active',
            'Agents: 0/1 active',
            'Skills: 1/1 active',
        ]);
    });

    test('instruction scope helpers classify broad patterns and summarize repo, layer, and profile risk', async () => {
        const repoRoot = path.join(workspaceRoot, '.ai', 'repo-meta');
        fs.mkdirSync(path.join(repoRoot, '.github', 'instructions', 'narrow'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, '.github', 'instructions', 'broad'), { recursive: true });
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'instructions', 'narrow', 'targeted.instructions.md'),
            [
                '---',
                'name: Targeted guidance',
                'applyTo: ".github/instructions/**/*.md"',
                '---',
                '',
                'Use tight scope.',
            ].join('\n'),
        );
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'instructions', 'broad', 'global.instructions.md'),
            ['---', 'name: Global guidance', 'applyTo: "**/*"', '---', '', 'This is broad.'].join(
                '\n',
            ),
        );
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'instructions', 'missing.instructions.md'),
            [
                '---',
                'name: Missing scope guidance',
                'description: Missing applyTo on purpose.',
                '---',
                '',
                'No applyTo declared.',
            ].join('\n'),
        );

        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/repo-meta', enabled: true }],
            layerSources: [{ repoId: 'primary', path: '.', enabled: true }],
            profiles: {
                baseline: {},
                focused: { disable: ['instructions/broad/**'] },
            },
            activeProfile: 'baseline',
        };

        const baseProfileFiles: EffectiveFile[] = [
            {
                relativePath: 'instructions/narrow/targeted.instructions.md',
                sourcePath: path.join(
                    repoRoot,
                    '.github',
                    'instructions',
                    'narrow',
                    'targeted.instructions.md',
                ),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'instructions/broad/global.instructions.md',
                sourcePath: path.join(
                    repoRoot,
                    '.github',
                    'instructions',
                    'broad',
                    'global.instructions.md',
                ),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
            {
                relativePath: 'instructions/missing.instructions.md',
                sourcePath: path.join(
                    repoRoot,
                    '.github',
                    'instructions',
                    'missing.instructions.md',
                ),
                sourceLayer: 'primary/.',
                sourceRepo: repoRoot,
                classification: 'settings',
            },
        ];

        const cache = await buildTreeSummaryCache(
            config,
            workspaceRoot,
            baseProfileFiles,
            baseProfileFiles,
            {
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: undefined,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        const repoScope = summarizeRepoInstructionScope(cache, 'primary');
        assert.strictEqual(repoScope.inspectedCount, 3);
        assert.strictEqual(repoScope.activeCount, 3);
        assert.strictEqual(repoScope.highRiskCount, 2);
        assert.strictEqual(repoScope.lowRiskCount, 1);
        assert.strictEqual(repoScope.missingApplyToCount, 1);
        assert.strictEqual(repoScope.status, 'elevated');
        assert.strictEqual(getInstructionScopeStatusLabel(repoScope), 'Elevated');
        assert.deepStrictEqual(getInstructionScopeTooltipLines(repoScope), [
            'Instruction scope: Elevated (3 inspected, 3 active)',
            'High risk: 2',
            'Broad patterns: 0',
            'Unknown: 0',
            'Missing applyTo: 1',
            'Scope example: Global guidance -> **/* (High)',
            'Scope example: Missing scope guidance -> no applyTo declared (High)',
        ]);

        const layerScope = summarizeLayerInstructionScope(cache, 'primary', '.');
        assert.strictEqual(layerScope.highRiskCount, 2);

        const displayScope = summarizeDisplayInstructionScope(
            cache,
            'primary',
            'instructions/broad',
        );
        assert.strictEqual(displayScope.inspectedCount, 1);
        assert.strictEqual(displayScope.highRiskCount, 1);

        const artifactScope = summarizeArtifactInstructionScope(cache, 'broad');
        assert.strictEqual(artifactScope.inspectedCount, 1);
        assert.strictEqual(artifactScope.highRiskCount, 1);

        const baselineScope = summarizeProfileInstructionScope(cache, 'baseline');
        assert.strictEqual(baselineScope.activeCount, 3);
        assert.strictEqual(baselineScope.activeHighRiskCount, 2);

        const focusedScope = summarizeProfileInstructionScope(cache, 'focused');
        assert.strictEqual(focusedScope.activeCount, 2);
        assert.strictEqual(focusedScope.activeHighRiskCount, 1);
    });

    test('assessInstructionScope distinguishes exact, broad, and missing applyTo cases', () => {
        assert.deepStrictEqual(assessInstructionScope('src/**/*.ts'), {
            level: 'medium',
            reason: 'Pattern is only weakly anchored before a recursive wildcard.',
            patterns: ['src/**/*.ts'],
            missingApplyTo: false,
        });
        assert.deepStrictEqual(assessInstructionScope('**/*'), {
            level: 'high',
            reason: 'Repo-wide wildcard pattern.',
            patterns: ['**/*'],
            missingApplyTo: false,
        });
        assert.deepStrictEqual(assessInstructionScope(undefined), {
            level: 'high',
            reason: 'Missing applyTo; instruction scope cannot be reviewed or constrained.',
            patterns: [],
            missingApplyTo: true,
        });
    });

    test('assessInstructionScope selects the highest risk across comma-separated patterns', () => {
        assert.deepStrictEqual(assessInstructionScope('src/component.ts, docs/**'), {
            level: 'medium',
            reason: 'Top-level directory wildcard covers a broad subtree.',
            patterns: ['src/component.ts', 'docs/**'],
            missingApplyTo: false,
        });

        assert.deepStrictEqual(assessInstructionScope('src/**/*.ts, **/*'), {
            level: 'high',
            reason: 'Repo-wide wildcard pattern.',
            patterns: ['src/**/*.ts', '**/*'],
            missingApplyTo: false,
        });
    });

    test('assessInstructionScope classifies boundary wildcard patterns', () => {
        assert.deepStrictEqual(assessInstructionScope('AGENTS.md'), {
            level: 'low',
            reason: 'Pattern is anchored to a specific path or file subset.',
            patterns: ['AGENTS.md'],
            missingApplyTo: false,
        });
        assert.deepStrictEqual(assessInstructionScope('**/AGENTS.md'), {
            level: 'medium',
            reason: 'Wildcard spans nested folders without an anchored root path.',
            patterns: ['**/AGENTS.md'],
            missingApplyTo: false,
        });
        assert.deepStrictEqual(assessInstructionScope('*.md'), {
            level: 'medium',
            reason: 'Pattern is anchored only to a broad top-level location or file type.',
            patterns: ['*.md'],
            missingApplyTo: false,
        });
    });

    test('instruction scope status helpers cover moderate, low, and none states', () => {
        const moderate = {
            inspectedCount: 1,
            activeCount: 1,
            highRiskCount: 0,
            mediumRiskCount: 1,
            lowRiskCount: 0,
            unknownCount: 0,
            missingApplyToCount: 0,
            activeHighRiskCount: 0,
            topRisks: [
                {
                    repoId: 'primary',
                    repoRelativePath: '.github/instructions/docs.instructions.md',
                    displayPath: 'instructions/docs.instructions.md',
                    absolutePath: '/workspace/.ai/repo/.github/instructions/docs.instructions.md',
                    name: 'Docs scope',
                    applyTo: 'docs/**',
                    active: true,
                    riskLevel: 'medium' as const,
                    riskReason: 'Top-level directory wildcard covers a broad subtree.',
                    patterns: ['docs/**'],
                    missingApplyTo: false,
                },
            ],
            status: 'moderate' as const,
        };
        const low = {
            ...moderate,
            mediumRiskCount: 0,
            lowRiskCount: 1,
            topRisks: [],
            status: 'low' as const,
        };
        const none = {
            inspectedCount: 0,
            activeCount: 0,
            highRiskCount: 0,
            mediumRiskCount: 0,
            lowRiskCount: 0,
            unknownCount: 0,
            missingApplyToCount: 0,
            activeHighRiskCount: 0,
            topRisks: [],
            status: 'none' as const,
        };

        assert.strictEqual(getInstructionScopeStatusLabel(moderate), 'Moderate');
        assert.deepStrictEqual(getInstructionScopeTooltipLines(moderate), [
            'Instruction scope: Moderate (1 inspected, 1 active)',
            'High risk: 0',
            'Broad patterns: 1',
            'Unknown: 0',
            'Missing applyTo: 0',
            'Scope example: Docs scope -> docs/** (Medium)',
        ]);
        assert.strictEqual(getInstructionScopeStatusLabel(low), 'Low');
        assert.deepStrictEqual(getInstructionScopeTooltipLines(low), [
            'Instruction scope: Low (1 inspected, 1 active)',
            'High risk: 0',
            'Broad patterns: 0',
            'Unknown: 0',
            'Missing applyTo: 0',
        ]);
        assert.strictEqual(getInstructionScopeStatusLabel(none), 'None');
        assert.deepStrictEqual(getInstructionScopeTooltipLines(none), []);
    });

    test('buildTreeSummaryCache ignores missing repos and non-artifact directories during available scan', async () => {
        const repoRoot = path.join(workspaceRoot, '.ai', 'repo-meta');
        fs.mkdirSync(path.join(repoRoot, '.github', 'instructions'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, '.git', 'objects'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'node_modules', 'pkg'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
        fs.writeFileSync(
            path.join(repoRoot, '.github', 'instructions', 'guide.instructions.md'),
            '# guide\n',
        );
        fs.writeFileSync(
            path.join(repoRoot, '.git', 'objects', 'ignored.instructions.md'),
            '# ignored\n',
        );
        fs.writeFileSync(
            path.join(repoRoot, 'node_modules', 'pkg', 'ignored.prompt.md'),
            '# ignored\n',
        );
        fs.writeFileSync(path.join(repoRoot, 'docs', 'notes.md'), '# docs\n');

        const cache = await buildTreeSummaryCache(
            {
                metadataRepos: [
                    { id: 'primary', localPath: '.ai/repo-meta', enabled: true },
                    { id: 'missing', localPath: '.ai/missing-repo', enabled: true },
                ],
                layerSources: [{ repoId: 'primary', path: '.', enabled: true }],
                profiles: { default: {} },
                activeProfile: 'default',
            },
            workspaceRoot,
            [],
            [],
            {
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: undefined,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        const availablePrimary = summarizeRepo(cache, 'primary');
        const availableMissing = summarizeRepo(cache, 'missing');
        assert.strictEqual(availablePrimary.totalAvailable, 1);
        assert.strictEqual(availablePrimary.byType.instructions.available, 1);
        assert.strictEqual(availableMissing.totalAvailable, 0);
        assert.deepStrictEqual(
            cache.availableRecords.map((record) => record.repoRelativePath),
            ['.github/instructions/guide.instructions.md'],
        );
    });

    test('buildTreeSummaryCache resolves effective files from sourceLayer fallback and prefers the most specific repo root', async () => {
        const outerRoot = path.join(workspaceRoot, '.ai', 'outer-meta');
        const innerRoot = path.join(outerRoot, 'nested-meta');
        fs.mkdirSync(path.join(innerRoot, '.github', 'instructions'), { recursive: true });
        fs.writeFileSync(
            path.join(innerRoot, '.github', 'instructions', 'nested.instructions.md'),
            ['---', 'name: Nested', 'applyTo: "src/**"', '---', '', 'nested'].join('\n'),
        );

        const cache = await buildTreeSummaryCache(
            {
                metadataRepos: [
                    { id: 'outer', localPath: '.ai/outer-meta', enabled: true },
                    { id: 'inner', localPath: '.ai/outer-meta/nested-meta', enabled: true },
                ],
                layerSources: [{ repoId: 'inner', path: '.', enabled: true }],
                profiles: { default: {} },
                activeProfile: 'default',
            },
            workspaceRoot,
            [
                {
                    relativePath: 'instructions/nested.instructions.md',
                    sourcePath: '',
                    sourceLayer: 'inner/.',
                    sourceRepo: undefined,
                    classification: 'settings',
                },
                {
                    relativePath: 'instructions/nested.instructions.md',
                    sourcePath: path.join(
                        innerRoot,
                        '.github',
                        'instructions',
                        'nested.instructions.md',
                    ),
                    sourceLayer: 'outer/.',
                    sourceRepo: outerRoot,
                    classification: 'settings',
                },
            ],
            [
                {
                    relativePath: 'instructions/nested.instructions.md',
                    sourcePath: path.join(
                        innerRoot,
                        '.github',
                        'instructions',
                        'nested.instructions.md',
                    ),
                    sourceLayer: 'inner/.',
                    sourceRepo: innerRoot,
                    classification: 'settings',
                },
            ],
            {
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: undefined,
                sourceId: 'dynfxdigital.metaflow',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
        );

        assert.deepStrictEqual(
            cache.currentActiveRecords.map((record) => ({
                repoId: record.repoId,
                repoRelativePath: record.repoRelativePath,
            })),
            [
                {
                    repoId: 'inner',
                    repoRelativePath: 'instructions/nested.instructions.md',
                },
                {
                    repoId: 'inner',
                    repoRelativePath: '.github/instructions/nested.instructions.md',
                },
            ],
        );
        assert.strictEqual(summarizeRepo(cache, 'inner').totalActive, 2);
        assert.strictEqual(summarizeRepo(cache, 'outer').totalActive, 0);
    });
});
