/**
 * Standalone inspection for the portable Agent Plugins 1.0 package format.
 *
 * This module validates only portable Agent Plugins components. Hosts can use
 * the loss-reporting fields when projecting legacy or host-specific packages.
 */

import * as fs from 'fs';
import { validateHeaderName, validateHeaderValue } from 'http';
import { isIP } from 'net';
import * as path from 'path';
import { parseDocument } from 'yaml';
import type { CapabilityWarning } from './types';

export const AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID =
    'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const AGENT_PLUGINS_V1_MCP_SCHEMA_ID =
    'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
export const CANONICAL_AGENT_PLUGIN_SCHEMA_ID = AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID;
export const CANONICAL_AGENT_PLUGIN_MCP_SCHEMA_ID = AGENT_PLUGINS_V1_MCP_SCHEMA_ID;

export type AgentPluginCompatibilityProfile =
    'agent-plugins-v1' | 'unsupported' | 'legacy-host' | 'invalid';

export interface AgentPluginManifestInventory {
    readonly name: string;
    readonly version?: string;
    readonly description?: string;
    readonly author?: Readonly<Partial<Record<'name' | 'email' | 'url', string>>>;
    readonly homepage?: string;
    readonly repository?: string;
    readonly license?: string;
    readonly keywords?: readonly string[];
}

export interface AgentSkillMetadataInventory {
    readonly name: string;
    readonly description: string;
    readonly license?: string;
    readonly compatibility?: string;
    readonly metadata?: Readonly<Record<string, string>>;
    readonly allowedTools?: string;
}

export interface AgentPluginSkillInventory extends AgentSkillMetadataInventory {
    readonly skillPath: string;
}

export type AgentSkillContentValidation =
    | {
          readonly valid: true;
          readonly metadata: AgentSkillMetadataInventory;
      }
    | {
          readonly valid: false;
          readonly reason: 'frontmatter' | 'metadata';
      };

export interface AgentPluginMcpServerInventory {
    readonly name: string;
    readonly type: 'stdio' | 'streamable-http' | 'sse';
    readonly command?: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
    readonly url?: string;
    readonly headers?: Readonly<Record<string, string>>;
}

export interface AgentPluginCompatibilityInspection {
    readonly pluginRoot: string;
    readonly profile: AgentPluginCompatibilityProfile;
    readonly validManifest: boolean;
    readonly manifest?: AgentPluginManifestInventory;
    /** Valid Agent Skills discovered from immediate children of skills/. */
    readonly validSkills: readonly AgentPluginSkillInventory[];
    /** Valid MCP server entries from the root mcp.json document. */
    readonly validMcpServers: readonly AgentPluginMcpServerInventory[];
    /** Alias retained for callers that use component-type names directly. */
    readonly skills: readonly AgentPluginSkillInventory[];
    /** Alias retained for callers that use component-type names directly. */
    readonly mcpServers: readonly AgentPluginMcpServerInventory[];
    readonly recognizedHostFields: readonly string[];
    readonly diagnostics: readonly CapabilityWarning[];
}

const PLUGIN_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME_PATTERN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const AGENT_PLUGIN_SCHEMA_PATTERN =
    /^https:\/\/agent-plugins\.org\/schemas\/[^/]+\/plugin\.schema\.json$/;
const MANIFEST_FIELDS = new Set([
    '$schema',
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
    'extensions',
]);
const SKILL_FRONTMATTER_FIELDS = new Set([
    'name',
    'description',
    'license',
    'compatibility',
    'metadata',
    'allowed-tools',
]);
const LEGACY_HOST_FIELDS = new Set([
    'agents',
    'capabilities',
    'chatParticipants',
    'commands',
    'components',
    'contributes',
    'hooks',
    'instructions',
    'metaflow',
    'mcpServers',
    'minimumMetaflowVersion',
    'pluginHosts',
    'prompts',
    'skills',
]);

/** Return whether a name satisfies the Agent Skills directory/name contract. */
export function isValidAgentSkillName(value: string): boolean {
    return value.length >= 1 && value.length <= 64 && SKILL_NAME_PATTERN.test(value);
}

function diagnostic(
    code: string,
    message: string,
    filePath?: string,
    severity: 'error' | 'warning' | 'info' = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringMap(value: unknown): value is Record<string, string> {
    return isObject(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function compareCodeUnits(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isInside(rootPath: string, targetPath: string): boolean {
    const relative = path.relative(rootPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realPath(pathToResolve: string): string {
    return fs.realpathSync.native(pathToResolve);
}

function hasFileSystemEntry(pathToInspect: string): boolean {
    try {
        fs.lstatSync(pathToInspect);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        return true;
    }
}

/** Resolves existing ancestors so symlink/junction traversal cannot evade containment. */
function resolveForContainment(pathToResolve: string): string {
    const absolute = path.resolve(pathToResolve);
    const missing: string[] = [];
    let candidate = absolute;

    while (true) {
        try {
            const resolved = realPath(candidate);
            return path.resolve(resolved, ...missing.reverse());
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
            const parent = path.dirname(candidate);
            if (parent === candidate) {
                throw error;
            }
            missing.push(path.basename(candidate));
            candidate = parent;
        }
    }
}

function readJsonObject(
    filePath: string,
    diagnostics: CapabilityWarning[],
    prefix: string,
): Record<string, unknown> | undefined {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        if (!isObject(parsed)) {
            diagnostics.push(
                diagnostic(
                    `${prefix}_OBJECT_REQUIRED`,
                    'The JSON document must contain an object.',
                    filePath,
                    'error',
                ),
            );
            return undefined;
        }
        return parsed;
    } catch (error) {
        diagnostics.push(
            diagnostic(
                `${prefix}_JSON_INVALID`,
                `The JSON document could not be read: ${(error as Error).message}`,
                filePath,
                'error',
            ),
        );
        return undefined;
    }
}

function parseProfile(manifest: Record<string, unknown>): AgentPluginCompatibilityProfile {
    const schema = manifest.$schema;
    if (schema === AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID) {
        return 'agent-plugins-v1';
    }
    if (typeof schema === 'string' && AGENT_PLUGIN_SCHEMA_PATTERN.test(schema)) {
        return 'unsupported';
    }
    return 'legacy-host';
}

function validateManifest(
    manifest: Record<string, unknown>,
    manifestPath: string,
    diagnostics: CapabilityWarning[],
): AgentPluginManifestInventory | undefined {
    for (const field of Object.keys(manifest).sort(compareCodeUnits)) {
        if (!MANIFEST_FIELDS.has(field)) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_MANIFEST_UNKNOWN_FIELD',
                    `plugin.json field "${field}" is not part of Agent Plugins 1.0 and was ignored.`,
                    manifestPath,
                ),
            );
        }
    }

    const schema = manifest.$schema;
    const name = manifest.name;
    if (schema !== AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MANIFEST_SCHEMA_INVALID',
                'plugin.json requires the canonical Agent Plugins 1.0 schema identifier.',
                manifestPath,
                'error',
            ),
        );
    }
    if (
        typeof name !== 'string' ||
        name.length < 1 ||
        name.length > 64 ||
        !PLUGIN_NAME_PATTERN.test(name)
    ) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MANIFEST_NAME_INVALID',
                'plugin.json "name" must be 1-64 lowercase ASCII letters, digits, periods, or hyphens without consecutive `--` or `..`.',
                manifestPath,
                'error',
            ),
        );
    }

    for (const field of ['version', 'description', 'homepage', 'repository', 'license'] as const) {
        if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_MANIFEST_METADATA_INVALID',
                    `plugin.json "${field}" must be a string when present.`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }
    if (manifest.keywords !== undefined && !isStringArray(manifest.keywords)) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MANIFEST_KEYWORDS_INVALID',
                'plugin.json "keywords" must be an array of strings when present.',
                manifestPath,
                'error',
            ),
        );
    }

    let author: Readonly<Partial<Record<'name' | 'email' | 'url', string>>> | undefined;
    if (manifest.author !== undefined) {
        if (
            !isObject(manifest.author) ||
            Object.keys(manifest.author).some((key) => !['name', 'email', 'url'].includes(key)) ||
            !isStringMap(manifest.author)
        ) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_MANIFEST_AUTHOR_INVALID',
                    'plugin.json "author" must be an object containing only optional name, email, and url strings.',
                    manifestPath,
                    'error',
                ),
            );
        } else {
            author = manifest.author as Partial<Record<'name' | 'email' | 'url', string>>;
        }
    }

    if (manifest.extensions !== undefined && !isObject(manifest.extensions)) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MANIFEST_EXTENSIONS_IGNORED',
                'plugin.json "extensions" is not an object and was ignored.',
                manifestPath,
            ),
        );
    }

    if (diagnostics.some((entry) => entry.severity === 'error')) {
        return undefined;
    }

    return {
        name: name as string,
        ...(typeof manifest.version === 'string' ? { version: manifest.version } : {}),
        ...(typeof manifest.description === 'string' ? { description: manifest.description } : {}),
        ...(author ? { author } : {}),
        ...(typeof manifest.homepage === 'string' ? { homepage: manifest.homepage } : {}),
        ...(typeof manifest.repository === 'string' ? { repository: manifest.repository } : {}),
        ...(typeof manifest.license === 'string' ? { license: manifest.license } : {}),
        ...(isStringArray(manifest.keywords) ? { keywords: manifest.keywords } : {}),
    };
}

function skillFrontmatter(content: string): unknown {
    const normalized = content.replace(/^\uFEFF/, '');
    const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) {
        return undefined;
    }
    const document = parseDocument(match[1]);
    if (document.errors.length > 0) {
        return undefined;
    }
    return document.toJS();
}

/** Validate Agent Skills frontmatter without reading from or writing to the filesystem. */
export function validateAgentSkillContent(
    skillDirectoryName: string,
    content: string,
): AgentSkillContentValidation {
    const frontmatter = skillFrontmatter(content);
    if (!isObject(frontmatter)) {
        return { valid: false, reason: 'frontmatter' };
    }
    const name = frontmatter.name;
    const description = frontmatter.description;
    const license = frontmatter.license;
    const compatibility = frontmatter.compatibility;
    const metadata = frontmatter.metadata;
    const allowedTools = frontmatter['allowed-tools'];
    const valid =
        Object.keys(frontmatter).every((field) => SKILL_FRONTMATTER_FIELDS.has(field)) &&
        typeof name === 'string' &&
        isValidAgentSkillName(name) &&
        name === skillDirectoryName &&
        typeof description === 'string' &&
        description.length >= 1 &&
        description.length <= 1024 &&
        (license === undefined || typeof license === 'string') &&
        (compatibility === undefined ||
            (typeof compatibility === 'string' &&
                compatibility.length >= 1 &&
                compatibility.length <= 500)) &&
        (metadata === undefined || isStringMap(metadata)) &&
        (allowedTools === undefined || typeof allowedTools === 'string');
    if (!valid) {
        return { valid: false, reason: 'metadata' };
    }
    return {
        valid: true,
        metadata: {
            name,
            description,
            ...(typeof license === 'string' ? { license } : {}),
            ...(typeof compatibility === 'string' ? { compatibility } : {}),
            ...(isStringMap(metadata) ? { metadata } : {}),
            ...(typeof allowedTools === 'string' ? { allowedTools } : {}),
        },
    };
}

function inspectSkills(
    rootPath: string,
    diagnostics: CapabilityWarning[],
): AgentPluginSkillInventory[] {
    const skillsPath = path.join(rootPath, 'skills');
    if (!hasFileSystemEntry(skillsPath)) {
        return [];
    }
    let realSkillsPath: string;
    try {
        realSkillsPath = realPath(skillsPath);
        if (!isInside(rootPath, realSkillsPath) || !fs.statSync(realSkillsPath).isDirectory()) {
            throw new Error('skills/ is not a contained directory');
        }
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_SKILLS_LOCATION_INVALID',
                `skills/ is unavailable: ${(error as Error).message}`,
                skillsPath,
            ),
        );
        return [];
    }

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(realSkillsPath, { withFileTypes: true });
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_SKILLS_READ_FAILED',
                `skills/ could not be read: ${(error as Error).message}`,
                skillsPath,
            ),
        );
        return [];
    }

    const skills: AgentPluginSkillInventory[] = [];
    for (const entry of entries.sort((left, right) => compareCodeUnits(left.name, right.name))) {
        const candidatePath = path.join(realSkillsPath, entry.name);
        let stat: fs.Stats;
        try {
            stat = fs.statSync(candidatePath);
        } catch {
            continue;
        }
        if (!stat.isDirectory()) {
            continue;
        }
        let hasExactSkillFile = false;
        try {
            hasExactSkillFile = fs
                .readdirSync(candidatePath, { withFileTypes: true })
                .some((child) => child.name === 'SKILL.md');
        } catch {
            continue;
        }
        if (!hasExactSkillFile) {
            continue;
        }
        const skillPath = path.join(candidatePath, 'SKILL.md');
        if (!hasFileSystemEntry(skillPath)) {
            continue;
        }
        let realSkillPath: string;
        try {
            realSkillPath = realPath(skillPath);
            if (!isInside(rootPath, realSkillPath) || !fs.statSync(realSkillPath).isFile()) {
                throw new Error('SKILL.md is not a contained regular file');
            }
        } catch (error) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_SKILL_PATH_INVALID',
                    `Skill "${entry.name}" was skipped: ${(error as Error).message}`,
                    skillPath,
                ),
            );
            continue;
        }

        let validation: AgentSkillContentValidation;
        try {
            validation = validateAgentSkillContent(
                entry.name,
                fs.readFileSync(realSkillPath, 'utf8'),
            );
        } catch (error) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_SKILL_READ_FAILED',
                    `Skill "${entry.name}" was skipped: ${(error as Error).message}`,
                    realSkillPath,
                ),
            );
            continue;
        }
        if (!validation.valid && validation.reason === 'frontmatter') {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_SKILL_FRONTMATTER_INVALID',
                    `Skill "${entry.name}" requires valid YAML frontmatter.`,
                    realSkillPath,
                ),
            );
            continue;
        }
        if (!validation.valid) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_SKILL_INVALID',
                    `Skill "${entry.name}" does not satisfy Agent Skills metadata requirements.`,
                    realSkillPath,
                ),
            );
            continue;
        }
        skills.push({
            skillPath: realSkillPath,
            ...validation.metadata,
        });
    }
    return skills.sort((left, right) => compareCodeUnits(left.name, right.name));
}

function validRemoteUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (
            (url.protocol !== 'http:' && url.protocol !== 'https:') ||
            url.username ||
            url.password ||
            url.hash
        ) {
            return false;
        }
        const rawHost = url.hostname.toLowerCase();
        const host =
            rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
        const loopback =
            host === 'localhost' ||
            host === '::1' ||
            (isIP(host) === 4 && host.split('.')[0] === '127');
        return loopback || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function validateCwd(rootPath: string, value: string): boolean {
    let candidate: string | undefined;
    if (value.startsWith('./')) {
        candidate = path.resolve(rootPath, value.slice(2));
    } else if (value === '${PLUGIN_ROOT}' || value.startsWith('${PLUGIN_ROOT}/')) {
        candidate = path.resolve(rootPath, value.slice('${PLUGIN_ROOT}'.length).replace(/^\//, ''));
    } else if (value === '${PLUGIN_DATA}' || value.startsWith('${PLUGIN_DATA}/')) {
        const suffix = value.slice('${PLUGIN_DATA}'.length).replace(/^\//, '');
        const portableSuffix = suffix.replace(/\\/g, '/');
        return (
            !portableSuffix.split('/').some((segment) => segment === '..') &&
            !path.posix.isAbsolute(portableSuffix) &&
            !path.win32.isAbsolute(suffix) &&
            !/^[A-Za-z]:/.test(suffix)
        );
    } else {
        return false;
    }
    try {
        return isInside(rootPath, resolveForContainment(candidate));
    } catch {
        return false;
    }
}

function isValidHeaderMap(value: unknown): value is Record<string, string> {
    if (!isStringMap(value)) {
        return false;
    }
    const names = new Set<string>();
    for (const [name, headerValue] of Object.entries(value)) {
        const normalizedName = name.toLowerCase();
        if (names.has(normalizedName)) {
            return false;
        }
        names.add(normalizedName);
        try {
            validateHeaderName(name);
            validateHeaderValue(name, headerValue);
        } catch {
            return false;
        }
    }
    return true;
}

function validateStdioCommand(rootPath: string, command: string): boolean {
    if (!command) {
        return false;
    }
    if (command.startsWith('./')) {
        try {
            return isInside(
                rootPath,
                resolveForContainment(path.resolve(rootPath, command.slice(2))),
            );
        } catch {
            return false;
        }
    }
    return (
        !/\s/.test(command) &&
        !command.includes('/') &&
        !command.includes('\\') &&
        !path.isAbsolute(command) &&
        path.win32.parse(command).root === ''
    );
}

function inspectMcp(
    rootPath: string,
    diagnostics: CapabilityWarning[],
): AgentPluginMcpServerInventory[] {
    const mcpPath = path.join(rootPath, 'mcp.json');
    if (!hasFileSystemEntry(mcpPath)) {
        return [];
    }
    let realMcpPath: string;
    try {
        realMcpPath = realPath(mcpPath);
        if (!isInside(rootPath, realMcpPath) || !fs.statSync(realMcpPath).isFile()) {
            throw new Error('mcp.json is not a contained regular file');
        }
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MCP_LOCATION_INVALID',
                `mcp.json is unavailable: ${(error as Error).message}`,
                mcpPath,
            ),
        );
        return [];
    }
    const mcp = readJsonObject(realMcpPath, diagnostics, 'AGENT_PLUGIN_MCP');
    if (!mcp) {
        return [];
    }
    const unknownFields = Object.keys(mcp).filter(
        (field) => field !== '$schema' && field !== 'mcpServers',
    );
    if (
        unknownFields.length > 0 ||
        mcp.$schema !== AGENT_PLUGINS_V1_MCP_SCHEMA_ID ||
        !isObject(mcp.mcpServers)
    ) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MCP_DOCUMENT_INVALID',
                'mcp.json requires only the canonical MCP schema identifier and an mcpServers object.',
                realMcpPath,
                'error',
            ),
        );
        return [];
    }

    const servers: AgentPluginMcpServerInventory[] = [];
    for (const name of Object.keys(mcp.mcpServers).sort(compareCodeUnits)) {
        const config = mcp.mcpServers[name];
        if (!isObject(config) || typeof config.type !== 'string') {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_MCP_SERVER_INVALID',
                    `MCP server "${name}" was skipped because its configuration is invalid.`,
                    realMcpPath,
                ),
            );
            continue;
        }
        const type = config.type;
        const allowed =
            type === 'stdio'
                ? new Set(['type', 'command', 'args', 'env', 'cwd'])
                : type === 'streamable-http' || type === 'sse'
                  ? new Set(['type', 'url', 'headers'])
                  : undefined;
        let valid = Boolean(allowed) && Object.keys(config).every((field) => allowed!.has(field));
        if (type === 'stdio') {
            valid =
                valid &&
                typeof config.command === 'string' &&
                validateStdioCommand(rootPath, config.command);
            valid = valid && (config.args === undefined || isStringArray(config.args));
            valid =
                valid &&
                (config.env === undefined ||
                    (isStringMap(config.env) &&
                        !Object.keys(config.env).some(
                            (key) => key === 'PLUGIN_ROOT' || key === 'PLUGIN_DATA',
                        )));
            valid =
                valid &&
                (config.cwd === undefined ||
                    (typeof config.cwd === 'string' && validateCwd(rootPath, config.cwd)));
        } else if (type === 'streamable-http' || type === 'sse') {
            valid = valid && typeof config.url === 'string' && validRemoteUrl(config.url);
            valid = valid && (config.headers === undefined || isValidHeaderMap(config.headers));
        }
        if (!valid) {
            diagnostics.push(
                diagnostic(
                    'AGENT_PLUGIN_MCP_SERVER_INVALID',
                    `MCP server "${name}" was skipped because its configuration is invalid.`,
                    realMcpPath,
                ),
            );
            continue;
        }
        if (type === 'stdio') {
            servers.push({
                name,
                type,
                command: config.command as string,
                ...(isStringArray(config.args) ? { args: config.args } : {}),
                ...(isStringMap(config.env) ? { env: config.env } : {}),
                ...(typeof config.cwd === 'string' ? { cwd: config.cwd } : {}),
            });
        } else if (type === 'streamable-http' || type === 'sse') {
            servers.push({
                name,
                type,
                url: config.url as string,
                ...(isValidHeaderMap(config.headers) ? { headers: config.headers } : {}),
            });
        }
    }
    return servers.sort((left, right) => compareCodeUnits(left.name, right.name));
}

function sortedDiagnostics(diagnostics: CapabilityWarning[]): CapabilityWarning[] {
    return diagnostics.sort(
        (left, right) =>
            compareCodeUnits(left.code, right.code) ||
            compareCodeUnits(left.filePath ?? '', right.filePath ?? '') ||
            compareCodeUnits(left.message, right.message),
    );
}

/**
 * Reads a plugin package without mutating it and returns portable inventories
 * plus deterministic diagnostics suitable for host compatibility reporting.
 */
export function inspectAgentPluginPackage(pluginRoot: string): AgentPluginCompatibilityInspection {
    const diagnostics: CapabilityWarning[] = [];
    const requestedRoot = path.resolve(pluginRoot);
    let rootPath: string;
    try {
        rootPath = realPath(requestedRoot);
        if (!fs.statSync(rootPath).isDirectory()) {
            throw new Error('plugin root is not a directory');
        }
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_ROOT_INVALID',
                `Plugin root is unavailable: ${(error as Error).message}`,
                requestedRoot,
                'error',
            ),
        );
        return {
            pluginRoot: requestedRoot,
            profile: 'invalid',
            validManifest: false,
            validSkills: [],
            validMcpServers: [],
            skills: [],
            mcpServers: [],
            recognizedHostFields: [],
            diagnostics: sortedDiagnostics(diagnostics),
        };
    }

    const manifestPath = path.join(rootPath, 'plugin.json');
    let manifest: Record<string, unknown> | undefined;
    try {
        if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
            throw new Error('plugin.json is missing or is not a regular file');
        }
        const realManifestPath = realPath(manifestPath);
        if (!isInside(rootPath, realManifestPath)) {
            throw new Error('plugin.json resolves outside the plugin root');
        }
        manifest = readJsonObject(realManifestPath, diagnostics, 'AGENT_PLUGIN_MANIFEST');
    } catch (error) {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_MANIFEST_PATH_INVALID',
                `plugin.json is unavailable: ${(error as Error).message}`,
                manifestPath,
                'error',
            ),
        );
    }

    if (!manifest) {
        return {
            pluginRoot: rootPath,
            profile: 'invalid',
            validManifest: false,
            validSkills: [],
            validMcpServers: [],
            skills: [],
            mcpServers: [],
            recognizedHostFields: [],
            diagnostics: sortedDiagnostics(diagnostics),
        };
    }

    const profile = parseProfile(manifest);
    const recognizedHostFields = manifest
        ? Object.keys(manifest)
              .filter((field) => LEGACY_HOST_FIELDS.has(field))
              .sort(compareCodeUnits)
        : [];
    if (profile === 'unsupported') {
        diagnostics.push(
            diagnostic(
                'AGENT_PLUGIN_SCHEMA_UNSUPPORTED',
                'plugin.json targets an unsupported Agent Plugins schema version.',
                manifestPath,
                'error',
            ),
        );
    }
    if (profile !== 'agent-plugins-v1' || !manifest) {
        return {
            pluginRoot: rootPath,
            profile,
            validManifest: false,
            validSkills: [],
            validMcpServers: [],
            skills: [],
            mcpServers: [],
            recognizedHostFields,
            diagnostics: sortedDiagnostics(diagnostics),
        };
    }

    const validManifest = validateManifest(manifest, manifestPath, diagnostics);
    if (!validManifest) {
        return {
            pluginRoot: rootPath,
            profile,
            validManifest: false,
            validSkills: [],
            validMcpServers: [],
            skills: [],
            mcpServers: [],
            recognizedHostFields,
            diagnostics: sortedDiagnostics(diagnostics),
        };
    }

    const skills = inspectSkills(rootPath, diagnostics);
    const mcpServers = inspectMcp(rootPath, diagnostics);
    return {
        pluginRoot: rootPath,
        profile,
        validManifest: true,
        manifest: validManifest,
        validSkills: skills,
        validMcpServers: mcpServers,
        skills,
        mcpServers,
        recognizedHostFields,
        diagnostics: sortedDiagnostics(diagnostics),
    };
}
