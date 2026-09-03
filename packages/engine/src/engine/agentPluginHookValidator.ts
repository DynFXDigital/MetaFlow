/**
 * Delivery-aware validation for hook files that MetaFlow exposes through
 * `chat.pluginLocations`.
 *
 * The validator reports actionable warnings only. It never rewrites authored
 * hook commands because plugin-root expansion and shell environment syntax are
 * owned by the selected plugin format and host.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID } from './agentPluginCompatibility';
import { resolvePluginRootPath } from './settingsInjector';
import { CapabilityWarning, EffectiveFile } from './types';

type PluginFormat = 'agent-plugins-v1' | 'openplugin' | 'copilot' | 'claude';

interface PluginManifestSelection {
    format: PluginFormat;
    manifestPath: string;
    relativePath: string;
    manifest: Record<string, unknown>;
}

interface PluginRootGroup {
    rootPath: string;
    files: EffectiveFile[];
}

interface HookConfigFile {
    filePath: string;
    relativePath: string;
    config: Record<string, unknown>;
}

interface HookCommand {
    command: string;
    field: string;
    cwd?: string;
}

const MANIFEST_PRECEDENCE: ReadonlyArray<{
    relativePath: string;
    format: PluginFormat;
}> = [
    { relativePath: '.plugin/plugin.json', format: 'openplugin' },
    { relativePath: 'plugin.json', format: 'copilot' },
    { relativePath: '.github/plugin/plugin.json', format: 'copilot' },
    { relativePath: '.claude-plugin/plugin.json', format: 'claude' },
];

const DEFAULT_HOOK_CONFIG_PATH: Record<PluginFormat, string> = {
    'agent-plugins-v1': 'com.github.copilot/hooks/hooks.json',
    openplugin: 'hooks/hooks.json',
    copilot: 'hooks.json',
    claude: 'hooks/hooks.json',
};

const FORMAT_ROOT_VARIABLES: Record<PluginFormat, readonly string[]> = {
    'agent-plugins-v1': ['PLUGIN_ROOT'],
    openplugin: ['PLUGIN_ROOT'],
    copilot: ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT'],
    claude: ['CLAUDE_PLUGIN_ROOT'],
};

const ROOT_VARIABLE_NAMES = ['PLUGIN_ROOT', 'CLAUDE_PLUGIN_ROOT', 'COPILOT_PLUGIN_ROOT'] as const;

const COMMAND_FIELDS = ['command', 'bash', 'powershell', 'windows', 'linux', 'osx'] as const;
const SCRIPT_EXTENSION_PATTERN = /\.(?:bat|cmd|cjs|exe|js|mjs|ps1|py|sh)$/i;
const SHELL_CONTROL_TOKENS = new Set(['&&', '||', ';', '|', '&']);
const SCRIPT_INTERPRETERS = new Set([
    'bash',
    'bun',
    'cmd',
    'deno',
    'node',
    'perl',
    'powershell',
    'pwsh',
    'py',
    'python',
    'python3',
    'ruby',
    'sh',
]);

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function isPathInside(rootPath: string, targetPath: string): boolean {
    const relative = path.relative(rootPath, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJsonObject(filePath: string): Record<string, unknown> | undefined {
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Existing manifest/config parsing owns syntax diagnostics. This
        // validator only evaluates paths when structured data is available.
    }
    return undefined;
}

function sourceRelativePath(rootPath: string, filePath: string): string {
    return normalizeRelativePath(path.relative(rootPath, filePath));
}

function selectedPluginRoot(selection: PluginManifestSelection): string {
    let rootPath = selection.manifestPath;
    for (const _segment of selection.relativePath.split('/')) {
        rootPath = path.dirname(rootPath);
    }
    return rootPath;
}

function groupPluginFiles(effectiveFiles: EffectiveFile[]): PluginRootGroup[] {
    const registeredRoots = new Set<string>();

    for (const file of effectiveFiles) {
        if (file.classification !== 'plugin') {
            continue;
        }
        const rootPath = resolvePluginRootPath(file);
        if (!rootPath) {
            continue;
        }
        registeredRoots.add(path.resolve(rootPath));
    }

    const groups = new Map<string, EffectiveFile[]>(
        Array.from(registeredRoots, (rootPath) => [rootPath, []]),
    );
    for (const file of effectiveFiles) {
        const rootPath = resolvePluginRootPath(file);
        if (!rootPath) {
            continue;
        }
        const normalizedRoot = path.resolve(rootPath);
        if (!registeredRoots.has(normalizedRoot)) {
            continue;
        }
        groups.get(normalizedRoot)!.push(file);
    }

    return Array.from(groups, ([rootPath, files]) => ({ rootPath, files })).sort((left, right) =>
        left.rootPath.localeCompare(right.rootPath),
    );
}

function selectPluginManifest(rootPath: string): PluginManifestSelection | undefined {
    for (const candidate of MANIFEST_PRECEDENCE) {
        const manifestPath = path.join(rootPath, ...candidate.relativePath.split('/'));
        if (!fs.existsSync(manifestPath)) {
            continue;
        }
        const manifest = readJsonObject(manifestPath) ?? {};
        const format =
            candidate.relativePath === 'plugin.json' &&
            manifest.$schema === AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID
                ? 'agent-plugins-v1'
                : candidate.format;
        return {
            format,
            manifestPath,
            relativePath: candidate.relativePath,
            manifest,
        };
    }
    return undefined;
}

function isHookConfig(value: Record<string, unknown>): boolean {
    return Boolean(value.hooks && typeof value.hooks === 'object');
}

function getPluginHookConfigFiles(group: PluginRootGroup): HookConfigFile[] {
    const configs: HookConfigFile[] = [];

    for (const file of group.files) {
        if (path.extname(file.sourcePath).toLowerCase() !== '.json') {
            continue;
        }
        const config = readJsonObject(file.sourcePath);
        if (!config || !isHookConfig(config)) {
            continue;
        }
        configs.push({
            filePath: file.sourcePath,
            relativePath: sourceRelativePath(group.rootPath, file.sourcePath),
            config,
        });
    }

    return configs.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function hookConfigContract(selection: PluginManifestSelection): {
    inlineHooks?: unknown;
    discoverablePaths: string[];
    explicitPath?: string;
} {
    const defaultPath = DEFAULT_HOOK_CONFIG_PATH[selection.format];
    if (selection.format === 'agent-plugins-v1') {
        return { discoverablePaths: [defaultPath] };
    }

    const compatibilityPaths =
        selection.format === 'openplugin' && hasLegacyCopilotRootManifest(selection)
            ? ['hooks.json']
            : [];
    const hooks = selection.manifest.hooks;
    if (typeof hooks === 'string') {
        const explicitPath = normalizeRelativePath(hooks.trim());
        return {
            discoverablePaths: Array.from(
                new Set([defaultPath, ...compatibilityPaths, explicitPath]),
            ).filter(Boolean),
            explicitPath,
        };
    }
    if (hooks && typeof hooks === 'object') {
        return {
            inlineHooks: hooks,
            discoverablePaths: [defaultPath, ...compatibilityPaths],
        };
    }
    return { discoverablePaths: [defaultPath, ...compatibilityPaths] };
}

function hasLegacyCopilotRootManifest(selection: PluginManifestSelection): boolean {
    const manifestPath = path.join(selectedPluginRoot(selection), 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
        return false;
    }
    const manifest = readJsonObject(manifestPath);
    return Boolean(manifest && manifest.$schema !== AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID);
}

function addHookConfigFile(configs: HookConfigFile[], rootPath: string, filePath: string): void {
    const resolvedFilePath = path.resolve(filePath);
    if (configs.some((config) => path.resolve(config.filePath) === resolvedFilePath)) {
        return;
    }
    const config = readJsonObject(resolvedFilePath);
    if (!config || !isHookConfig(config)) {
        return;
    }
    configs.push({
        filePath: resolvedFilePath,
        relativePath: sourceRelativePath(rootPath, resolvedFilePath),
        config,
    });
}

function validateExplicitHookConfigPath(
    selection: PluginManifestSelection,
    explicitPath: string,
    warnings: CapabilityWarning[],
): string | undefined {
    const pluginRoot = path.resolve(selectedPluginRoot(selection));
    if (!explicitPath) {
        warnings.push(
            warning(
                'AGENT_PLUGIN_HOOK_TARGET_MISSING',
                `Selected manifest "${selection.relativePath}" declares an empty "hooks" path.`,
                selection.manifestPath,
            ),
        );
        return undefined;
    }

    const targetPath = path.resolve(pluginRoot, explicitPath);
    if (!isPathInside(pluginRoot, targetPath)) {
        warnings.push(
            warning(
                'AGENT_PLUGIN_HOOK_TARGET_OUTSIDE_ROOT',
                `Selected manifest "${selection.relativePath}" declares hook config path "${explicitPath}", which escapes the plugin root.`,
                selection.manifestPath,
            ),
        );
        return undefined;
    }
    if (!fs.existsSync(targetPath)) {
        warnings.push(
            warning(
                'AGENT_PLUGIN_HOOK_TARGET_MISSING',
                `Selected manifest "${selection.relativePath}" declares hook config path "${explicitPath}", but that file is not present in the plugin package.`,
                selection.manifestPath,
            ),
        );
        return undefined;
    }
    return targetPath;
}

function collectHookCommands(value: unknown, result: HookCommand[] = []): HookCommand[] {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectHookCommands(item, result);
        }
        return result;
    }
    if (!value || typeof value !== 'object') {
        return result;
    }

    const object = value as Record<string, unknown>;
    const cwd = typeof object.cwd === 'string' ? object.cwd : undefined;
    for (const field of COMMAND_FIELDS) {
        const command = object[field];
        if (typeof command === 'string') {
            result.push({ command, field, cwd });
        }
    }

    for (const [field, nested] of Object.entries(object)) {
        if ((COMMAND_FIELDS as readonly string[]).includes(field) || field === 'cwd') {
            continue;
        }
        collectHookCommands(nested, result);
    }
    return result;
}

function referencedRootVariables(value: string): string[] {
    const found = new Set<string>();
    for (const variable of ROOT_VARIABLE_NAMES) {
        const patterns = [
            new RegExp(`\\$\\{${variable}\\}`, 'i'),
            new RegExp(`\\$env:${variable}\\b`, 'i'),
            new RegExp(`\\$${variable}\\b`, 'i'),
            new RegExp(`%${variable}%`, 'i'),
        ];
        if (patterns.some((pattern) => pattern.test(value))) {
            found.add(variable);
        }
    }
    return Array.from(found);
}

function tokenizeSimpleCommand(command: string): string[] {
    const tokens: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(command)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
    }
    return tokens;
}

function isAbsolutePath(value: string): boolean {
    return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function relativeScriptOperands(command: string, rootPath: string): string[] {
    const operands: string[] = [];
    let expectExecutable = true;
    let interpreterNeedsOperand = false;

    const isRelativeScript = (token: string): boolean => {
        const candidate = token.replace(/[),;]+$/, '');
        if (
            !candidate ||
            candidate.startsWith('-') ||
            referencedRootVariables(candidate).length > 0 ||
            isAbsolutePath(candidate) ||
            !SCRIPT_EXTENSION_PATTERN.test(candidate)
        ) {
            return false;
        }

        const normalized = normalizeRelativePath(candidate);
        return (
            candidate.startsWith('./') ||
            candidate.startsWith('../') ||
            candidate.startsWith('.\\') ||
            candidate.startsWith('..\\') ||
            normalized.startsWith('.github/') ||
            normalized.startsWith('hooks/') ||
            normalized.startsWith('scripts/') ||
            normalized.includes('/') ||
            fs.existsSync(path.resolve(rootPath, candidate))
        );
    };

    for (const token of tokenizeSimpleCommand(command)) {
        if (SHELL_CONTROL_TOKENS.has(token)) {
            expectExecutable = true;
            interpreterNeedsOperand = false;
            continue;
        }

        if (expectExecutable) {
            expectExecutable = false;
            const executable = token.replace(/[),;]+$/, '');
            if (isRelativeScript(executable)) {
                operands.push(executable);
            }
            const executableName = path
                .basename(executable)
                .toLowerCase()
                .replace(/\.exe$/, '');
            interpreterNeedsOperand = SCRIPT_INTERPRETERS.has(executableName);
            continue;
        }

        const isInterpreterOption =
            token.startsWith('-') || /^\/[A-Za-z][A-Za-z0-9-]*$/.test(token);
        if (interpreterNeedsOperand && !isInterpreterOption) {
            const operand = token.replace(/[),;]+$/, '');
            if (isRelativeScript(operand)) {
                operands.push(operand);
            }
            interpreterNeedsOperand = false;
        }
    }

    return operands;
}

function warning(code: string, message: string, filePath: string): CapabilityWarning {
    return {
        code,
        message,
        filePath,
        severity: 'warning',
    };
}

function validateRootTargets(
    value: string,
    field: string,
    selection: PluginManifestSelection,
    hookFilePath: string,
    warnings: CapabilityWarning[],
    requireDirectory = false,
): { hasReference: boolean; valid: boolean } {
    const variables = FORMAT_ROOT_VARIABLES[selection.format];
    if (variables.length === 0) {
        return { hasReference: false, valid: false };
    }

    const markerPattern = new RegExp(
        `(?:${variables
            .flatMap((variable) => [
                `\\$\\{${variable}\\}`,
                `\\$env:${variable}\\b`,
                `\\$${variable}\\b`,
                `%${variable}%`,
            ])
            .join('|')})([\\\\/].*)?`,
        'gi',
    );
    const values = requireDirectory ? [value.trim()] : tokenizeSimpleCommand(value);
    const normalizedRoot = path.resolve(selectedPluginRoot(selection));
    let hasReference = false;
    let valid = true;

    for (const token of values) {
        let match: RegExpExecArray | null;
        markerPattern.lastIndex = 0;
        while ((match = markerPattern.exec(token)) !== null) {
            hasReference = true;
            const relativeTarget = (match[1] ?? '')
                .replace(/^[\\/]+/, '')
                .replace(/[),;]+$/, '')
                .replace(/[\\/]/g, path.sep);
            const targetPath = path.resolve(normalizedRoot, relativeTarget);

            if (!isPathInside(normalizedRoot, targetPath)) {
                valid = false;
                warnings.push(
                    warning(
                        'AGENT_PLUGIN_HOOK_TARGET_OUTSIDE_ROOT',
                        `Hook ${field} path "${match[0]}" escapes the selected ${selection.format} plugin root. Keep bundled hook targets inside the plugin package.`,
                        hookFilePath,
                    ),
                );
                continue;
            }

            let targetExists = false;
            try {
                const stats = fs.statSync(targetPath);
                targetExists = requireDirectory ? stats.isDirectory() : true;
            } catch {
                targetExists = false;
            }
            if (!targetExists) {
                valid = false;
                warnings.push(
                    warning(
                        'AGENT_PLUGIN_HOOK_TARGET_MISSING',
                        `Hook ${field} path "${match[0]}" does not resolve to a packaged ${requireDirectory ? 'directory' : 'file'} under the selected ${selection.format} plugin root.`,
                        hookFilePath,
                    ),
                );
            }
        }
    }

    return { hasReference, valid };
}

function validateHookCommands(
    commands: HookCommand[],
    selection: PluginManifestSelection,
    hookFilePath: string,
    warnings: CapabilityWarning[],
): void {
    const allowedVariables = FORMAT_ROOT_VARIABLES[selection.format];

    for (const command of commands) {
        const referencedVariables = new Set([
            ...referencedRootVariables(command.command),
            ...referencedRootVariables(command.cwd ?? ''),
        ]);
        const unsupportedVariables = Array.from(referencedVariables).filter(
            (variable) => !allowedVariables.includes(variable),
        );
        if (unsupportedVariables.length > 0) {
            warnings.push(
                warning(
                    'AGENT_PLUGIN_HOOK_ROOT_TOKEN_UNSUPPORTED',
                    `Hook ${command.field} uses ${unsupportedVariables
                        .map((variable) => `"${variable}"`)
                        .join(
                            ', ',
                        )}, but manifest precedence selects ${selection.relativePath} (${selection.format}). ${
                        allowedVariables.length > 0
                            ? `Use ${allowedVariables
                                  .map((variable) => `\${${variable}}`)
                                  .join(' or ')} for plugin-root paths in this format.`
                            : 'Use a format-specific package or inject the hook as repository configuration.'
                    }`,
                    hookFilePath,
                ),
            );
        }

        validateRootTargets(command.command, command.field, selection, hookFilePath, warnings);
        const cwdValidation = command.cwd
            ? validateRootTargets(
                  command.cwd,
                  `${command.field} cwd`,
                  selection,
                  hookFilePath,
                  warnings,
                  true,
              )
            : { hasReference: false, valid: false };
        const cwdUsesAllowedRoot =
            allowedVariables.length > 0 && cwdValidation.hasReference && cwdValidation.valid;
        const operands = relativeScriptOperands(command.command, selectedPluginRoot(selection));
        if (operands.length > 0 && !cwdUsesAllowedRoot) {
            warnings.push(
                warning(
                    'AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT',
                    `Hook ${command.field} launches bundled script path "${operands[0]}" relative to the session/workspace working directory. Resolve it from the selected plugin root or set an explicit plugin-root cwd.`,
                    hookFilePath,
                ),
            );
        }
    }
}

function validatePluginRoot(group: PluginRootGroup): CapabilityWarning[] {
    const warnings: CapabilityWarning[] = [];
    const hookConfigs = getPluginHookConfigFiles(group);

    const selection = selectPluginManifest(group.rootPath);
    if (!selection) {
        if (hookConfigs.length === 0) {
            return warnings;
        }
        warnings.push(
            warning(
                'AGENT_PLUGIN_HOOK_MANIFEST_MISSING',
                'Plugin-delivered hook configuration has no recognized plugin manifest. Add a format-specific manifest before registering this capability through chat.pluginLocations.',
                hookConfigs[0].filePath,
            ),
        );
        return warnings;
    }

    const contract = hookConfigContract(selection);
    for (const discoverablePath of contract.discoverablePaths) {
        const targetPath = path.resolve(selectedPluginRoot(selection), discoverablePath);
        if (isPathInside(selectedPluginRoot(selection), targetPath) && fs.existsSync(targetPath)) {
            addHookConfigFile(hookConfigs, group.rootPath, targetPath);
        }
    }
    if (contract.explicitPath !== undefined) {
        const explicitTarget = validateExplicitHookConfigPath(
            selection,
            contract.explicitPath,
            warnings,
        );
        if (explicitTarget) {
            addHookConfigFile(hookConfigs, group.rootPath, explicitTarget);
        }
    }

    if (contract.inlineHooks) {
        validateHookCommands(
            collectHookCommands(contract.inlineHooks),
            selection,
            selection.manifestPath,
            warnings,
        );
    }

    const selectedManifestPath = path.resolve(selection.manifestPath);
    const inactiveManifestPaths = new Set(
        MANIFEST_PRECEDENCE.map((candidate) =>
            path.resolve(group.rootPath, ...candidate.relativePath.split('/')),
        ).filter((manifestPath) => manifestPath !== selectedManifestPath),
    );

    for (const hookConfig of hookConfigs) {
        if (inactiveManifestPaths.has(path.resolve(hookConfig.filePath))) {
            continue;
        }
        if (contract.inlineHooks && path.resolve(hookConfig.filePath) === selectedManifestPath) {
            continue;
        }
        if (!contract.discoverablePaths.includes(normalizeRelativePath(hookConfig.relativePath))) {
            const expectedDescription = contract.discoverablePaths
                .map((candidate) => `"${candidate}"`)
                .join(' or ');
            warnings.push(
                warning(
                    'AGENT_PLUGIN_HOOK_CONFIG_UNDISCOVERABLE',
                    `Plugin-delivered hook config "${hookConfig.relativePath}" is not discovered by the selected ${selection.format} manifest "${selection.relativePath}". ${
                        selection.format === 'agent-plugins-v1'
                            ? `Move it to ${expectedDescription}; strict Agent Plugins v1 does not define a top-level "hooks" manifest field.`
                            : `Move it to ${expectedDescription} or declare that path in the selected manifest's "hooks" field.`
                    }`,
                    hookConfig.filePath,
                ),
            );
        }

        validateHookCommands(
            collectHookCommands(hookConfig.config.hooks),
            selection,
            hookConfig.filePath,
            warnings,
        );
    }

    return warnings;
}

/**
 * Validate hook configuration co-located with a root that MetaFlow registers
 * as a plugin.
 *
 * Standalone repository/settings and synchronized hooks are excluded because
 * their path base is the consuming repository. A settings-classified hook under
 * a registered plugin root is included so MetaFlow can warn when that config
 * would be suppressed from settings injection yet remain undiscoverable by the
 * selected plugin manifest.
 */
export function collectAgentPluginHookWarnings(
    effectiveFiles: EffectiveFile[],
): CapabilityWarning[] {
    const warnings = groupPluginFiles(effectiveFiles).flatMap(validatePluginRoot);
    const seen = new Set<string>();

    return warnings.filter((entry) => {
        const identity = `${entry.code}\0${entry.filePath ?? ''}\0${entry.message}`;
        if (seen.has(identity)) {
            return false;
        }
        seen.add(identity);
        return true;
    });
}
