/**
 * Config loader: discovers, parses, and validates `.metaflow/config.jsonc`.
 *
 * Uses `jsonc-parser` for fault-tolerant JSONC support.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { MetaFlowConfig, ConfigError, ConfigLoadResult } from './configSchema';
import { discoverConfigPath } from './configPathUtils';
import { CURRENT_CONFIG_COMPATIBILITY_VERSION, normalizeConfigShape } from './configNormalization';

/**
 * Load and validate a `.metaflow/config.jsonc` configuration file.
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns A `ConfigLoadResult` with either the parsed config or errors.
 */
export function loadConfig(workspaceRoot: string): ConfigLoadResult {
    const configPath = discoverConfigPath(workspaceRoot);
    if (!configPath) {
        return {
            ok: false,
            errors: [{ message: 'No .metaflow/config.jsonc found at workspace root.' }],
        };
    }
    return loadConfigFromPath(configPath);
}

/**
 * Load and validate from a specific config file path.
 *
 * @param configPath Absolute path to the config file.
 * @returns A `ConfigLoadResult`.
 */
export function loadConfigFromPath(configPath: string): ConfigLoadResult {
    let rawText: string;
    try {
        rawText = fs.readFileSync(configPath, 'utf-8');
    } catch (err) {
        return {
            ok: false,
            errors: [{ message: `Failed to read config file: ${(err as Error).message}` }],
            configPath,
        };
    }

    return parseAndValidate(rawText, configPath);
}

/**
 * Parse raw JSONC text and validate against the MetaFlow config schema.
 *
 * @param rawText Raw JSONC content.
 * @param configPath Path for error reporting.
 * @returns A `ConfigLoadResult`.
 */
export function parseAndValidate(rawText: string, configPath: string): ConfigLoadResult {
    // Parse JSONC
    const parseErrors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(rawText, parseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
    });

    if (parseErrors.length > 0) {
        const errors: ConfigError[] = parseErrors.map((pe) => {
            const pos = getLineColumn(rawText, pe.offset);
            return {
                message: `JSON parse error: ${jsonc.printParseErrorCode(pe.error)} at offset ${pe.offset}`,
                line: pos.line,
                column: pos.column,
            };
        });
        return { ok: false, errors, configPath };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
            ok: false,
            errors: [{ message: 'Config must be a JSON object.' }],
            configPath,
        };
    }

    const workspaceRoot = inferWorkspaceRoot(configPath);

    // Validate authored/legacy schema before normalization so incomplete
    // legacy shapes still surface precise compatibility errors.
    const validationDiagnostics = validateConfig(parsed as MetaFlowConfig, workspaceRoot);
    const validationErrors = validationDiagnostics.filter(
        (diagnostic) => diagnostic.severity !== 'warning',
    );
    const validationWarnings = validationDiagnostics.filter(
        (diagnostic) => diagnostic.severity === 'warning',
    );
    if (validationErrors.length > 0) {
        return {
            ok: false,
            errors: validationErrors,
            ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
            configPath,
        };
    }

    const normalized = normalizeConfigShape(parsed as MetaFlowConfig);

    return {
        ok: true,
        config: normalized.config,
        configPath,
        migrationRequired:
            !Object.prototype.hasOwnProperty.call(parsed, 'compatibilityVersion') ||
            (parsed as MetaFlowConfig).compatibilityVersion !==
                CURRENT_CONFIG_COMPATIBILITY_VERSION,
        ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
        ...(normalized.migrated
            ? {
                  migrated: true,
                  migrationMessages: normalized.migrationMessages,
              }
            : {}),
    };
}

/**
 * Validate a parsed config object against the MetaFlow schema.
 *
 * @param config The parsed config.
 * @returns Config validation errors and recoverable warnings.
 */
export function validateConfig(config: MetaFlowConfig, workspaceRoot?: string): ConfigError[] {
    const errors: ConfigError[] = [];

    if (config.compatibilityVersion !== undefined) {
        if (!Number.isInteger(config.compatibilityVersion) || config.compatibilityVersion < 1) {
            errors.push({
                message: '"compatibilityVersion" must be an integer greater than or equal to 1.',
            });
        } else if (config.compatibilityVersion > CURRENT_CONFIG_COMPATIBILITY_VERSION) {
            errors.push({
                message: `"compatibilityVersion" ${config.compatibilityVersion} is newer than the supported version ${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
            });
        }
    }

    if (config.synchronization !== undefined) {
        if (
            typeof config.synchronization !== 'object' ||
            config.synchronization === null ||
            Array.isArray(config.synchronization)
        ) {
            errors.push({ message: '"synchronization" must be an object when provided.' });
        } else {
            const synchronization = config.synchronization as Record<string, unknown>;
            for (const key of Object.keys(synchronization)) {
                if (key !== 'repoWideCopilotInstructions') {
                    errors.push({
                        message: `"synchronization.${key}" is not a supported configuration key.`,
                    });
                }
            }
            if (
                Object.prototype.hasOwnProperty.call(
                    synchronization,
                    'repoWideCopilotInstructions',
                ) &&
                typeof synchronization.repoWideCopilotInstructions !== 'boolean'
            ) {
                errors.push({
                    message: '"synchronization.repoWideCopilotInstructions" must be a boolean.',
                });
            }
        }
    }

    if (config.agentPlugins !== undefined) {
        if (
            typeof config.agentPlugins !== 'object' ||
            config.agentPlugins === null ||
            Array.isArray(config.agentPlugins)
        ) {
            errors.push({
                code: 'CONFIG_AGENT_PLUGINS_INVALID',
                message: '"agentPlugins" must be an object when provided.',
            });
        } else {
            if (config.compatibilityVersion !== CURRENT_CONFIG_COMPATIBILITY_VERSION) {
                errors.push({
                    code: 'CONFIG_AGENT_PLUGINS_VERSION_REQUIRED',
                    message: `"agentPlugins" requires "compatibilityVersion": ${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
                });
            }
            const agentPlugins = config.agentPlugins as Record<string, unknown>;
            for (const key of Object.keys(agentPlugins)) {
                if (key !== 'targetVersion' && key !== 'disposition') {
                    errors.push({
                        code: 'CONFIG_AGENT_PLUGINS_KEY_UNSUPPORTED',
                        message: `"agentPlugins.${key}" is not a supported configuration key.`,
                    });
                }
            }
            if (
                Object.prototype.hasOwnProperty.call(agentPlugins, 'targetVersion') &&
                agentPlugins.targetVersion !== '1.0.0'
            ) {
                errors.push({
                    code: 'CONFIG_AGENT_PLUGINS_TARGET_VERSION_INVALID',
                    message: '"agentPlugins.targetVersion" must be "1.0.0".',
                });
            }
            if (
                Object.prototype.hasOwnProperty.call(agentPlugins, 'disposition') &&
                !['compatibility', 'prefer-standard', 'audit-standard'].includes(
                    agentPlugins.disposition as string,
                )
            ) {
                errors.push({
                    code: 'CONFIG_AGENT_PLUGINS_DISPOSITION_INVALID',
                    message:
                        '"agentPlugins.disposition" must be "compatibility", "prefer-standard", or "audit-standard".',
                });
            }
        }
    }

    if (config.targets !== undefined) {
        if (
            typeof config.targets !== 'object' ||
            config.targets === null ||
            Array.isArray(config.targets)
        ) {
            errors.push({
                code: 'CONFIG_TARGETS_INVALID',
                message: '"targets" must be an object when provided.',
            });
        } else {
            const targets = config.targets as Record<string, unknown>;
            for (const key of Object.keys(targets)) {
                if (key !== 'pi') {
                    errors.push({
                        code: 'CONFIG_TARGET_UNSUPPORTED',
                        message: `"targets.${key}" is not a supported project target.`,
                    });
                }
            }

            if (Object.prototype.hasOwnProperty.call(targets, 'pi')) {
                if (config.compatibilityVersion !== CURRENT_CONFIG_COMPATIBILITY_VERSION) {
                    errors.push({
                        code: 'CONFIG_PI_TARGET_VERSION_REQUIRED',
                        message: `"targets.pi" requires "compatibilityVersion": ${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
                    });
                }

                const pi = targets.pi;
                if (typeof pi !== 'object' || pi === null || Array.isArray(pi)) {
                    errors.push({
                        code: 'CONFIG_PI_TARGET_INVALID',
                        message: '"targets.pi" must be an object.',
                    });
                } else {
                    const piTarget = pi as Record<string, unknown>;
                    for (const key of Object.keys(piTarget)) {
                        if (key !== 'enabled') {
                            errors.push({
                                code: 'CONFIG_PI_TARGET_KEY_UNSUPPORTED',
                                message: `"targets.pi.${key}" is not supported; the skills-only Pi target accepts only "enabled".`,
                            });
                        }
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(piTarget, 'enabled') &&
                        typeof piTarget.enabled !== 'boolean'
                    ) {
                        errors.push({
                            code: 'CONFIG_PI_TARGET_ENABLED_INVALID',
                            message: '"targets.pi.enabled" must be a boolean.',
                        });
                    }
                }
            }
        }
    }

    const hasSingleRepo = config.metadataRepo !== undefined;
    const hasMultiRepo = config.metadataRepos !== undefined && config.metadataRepos.length > 0;

    // Must have at least one repo mode
    if (!hasSingleRepo && !hasMultiRepo) {
        errors.push({ message: 'Config must define "metadataRepo" or "metadataRepos".' });
    }

    if (hasSingleRepo && !hasMultiRepo) {
        if (!config.metadataRepo!.localPath) {
            errors.push({ message: '"metadataRepo.localPath" is required.' });
        }
    }

    // Multi-repo mode validation
    if (hasMultiRepo) {
        // Unique IDs
        const ids = config.metadataRepos!.map((r) => r.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== ids.length) {
            errors.push({ message: '"metadataRepos" IDs must be unique.' });
        }

        // Each repo needs localPath
        for (const repo of config.metadataRepos!) {
            if (!repo.id) {
                errors.push({ message: 'Each entry in "metadataRepos" must have an "id".' });
            }
            if (!repo.localPath) {
                errors.push({
                    message: `"metadataRepos" entry "${repo.id}" is missing "localPath".`,
                });
            }
            if (repo.discover !== undefined) {
                if (
                    typeof repo.discover !== 'object' ||
                    repo.discover === null ||
                    Array.isArray(repo.discover)
                ) {
                    errors.push({
                        message: `"metadataRepos" entry "${repo.id}" has invalid "discover" (must be an object).`,
                    });
                } else if (
                    repo.discover.exclude !== undefined &&
                    (!Array.isArray(repo.discover.exclude) ||
                        repo.discover.exclude.some((item) => typeof item !== 'string'))
                ) {
                    errors.push({
                        message: `"metadataRepos" entry "${repo.id}" has invalid "discover.exclude" (must be an array of strings).`,
                    });
                }
            }

            if (
                repo.capabilities !== undefined &&
                (!Array.isArray(repo.capabilities) ||
                    repo.capabilities.some((capability) => {
                        if (
                            typeof capability !== 'object' ||
                            capability === null ||
                            Array.isArray(capability)
                        ) {
                            return true;
                        }

                        const candidate = capability as {
                            path?: unknown;
                            fileNamingStrategy?: unknown;
                        };
                        return (
                            typeof candidate.path !== 'string' ||
                            (candidate.fileNamingStrategy !== undefined &&
                                candidate.fileNamingStrategy !== 'prefixed' &&
                                candidate.fileNamingStrategy !== 'original-unless-conflict')
                        );
                    }))
            ) {
                errors.push({
                    message: `"metadataRepos" entry "${repo.id}" has invalid "capabilities" entries.`,
                });
            }

            for (const capability of repo.capabilities ?? []) {
                if (
                    typeof capability === 'object' &&
                    capability !== null &&
                    !Array.isArray(capability) &&
                    Object.prototype.hasOwnProperty.call(capability, 'excludedTypes')
                ) {
                    errors.push({
                        message: `"metadataRepos" entry "${repo.id}" capability "${(capability as { path?: unknown }).path ?? '<unknown>'}" uses unsupported "excludedTypes". Capabilities are atomic; split the capability or disable it entirely.`,
                    });
                }
            }

            if (
                repo.fileNamingStrategy !== undefined &&
                repo.fileNamingStrategy !== 'prefixed' &&
                repo.fileNamingStrategy !== 'original-unless-conflict'
            ) {
                errors.push({
                    message: `"metadataRepos" entry "${repo.id}" has invalid "fileNamingStrategy" (must be "prefixed" or "original-unless-conflict").`,
                });
            }
        }

        if (workspaceRoot) {
            const enabledRepoIdsByPath = new Map<string, string>();
            for (const repo of config.metadataRepos!) {
                if (repo.enabled === false) {
                    continue;
                }

                if (!repo.localPath) {
                    continue;
                }

                const resolved = canonicalizeResolvedPath(workspaceRoot, repo.localPath);
                const existingRepoId = enabledRepoIdsByPath.get(resolved);
                if (existingRepoId) {
                    errors.push({
                        message: `metadataRepos entries "${existingRepoId}" and "${repo.id}" resolve to the same localPath. Remove one source.`,
                    });
                } else {
                    enabledRepoIdsByPath.set(resolved, repo.id);
                }
            }
        }

        if (config.layerSources) {
            // Validate repoId references
            for (const ls of config.layerSources!) {
                if (!ls.repoId) {
                    errors.push({ message: 'Each "layerSources" entry must have a "repoId".' });
                } else if (!uniqueIds.has(ls.repoId)) {
                    errors.push({
                        code: 'CONFIG_LAYER_SOURCE_REPO_UNRESOLVED',
                        message: `"layerSources" repoId "${ls.repoId}" does not match any "metadataRepos" id.`,
                        severity: 'warning',
                    });
                }
                if (!ls.path) {
                    errors.push({ message: 'Each "layerSources" entry must have a "path".' });
                }
                if (Object.prototype.hasOwnProperty.call(ls, 'excludedTypes')) {
                    errors.push({
                        message: `"layerSources" entry "${ls.repoId}/${ls.path}" uses unsupported "excludedTypes". Capabilities are atomic; split the capability or disable it entirely.`,
                    });
                }
                if (
                    ls.fileNamingStrategy !== undefined &&
                    ls.fileNamingStrategy !== 'prefixed' &&
                    ls.fileNamingStrategy !== 'original-unless-conflict'
                ) {
                    errors.push({
                        message: `"layerSources" entry "${ls.repoId}/${ls.path}" has invalid "fileNamingStrategy" (must be "prefixed" or "original-unless-conflict").`,
                    });
                }
            }
        }
    }

    if (config.profiles !== undefined) {
        const repoIds = new Set(config.metadataRepos?.map((repo) => repo.id) ?? ['primary']);
        for (const [profileId, profile] of Object.entries(config.profiles)) {
            if (profile.enabledCapabilities === undefined) {
                continue;
            }

            if (
                !Array.isArray(profile.enabledCapabilities) ||
                profile.enabledCapabilities.some((reference) => typeof reference !== 'string')
            ) {
                errors.push({
                    message: `Profile "${profileId}" has invalid "enabledCapabilities" (must be an array of strings).`,
                });
                continue;
            }

            const seen = new Set<string>();
            for (const reference of profile.enabledCapabilities) {
                const separator = reference.indexOf(':');
                const repoId = separator > 0 ? reference.slice(0, separator).trim() : '';
                const layerPath = separator > 0 ? reference.slice(separator + 1).trim() : '';
                if (!repoId || !layerPath) {
                    errors.push({
                        message: `Profile "${profileId}" has invalid capability reference "${reference}"; expected "repoId:path".`,
                    });
                    continue;
                }
                if (seen.has(reference)) {
                    errors.push({
                        message: `Profile "${profileId}" contains duplicate capability reference "${reference}".`,
                    });
                }
                seen.add(reference);
                if (config.metadataRepos && !repoIds.has(repoId)) {
                    errors.push({
                        code: 'CONFIG_PROFILE_CAPABILITY_REPO_UNRESOLVED',
                        message: `Profile "${profileId}" capability reference "${reference}" does not match a metadata repository.`,
                        severity: 'warning',
                    });
                }
            }
        }
    }

    if (
        config.fileNamingStrategy !== undefined &&
        config.fileNamingStrategy !== 'prefixed' &&
        config.fileNamingStrategy !== 'original-unless-conflict'
    ) {
        errors.push({
            message:
                '"fileNamingStrategy" must be either "prefixed" or "original-unless-conflict".',
        });
    }

    // An activeProfile that does not exist in "profiles" is intentionally NOT a
    // fatal config error: the overlay layer surfaces all files without profile
    // filtering and emits an ACTIVE_PROFILE_NOT_FOUND warning instead, so a profile
    // typo degrades gracefully rather than nuking all metadata delivery.

    return errors;
}

// ── Helpers ────────────────────────────────────────────────────────

function inferWorkspaceRoot(configPath: string): string | undefined {
    const normalized = configPath.replace(/\\/g, '/');
    if (!normalized.endsWith('/.metaflow/config.jsonc')) {
        return undefined;
    }

    return path.resolve(path.dirname(configPath), '..');
}

function canonicalizeResolvedPath(workspaceRoot: string, localPath: string): string {
    const normalized = localPath.replace(/\\/g, '/');
    const resolved = path.resolve(workspaceRoot, normalized);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Convert a byte offset to 0-based line and column. */
function getLineColumn(text: string, offset: number): { line: number; column: number } {
    let line = 0;
    let lastNewline = -1;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            lastNewline = i;
        }
    }
    return { line, column: offset - lastNewline - 1 };
}
