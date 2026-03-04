import * as path from 'path';
import * as fs from 'fs';

export const BUILT_IN_CAPABILITY_STATE_KEY = 'metaflow.builtInCapability.v1';
export const BUILT_IN_CAPABILITY_LEGACY_ENABLED_KEY = 'metaflow.builtInCapability.enabled';
export const BUILT_IN_CAPABILITY_REPO_ID = '__metaflow_builtin__';
export const BUILT_IN_CAPABILITY_REPO_LABEL = 'MetaFlow capability (built-in)';
export const BUILT_IN_CAPABILITY_LAYER_PATH = '.github';

export interface BuiltInCapabilityWorkspaceState {
    enabled?: boolean;
    layerEnabled?: boolean;
    materializedFiles?: string[];
}

export interface BuiltInCapabilityRuntimeState {
    enabled: boolean;
    layerEnabled: boolean;
    materializedFiles: string[];
    sourceRoot?: string;
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
    extensionPath: string
): BuiltInCapabilityRuntimeState {
    const payload = workspaceState.get<BuiltInCapabilityWorkspaceState>(BUILT_IN_CAPABILITY_STATE_KEY);
    const legacyEnabled = workspaceState.get<boolean>(BUILT_IN_CAPABILITY_LEGACY_ENABLED_KEY);
    const sourceRoot = resolveBuiltInCapabilitySourceRoot(extensionPath);
    const enabled = sourceRoot
        ? (payload?.enabled ?? legacyEnabled ?? false)
        : false;

    return {
        enabled,
        layerEnabled: payload?.layerEnabled ?? true,
        materializedFiles: sanitizeMaterializedFiles(payload?.materializedFiles),
        sourceRoot,
    };
}

export function sanitizeMaterializedFiles(values: string[] | undefined): string[] {
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
