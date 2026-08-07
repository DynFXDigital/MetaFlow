import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EffectiveFile } from '@metaflow/engine';
import {
    CapabilityDetailModel,
    loadCapabilityDetailModel,
    resolveCapabilityDetailTarget,
} from '../../commands/capabilityDetails';
import { buildTreeSummaryCache } from '../../treeSummary';
import { renderCapabilityDetailsHtml } from '../../views/capabilityDetailsHtml';

function makeCapabilityDetailModel(
    overrides: Partial<CapabilityDetailModel> = {},
): CapabilityDetailModel {
    return {
        title: 'Capability Review',
        capabilityId: 'capability-review',
        description: 'Review shared metadata assets.',
        license: undefined,
        experimental: undefined,
        agentPlugin: undefined,
        agentPluginManifest: undefined,
        layerId: 'primary/review/capability-review',
        layerIndex: 2,
        layerPath: 'review/capability-review',
        layerRoot: 'C:/workspace/.ai/ai-metadata/review/capability-review',
        repoId: 'primary',
        repoLabel: 'Primary',
        descriptorPath: 'C:/workspace/.ai/ai-metadata/review/capability-review/README.md',
        descriptorKind: 'readme',
        manifestPath: 'C:/workspace/.ai/ai-metadata/review/capability-review/README.md',
        enabled: true,
        builtIn: false,
        warnings: [],
        instructionScopeSummary: {
            inspectedCount: 0,
            activeCount: 0,
            highRiskCount: 0,
            mediumRiskCount: 0,
            lowRiskCount: 0,
            unknownCount: 0,
            missingApplyToCount: 0,
            activeHighRiskCount: 0,
            topRisks: [],
            status: 'low',
        },
        layerFiles: ['.github/instructions/review.instructions.md'],
        artifactBuckets: [],
        artifactCount: 1,
        body: '# Capability: Capability Review',
        ...overrides,
    };
}

suite('CapabilityDetails helpers', () => {
    test('TC-0252: builds a capability detail model and renders webview HTML for a multi-repo layer (Verifies: REQ-0311)', async () => {
        const workspaceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'metaflow-capability-details-'),
        );
        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'ai-metadata');
            const layerRoot = path.join(repoRoot, 'standards', 'sdlc');
            fs.mkdirSync(path.join(layerRoot, '.github', 'instructions'), { recursive: true });
            fs.mkdirSync(path.join(layerRoot, '.github', 'skills', 'traceability'), {
                recursive: true,
            });
            fs.writeFileSync(
                path.join(repoRoot, 'METAFLOW.md'),
                [
                    '---',
                    'name: Team Metadata',
                    'description: Shared Copilot Pack providing reusable AI coding agent capabilities.',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(layerRoot, 'README.md'),
                [
                    '---',
                    'name: SDLC Traceability',
                    'description: Shared traceability metadata.',
                    'id: 123e4567-e89b-12d3-a456-426614174000',
                    '---',
                    '',
                    '## Mission',
                    'Keep requirements, design, and tests aligned.',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(layerRoot, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'sdlc-traceability',
                        version: '1.0.0',
                        description: 'Traceability plugin manifest.',
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.1.0',
                        },
                    },
                    null,
                    2,
                ),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(layerRoot, '.github', 'instructions', 'trace.instructions.md'),
                [
                    '---',
                    'name: Traceability instructions',
                    'applyTo: "**/*"',
                    '---',
                    '',
                    '# Trace',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(layerRoot, '.github', 'skills', 'traceability', 'SKILL.md'),
                '# Skill',
                'utf-8',
            );

            const target = resolveCapabilityDetailTarget(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                    layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                },
                workspaceRoot,
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow',
                },
                { layerIndex: 0, repoId: 'primary' },
            );

            assert.ok(target, 'expected detail target');
            const effectiveFiles: EffectiveFile[] = [
                {
                    relativePath: 'instructions/trace.instructions.md',
                    sourcePath: path.join(
                        layerRoot,
                        '.github',
                        'instructions',
                        'trace.instructions.md',
                    ),
                    sourceLayer: 'primary/standards/sdlc',
                    sourceRepo: repoRoot,
                    classification: 'settings',
                },
                {
                    relativePath: 'skills/traceability/SKILL.md',
                    sourcePath: path.join(
                        layerRoot,
                        '.github',
                        'skills',
                        'traceability',
                        'SKILL.md',
                    ),
                    sourceLayer: 'primary/standards/sdlc',
                    sourceRepo: repoRoot,
                    classification: 'settings',
                },
            ];
            const treeSummaryCache = await buildTreeSummaryCache(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                    layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                },
                workspaceRoot,
                effectiveFiles,
                effectiveFiles,
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow',
                },
            );
            const model = await loadCapabilityDetailModel(target!, treeSummaryCache);
            const html = renderCapabilityDetailsHtml(model, {
                cspSource: 'https://webview.test',
                nonce: 'nonce-123',
            });

            assert.strictEqual(model.title, 'SDLC Traceability');
            assert.strictEqual(model.repoLabel, 'Team Metadata');
            assert.strictEqual(model.descriptorKind, 'readme');
            assert.ok(
                model.descriptorPath?.replace(/\\/g, '/').endsWith('/standards/sdlc/README.md'),
            );
            assert.strictEqual(model.artifactCount, 3);
            assert.strictEqual(model.experimental, undefined);
            assert.strictEqual(model.agentPlugin, true);
            assert.strictEqual(model.agentPluginManifest?.name, 'sdlc-traceability');
            assert.ok(html.includes('capability-tab-details'));
            assert.ok(html.includes('capability-tab-contents'));
            assert.ok(html.includes('Contents'));
            assert.ok(html.includes('Team Metadata'));
            assert.ok(html.includes('class="artifact-type-label"'));
            assert.ok(html.includes('trace.instructions.md'));
            assert.ok(html.includes('<h2>Mission</h2>'));
            assert.ok(html.includes('command:metaflow.toggleLayer?'));
            assert.ok(html.includes('command:metaflow.openCapabilityDescriptor?'));
            assert.ok(html.includes('Open README.md'));
            assert.ok(html.includes('<span class="stat-chip-label">Files</span>'));
            assert.ok(html.includes('status-pill-info">Agent Plugin'));
            assert.ok(html.includes('sdlc-traceability'));
            assert.ok(html.includes('<span class="stat-chip-label">Scope Risk</span>'));
            assert.ok(html.includes("script-src 'none'"));
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('README wins over legacy CAPABILITY and reports the duplicate without merging content', async () => {
        const workspaceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'metaflow-capability-details-duplicate-'),
        );
        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'ai-metadata');
            const layerRoot = path.join(repoRoot, 'duplicate-package');
            fs.mkdirSync(layerRoot, { recursive: true });
            fs.writeFileSync(
                path.join(layerRoot, 'README.md'),
                [
                    '---',
                    'name: README Package',
                    'description: README is authoritative.',
                    '---',
                    '',
                    '# README Documentation',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(layerRoot, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Legacy Package',
                    'description: Legacy fallback content.',
                    '---',
                    '',
                    '# Legacy Documentation',
                ].join('\n'),
                'utf-8',
            );

            const target = resolveCapabilityDetailTarget(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                    layerSources: [{ repoId: 'primary', path: 'duplicate-package', enabled: true }],
                },
                workspaceRoot,
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow',
                },
                { layerPath: 'duplicate-package', repoId: 'primary' },
            );

            assert.ok(target, 'expected duplicate descriptor detail target');
            const model = await loadCapabilityDetailModel(target!);
            const html = renderCapabilityDetailsHtml(model, {
                cspSource: 'https://webview.test',
                nonce: 'nonce-duplicate',
            });

            assert.strictEqual(model.title, 'README Documentation');
            assert.strictEqual(model.descriptorKind, 'readme');
            assert.ok(
                model.descriptorPath?.replace(/\\/g, '/').endsWith('/duplicate-package/README.md'),
            );
            assert.ok(
                model.warnings.some((warning) =>
                    warning.includes('CAPABILITY_DESCRIPTOR_DUPLICATE'),
                ),
            );
            assert.ok(model.warnings.some((warning) => warning.includes('not merged')));
            assert.ok(html.includes('Open README.md'));
            assert.ok(html.includes('README Documentation'));
            assert.ok(!html.includes('Legacy Documentation'));
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('TC-0252: degrades gracefully when README and legacy CAPABILITY descriptors are missing (Verifies: REQ-0311)', async () => {
        const workspaceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'metaflow-capability-details-missing-'),
        );
        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'ai-metadata');
            const layerRoot = path.join(repoRoot, 'communication');
            fs.mkdirSync(path.join(layerRoot, '.github', 'instructions'), { recursive: true });
            fs.writeFileSync(
                path.join(layerRoot, '.github', 'instructions', 'tone.instructions.md'),
                '# Tone',
                'utf-8',
            );

            const target = resolveCapabilityDetailTarget(
                {
                    metadataRepo: { localPath: '.ai/ai-metadata' },
                    layers: ['communication'],
                },
                workspaceRoot,
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow',
                },
                { layerIndex: 0 },
            );

            assert.ok(target, 'expected detail target');
            const model = await loadCapabilityDetailModel(target!);
            const html = renderCapabilityDetailsHtml(model, {
                cspSource: 'https://webview.test',
                nonce: 'nonce-456',
            });

            assert.ok(model.warnings.some((warning) => warning.includes('DESCRIPTOR_MISSING')));
            assert.ok(
                html.includes(
                    'No <code>README.md</code> or legacy <code>CAPABILITY.md</code> descriptor exists for this layer yet.',
                ),
            );
            assert.ok(
                !html.includes('Open README.md'),
                'missing-manifest details should not render the open-manifest action',
            );
            assert.ok(html.includes('tone.instructions.md'));
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('TC-0252: resolves capability details by layer path when the saved layer index is stale', () => {
        const workspaceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'metaflow-capability-details-stale-index-'),
        );
        try {
            const repoRoot = path.join(workspaceRoot, '.ai', 'ai-metadata');
            const targetLayerRoot = path.join(repoRoot, 'standards', 'sdlc');
            const otherLayerRoot = path.join(repoRoot, 'other');
            fs.mkdirSync(targetLayerRoot, { recursive: true });
            fs.mkdirSync(otherLayerRoot, { recursive: true });
            fs.writeFileSync(
                path.join(targetLayerRoot, 'CAPABILITY.md'),
                ['---', 'name: SDLC Traceability', '---'].join('\n'),
                'utf-8',
            );

            const target = resolveCapabilityDetailTarget(
                {
                    metadataRepos: [{ id: 'primary', localPath: '.ai/ai-metadata', enabled: true }],
                    layerSources: [
                        { repoId: 'primary', path: 'other', enabled: true },
                        { repoId: 'primary', path: 'standards/sdlc', enabled: true },
                    ],
                },
                workspaceRoot,
                {
                    enabled: false,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot: undefined,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow',
                },
                {
                    layerIndex: 0,
                    layerPath: 'standards/sdlc',
                    repoId: 'primary',
                },
            );

            assert.ok(target, 'expected detail target');
            assert.strictEqual(target?.layerIndex, 1);
            assert.strictEqual(target?.layerPath, 'standards/sdlc');
            assert.strictEqual(target?.repoId, 'primary');
            assert.strictEqual(target?.capabilityId, 'sdlc');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('TC-0252: builds a capability detail model for the built-in MetaFlow capability (Verifies: REQ-0311)', async () => {
        const sourceRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), 'metaflow-built-in-capability-details-'),
        );
        try {
            fs.mkdirSync(path.join(sourceRoot, '.github', 'instructions'), { recursive: true });
            fs.writeFileSync(
                path.join(sourceRoot, 'README.md'),
                [
                    '---',
                    'name: MetaFlow',
                    'description: Bundled MetaFlow guidance for authoring MetaFlow constructs and reviewing reusable AI metadata capabilities.',
                    'id: d7da7ee3-4ccf-42e8-a23f-c61e321ec612',
                    '---',
                    '',
                    '## Purpose',
                    'Provide a small built-in MetaFlow metadata layer that works out of the box in the extension.',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(
                    sourceRoot,
                    '.github',
                    'instructions',
                    'metaflow-constructs.instructions.md',
                ),
                '# MetaFlow constructs\n',
                'utf-8',
            );

            const target = resolveCapabilityDetailTarget(
                {
                    metadataRepos: [],
                    layerSources: [],
                },
                sourceRoot,
                {
                    enabled: true,
                    layerEnabled: true,
                    synchronizedFiles: [],
                    sourceRoot,
                    sourceId: 'dynfxdigital.metaflow-ai',
                    sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
                },
                { layerIndex: 0, repoId: '__metaflow_builtin__' },
            );

            assert.ok(target, 'expected built-in detail target');
            const model = await loadCapabilityDetailModel(target!);
            const html = renderCapabilityDetailsHtml(model, {
                cspSource: 'https://webview.test',
                nonce: 'nonce-built-in',
            });

            assert.strictEqual(model.title, 'MetaFlow');
            assert.strictEqual(model.license, undefined);
            assert.strictEqual(model.builtIn, true);
            assert.strictEqual(model.warnings.length, 0);
            assert.ok(html.includes('metaflow-constructs.instructions.md'));
            assert.ok(html.includes('Built-in capability'));
            assert.ok(html.includes('<h2>Purpose</h2>'));
        } finally {
            fs.rmSync(sourceRoot, { recursive: true, force: true });
        }
    });

    test('TC-0252: escapes raw HTML and disables unsafe manifest links (Verifies: REQ-0311)', () => {
        const model: CapabilityDetailModel = {
            title: 'Secure Capability',
            capabilityId: 'secure-capability',
            description: 'Security-focused capability manifest rendering.',
            license: undefined,
            layerId: 'primary/security/secure-capability',
            layerIndex: 3,
            layerPath: 'security/secure-capability',
            layerRoot: 'C:/workspace/.ai/ai-metadata/security/secure-capability',
            repoId: 'primary',
            repoLabel: 'Primary',
            manifestPath: 'C:/workspace/.ai/ai-metadata/security/secure-capability/CAPABILITY.md',
            enabled: true,
            builtIn: false,
            warnings: [],
            instructionScopeSummary: {
                inspectedCount: 2,
                activeCount: 1,
                highRiskCount: 1,
                mediumRiskCount: 0,
                lowRiskCount: 1,
                unknownCount: 0,
                missingApplyToCount: 1,
                activeHighRiskCount: 1,
                topRisks: [
                    {
                        repoId: 'primary',
                        repoRelativePath:
                            'review/capability-review/.github/instructions/review.instructions.md',
                        displayPath: 'instructions/review.instructions.md',
                        absolutePath:
                            'C:/workspace/.ai/ai-metadata/review/capability-review/.github/instructions/review.instructions.md',
                        name: 'review.instructions.md',
                        applyTo: '**/*',
                        active: true,
                        riskLevel: 'high',
                        riskReason: 'Repo-wide wildcard pattern.',
                        patterns: ['**/*'],
                        missingApplyTo: false,
                    },
                ],
                status: 'elevated',
            },
            layerFiles: ['.github/instructions/secure.instructions.md'],
            artifactBuckets: [],
            artifactCount: 1,
            body: [
                '<script>alert("x")</script>',
                '',
                '[Docs](https://example.com)',
                '',
                '[Local](./README.md)',
            ].join('\n'),
        };

        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-789',
        });

        assert.ok(!html.includes('<script>alert("x")</script>'));
        assert.match(
            html,
            /&lt;script&gt;alert\((?:&quot;|&#39;)x(?:&quot;|&#39;)\)&lt;\/script&gt;/,
        );
        assert.ok(html.includes('href="https://example.com"'));
        assert.ok(html.includes('target="_blank"'));
        assert.ok(!html.includes('href="./README.md"'));
        assert.ok(html.includes('Local'));
    });

    test('TC-0252: renders artifact bucket sections, unknown license, toggle action, and a normalized capability heading (Verifies: REQ-0311)', () => {
        const model = makeCapabilityDetailModel({
            instructionScopeSummary: {
                inspectedCount: 2,
                activeCount: 1,
                highRiskCount: 1,
                mediumRiskCount: 0,
                lowRiskCount: 1,
                unknownCount: 0,
                missingApplyToCount: 1,
                activeHighRiskCount: 1,
                topRisks: [
                    {
                        repoId: 'primary',
                        repoRelativePath:
                            'review/capability-review/.github/instructions/review.instructions.md',
                        displayPath: 'instructions/review.instructions.md',
                        absolutePath:
                            'C:/workspace/.ai/ai-metadata/review/capability-review/.github/instructions/review.instructions.md',
                        name: 'review.instructions.md',
                        applyTo: '**/*',
                        active: true,
                        riskLevel: 'high',
                        riskReason: 'Repo-wide wildcard pattern.',
                        patterns: ['**/*'],
                        missingApplyTo: false,
                    },
                ],
                status: 'elevated',
            },
            layerFiles: [
                '.github/instructions/review.instructions.md',
                '.github/skills/review/SKILL.md',
                'notes/review-checklist.md',
            ],
            artifactBuckets: [
                {
                    type: 'instructions',
                    files: ['.github/instructions/review.instructions.md'],
                },
                {
                    type: 'skills',
                    files: ['.github/skills/review/SKILL.md'],
                },
                {
                    type: 'other',
                    files: ['notes/review-checklist.md'],
                },
            ],
            artifactCount: 3,
            body: [
                '# Capability: Capability Review',
                '',
                '## Mission',
                'Keep reusable metadata in shape.',
            ].join('\n'),
        });

        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-101',
        });

        assert.ok(html.includes('<dt class="metadata-label">License</dt>'));
        assert.ok(html.includes('<dd class="metadata-value">Unknown</dd>'));
        assert.ok(html.includes('class="artifact-bucket"'));
        assert.ok(html.includes('class="artifact-type-label"'));
        assert.ok(html.includes('command:metaflow.toggleLayer?'));
        assert.ok(html.includes('Disable'));
        assert.ok(html.includes('Included in the active MetaFlow capability set.'));
        assert.ok(html.includes('<h2>Metadata</h2>'));
        assert.ok(html.includes('<summary>Paths &amp; IDs</summary>'));
        assert.ok(html.includes('Instructions'));
        assert.ok(html.includes('review.instructions.md'));
        assert.ok(html.includes('Skills'));
        assert.ok(html.includes('SKILL.md'));
        assert.ok(html.includes('notes/review-checklist.md'));
        assert.ok(!html.includes('Capability: Capability Review</h1>'));
        assert.strictEqual((html.match(/<h1>Capability Review<\/h1>/g) ?? []).length, 2);
        assert.ok(html.includes('<span class="stat-chip-label">Scope Risk</span>'));
        assert.ok(html.includes('<h2>Scope Risk</h2>'));
        assert.ok(
            html.includes(
                'One or more instructions in this capability look broader than they likely need to be.',
            ),
        );
        assert.ok(html.includes('review.instructions.md'));
        assert.ok(html.includes('Repo-wide wildcard pattern.'));
    });

    test('TC-0252: renders a governance notice when the selected capability is governed or violating', () => {
        const model = makeCapabilityDetailModel({
            governance: {
                summary: 'Governance: non-compliant (severity: error)',
                detailLines: [
                    'Governance Rule: required capability',
                    'Governance Violations: 1',
                    '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::review/capability-review] Required capability "primary/review/capability-review" is not active because the capability is disabled in the active runtime state.',
                ],
                variant: 'error',
            },
        });

        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-governance',
        });

        assert.ok(html.includes('<h2>Governance</h2>'));
        assert.ok(html.includes('governance-notice-error'));
        assert.ok(html.includes('Governance: non-compliant (severity: error)'));
        assert.ok(html.includes('Governance Rule: required capability'));
        assert.ok(
            html.includes(
                '[GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::review/capability-review] Required capability &quot;primary/review/capability-review&quot; is not active because the capability is disabled in the active runtime state.',
            ),
        );
    });

    test('TC-0252: renders built-in capability details from actual bundled source root (Verifies: REQ-0311)', async () => {
        const bundledSourceRoot = path.resolve(__dirname, '../../../assets/metaflow-ai-metadata');

        const target = resolveCapabilityDetailTarget(
            { metadataRepos: [], layerSources: [] },
            bundledSourceRoot,
            {
                enabled: true,
                layerEnabled: true,
                synchronizedFiles: [],
                sourceRoot: bundledSourceRoot,
                sourceId: 'dynfxdigital.metaflow-ai',
                sourceDisplayName: 'MetaFlow: AI Metadata Overlay',
            },
            { layerIndex: 0, repoId: '__metaflow_builtin__' },
        );

        assert.ok(target, 'expected built-in detail target from bundled source root');

        const model = await loadCapabilityDetailModel(target!);
        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-bundled',
        });

        assert.strictEqual(model.title, 'MetaFlow Metadata');
        assert.strictEqual(model.builtIn, true);
        assert.strictEqual(model.descriptorKind, 'readme');
        assert.ok(
            model.descriptorPath?.replace(/\\/g, '/').endsWith('/metaflow-ai-metadata/README.md'),
        );
        assert.strictEqual(model.warnings.length, 0);
        assert.ok(
            model.nativeContributions && model.nativeContributions.length >= 7,
            'built-in capability should expose native VS Code registration metadata',
        );

        const instructionsBucket = model.artifactBuckets.find(
            (bucket) => bucket.type === 'instructions',
        );
        const promptsBucket = model.artifactBuckets.find((bucket) => bucket.type === 'prompts');
        const agentsBucket = model.artifactBuckets.find((bucket) => bucket.type === 'agents');
        const skillsBucket = model.artifactBuckets.find((bucket) => bucket.type === 'skills');

        assert.ok(
            instructionsBucket && instructionsBucket.files.length > 0,
            'instructions bucket should be populated',
        );
        assert.ok(
            promptsBucket && promptsBucket.files.length > 0,
            'prompts bucket should be populated',
        );
        assert.ok(
            agentsBucket && agentsBucket.files.length > 0,
            'agents bucket should be populated',
        );
        assert.ok(
            skillsBucket && skillsBucket.files.length > 0,
            'skills bucket should be populated',
        );

        assert.ok(
            html.includes('class="artifact-bucket"'),
            'HTML should render artifact bucket sections',
        );
        assert.ok(html.includes('Instructions'), 'HTML should show Instructions section');
        assert.ok(html.includes('Prompts'), 'HTML should show Prompts section');
        assert.ok(html.includes('Agents'), 'HTML should show Agents section');
        assert.ok(html.includes('Skills'), 'HTML should show Skills section');
        assert.ok(html.includes('Built-in capability'), 'HTML should show built-in source kind');
        assert.ok(
            html.includes('Native VS Code registrations'),
            'HTML should show native VS Code registration visibility',
        );
        assert.ok(
            html.includes('@metaflow'),
            'HTML should show the native MetaFlow chat participant',
        );
        assert.ok(
            html.includes('metaflow-constructs.instructions.md'),
            'HTML should include MetaFlow constructs instruction',
        );
        assert.ok(
            html.includes('ai-metadata-agent.instructions.md'),
            'HTML should include AI metadata agent instruction',
        );
        assert.ok(
            html.includes('github-copilot-metadata-authoring-steward.agent.md'),
            'HTML should include Copilot authoring steward agent',
        );
        assert.ok(
            html.includes('create-agents-md.prompt.md'),
            'HTML should include create-agents-md prompt',
        );
        assert.ok(
            html.includes('grouped by artifact type'),
            'HTML should describe artifact grouping in caption',
        );
    });

    test('TC-0252: renders static built-in state and empty content fallbacks without toggle actions', () => {
        const model = makeCapabilityDetailModel({
            title: '!!!',
            description: undefined,
            layerIndex: undefined,
            repoId: '__metaflow_builtin__',
            repoLabel: 'MetaFlow Built-in',
            descriptorPath: undefined,
            descriptorKind: undefined,
            manifestPath: undefined,
            enabled: false,
            builtIn: true,
            layerFiles: [],
            artifactCount: 0,
            body: '',
        });

        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-static',
        });

        assert.ok(html.includes('<div class="hero-actions hero-actions-static">'));
        assert.ok(!html.includes('command:metaflow.toggleLayer?'));
        assert.ok(html.includes('No description was provided in this package descriptor yet.'));
        assert.ok(html.includes('No source artifacts were found under this layer.'));
        assert.ok(
            html.includes(
                'No <code>README.md</code> or legacy <code>CAPABILITY.md</code> descriptor exists for this layer yet.',
            ),
        );
        assert.ok(html.includes('Excluded from the active MetaFlow capability set.'));
        assert.ok(html.includes('Built-in capability'));
        assert.match(html, /<div class="identity-badge" aria-hidden="true">\s*MF\s*<\/div>/);
    });

    test('TC-0252: renders mailto links, empty applyTo scope examples, and non-github supplemental content', () => {
        const model = makeCapabilityDetailModel({
            title: 'Alerting Capability',
            repoLabel: 'Primary & Partners',
            instructionScopeSummary: {
                inspectedCount: 1,
                activeCount: 0,
                highRiskCount: 0,
                mediumRiskCount: 0,
                lowRiskCount: 0,
                unknownCount: 0,
                missingApplyToCount: 1,
                activeHighRiskCount: 0,
                topRisks: [
                    {
                        repoId: 'primary',
                        repoRelativePath: 'instructions/alert.instructions.md',
                        displayPath: 'instructions/alert.instructions.md',
                        absolutePath: 'C:/workspace/.ai/ai-metadata/alert.instructions.md',
                        name: 'alert.instructions.md',
                        applyTo: undefined,
                        active: false,
                        riskLevel: 'unknown',
                        riskReason: 'Instruction does not declare applyTo.',
                        patterns: [],
                        missingApplyTo: true,
                    },
                ],
                status: 'elevated',
            },
            layerFiles: ['notes/runbook.md'],
            artifactBuckets: [
                {
                    type: 'other',
                    files: ['notes/runbook.md'],
                },
            ],
            body: ['# Capability:   ', '', '[Contact](mailto:ops@example.com)'].join('\n'),
        });

        const html = renderCapabilityDetailsHtml(model, {
            cspSource: 'https://webview.test',
            nonce: 'nonce-mailto',
        });

        assert.ok(html.includes('href="mailto:ops@example.com"'));
        assert.ok(html.includes('target="_blank"'));
        assert.ok(
            html.includes('No <code>.github</code> content was found under this capability.'),
        );
        assert.ok(html.includes('<h3>Other Files</h3>'));
        assert.ok(html.includes('notes/runbook.md'));
        assert.ok(html.includes('no applyTo declared'));
        assert.ok(html.includes('Instruction does not declare applyTo.'));
        assert.ok(html.includes('Primary &amp; Partners'));
        assert.strictEqual((html.match(/<h1>Alerting Capability<\/h1>/g) ?? []).length, 1);
    });
});
