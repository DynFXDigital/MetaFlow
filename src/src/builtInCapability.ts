import * as path from 'path';
import * as fs from 'fs';
import type { InjectionConfig, InjectionMode } from '@metaflow/engine';

export const BUILT_IN_CAPABILITY_STATE_KEY = 'metaflow.builtInCapability.v1';
export const BUILT_IN_CAPABILITY_REPO_ID = '__metaflow_builtin__';
export const BUILT_IN_CAPABILITY_LAYER_PATH = '.';
export const BUILT_IN_CAPABILITY_LAYER_LABEL = 'MetaFlow';

const BUILT_IN_INJECTION_KEYS = [
    'instructions',
    'prompts',
    'commands',
    'skills',
    'agents',
    'hooks',
] as const;

export interface BuiltInCapabilityWorkspaceState {
    enabled?: boolean;
    layerEnabled?: boolean;
    disabledByUser?: boolean;
    synchronizedFiles?: string[];
    layerStates?: Record<string, boolean>;
    injection?: InjectionConfig;
}

export interface BuiltInCapabilityRuntimeState {
    enabled: boolean;
    layerEnabled: boolean;
    disabledByUser?: boolean;
    synchronizedFiles: string[];
    layerStates?: Record<string, boolean>;
    injection?: InjectionConfig;
    sourceRoot?: string;
    sourceId: string;
    sourceDisplayName: string;
}

export interface BuiltInCapabilityActivationState {
    enabled: boolean;
    layerEnabled: boolean;
    disabledByUser?: boolean;
    synchronizedFiles: string[];
    layerStates?: Record<string, boolean>;
    injection?: InjectionConfig;
}

export interface WorkspaceStateLike {
    get<T>(key: string): T | undefined;
}

export function resolveBuiltInCapabilitySourceRoot(extensionPath: string): string | undefined {
    const sourceRoot = path.join(extensionPath, 'assets', 'metaflow-ai-metadata');
    return fs.existsSync(sourceRoot) ? sourceRoot : undefined;
}

export function readBuiltInCapabilityRuntimeState(
    workspaceState: WorkspaceStateLike,
    extensionPath: string,
    extensionId?: string,
    extensionDisplayName?: string,
    sourceRootOverride?: string,
): BuiltInCapabilityRuntimeState {
    const payload = workspaceState.get<BuiltInCapabilityWorkspaceState>(
        BUILT_IN_CAPABILITY_STATE_KEY,
    );
    const sourceRoot = sourceRootOverride ?? resolveBuiltInCapabilitySourceRoot(extensionPath);
    const sourceId = normalizeBuiltInSourceId(extensionId);
    const sourceDisplayName = normalizeBuiltInSourceDisplayName(extensionDisplayName, sourceId);
    const enabled = sourceRoot ? (payload?.enabled ?? false) : false;

    return {
        enabled,
        layerEnabled: payload?.layerEnabled ?? true,
        disabledByUser: payload?.disabledByUser ?? false,
        synchronizedFiles: sanitizeSynchronizedFiles(payload?.synchronizedFiles),
        layerStates: sanitizeBuiltInLayerStates(payload?.layerStates),
        injection: sanitizeBuiltInInjectionConfig(payload?.injection),
        sourceRoot,
        sourceId,
        sourceDisplayName,
    };
}

export function normalizeBuiltInLayerPath(layerPath: string): string {
    const normalized = layerPath.replace(/\\/g, '/').replace(/\/+$/, '').trim();
    return normalized.length > 0 ? normalized : '.';
}

export function resolveBuiltInLayerEnabled(
    state: Pick<BuiltInCapabilityRuntimeState, 'layerEnabled' | 'layerStates'>,
    layerPath: string,
): boolean {
    const normalizedLayerPath = normalizeBuiltInLayerPath(layerPath);
    const layerState = state.layerStates?.[normalizedLayerPath];
    return typeof layerState === 'boolean' ? layerState : state.layerEnabled;
}

export function resolveBuiltInRepoEnabled(
    state: Pick<BuiltInCapabilityRuntimeState, 'layerEnabled' | 'layerStates'>,
): boolean {
    if (state.layerEnabled) {
        return true;
    }

    return Object.values(state.layerStates ?? {}).some((value) => value === true);
}

function normalizeBuiltInSourceId(extensionId: string | undefined): string {
    const normalized = extensionId?.trim();
    return normalized && normalized.length > 0 ? normalized : 'unknown.extension';
}

function normalizeBuiltInSourceDisplayName(
    displayName: string | undefined,
    fallbackId: string,
): string {
    const normalized = displayName?.trim();
    return normalized && normalized.length > 0 ? normalized : fallbackId;
}

export function formatBuiltInCapabilityRepoLabel(): string {
    return BUILT_IN_CAPABILITY_LAYER_LABEL;
}

export function resolveBuiltInCapabilityDisplayName(
    capabilityName: string | undefined,
    sourceDisplayName?: string,
): string {
    const normalizedCapabilityName = capabilityName?.trim();
    if (normalizedCapabilityName) {
        return normalizedCapabilityName;
    }

    const normalizedSourceDisplayName = sourceDisplayName?.trim();
    if (normalizedSourceDisplayName) {
        return normalizedSourceDisplayName;
    }

    return formatBuiltInCapabilityRepoLabel();
}

export function isBuiltInCapabilityActive(state: BuiltInCapabilityActivationState): boolean {
    if (state.enabled) {
        return true;
    }

    // Keep the built-in source visible when it has been intentionally disabled by the
    // user so the repo row remains recoverable and the explicit remove command stays
    // distinct from a temporary disable.
    if (state.disabledByUser) {
        return true;
    }

    // Keep legacy synchronized installs active so users can still manage them.
    return state.synchronizedFiles.length > 0;
}

export function isBuiltInCapabilityEnabled(state: BuiltInCapabilityActivationState): boolean {
    return state.enabled;
}

export function sanitizeSynchronizedFiles(values: string[] | undefined): string[] {
    if (!values || values.length === 0) {
        return [];
    }

    const unique = new Set<string>();
    for (const value of values) {
        const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
        if (!normalized || !normalized.startsWith('.github/')) {
            continue;
        }
        unique.add(normalized);
    }

    return Array.from(unique.values()).sort();
}

export function sanitizeBuiltInLayerStates(
    values: Record<string, boolean> | undefined,
): Record<string, boolean> {
    if (!values) {
        return {};
    }

    const sanitized: Record<string, boolean> = {};
    for (const [layerPath, enabled] of Object.entries(values)) {
        if (typeof enabled !== 'boolean') {
            continue;
        }

        sanitized[normalizeBuiltInLayerPath(layerPath)] = enabled;
    }

    return sanitized;
}

function isBuiltInInjectionMode(value: unknown): value is InjectionMode {
    return value === 'settings' || value === 'synchronize' || value === 'plugin';
}

export function sanitizeBuiltInInjectionConfig(
    injection: unknown,
): InjectionConfig | undefined {
    if (!injection || typeof injection !== 'object' || Array.isArray(injection)) {
        return undefined;
    }

    const source = injection as Record<string, unknown>;
    const sanitized: InjectionConfig = {};
    for (const key of BUILT_IN_INJECTION_KEYS) {
        const mode = source[key];
        if (isBuiltInInjectionMode(mode)) {
            sanitized[key] = mode;
        }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
