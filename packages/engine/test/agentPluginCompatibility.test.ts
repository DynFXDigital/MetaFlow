import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    inspectAgentPluginPackage,
    inspectAgentPluginPackageCandidate,
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
                'dev.pi.agent-plugins': {
                    enabled: true,
                },
            },
        });

        const result = inspectAgentPluginPackage(rootPath);

        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(result.manifest?.extensions, {
            'dev.pi.agent-plugins': {
                enabled: true,
            },
        });
        assert.deepStrictEqual(result.diagnostics, []);
    });

    it('preflights a proposed manifest without creating plugin.json', () => {
        writeFixture(rootPath, 'skills/deploy/SKILL.md', skill('deploy'));

        const result = inspectAgentPluginPackageCandidate(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'deployment.tools',
        });

        assert.strictEqual(result.profile, 'agent-plugins-v1');
        assert.strictEqual(result.validManifest, true);
        assert.deepStrictEqual(
            result.validSkills.map((entry) => entry.name),
            ['deploy'],
        );
        assert.deepStrictEqual(result.diagnostics, []);
        assert.strictEqual(fs.existsSync(path.join(rootPath, 'plugin.json')), false);
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

    it('rejects outside-root skill directories before stat or enumeration, including chained links', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'skills-plugin',
        });
        writeFixture(rootPath, 'skills/valid-skill/SKILL.md', skill('valid-skill'));
        const outside = fs.mkdtempSync(`${rootPath}-outside-`);
        const nativeFs: typeof fs = require('fs');
        const originalStat = nativeFs.statSync;
        const originalReadDir = nativeFs.readdirSync;
        const originalReadFile = nativeFs.readFileSync;
        const outsideAccesses: string[] = [];
        try {
            writeFixture(outside, 'SKILL.md', skill('escape'));
            const linkType = process.platform === 'win32' ? 'junction' : 'dir';
            const directLink = path.join(rootPath, 'skills', 'escape');
            fs.symlinkSync(outside, directLink, linkType);
            fs.symlinkSync(directLink, path.join(rootPath, 'skills', 'chained'), linkType);
            const emptyOutside = path.join(outside, 'empty');
            fs.mkdirSync(emptyOutside);
            fs.symlinkSync(emptyOutside, path.join(rootPath, 'skills', 'empty'), linkType);
            const realOutside = fs.realpathSync.native(outside);
            const recordAccess = (operation: string, target: fs.PathLike | number): void => {
                if (typeof target === 'number') {
                    return;
                }
                const resolved = fs.realpathSync.native(target);
                const relative = path.relative(realOutside, resolved);
                if (
                    relative === '' ||
                    (relative !== '..' &&
                        !relative.startsWith(`..${path.sep}`) &&
                        !path.isAbsolute(relative))
                ) {
                    outsideAccesses.push(`${operation}: ${String(target)}`);
                }
            };
            nativeFs.statSync = new Proxy(originalStat, {
                apply(target, thisArg, args) {
                    recordAccess('stat', args[0]);
                    return Reflect.apply(target, thisArg, args);
                },
            });
            nativeFs.readdirSync = new Proxy(originalReadDir, {
                apply(target, thisArg, args) {
                    recordAccess('readdir', args[0]);
                    return Reflect.apply(target, thisArg, args);
                },
            });
            nativeFs.readFileSync = new Proxy(originalReadFile, {
                apply(target, thisArg, args) {
                    recordAccess('readFile', args[0]);
                    return Reflect.apply(target, thisArg, args);
                },
            });

            const result = inspectAgentPluginPackage(rootPath);

            assert.deepStrictEqual(outsideAccesses, [], 'outside directories must not be accessed');
            assert.deepStrictEqual(
                result.skills.map((entry) => entry.name),
                ['valid-skill'],
            );
            assert.strictEqual(
                result.diagnostics.filter(
                    (entry) => entry.code === 'AGENT_PLUGIN_SKILL_PATH_INVALID',
                ).length,
                3,
            );
        } finally {
            nativeFs.statSync = originalStat;
            nativeFs.readdirSync = originalReadDir;
            nativeFs.readFileSync = originalReadFile;
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('accepts contained skill directory links and ignores non-directory siblings', () => {
        writeManifest(rootPath, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'skills-plugin',
        });
        const target = writeFixture(rootPath, '..cache/SKILL.md', skill('linked-skill'));
        fs.mkdirSync(path.join(rootPath, 'skills'));
        fs.symlinkSync(
            path.dirname(target),
            path.join(rootPath, 'skills', 'linked-skill'),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
        writeFixture(rootPath, 'skills/README.md', 'Not a skill directory.');

        const result = inspectAgentPluginPackage(rootPath);

        assert.deepStrictEqual(
            result.skills.map((entry) => entry.name),
            ['linked-skill'],
        );
        assert.strictEqual(result.skills[0].skillPath, fs.realpathSync.native(target));
        assert.deepStrictEqual(result.diagnostics, []);
    });

    it('accepts contained dot-prefixed MCP command and cwd paths', () => {
        writeManifest(rootPath, { $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: 'mcp-plugin' });
        writeFixture(rootPath, '..cache/server', 'fixture');
        for (const config of [
            { command: './..cache/server', cwd: './..cache' },
            { command: './..missing/server', cwd: '${PLUGIN_ROOT}/..missing/work' },
            { command: 'node', cwd: '${PLUGIN_ROOT}/..cache' },
            { command: './..cache/../..cache/server', cwd: '${PLUGIN_ROOT}' },
        ]) {
            writeFixture(
                rootPath,
                'mcp.json',
                JSON.stringify({
                    $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                    mcpServers: { candidate: { type: 'stdio', ...config } },
                }),
            );
            const result = inspectAgentPluginPackage(rootPath);
            assert.deepStrictEqual(
                result.mcpServers.map((entry) => entry.name),
                ['candidate'],
                JSON.stringify(config),
            );
            assert.deepStrictEqual(result.diagnostics, []);
        }
    });

    it('rejects parent escapes and linked escapes in MCP command and cwd paths', () => {
        writeManifest(rootPath, { $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: 'mcp-plugin' });
        const outside = fs.mkdtempSync(`${rootPath}-outside-`);
        try {
            fs.symlinkSync(
                outside,
                path.join(rootPath, '..linked'),
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            for (const config of [
                { command: './../server' },
                { command: './..linked/missing/server' },
                { command: 'node', cwd: './..' },
                { command: 'node', cwd: '${PLUGIN_ROOT}/../escape' },
                { command: 'node', cwd: '${PLUGIN_ROOT}/..linked/missing' },
            ]) {
                writeFixture(
                    rootPath,
                    'mcp.json',
                    JSON.stringify({
                        $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                        mcpServers: { candidate: { type: 'stdio', ...config } },
                    }),
                );
                const result = inspectAgentPluginPackage(rootPath);
                assert.deepStrictEqual(result.mcpServers, [], JSON.stringify(config));
                assert.ok(
                    result.diagnostics.some(
                        (entry) => entry.code === 'AGENT_PLUGIN_MCP_SERVER_INVALID',
                    ),
                );
            }
        } finally {
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('accepts lexically contained PLUGIN_DATA cwd paths after normalization', () => {
        writeManifest(rootPath, { $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: 'mcp-plugin' });
        for (const cwd of [
            '${PLUGIN_DATA}',
            '${PLUGIN_DATA}/cache/../work',
            '${PLUGIN_DATA}/cache/..',
            '${PLUGIN_DATA}/cache\\..\\work',
        ]) {
            writeFixture(
                rootPath,
                'mcp.json',
                JSON.stringify({
                    $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                    mcpServers: { candidate: { type: 'stdio', command: 'node', cwd } },
                }),
            );
            const result = inspectAgentPluginPackage(rootPath);
            assert.deepStrictEqual(
                result.mcpServers.map((entry) => entry.name),
                ['candidate'],
                cwd,
            );
        }
    });

    it('rejects escaping and absolute PLUGIN_DATA cwd suffixes after normalization', () => {
        writeManifest(rootPath, { $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: 'mcp-plugin' });
        for (const cwd of [
            '${PLUGIN_DATA}/../escape',
            '${PLUGIN_DATA}/cache/../../escape',
            '${PLUGIN_DATA}/cache\\..\\..\\escape',
            '${PLUGIN_DATA}//absolute',
            '${PLUGIN_DATA}/C:/absolute',
            '${PLUGIN_DATA}/cache/../C:relative',
        ]) {
            writeFixture(
                rootPath,
                'mcp.json',
                JSON.stringify({
                    $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                    mcpServers: { candidate: { type: 'stdio', command: 'node', cwd } },
                }),
            );
            const result = inspectAgentPluginPackage(rootPath);
            assert.deepStrictEqual(result.mcpServers, [], cwd);
            assert.ok(
                result.diagnostics.some(
                    (entry) => entry.code === 'AGENT_PLUGIN_MCP_SERVER_INVALID',
                ),
                cwd,
            );
        }
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
