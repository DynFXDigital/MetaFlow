/**
 * Config loader: discovers, parses, and validates `.metaflow/config.jsonc`.
 *
 * Uses `jsonc-parser` for fault-tolerant JSONC support.
 *
 * Pure TypeScript — no VS Code imports.
 */

import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import {
    MetaFlowConfig,
    ConfigError,
    ConfigLoadResult,
} from './configSchema';
import { discoverConfigPath } from './configPathUtils';

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
        const errors: ConfigError[] = parseErrors.map(pe => {
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

    // Validate schema
    const validationErrors = validateConfig(parsed as MetaFlowConfig);
    if (validationErrors.length > 0) {
        return { ok: false, errors: validationErrors, configPath };
    }

    return { ok: true, config: parsed as MetaFlowConfig, configPath };
}

/**
 * Validate a parsed config object against the MetaFlow schema.
 *
 * @param config The parsed config.
 * @returns Array of validation errors (empty if valid).
 */
export function validateConfig(config: MetaFlowConfig): ConfigError[] {
    const errors: ConfigError[] = [];

    const hasSingleRepo = config.metadataRepo !== undefined;
    const hasMultiRepo = config.metadataRepos !== undefined && config.metadataRepos.length > 0;

    // Must have at least one repo mode
    if (!hasSingleRepo && !hasMultiRepo) {
        errors.push({ message: 'Config must define "metadataRepo" or "metadataRepos".' });
    }

    // Single-repo mode requires layers
    if (hasSingleRepo && !hasMultiRepo) {
        if (!config.metadataRepo!.localPath) {
            errors.push({ message: '"metadataRepo.localPath" is required.' });
        }
        if (!config.layers || config.layers.length === 0) {
            errors.push({ message: '"layers" is required when using single-repo mode (metadataRepo).' });
        }
    }

    // Multi-repo mode validation
    if (hasMultiRepo) {
        // Unique IDs
        const ids = config.metadataRepos!.map(r => r.id);
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
                errors.push({ message: `"metadataRepos" entry "${repo.id}" is missing "localPath".` });
            }
        }

        // layerSources required for multi-repo
        if (!config.layerSources || config.layerSources.length === 0) {
            errors.push({ message: '"layerSources" is required when using multi-repo mode (metadataRepos).' });
        } else {
            // Validate repoId references
            for (const ls of config.layerSources!) {
                if (!ls.repoId) {
                    errors.push({ message: 'Each "layerSources" entry must have a "repoId".' });
                } else if (!uniqueIds.has(ls.repoId)) {
                    errors.push({ message: `"layerSources" repoId "${ls.repoId}" does not match any "metadataRepos" id.` });
                }
                if (!ls.path) {
                    errors.push({ message: 'Each "layerSources" entry must have a "path".' });
                }
            }
        }
    }

    // Active profile must exist in profiles if set
    if (config.activeProfile && config.profiles) {
        if (!(config.activeProfile in config.profiles)) {
            errors.push({ message: `Active profile "${config.activeProfile}" not found in "profiles".` });
        }
    }

    return errors;
}

// ── Helpers ────────────────────────────────────────────────────────

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