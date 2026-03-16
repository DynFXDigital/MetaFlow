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
        layerId: 'primary/review/capability-review',
        layerIndex: 2,
        layerPath: 'review/capability-review',
        layerRoot: 'C:/workspace/.ai/ai-metadata/review/capability-review',
        repoId: 'primary',
        repoLabel: 'Primary',
        manifestPath: 'C:/workspace/.ai/ai-metadata/review/capability-review/CAPABILITY.md',
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
                path.join(layerRoot, 'CAPABILITY.md'),
                [
                    '---',
                    'name: SDLC Traceability',
                    'description: Shared traceability metadata.',
                    'license: MIT',
                    '---',
                    '',
                    '## Mission',
                    'Keep requirements, design, and tests aligned.',
                ].join('\n'),
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
            assert.strictEqual(model.artifactCount, 2);
            assert.ok(html.includes('capability-tab-details'));
            assert.ok(html.includes('capability-tab-contents'));
            assert.ok(html.includes('Contents'));
            assert.ok(html.includes('Team Metadata'));
            assert.ok(html.includes('<span class="content-tree-title">.github</span>'));
            assert.ok(html.includes('trace.instructions.md'));
            assert.ok(html.includes('<h2>Mission</h2>'));
            assert.ok(html.includes('command:metaflow.toggleLayer?'));
            assert.ok(html.includes('<span class="stat-chip-label">Files</span>'));
            assert.ok(html.includes('<span class="stat-chip-label">Scope Risk</span>'));
            assert.ok(html.includes("script-src 'none'"));
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    test('TC-0252: degrades gracefully when CAPABILITY.md is missing (Verifies: REQ-0311)', async () => {
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

            assert.ok(
                model.warnings.some((warning) => warning.includes('CAPABILITY_MANIFEST_MISSING')),
            );
            assert.ok(
                html.includes('No <code>CAPABILITY.md</code> file exists for this layer yet.'),
            );
            assert.ok(html.includes('tone.instructions.md'));
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
                path.join(sourceRoot, 'CAPABILITY.md'),
                [
                    '---',
                    'name: MetaFlow',
                    'description: Bundled MetaFlow guidance for authoring MetaFlow constructs and reviewing reusable AI metadata capabilities.',
                    'license: MIT',
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
            assert.strictEqual(model.license, 'MIT');
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

    test('TC-0252: renders a .github tree, unknown license, toggle action, and a normalized capability heading (Verifies: REQ-0311)', () => {
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
        assert.ok(html.includes('<details class="content-tree" open>'));
        assert.ok(html.includes('<span class="content-tree-title">.github</span>'));
        assert.ok(html.includes('command:metaflow.toggleLayer?'));
        assert.ok(html.includes('Disable'));
        assert.ok(html.includes('Included in the active MetaFlow capability set.'));
        assert.ok(html.includes('<h2>Metadata</h2>'));
        assert.ok(html.includes('<summary>Paths &amp; IDs</summary>'));
        assert.ok(html.includes('instructions'));
        assert.ok(html.includes('review.instructions.md'));
        assert.ok(html.includes('skills'));
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

    test('TC-0252: renders static built-in state and empty content fallbacks without toggle actions', () => {
        const model = makeCapabilityDetailModel({
            title: '!!!',
            description: undefined,
            layerIndex: undefined,
            repoId: '__metaflow_builtin__',
            repoLabel: 'MetaFlow Built-in',
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
        assert.ok(html.includes('No description was provided in this capability manifest yet.'));
        assert.ok(html.includes('No source artifacts were found under this layer.'));
        assert.ok(html.includes('No <code>CAPABILITY.md</code> file exists for this layer yet.'));
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
