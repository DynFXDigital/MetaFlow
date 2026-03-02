import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export type McpConfigMode = 'workspace' | 'profile';

export interface McpValidationIssue {
    severity: 'warning' | 'error';
    message: string;
}

export interface McpValidationResult {
    configPath: string;
    issues: McpValidationIssue[];
}

export function normalizeMcpConfigMode(value: unknown): McpConfigMode {
    return value === 'profile' ? 'profile' : 'workspace';
}

export function getWorkspaceMcpConfigPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, '.vscode', 'mcp.json');
}

export async function scaffoldWorkspaceMcpConfig(workspaceRoot: string): Promise<{ configPath: string; created: boolean }> {
    const configPath = getWorkspaceMcpConfigPath(workspaceRoot);
    await fsp.mkdir(path.dirname(configPath), { recursive: true });
    const existedBefore = fs.existsSync(configPath);

    let doc: Record<string, unknown> = {};
    if (existedBefore) {
        const raw = await fsp.readFile(configPath, 'utf-8');
        doc = parseObjectJson(raw) ?? {};
    }

    const servers = ensureServersObject(doc);
    if (!('metaflow-filesystem' in servers)) {
        servers['metaflow-filesystem'] = {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        };
    }

    await fsp.writeFile(configPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
    return { configPath, created: !existedBefore };
}

export async function validateWorkspaceMcpConfig(workspaceRoot: string): Promise<McpValidationResult> {
    const configPath = getWorkspaceMcpConfigPath(workspaceRoot);
    if (!fs.existsSync(configPath)) {
        return {
            configPath,
            issues: [{ severity: 'warning', message: 'No .vscode/mcp.json found. Run "MetaFlow: Scaffold MCP Config" first.' }],
        };
    }

    const raw = await fsp.readFile(configPath, 'utf-8');
    const parsed = parseObjectJson(raw);
    if (!parsed) {
        return {
            configPath,
            issues: [{ severity: 'error', message: '.vscode/mcp.json must be a valid JSON object.' }],
        };
    }

    const issues: McpValidationIssue[] = [];
    const servers = (parsed as { servers?: unknown }).servers;
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
        issues.push({ severity: 'error', message: 'mcp.json is missing a valid "servers" object.' });
        return { configPath, issues };
    }

    const serverEntries = Object.entries(servers as Record<string, unknown>);
    if (serverEntries.length === 0) {
        issues.push({ severity: 'warning', message: 'mcp.json has no configured servers.' });
        return { configPath, issues };
    }

    for (const [serverId, config] of serverEntries) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            issues.push({ severity: 'error', message: `Server "${serverId}" must be an object.` });
            continue;
        }

        const command = (config as { command?: unknown }).command;
        if (typeof command !== 'string' || command.trim().length === 0) {
            issues.push({ severity: 'error', message: `Server "${serverId}" is missing a non-empty "command".` });
            continue;
        }

        const args = (config as { args?: unknown }).args;
        if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string'))) {
            issues.push({ severity: 'error', message: `Server "${serverId}" has invalid "args"; expected string array.` });
        }

        if (!isExecutableAvailable(command)) {
            issues.push({ severity: 'warning', message: `Server "${serverId}" command not found on PATH: ${command}` });
        }
    }

    return { configPath, issues };
}

function parseObjectJson(raw: string): Record<string, unknown> | undefined {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return undefined;
    }
}

function ensureServersObject(doc: Record<string, unknown>): Record<string, unknown> {
    const existingServers = doc.servers;
    if (existingServers && typeof existingServers === 'object' && !Array.isArray(existingServers)) {
        return existingServers as Record<string, unknown>;
    }

    const servers: Record<string, unknown> = {};
    doc.servers = servers;
    return servers;
}

function isExecutableAvailable(command: string): boolean {
    if (path.isAbsolute(command)) {
        return fs.existsSync(command);
    }

    const pathVariable = process.env.PATH ?? '';
    if (!pathVariable) {
        return false;
    }

    const directories = pathVariable.split(path.delimiter).filter(Boolean);
    const pathextRaw = process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM';
    const extensions = process.platform === 'win32'
        ? pathextRaw
            .split(';')
            .map(ext => ext.trim())
            .filter(Boolean)
        : [''];

    for (const dir of directories) {
        const directCandidate = path.join(dir, command);
        if (fs.existsSync(directCandidate)) {
            return true;
        }

        for (const ext of extensions) {
            const commandLower = command.toLowerCase();
            const extLower = ext.toLowerCase();
            const candidate = path.join(dir, commandLower.endsWith(extLower) ? command : `${command}${ext}`);
            if (fs.existsSync(candidate)) {
                return true;
            }
        }
    }

    return false;
}
