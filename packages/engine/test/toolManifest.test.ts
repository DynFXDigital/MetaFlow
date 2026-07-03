import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadToolsForLayer, parseToolContent } from '../src/index';

describe('toolManifest parser', () => {
    it('parses canonical command and MCP tool metadata', () => {
        const commandTool = parseToolContent(
            JSON.stringify({
                schemaVersion: 'metaflow.tool/v1',
                id: 'run-tests',
                kind: 'command',
                command: 'npm',
                args: ['test'],
                policyGrants: ['shell-test'],
                targets: ['codex'],
                executionProfiles: ['local'],
                inputSchema: { type: 'object' },
                description: 'Run focused tests.',
            }),
            '/tmp/.metaflow/tools/run-tests.json',
            new Set(['shell-test']),
        );

        assert.strictEqual(commandTool.id, 'run-tests');
        assert.strictEqual(commandTool.kind, 'command');
        assert.strictEqual(commandTool.command, 'npm');
        assert.deepStrictEqual(commandTool.args, ['test']);
        assert.deepStrictEqual(commandTool.policyGrants, ['shell-test']);
        assert.deepStrictEqual(commandTool.targets, ['codex']);
        assert.deepStrictEqual(commandTool.executionProfiles, ['local']);
        assert.deepStrictEqual(commandTool.inputSchema, { type: 'object' });
        assert.strictEqual(commandTool.description, 'Run focused tests.');
        assert.deepStrictEqual(commandTool.warnings, []);

        const mcpTool = parseToolContent(
            JSON.stringify({
                schemaVersion: 'metaflow.tool/v1',
                id: 'github-create-pr',
                kind: 'mcp',
                mcpServer: 'github',
                mcpTool: 'create_pull_request',
                policyGrants: ['github-pr-write'],
                targets: ['codex', 'github-copilot'],
            }),
            '/tmp/.metaflow/tools/github-create-pr.json',
            new Set(['github-pr-write']),
        );

        assert.strictEqual(mcpTool.kind, 'mcp');
        assert.strictEqual(mcpTool.mcpServer, 'github');
        assert.strictEqual(mcpTool.mcpTool, 'create_pull_request');
        assert.deepStrictEqual(mcpTool.targets, ['codex', 'github-copilot']);
        assert.deepStrictEqual(mcpTool.warnings, []);
    });

    it('warns on invalid canonical tool metadata shapes', () => {
        const parsed = parseToolContent(
            JSON.stringify({
                schemaVersion: 'wrong',
                id: 'Bad ID',
                kind: 'mcp',
                command: '',
                args: 'test',
                mcpServer: '',
                mcpTool: '',
                endpoint: '',
                policyGrants: ['missing-grant'],
                targets: [7],
                executionProfiles: 'local',
                inputSchema: [],
                description: '',
                extra: true,
            }),
            '/tmp/.metaflow/tools/bad.json',
            new Set(['known-grant']),
        );

        const codes = parsed.warnings.map((warning) => warning.code);
        assert.ok(codes.includes('TOOL_SCHEMA_VERSION_INVALID'));
        assert.ok(codes.includes('TOOL_ID_INVALID'));
        assert.ok(codes.includes('TOOL_COMMAND_INVALID'));
        assert.ok(codes.includes('TOOL_ARGS_INVALID'));
        assert.ok(codes.includes('TOOL_MCP_SERVER_INVALID'));
        assert.ok(codes.includes('TOOL_MCP_TOOL_INVALID'));
        assert.ok(codes.includes('TOOL_ENDPOINT_INVALID'));
        assert.ok(codes.includes('TOOL_POLICY_GRANT_UNKNOWN'));
        assert.ok(codes.includes('TOOL_TARGETS_INVALID'));
        assert.ok(codes.includes('TOOL_EXECUTION_PROFILES_INVALID'));
        assert.ok(codes.includes('TOOL_INPUT_SCHEMA_INVALID'));
        assert.ok(codes.includes('TOOL_DESCRIPTION_INVALID'));
        assert.ok(codes.includes('TOOL_MCP_REQUIRED'));
        assert.ok(codes.includes('TOOL_UNKNOWN_FIELD'));
    });

    it('loads tool manifests from a capability layer', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-manifest-test-'));
        try {
            const toolsDir = path.join(tmpDir, '.metaflow', 'tools');
            fs.mkdirSync(toolsDir, { recursive: true });
            fs.writeFileSync(
                path.join(toolsDir, 'run-tests.json'),
                JSON.stringify({
                    schemaVersion: 'metaflow.tool/v1',
                    id: 'run-tests',
                    kind: 'command',
                    command: 'npm',
                    args: ['test'],
                }),
                'utf-8',
            );

            const tools = loadToolsForLayer(tmpDir);
            assert.strictEqual(tools.length, 1);
            assert.strictEqual(tools[0].id, 'run-tests');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
