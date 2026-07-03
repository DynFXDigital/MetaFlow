import * as assert from 'assert';
import {
    capabilityManifestConstants,
    collectDuplicateCapabilityUidWarnings,
    loadCapabilityManifestForLayer,
    parseCanonicalCapabilityManifestContent,
    parseCapabilityManifestContent,
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
                metaflow: { pluginHosts: ['github-copilot'], minimumMetaflowVersion: 'not-a-range' },
            }),
        );
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID'));
    });

    it('emits an error when metaflow.minimumMetaflowVersion is not a string', () => {
        const loaded = loadWithPluginJson(
            JSON.stringify({
                name: 'good-name',
                version: '1.0.0',
                metaflow: { pluginHosts: ['github-copilot'], minimumMetaflowVersion: 14 },
            }),
        );
        assert.ok(hasCode(loaded, 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MINIMUM_METAFLOW_VERSION_INVALID'));
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

    it('parses canonical .metaflow capability metadata', () => {
        const parsed = parseCanonicalCapabilityManifestContent(
            JSON.stringify({
                schemaVersion: 'metaflow.capability/v1',
                id: 'metadata-authoring.codex',
                uid: '123e4567-e89b-42d3-a456-426614174000',
                previousIds: ['codex-metadata-authoring'],
                previousPaths: ['capabilities/old-codex'],
                name: 'Codex Metadata Authoring',
                summary: 'Helps agents author Codex-compatible metadata.',
                domain: 'metadata-authoring',
                kind: 'agent-plugin',
                lifecycle: 'draft',
                owners: ['metaflow'],
                components: {
                    agents: ['codex-metadata-authoring-steward'],
                    skills: ['codex-metadata'],
                    packages: ['codex-metadata-authoring'],
                },
                targets: {
                    codex: { enabled: true },
                    'github-copilot': { enabled: false },
                },
                packages: ['codex-metadata-authoring'],
                license: 'MIT',
                experimental: false,
            }),
            'fallback-id',
            '/tmp/.metaflow/capability.json',
        );

        assert.strictEqual(parsed.id, 'metadata-authoring.codex');
        assert.strictEqual(parsed.uid, '123e4567-e89b-42d3-a456-426614174000');
        assert.deepStrictEqual(parsed.previousIds, ['codex-metadata-authoring']);
        assert.deepStrictEqual(parsed.previousPaths, ['capabilities/old-codex']);
        assert.strictEqual(parsed.name, 'Codex Metadata Authoring');
        assert.strictEqual(parsed.schemaVersion, 'metaflow.capability/v1');
        assert.strictEqual(parsed.domain, 'metadata-authoring');
        assert.strictEqual(parsed.kind, 'agent-plugin');
        assert.strictEqual(parsed.lifecycle, 'draft');
        assert.deepStrictEqual(parsed.owners, ['metaflow']);
        assert.deepStrictEqual(parsed.components, {
            agents: ['codex-metadata-authoring-steward'],
            skills: ['codex-metadata'],
            packages: ['codex-metadata-authoring'],
        });
        assert.deepStrictEqual(parsed.targets, {
            codex: { enabled: true },
            'github-copilot': { enabled: false },
        });
        assert.deepStrictEqual(parsed.packages, ['codex-metadata-authoring']);
        assert.strictEqual(parsed.description, 'Helps agents author Codex-compatible metadata.');
        assert.strictEqual(parsed.license, 'MIT');
        assert.strictEqual(parsed.experimental, false);
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('warns on invalid canonical .metaflow capability metadata shapes', () => {
        const parsed = parseCanonicalCapabilityManifestContent(
            JSON.stringify({
                schemaVersion: '',
                id: '',
                uid: 'not-a-uuid',
                previousIds: 'old-id',
                previousPaths: [],
                name: '',
                domain: '',
                lifecycle: '',
                owners: [''],
                components: { skills: [] },
                targets: { codex: { enabled: 'yes' } },
                packages: [],
                experimental: 'false',
                agentPlugin: 'true',
                kind: '',
                extraField: true,
            }),
            'fallback-id',
            '/tmp/.metaflow/capability.json',
        );

        const codes = parsed.warnings.map((warning) => warning.code);
        assert.ok(codes.includes('CANONICAL_CAPABILITY_SCHEMA_VERSION_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_ID_INVALID'));
        assert.ok(codes.includes('CAPABILITY_UID_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_PREVIOUS_IDS_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_PREVIOUS_PATHS_INVALID'));
        assert.ok(codes.includes('CAPABILITY_NAME_REQUIRED'));
        assert.ok(codes.includes('CAPABILITY_DESCRIPTION_REQUIRED'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_DOMAIN_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_LIFECYCLE_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_OWNERS_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_COMPONENTS_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_TARGETS_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_PACKAGES_INVALID'));
        assert.ok(codes.includes('CAPABILITY_EXPERIMENTAL_INVALID'));
        assert.ok(codes.includes('CAPABILITY_AGENT_PLUGIN_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_KIND_INVALID'));
        assert.ok(codes.includes('CANONICAL_CAPABILITY_UNKNOWN_FIELD'));
    });

    it('loads canonical kind agent-plugin opt-in and validates plugin.json', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-capability-plugin-test-'));
        try {
            fs.mkdirSync(path.join(tmpDir, '.metaflow'));
            fs.writeFileSync(
                path.join(tmpDir, '.metaflow', 'capability.json'),
                JSON.stringify({
                    schemaVersion: 'metaflow.capability/v1',
                    id: 'codex-plugin-capability',
                    name: 'Codex Plugin Capability',
                    summary: 'Codex plugin capability.',
                    kind: 'agent-plugin',
                }),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, 'plugin.json'),
                JSON.stringify({
                    name: 'codex-plugin-capability',
                    version: '1.0.0',
                    metaflow: {
                        pluginHosts: ['github-copilot', 'codex'],
                    },
                }),
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'fallback-id');
            assert.strictEqual(loaded?.agentPlugin, true);
            assert.strictEqual(loaded?.agentPluginManifest?.name, 'codex-plugin-capability');
            assert.deepStrictEqual(loaded?.agentPluginManifest?.pluginHosts, [
                'github-copilot',
                'codex',
            ]);
            assert.ok(
                !loaded?.warnings.some((warning) => warning.severity === 'error'),
                `expected no canonical plugin errors, got: ${JSON.stringify(loaded?.warnings)}`,
            );
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('loads canonical .metaflow README as the capability narrative body', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-capability-readme-test-'));
        try {
            fs.mkdirSync(path.join(tmpDir, '.metaflow'));
            fs.writeFileSync(
                path.join(tmpDir, '.metaflow', 'capability.json'),
                JSON.stringify({
                    schemaVersion: 'metaflow.capability/v1',
                    id: 'canonical-narrative',
                    name: 'Canonical Narrative',
                    summary: 'Structured identity with markdown narrative.',
                }),
                'utf-8',
            );
            fs.writeFileSync(
                path.join(tmpDir, '.metaflow', 'README.md'),
                '# Canonical Narrative\n\nAuthor the long-form capability story here.\n',
                'utf-8',
            );

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'fallback-id');
            assert.strictEqual(loaded?.id, 'canonical-narrative');
            assert.ok(loaded?.body?.includes('Author the long-form capability story here.'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('warns when canonical .metaflow README cannot be read as a file', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-capability-readme-test-'));
        try {
            fs.mkdirSync(path.join(tmpDir, '.metaflow'));
            fs.writeFileSync(
                path.join(tmpDir, '.metaflow', 'capability.json'),
                JSON.stringify({
                    schemaVersion: 'metaflow.capability/v1',
                    id: 'canonical-narrative',
                    name: 'Canonical Narrative',
                    summary: 'Structured identity with markdown narrative.',
                }),
                'utf-8',
            );
            fs.mkdirSync(path.join(tmpDir, '.metaflow', 'README.md'));

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'fallback-id');
            assert.ok(hasCode(loaded, 'CANONICAL_CAPABILITY_README_READ_ERROR'));
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('returns canonical parse errors for invalid .metaflow capability files', () => {
        const invalidJson = parseCanonicalCapabilityManifestContent(
            '{ invalid json',
            'fallback-id',
            '/tmp/.metaflow/capability.json',
        );
        assert.ok(hasCode(invalidJson, 'CANONICAL_CAPABILITY_JSON_INVALID'));

        const nonObject = parseCanonicalCapabilityManifestContent(
            '[]',
            'fallback-id',
            '/tmp/.metaflow/capability.json',
        );
        assert.ok(hasCode(nonObject, 'CANONICAL_CAPABILITY_OBJECT_REQUIRED'));
    });
});
