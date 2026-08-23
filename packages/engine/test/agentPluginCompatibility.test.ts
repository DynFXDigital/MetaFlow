import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    inspectAgentPluginPackage,
} from '../src/engine/agentPluginCompatibility';

function writeFixture(rootPath: string, relativePath: string, content: string): string {
    const filePath = path.join(rootPath, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

function writeManifest(rootPath: string, manifest: Record<string, unknown>): void {
    writeFixture(rootPath, 'plugin.json', JSON.stringify(manifest));
}

function skill(name: string, description = 'A valid skill description.'): string {
    return [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        '# Instructions',
    ].join('\n');
}

describe('inspectAgentPluginPackage', () => {
    let rootPath: string;

    beforeEach(() => {
        rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-agent-plugins-v1-'));
    });

    afterEach(() => {
        fs.rmSync(rootPath, { recursive: true, force: true });
    });

    it('accepts a minimal manifest with dotted name and an omitted version', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'deployment.tools',
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.profile, 'agent-plugins-v1');
        assert.strictEqual(result.validManifest, true);
        assert.strictEqual(result.manifest?.name, 'deployment.tools');
        assert.strictEqual(result.manifest?.version, undefined);
        assert.deepStrictEqual(result.diagnostics, []);
    });

    it('accepts a non-SemVer version string', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'deployment.tools',
            version: 'release-candidate',
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.profile, 'agent-plugins-v1');
        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(result.validSkills, []);
        assert.deepStrictEqual(result.validMcpServers, []);
        assert.strictEqual(result.manifest?.name, 'deployment.tools');
        assert.strictEqual(result.manifest?.version, 'release-candidate');
        assert.deepStrictEqual(result.diagnostics, []);
    });

    it('preserves standard object extensions in the portable manifest inventory', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'deployment.tools',
            extensions: {
                'pi-agent-plugins': {
                    enabled: true,
                },
            },
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(result.manifest?.extensions, {
            'pi-agent-plugins': {
                enabled: true,
            },
        });
        assert.deepStrictEqual(result.diagnostics, []);
    });

    it('reports but ignores unknown fields and non-object extensions', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'valid-plugin',
            extensions: 'old-host-data',
            commands: ['legacy-command'],
            experimental: true,
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(result.recognizedHostFields, ['commands']);
        assert.deepStrictEqual(
            result.diagnostics.map((entry) => entry.code),
            [
                'AGENT_PLUGIN_MANIFEST_EXTENSIONS_IGNORED',
                'AGENT_PLUGIN_MANIFEST_UNKNOWN_FIELD',
                'AGENT_PLUGIN_MANIFEST_UNKNOWN_FIELD',
            ],
        );
        assert.ok(result.diagnostics.every((entry) => entry.severity !== 'error'));
    });

    it('rejects fatal portable metadata errors before component discovery', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'valid-plugin',
            version: 1,
            author: { name: 'Example', extra: 'not allowed' },
            keywords: ['portable', 2],
        });
        writeFixture(rootPath, 'skills/valid-skill/SKILL.md', skill('valid-skill'));

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, false);
        assert.deepStrictEqual(result.skills, []);
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_MANIFEST_METADATA_INVALID',
            ),
        );
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_MANIFEST_AUTHOR_INVALID',
            ),
        );
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_MANIFEST_KEYWORDS_INVALID',
            ),
        );
    });

    it('classifies unsupported Agent Plugins schemas without discovering components', () => {
        writeManifest(rootPath, {
            $schema: 'https://agent-plugins.org/schemas/2.0.0/plugin.schema.json',
            name: 'future-plugin',
        });
        writeFixture(rootPath, 'skills/valid-skill/SKILL.md', skill('valid-skill'));

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.profile, 'unsupported');
        assert.strictEqual(result.validManifest, false);
        assert.deepStrictEqual(result.skills, []);
        assert.ok(
            result.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_SCHEMA_UNSUPPORTED'),
        );
    });

    it('discovers only immediate valid skills and isolates invalid siblings', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'skills-plugin',
        });
        writeFixture(
            rootPath,
            'skills/a-skill/SKILL.md',
            [
                '---',
                'name: a-skill',
                'description: Valid and sorted first.',
                'license: MIT',
                'compatibility: Requires git',
                'metadata:',
                '  owner: metaflow',
                'allowed-tools: Read Bash(git:*)',
                '---',
                '',
                '# Instructions',
            ].join('\n'),
        );
        writeFixture(rootPath, 'skills/invalid/SKILL.md', skill('wrong-name'));
        writeFixture(
            rootPath,
            'skills/invalid-metadata/SKILL.md',
            [
                '---',
                'name: invalid-metadata',
                'description: Invalid optional metadata types.',
                'license:',
                '  - MIT',
                'allowed-tools:',
                '  - Read',
                '---',
            ].join('\n'),
        );
        writeFixture(
            rootPath,
            'skills/unknown-field/SKILL.md',
            [
                '---',
                'name: unknown-field',
                'description: Unknown frontmatter is not portable.',
                'host-only: true',
                '---',
            ].join('\n'),
        );
        writeFixture(rootPath, 'skills/nested/deeper/SKILL.md', skill('deeper'));

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(
            result.skills.map((entry) => entry.name),
            ['a-skill'],
        );
        assert.strictEqual(result.skills[0]?.license, 'MIT');
        assert.strictEqual(result.skills[0]?.metadata?.owner, 'metaflow');
        assert.strictEqual(result.skills[0]?.allowedTools, 'Read Bash(git:*)');
        assert.ok(result.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_SKILL_INVALID'));
    });

    it('isolates invalid MCP entries and disables MCP only for a version mismatch', () => {
        writeManifest(rootPath, { $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: 'mcp-plugin' });
        writeFixture(rootPath, 'skills/valid-skill/SKILL.md', skill('valid-skill'));
        writeFixture(
            rootPath,
            'mcp.json',
            JSON.stringify({
                $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                mcpServers: {
                    remote: {
                        type: 'streamable-http',
                        url: 'https://tools.example.test/mcp',
                        headers: { 'X-Tenant': 'public' },
                    },
                    'loopback-v6': {
                        type: 'streamable-http',
                        url: 'http://[::1]/mcp',
                    },
                    broken: { type: 'stdio', command: 'node server' },
                    reserved: { type: 'stdio', command: 'node', env: { PLUGIN_ROOT: 'forbidden' } },
                    'duplicate-headers': {
                        type: 'streamable-http',
                        url: 'https://tools.example.test/mcp',
                        headers: { Authorization: 'one', authorization: 'two' },
                    },
                    'invalid-header-name': {
                        type: 'streamable-http',
                        url: 'https://tools.example.test/mcp',
                        headers: { 'Bad Header': 'value' },
                    },
                    'invalid-header-value': {
                        type: 'streamable-http',
                        url: 'https://tools.example.test/mcp',
                        headers: { 'X-Test': 'line one\r\nline two' },
                    },
                    'plugin-data-escape': {
                        type: 'stdio',
                        command: 'node',
                        cwd: '${PLUGIN_DATA}/safe\\..\\..\\escape',
                    },
                    'drive-relative-command': {
                        type: 'stdio',
                        command: 'C:server.exe',
                    },
                    local: {
                        type: 'stdio',
                        command: './bin/server with spaces',
                        args: ['--data', '${PLUGIN_DATA}'],
                        cwd: '${PLUGIN_ROOT}',
                    },
                },
            }),
        );

        const isolated = inspectAgentPluginPackage(rootPath);
        assert.strictEqual(isolated.validManifest, true);
        assert.deepStrictEqual(
            isolated.mcpServers.map((entry) => entry.name),
            ['local', 'loopback-v6', 'remote'],
        );
        assert.ok(
            isolated.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_MCP_SERVER_INVALID'),
        );
        assert.ok(
            isolated.diagnostics.some(
                (entry) =>
                    entry.code === 'AGENT_PLUGIN_MCP_SERVER_INVALID' &&
                    entry.message.includes('drive-relative-command'),
            ),
        );

        writeFixture(
            rootPath,
            'mcp.json',
            JSON.stringify({
                $schema: 'https://agent-plugins.org/schemas/2.0.0/mcp.schema.json',
                mcpServers: {
                    remote: { type: 'streamable-http', url: 'https://tools.example.test/mcp' },
                },
            }),
        );
        const mismatch = inspectAgentPluginPackage(rootPath);
        assert.strictEqual(mismatch.validManifest, true);
        assert.deepStrictEqual(
            mismatch.skills.map((entry) => entry.name),
            ['valid-skill'],
        );
        assert.deepStrictEqual(mismatch.mcpServers, []);
        assert.ok(
            mismatch.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_MCP_DOCUMENT_INVALID',
            ),
        );
    });

    it('classifies non-Agent Plugins manifests as legacy hosts and reports known fields', () => {
        writeManifest(rootPath, {
            name: 'legacy-plugin',
            agents: ['agent.md'],
            hooks: { PreToolUse: [] },
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.profile, 'legacy-host');
        assert.strictEqual(result.validManifest, false);
        assert.deepStrictEqual(result.recognizedHostFields, ['agents', 'hooks']);
    });

    it('rejects a root plugin.json whose resolved path escapes the plugin root', function () {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-agent-plugin-manifest-'));
        try {
            const outsideManifest = writeFixture(
                outside,
                'plugin.json',
                JSON.stringify({
                    $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
                    name: 'outside-plugin',
                }),
            );
            try {
                fs.symlinkSync(outsideManifest, path.join(rootPath, 'plugin.json'), 'file');
            } catch {
                this.skip();
                return;
            }

            const result = inspectAgentPluginPackage(rootPath);

            assert.strictEqual(result.profile, 'invalid');
            assert.strictEqual(result.validManifest, false);
            assert.deepStrictEqual(result.skills, []);
            assert.ok(
                result.diagnostics.some(
                    (entry) => entry.code === 'AGENT_PLUGIN_MANIFEST_PATH_INVALID',
                ),
            );
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('skips a skill whose resolved path escapes the plugin root when symlinks are supported', function () {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'contained-plugin',
        });
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-agent-plugins-outside-'));
        try {
            const outsideSkill = writeFixture(outside, 'SKILL.md', skill('escape'));
            const linkPath = path.join(rootPath, 'skills', 'escape', 'SKILL.md');
            fs.mkdirSync(path.dirname(linkPath), { recursive: true });
            try {
                fs.symlinkSync(outsideSkill, linkPath, 'file');
            } catch {
                this.skip();
                return;
            }

            const result = inspectAgentPluginPackage(rootPath);
            assert.deepStrictEqual(result.skills, []);
            assert.ok(
                result.diagnostics.some(
                    (entry) => entry.code === 'AGENT_PLUGIN_SKILL_PATH_INVALID',
                ),
            );
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('reports dangling fixed component locations instead of treating them as absent', function () {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'dangling-components',
        });
        try {
            fs.symlinkSync(
                path.join(rootPath, 'missing-skills'),
                path.join(rootPath, 'skills'),
                'dir',
            );
            fs.symlinkSync(
                path.join(rootPath, 'missing-mcp.json'),
                path.join(rootPath, 'mcp.json'),
                'file',
            );
        } catch {
            this.skip();
            return;
        }

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(result.skills, []);
        assert.deepStrictEqual(result.mcpServers, []);
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'AGENT_PLUGIN_SKILLS_LOCATION_INVALID',
            ),
        );
        assert.ok(
            result.diagnostics.some((entry) => entry.code === 'AGENT_PLUGIN_MCP_LOCATION_INVALID'),
        );
    });
});
