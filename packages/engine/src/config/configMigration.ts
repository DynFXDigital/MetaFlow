import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import { ConfigError, MetaFlowConfig, ConfigLoadResult } from './configSchema';
import { loadConfigFromPath, validateConfig } from './configLoader';
import { CURRENT_CONFIG_COMPATIBILITY_VERSION } from './configNormalization';

/** Opaque proof that a root synchronization operation passed raw-disk checks. */
export interface RootSynchronizationAuthorization {
    readonly kind: 'active-persisted-v4';
}

const activeAuthorizations = new WeakSet<object>();
const authorizationPaths = new WeakMap<object, string>();

function canonicalPath(filePath: string): string {
    const resolved = fs.realpathSync.native?.(filePath) ?? filePath;
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function parseRawConfig(rawText: string, configPath: string): MetaFlowConfig {
    const parseErrors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(rawText, parseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
    });
    if (parseErrors.length > 0 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Cannot attest ${configPath}: the raw config is not valid JSONC.`);
    }
    return parsed as MetaFlowConfig;
}

function formatErrors(errors: ConfigError[]): string {
    return errors.map((error) => error.message).join('; ');
}

function validateRawConfig(config: MetaFlowConfig, configPath: string): void {
    const errors = validateConfig(config).filter((error) => error.severity !== 'warning');
    if (errors.length > 0) {
        throw new Error(`Cannot attest ${configPath}: ${formatErrors(errors)}`);
    }
}

/**
 * Persist only the compatibility barrier and explicit root policy fields.
 * jsonc.modify/applyEdits preserves unrelated comments and authored nodes.
 */
export function persistCompatibilityV4Config(configPath: string): boolean {
    const existing = fs.readFileSync(configPath, 'utf-8');
    const raw = parseRawConfig(existing, configPath);
    validateRawConfig(raw, configPath);

    let updated = existing;
    const formattingOptions: jsonc.FormattingOptions = { tabSize: 2, insertSpaces: true };
    if (raw.compatibilityVersion !== CURRENT_CONFIG_COMPATIBILITY_VERSION) {
        updated = jsonc.applyEdits(
            updated,
            jsonc.modify(updated, ['compatibilityVersion'], CURRENT_CONFIG_COMPATIBILITY_VERSION, {
                formattingOptions,
            }),
        );
    }
    if (!raw.synchronization) {
        updated = jsonc.applyEdits(
            updated,
            jsonc.modify(
                updated,
                ['synchronization'],
                { repoWideCopilotInstructions: false },
                { formattingOptions },
            ),
        );
    } else if (
        !Object.prototype.hasOwnProperty.call(raw.synchronization, 'repoWideCopilotInstructions')
    ) {
        updated = jsonc.applyEdits(
            updated,
            jsonc.modify(updated, ['synchronization', 'repoWideCopilotInstructions'], false, {
                formattingOptions,
            }),
        );
    }

    if (updated === existing) {
        return false;
    }
    fs.writeFileSync(configPath, updated, 'utf-8');
    return true;
}

function assertPersistedV4(configPath: string): ConfigLoadResult & { ok: true } {
    const rawText = fs.readFileSync(configPath, 'utf-8');
    const raw = parseRawConfig(rawText, configPath);
    validateRawConfig(raw, configPath);
    if (
        !Object.prototype.hasOwnProperty.call(raw, 'compatibilityVersion') ||
        !Number.isInteger(raw.compatibilityVersion) ||
        raw.compatibilityVersion !== CURRENT_CONFIG_COMPATIBILITY_VERSION
    ) {
        throw new Error(`Cannot attest ${configPath}: compatibilityVersion v4 is not persisted.`);
    }

    const loaded = loadConfigFromPath(configPath);
    if (!loaded.ok || loaded.migrationRequired) {
        throw new Error(`Cannot attest ${configPath}: normalized config still requires migration.`);
    }
    const rawPolicy = raw.synchronization?.repoWideCopilotInstructions === true;
    const normalizedPolicy = loaded.config.synchronization?.repoWideCopilotInstructions === true;
    if (rawPolicy !== normalizedPolicy) {
        throw new Error(`Cannot attest ${configPath}: raw and normalized root policy disagree.`);
    }
    return loaded;
}

/**
 * Read, minimally migrate, re-read, and execute one operation-local callback.
 * The authorization object remains active until a synchronous or asynchronous
 * callback has completed, then is revoked unconditionally.
 */
export function withRootSynchronizationAuthorization<T>(
    configPath: string,
    callback: (
        authorization: RootSynchronizationAuthorization | undefined,
        loaded: ConfigLoadResult & { ok: true },
    ) => T,
): T {
    const first = loadConfigFromPath(configPath);
    if (!first.ok) {
        throw new Error(first.errors.map((error) => error.message).join('; '));
    }
    if (first.migrationRequired) {
        persistCompatibilityV4Config(configPath);
    }
    const loaded = assertPersistedV4(configPath);
    const policyEnabled = loaded.config.synchronization?.repoWideCopilotInstructions === true;
    if (!policyEnabled) {
        return callback(undefined, loaded);
    }

    const authorization = Object.freeze({
        kind: 'active-persisted-v4',
    }) as RootSynchronizationAuthorization;
    const key = authorization as object;
    activeAuthorizations.add(key);
    authorizationPaths.set(key, canonicalPath(configPath));
    const revoke = (): void => {
        activeAuthorizations.delete(key);
        authorizationPaths.delete(key);
    };
    try {
        const result = callback(authorization, loaded);
        if (
            result !== null &&
            typeof result === 'object' &&
            typeof (result as { then?: unknown }).then === 'function'
        ) {
            return Promise.resolve(result).then(
                (value) => {
                    revoke();
                    return value;
                },
                (error: unknown) => {
                    revoke();
                    throw error;
                },
            ) as T;
        }
        revoke();
        return result;
    } catch (error) {
        revoke();
        throw error;
    }
}

export function isRootSynchronizationAuthorizationActive(
    authorization: RootSynchronizationAuthorization | undefined,
    configPath: string | undefined,
): boolean {
    if (!authorization || !configPath) {
        return false;
    }
    const key = authorization as object;
    return (
        activeAuthorizations.has(key) && authorizationPaths.get(key) === canonicalPath(configPath)
    );
}
