import * as path from 'path';
import * as fs from 'fs';

export const BUILT_IN_CAPABILITY_STATE_KEY = 'metaflow.builtInCapability.v1';
export const BUILT_IN_CAPABILITY_REPO_ID = '__metaflow_builtin__';
export const BUILT_IN_CAPABILITY_LAYER_PATH = '.github';
export const BUILT_IN_CAPABILITY_LAYER_LABEL = 'MetaFlow';

export interface BuiltInCapabilityWorkspaceState {
    enabled?: boolean;
    layerEnabled?: boolean;
    synchronizedFiles?: string[];
}

export interface BuiltInCapabilityRuntimeState {
    enabled: boolean;
    layerEnabled: boolean;
    synchronizedFiles: string[];
    sourceRoot?: string;
    sourceId: string;
    sourceDisplayName: string;
}

export interface BuiltInCapabilityActivationState {
    enabled: boolean;
    layerEnabled: boolean;
    synchronizedFiles: string[];
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
        synchronizedFiles: sanitizeSynchronizedFiles(payload?.synchronizedFiles),
        sourceRoot,
        sourceId,
        sourceDisplayName,
    };
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

    // Keep the node visible even when the layer is unchecked so users can re-enable it.
    return state.synchronizedFiles.length > 0;
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
