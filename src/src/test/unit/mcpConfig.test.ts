import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    getWorkspaceMcpConfigPath,
    normalizeMcpConfigMode,
    scaffoldWorkspaceMcpConfig,
    validateWorkspaceMcpConfig,
} from '../../commands/mcpConfig';

suite('mcpConfig', () => {
    test('normalizes MCP config mode', () => {
        assert.strictEqual(normalizeMcpConfigMode('workspace'), 'workspace');
        assert.strictEqual(normalizeMcpConfigMode('profile'), 'profile');
        assert.strictEqual(normalizeMcpConfigMode('other'), 'workspace');
    });

    test('scaffoldWorkspaceMcpConfig creates default server entry', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mcp-create-'));

        const result = await scaffoldWorkspaceMcpConfig(workspaceRoot);
        assert.strictEqual(result.created, true);
        assert.strictEqual(result.configPath, getWorkspaceMcpConfigPath(workspaceRoot));

        const written = JSON.parse(fs.readFileSync(result.configPath, 'utf-8')) as {
            servers?: Record<string, unknown>;
        };
        assert.ok(written.servers);
        assert.ok(written.servers && 'metaflow-filesystem' in written.servers);

        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    test('scaffoldWorkspaceMcpConfig preserves existing servers', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mcp-update-'));
        const configPath = getWorkspaceMcpConfigPath(workspaceRoot);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                servers: {
                    existing: {
                        command: 'node',
                        args: ['server.js'],
                    },
                },
            }, null, 2),
            'utf-8'
        );

        const result = await scaffoldWorkspaceMcpConfig(workspaceRoot);
        assert.strictEqual(result.created, false);

        const written = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
            servers?: Record<string, unknown>;
        };
        assert.ok(written.servers && 'existing' in written.servers);
        assert.ok(written.servers && 'metaflow-filesystem' in written.servers);

        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    test('validateWorkspaceMcpConfig reports parse and schema issues', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mcp-validate-'));
        const configPath = getWorkspaceMcpConfigPath(workspaceRoot);
        fs.mkdirSync(path.dirname(configPath), { recursive: true });

        fs.writeFileSync(configPath, '{ invalid', 'utf-8');
        const parseResult = await validateWorkspaceMcpConfig(workspaceRoot);
        assert.ok(parseResult.issues.some(issue => issue.severity === 'error'));

        fs.writeFileSync(configPath, JSON.stringify({ servers: { bad: {} } }, null, 2), 'utf-8');
        const schemaResult = await validateWorkspaceMcpConfig(workspaceRoot);
        assert.ok(schemaResult.issues.some(issue => issue.message.includes('missing a non-empty "command"')));

        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });
});
