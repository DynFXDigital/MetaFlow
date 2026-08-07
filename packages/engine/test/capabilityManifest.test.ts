import * as assert from 'assert';
import {
    buildAgentPluginCatalog,
    capabilityManifestConstants,
    collectDuplicateCapabilityUidWarnings,
    hasValidReadmeDescriptorAtRoot,
    loadCapabilityDescriptorForLayer,
    loadCapabilityManifestForLayer,
    parseReadmeDescriptorContent,
    parseCapabilityManifestContent,
    resolveCapabilityDescriptorPath,
    type CapabilityMetadata,
} from '../src/index';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('capabilityManifest parser', () => {
    it('parses required fields and body', () => {
        const content = [
            '---',
            'name: SDLC Traceability',
            'description: Traceable requirements and tests.',
            'license: MIT',
            'experimental: true',
            '---',
            '',
            '## Mission',
            'Keep docs testable.',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'sdlc-traceability',
            '/tmp/CAPABILITY.md',
        );

        assert.strictEqual(parsed.id, 'sdlc-traceability');
        assert.strictEqual(parsed.name, 'SDLC Traceability');
        assert.strictEqual(parsed.description, 'Traceable requirements and tests.');
        assert.strictEqual(parsed.license, 'MIT');
        assert.strictEqual(parsed.experimental, true);
        assert.ok(parsed.body?.includes('## Mission'));
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('parses immutable uid and migration aliases', () => {
        const content = [
            '---',
            'uid: 123e4567-e89b-42d3-a456-426614174000',
            'previousIds: [planning, project-planning]',
            'previousPaths: capabilities/planning, capabilities/project/planning',
            'name: Planning',
            'description: Planning guidance.',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'planning', '/tmp/CAPABILITY.md');

        assert.strictEqual(parsed.uid, '123e4567-e89b-42d3-a456-426614174000');
        assert.deepStrictEqual(parsed.previousIds, ['planning', 'project-planning']);
        assert.deepStrictEqual(parsed.previousPaths, [
            'capabilities/planning',
            'capabilities/project/planning',
        ]);
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('keeps missing uid backward-compatible', () => {
        const content = ['---', 'name: Legacy Capability', 'description: Desc', '---'].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'legacy-capability',
            '/tmp/CAPABILITY.md',
        );

        assert.strictEqual(parsed.uid, undefined);
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_UID_INVALID'));
    });

    it('warns on invalid uid syntax', () => {
        const content = [
            '---',
            'uid: not-a-guid',
            'name: My Capability',
            'description: Desc',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );

        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_UID_INVALID'));
    });

    it('warns on empty alias lists', () => {
        const content = [
            '---',
            'previousIds: []',
            'previousPaths: []',
            'name: My Capability',
            'description: Desc',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );

        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_PREVIOUS_IDS_INVALID'));
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_PREVIOUS_PATHS_INVALID'));
    });

    it('emits duplicate uid warnings for capability sets', () => {
        const first = parseCapabilityManifestContent(
            [
                '---',
                'uid: 123e4567-e89b-42d3-a456-426614174000',
                'name: First',
                'description: Desc',
                '---',
            ].join('\n'),
            'first',
            '/repo/first/CAPABILITY.md',
        );
        const second = parseCapabilityManifestContent(
            [
                '---',
                'uid: 123e4567-e89b-42d3-a456-426614174000',
                'name: Second',
                'description: Desc',
                '---',
            ].join('\n'),
            'second',
            '/repo/second/CAPABILITY.md',
        );

        const warnings = collectDuplicateCapabilityUidWarnings([first, second]);

        assert.strictEqual(warnings.length, 2);
        assert.ok(warnings.every((w) => w.code === 'CAPABILITY_UID_DUPLICATE'));
        assert.ok(warnings.every((w) => w.severity === 'error'));
    });

    it('warns on invalid experimental syntax', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'experimental: maybe',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_EXPERIMENTAL_INVALID'));
    });

    it('parses agentPlugin opt-in flag', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'agentPlugin: true',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );

        assert.strictEqual(parsed.agentPlugin, true);
    });

    it('warns when frontmatter is missing', () => {
        const parsed = parseCapabilityManifestContent(
            '# No frontmatter\nBody',
            'foo',
            '/tmp/CAPABILITY.md',
        );

        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_FRONTMATTER_MISSING'));
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_NAME_REQUIRED'));
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_DESCRIPTION_REQUIRED'));
    });

    it('warns on unknown frontmatter keys', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'owner: platform',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_UNKNOWN_FIELD'));
    });

    it('accepts fallback license token', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            `license: ${capabilityManifestConstants.FALLBACK_LICENSE_TOKEN}`,
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('accepts SPDX-like expression syntax', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: MIT OR Apache-2.0',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('warns on invalid license syntax', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: MIT OR',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('loads CAPABILITY.md from layer directory', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const filePath = path.join(tmpDir, 'CAPABILITY.md');
            fs.writeFileSync(
                filePath,
                ['---', 'name: Capability Name', 'description: Capability Description', '---'].join(
                    '\n',
                ),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(loaded);
            assert.strictEqual(loaded?.id, 'capability-id');
            assert.strictEqual(loaded?.manifestPath, filePath);
            assert.strictEqual(loaded?.name, 'Capability Name');
            assert.strictEqual(loaded?.description, 'Capability Description');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('loads a minimal README.md descriptor with body and selected path', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const descriptorId = '123e4567-e89b-42d3-a456-426614174000';
            const readmePath = path.join(tmpDir, 'README.md');
            fs.writeFileSync(
                readmePath,
                [
                    '---',
                    `id: ${descriptorId}`,
                    'name: Portable Package',
                    'description: A portable package descriptor.',
                    '---',
                    '',
                    '# Portable Package',
                    '',
                    'Human-facing package documentation.',
                ].join('\n'),
                'utf-8',
            );

            const loaded = loadCapabilityDescriptorForLayer(tmpDir, 'portable-package');
            assert.ok(loaded);
            assert.strictEqual(loaded?.id, 'portable-package');
            assert.strictEqual(loaded?.uid, undefined);
            assert.strictEqual(loaded?.descriptorKind, 'readme');
            assert.strictEqual(loaded?.manifestPath, readmePath);
            assert.strictEqual(loaded?.name, 'Portable Package');
            assert.strictEqual(loaded?.description, 'A portable package descriptor.');
            assert.ok(loaded?.body?.includes('Human-facing package documentation.'));
            assert.strictEqual(loaded?.license, undefined);
            assert.strictEqual(loaded?.experimental, undefined);
            assert.strictEqual(loaded?.agentPlugin, undefined);
            assert.deepStrictEqual(loaded?.warnings, []);
            assert.deepStrictEqual(resolveCapabilityDescriptorPath(tmpDir), {
                kind: 'readme',
                absolutePath: readmePath,
            });
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('keeps CAPABILITY.md as the absence-only fallback', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const capabilityPath = path.join(tmpDir, 'CAPABILITY.md');
            fs.writeFileSync(
                capabilityPath,
                [
                    '---',
                    'uid: 123e4567-e89b-42d3-a456-426614174000',
                    'name: Legacy Package',
                    'description: A legacy package descriptor.',
                    'license: MIT',
                    '---',
                    '',
                    'Legacy body.',
                ].join('\n'),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'legacy-package');
            assert.ok(loaded);
            assert.strictEqual(loaded?.descriptorKind, 'capability');
            assert.strictEqual(loaded?.manifestPath, capabilityPath);
            assert.strictEqual(loaded?.name, 'Legacy Package');
            assert.strictEqual(loaded?.license, 'MIT');
            assert.strictEqual(
                resolveCapabilityDescriptorPath(tmpDir)?.absolutePath,
                capabilityPath,
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('prefers README.md and emits a stable duplicate warning without merging', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'README.md'),
                [
                    '---',
                    'id: 123e4567-e89b-42d3-a456-426614174000',
                    'name: README Package',
                    'description: README wins.',
                    '---',
                    '',
                    'README body.',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Legacy Package',
                    'description: Legacy loses.',
                    'license: MIT',
                    'agentPlugin: true',
                    '---',
                    '',
                    'Legacy body.',
                ].join('\n'),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'duplicate-package');
            assert.ok(loaded);
            assert.strictEqual(loaded?.manifestPath, path.join(tmpDir, 'README.md'));
            assert.strictEqual(loaded?.name, 'README Package');
            assert.strictEqual(loaded?.description, 'README wins.');
            assert.strictEqual(loaded?.license, undefined);
            assert.strictEqual(loaded?.agentPlugin, undefined);
            const duplicateWarnings = loaded?.warnings.filter(
                (warning) => warning.code === 'CAPABILITY_DESCRIPTOR_DUPLICATE',
            );
            assert.strictEqual(duplicateWarnings?.length, 1);
            assert.ok(duplicateWarnings?.[0].message.includes('contents differ'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('diagnoses malformed README.md without falling back to CAPABILITY.md', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const readmePath = path.join(tmpDir, 'README.md');
            fs.writeFileSync(
                readmePath,
                ['---', 'name: Broken README', 'description: Missing closing delimiter'].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                ['---', 'name: Legacy Fallback', 'description: Must not be selected.', '---'].join(
                    '\n',
                ),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'broken-package');
            assert.ok(loaded);
            assert.strictEqual(loaded?.manifestPath, readmePath);
            assert.strictEqual(loaded?.name, undefined);
            assert.strictEqual(loaded?.description, undefined);
            assert.ok(
                loaded?.warnings.some(
                    (warning) => warning.code === 'README_DESCRIPTOR_FRONTMATTER_MALFORMED',
                ),
            );
            assert.ok(
                loaded?.warnings.some(
                    (warning) => warning.code === 'CAPABILITY_DESCRIPTOR_DUPLICATE',
                ),
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('treats an ordinary README.md as documentation without front matter', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const readmePath = path.join(tmpDir, 'README.md');
            fs.writeFileSync(readmePath, '# Ordinary Repository\n\nDocumentation only.', 'utf-8');

            assert.strictEqual(hasValidReadmeDescriptorAtRoot(tmpDir), true);
            const loaded = loadCapabilityManifestForLayer(tmpDir, 'ordinary-repository');
            assert.ok(loaded);
            assert.strictEqual(loaded?.manifestPath, readmePath);
            assert.strictEqual(loaded?.name, 'Ordinary Repository');
            assert.deepStrictEqual(loaded?.warnings, []);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('infers plugin metadata from README package plugin.json', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'README.md'),
                '# Plugin Package\n\nHuman-facing plugin documentation.',
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'plugin-package',
                        version: '1.0.0',
                        description: 'Runtime plugin metadata.',
                        metaflow: { pluginHosts: ['github-copilot'] },
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'plugin-package');
            assert.ok(loaded);
            assert.strictEqual(loaded?.agentPlugin, true);
            assert.strictEqual(loaded?.name, 'Plugin Package');
            assert.strictEqual(loaded?.description, 'Runtime plugin metadata.');
            assert.strictEqual(loaded?.agentPluginManifest?.name, 'plugin-package');
            assert.strictEqual(loaded?.agentPluginManifest?.version, '1.0.0');
            assert.deepStrictEqual(loaded?.agentPluginManifest?.pluginHosts, ['github-copilot']);
            const catalog = buildAgentPluginCatalog([
                { layerId: 'plugin-package', files: [], capability: loaded },
            ]);
            assert.strictEqual(catalog.entries.length, 1);
            assert.strictEqual(catalog.entries[0].manifestPath, path.join(tmpDir, 'README.md'));
            assert.strictEqual(catalog.entries[0].pluginJsonPath, path.join(tmpDir, 'plugin.json'));
            assert.ok(
                !loaded?.warnings.some(
                    (warning) => warning.code === 'README_DESCRIPTOR_UNKNOWN_FIELD',
                ),
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('does not activate or catalog plugin metadata for invalid README content', () => {
        const cases = [
            {
                name: 'malformed-frontmatter',
                readme: ['---', 'name: Broken', 'description: Missing closing delimiter'].join(
                    '\n',
                ),
                warningCode: 'README_DESCRIPTOR_FRONTMATTER_MALFORMED',
            },
            {
                name: 'missing-name',
                readme: [
                    '---',
                    'id: 123e4567-e89b-42d3-a456-426614174000',
                    'description: Missing name.',
                    '---',
                ].join('\n'),
                warningCode: undefined,
            },
            {
                name: 'missing-description',
                readme: [
                    '---',
                    'id: 123e4567-e89b-42d3-a456-426614174000',
                    'name: Missing Description',
                    '---',
                ].join('\n'),
                warningCode: undefined,
            },
            {
                name: 'ordinary-readme',
                readme: '# Ordinary Repository\n\nDocumentation only.',
                warningCode: undefined,
            },
            {
                name: 'invalid-id',
                readme: [
                    '---',
                    'name: Invalid Identifier',
                    'description: The optional identifier is malformed.',
                    'id: not-a-uuid',
                    '---',
                ].join('\n'),
                warningCode: undefined,
            },
            {
                name: 'missing-id',
                readme: [
                    '---',
                    'name: Missing Identifier',
                    'description: The required identifier is absent.',
                    '---',
                ].join('\n'),
                warningCode: undefined,
            },
        ];

        for (const testCase of cases) {
            const tmpDir = fs.mkdtempSync(
                path.join(os.tmpdir(), 'capability-manifest-plugin-test-'),
            );
            try {
                fs.writeFileSync(path.join(tmpDir, 'README.md'), testCase.readme, 'utf-8');
                fs.writeFileSync(
                    path.join(tmpDir, 'plugin.json'),
                    JSON.stringify(
                        {
                            name: `${testCase.name}-plugin`,
                            version: '1.0.0',
                            metaflow: { pluginHosts: ['github-copilot'] },
                        },
                        null,
                        2,
                    ),
                    'utf-8',
                );

                const loaded = loadCapabilityManifestForLayer(tmpDir, testCase.name);
                assert.ok(loaded);
                assert.strictEqual(loaded?.agentPlugin, true);
                assert.ok(loaded?.agentPluginManifest);
                if (testCase.warningCode) {
                    assert.ok(
                        loaded?.warnings.some((warning) => warning.code === testCase.warningCode),
                    );
                }

                const catalog = buildAgentPluginCatalog([
                    { layerId: testCase.name, files: [], capability: loaded },
                ]);
                assert.strictEqual(catalog.entries.length, 1);
            } finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
        }
    });

    it('accepts optional README frontmatter without a GUID contract', () => {
        const parsed = parseReadmeDescriptorContent(
            [
                '---',
                'id: 123e4567-e89b-42d3-a456-426614174000',
                'name: Minimal',
                'description: Minimal description.',
                '---',
                '',
                'Body',
            ].join('\n'),
            'minimal',
            '/tmp/README.md',
        );

        assert.strictEqual(parsed.name, 'Minimal');
        assert.strictEqual(parsed.description, 'Minimal description.');
        assert.strictEqual(parsed.uid, undefined);
        assert.strictEqual(parsed.agentPlugin, undefined);
        assert.strictEqual(parsed.experimental, undefined);
        assert.strictEqual(parsed.previousIds, undefined);
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('accepts incomplete README frontmatter as documentation', () => {
        const parsed = parseReadmeDescriptorContent(
            [
                '---',
                'id: 123e4567-e89b-42d3-a456-426614174000',
                'name: Incomplete',
                '---',
                '',
                'Body',
            ].join('\n'),
            'incomplete',
            '/tmp/README.md',
        );

        assert.strictEqual(parsed.name, 'Incomplete');
        assert.strictEqual(parsed.description, undefined);
        assert.deepStrictEqual(parsed.warnings, []);
        assert.strictEqual(parsed.agentPlugin, undefined);
        assert.strictEqual(parsed.experimental, undefined);
        assert.strictEqual(parsed.previousIds, undefined);
    });

    it('returns CAPABILITY_READ_ERROR warning when file cannot be read', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            // Create a directory at CAPABILITY.md path — readFileSync will throw EISDIR/EACCES
            const capPath = path.join(tmpDir, 'CAPABILITY.md');
            fs.mkdirSync(capPath);
            const loaded = loadCapabilityManifestForLayer(tmpDir, 'my-capability');
            assert.ok(loaded, 'should return a capability object even on read failure');
            assert.ok(
                loaded!.warnings.some((w) => w.code === 'CAPABILITY_READ_ERROR'),
                `expected CAPABILITY_READ_ERROR, got: ${JSON.stringify(loaded!.warnings)}`,
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('accepts AND expression in license', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: MIT AND Apache-2.0',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('accepts parenthesized SPDX expression in license', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: (MIT OR Apache-2.0) AND GPL-2.0-only',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('accepts SPDX WITH exception expression in license', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: GPL-2.0-only WITH Classpath-exception-2.0',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(!parsed.warnings.some((w) => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('warns on malformed frontmatter without closing ---', () => {
        // starts with --- but has no closing ---
        const content = '---\nname: My Cap\ndescription: Desc\n'; // missing closing ---

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_FRONTMATTER_MALFORMED'));
    });

    it('warns on invalid frontmatter line format', () => {
        const content = ['---', 'name: My Cap', 'description: Desc', ':invalid-no-key', '---'].join(
            '\n',
        );

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_FRONTMATTER_LINE_INVALID'));
    });

    it('warns when name and description are empty strings', () => {
        const content = ['---', 'name: ', 'description: ', '---'].join('\n');

        const parsed = parseCapabilityManifestContent(
            content,
            'my-capability',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_NAME_REQUIRED'));
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_DESCRIPTION_REQUIRED'));
    });

    it('loads validated agent-plugin manifest metadata when opted in', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Capability Name',
                    'description: Capability Description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, 'plugin.json'),
                JSON.stringify(
                    {
                        name: 'capability-name',
                        version: '1.2.3',
                        description: 'Capability plugin description',
                        keywords: ['metaflow', 'agent-plugin'],
                        metaflow: {
                            pluginHosts: ['github-copilot'],
                            minimumMetaflowVersion: '^0.14.0',
                        },
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(loaded);
            assert.strictEqual(loaded?.agentPlugin, true);
            assert.strictEqual(loaded?.agentPluginManifest?.name, 'capability-name');
            assert.strictEqual(loaded?.agentPluginManifest?.version, '1.2.3');
            assert.deepStrictEqual(loaded?.agentPluginManifest?.pluginHosts, ['github-copilot']);
            assert.ok(
                !loaded?.warnings.some((warning) => warning.severity === 'error'),
                `expected no agent-plugin errors, got: ${JSON.stringify(loaded?.warnings)}`,
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('emits an error when agentPlugin is enabled but plugin.json is missing', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Capability Name',
                    'description: Capability Description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(
                loaded?.warnings.some(
                    (warning) =>
                        warning.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING' &&
                        warning.severity === 'error',
                ),
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('emits an error when agent-plugin plugin.json is invalid', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Capability Name',
                    'description: Capability Description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(path.join(tmpDir, 'plugin.json'), '{ invalid json', 'utf-8');

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(
                loaded?.warnings.some(
                    (warning) =>
                        warning.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_JSON_INVALID' &&
                        warning.severity === 'error',
                ),
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    function loadWithPluginJson(pluginJsonRaw: string): CapabilityMetadata | undefined {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                [
                    '---',
                    'name: Capability Name',
                    'description: Capability Description',
                    'agentPlugin: true',
                    '---',
                ].join('\n'),
                'utf-8',
            );
            fs.writeFileSync(path.join(tmpDir, 'plugin.json'), pluginJsonRaw, 'utf-8');
            return loadCapabilityManifestForLayer(tmpDir, 'capability-id');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }

    function hasCode(loaded: CapabilityMetadata | undefined, code: string): boolean {
        return Boolean(loaded?.warnings.some((warning) => warning.code === code));
    }

    it('emits an error when plugin.json is not a top-level object', () => {
        const loaded = loadWithPluginJson('["not", "an", "object"]');
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_OBJECT_REQUIRED'));
    });

    it('emits an error when plugin.json name is missing', () => {
        const loaded = loadWithPluginJson(JSON.stringify({ version: '1.0.0' }));
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_NAME_REQUIRED'));
    });

    it('emits an error when plugin.json name is not kebab-case', () => {
        const loaded = loadWithPluginJson(JSON.stringify({ name: 'Not Kebab', version: '1.0.0' }));
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_NAME_INVALID'));
    });

    it('emits an error when plugin.json version is missing', () => {
        const loaded = loadWithPluginJson(JSON.stringify({ name: 'good-name' }));
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_VERSION_REQUIRED'));
    });

    it('emits an error when plugin.json version is not semver', () => {
        const loaded = loadWithPluginJson(JSON.stringify({ name: 'good-name', version: 'v-one' }));
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_VERSION_INVALID'));
    });

    it('warns when plugin.json keywords is not an array', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({ name: 'good-name', version: '1.0.0', keywords: 'oops' }),
        );
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_KEYWORDS_INVALID'));
    });

    it('emits an error when plugin.json metaflow is not an object', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({ name: 'good-name', version: '1.0.0', metaflow: 'oops' }),
        );
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_METAFLOW_INVALID'));
    });

    it('emits an error when metaflow.pluginHosts is not an array of strings', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({
                name: 'good-name',
                version: '1.0.0',
                metaflow: { pluginHosts: 'github-copilot' },
            }),
        );
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_HOSTS_INVALID'));
    });

    it('emits an error when metaflow.minimumMetaflowVersion is not a recognizable range', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({
                name: 'good-name',
                version: '1.0.0',
                metaflow: {
                    pluginHosts: ['github-copilot'],
                    minimumMetaflowVersion: 'not-a-range',
                },
            }),
        );
        assert.ok(
            hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID'),
        );
    });

    it('emits an error when metaflow.minimumMetaflowVersion is not a string', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({
                name: 'good-name',
                version: '1.0.0',
                metaflow: { pluginHosts: ['github-copilot'], minimumMetaflowVersion: 14 },
            }),
        );
        assert.ok(
            hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID'),
        );
    });

    it('recommends declaring pluginHosts when none are present', () => {
        const loaded = loadWithPluginJson(JSON.stringify({ name: 'good-name', version: '1.0.0' }));
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_HOSTS_RECOMMENDED'));
    });

    it('emits a read error when plugin.json cannot be read as a file', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-plugin-test-'));
        try {
            fs.writeFileSync(
                path.join(tmpDir, 'CAPABILITY.md'),
                ['---', 'name: Cap', 'description: Desc', 'agentPlugin: true', '---'].join('\n'),
                'utf-8',
            );
            // Make plugin.json a directory so readFileSync throws (EISDIR).
            fs.mkdirSync(path.join(tmpDir, 'plugin.json'));
            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_READ_ERROR'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('emits an error when CAPABILITY.md agentPlugin is not a boolean', () => {
        const parsed = parseCapabilityManifestContent(
            ['---', 'name: Cap', 'description: Desc', 'agentPlugin: maybe', '---'].join('\n'),
            'cap',
            '/tmp/CAPABILITY.md',
        );
        assert.ok(parsed.warnings.some((w) => w.code === 'CAPABILITY_AGENT_PLUGIN_INVALID'));
    });
});
