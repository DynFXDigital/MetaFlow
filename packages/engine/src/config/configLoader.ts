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
    const validationErrors = validateConfig(parsed as MetaFlowConfig, workspaceRoot);
    if (validationErrors.length > 0) {
        return { ok: false, errors: validationErrors, configPath };
    }

    const normalized = normalizeConfigShape(parsed as MetaFlowConfig);

    return {
        ok: true,
        config: normalized.config,
        configPath,
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
 * @returns Array of validation errors (empty if valid).
 */
export function validateConfig(config: MetaFlowConfig, workspaceRoot?: string): ConfigError[] {
    const errors: ConfigError[] = [];

    if (config.compatibilityVersion !== undefined) {
        if (
            !Number.isInteger(config.compatibilityVersion) ||
            config.compatibilityVersion < 1
        ) {
            errors.push({
                message:
                    '"compatibilityVersion" must be an integer greater than or equal to 1.',
            });
        } else if (config.compatibilityVersion > CURRENT_CONFIG_COMPATIBILITY_VERSION) {
            errors.push({
                message:
                    `"compatibilityVersion" ${config.compatibilityVersion} is newer than the supported version ${CURRENT_CONFIG_COMPATIBILITY_VERSION}.`,
            });
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
                        message:
                            `"metadataRepos" entry "${repo.id}" capability "${(capability as { path?: unknown }).path ?? '<unknown>'}" uses unsupported "excludedTypes". Capabilities are atomic; split the capability or disable it entirely.`,
                    });
                }
            }

            if (
                repo.fileNamingStrategy !== undefined &&
                repo.fileNamingStrategy !== 'prefixed' &&
                repo.fileNamingStrategy !== 'original-unless-conflict'
            ) {
                errors.push({
                    message:
                        `"metadataRepos" entry "${repo.id}" has invalid "fileNamingStrategy" (must be "prefixed" or "original-unless-conflict").`,
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
                        message: `Enabled metadataRepos entries "${existingRepoId}" and "${repo.id}" resolve to the same localPath. Disable or remove one source.`,
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
                        message: `"layerSources" repoId "${ls.repoId}" does not match any "metadataRepos" id.`,
                    });
                }
                if (!ls.path) {
                    errors.push({ message: 'Each "layerSources" entry must have a "path".' });
                }
                if (Object.prototype.hasOwnProperty.call(ls, 'excludedTypes')) {
                    errors.push({
                        message:
                            `"layerSources" entry "${ls.repoId}/${ls.path}" uses unsupported "excludedTypes". Capabilities are atomic; split the capability or disable it entirely.`,
                    });
                }
                if (
                    ls.fileNamingStrategy !== undefined &&
                    ls.fileNamingStrategy !== 'prefixed' &&
                    ls.fileNamingStrategy !== 'original-unless-conflict'
                ) {
                    errors.push({
                        message:
                            `"layerSources" entry "${ls.repoId}/${ls.path}" has invalid "fileNamingStrategy" (must be "prefixed" or "original-unless-conflict").`,
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

    // Active profile must exist in profiles if set
    if (config.activeProfile && config.profiles) {
        if (!(config.activeProfile in config.profiles)) {
            errors.push({
                message: `Active profile "${config.activeProfile}" not found in "profiles".`,
            });
        }
    }

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
