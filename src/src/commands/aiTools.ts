export interface AiToolsCompatibility {
    supported: boolean;
    minVersion: string;
    currentVersion: string;
    reason?: string;
}

const MIN_AI_TOOLS_VSCODE_VERSION = '1.109.0';

export function getAiToolsMinVersion(): string {
    return MIN_AI_TOOLS_VSCODE_VERSION;
}

export function evaluateAiToolsCompatibility(currentVersion: string): AiToolsCompatibility {
    const supported = compareVersions(currentVersion, MIN_AI_TOOLS_VSCODE_VERSION) >= 0;
    if (supported) {
        return {
            supported: true,
            minVersion: MIN_AI_TOOLS_VSCODE_VERSION,
            currentVersion,
        };
    }

    return {
        supported: false,
        minVersion: MIN_AI_TOOLS_VSCODE_VERSION,
        currentVersion,
        reason: `Requires VS Code ${MIN_AI_TOOLS_VSCODE_VERSION}+`,
    };
}

function compareVersions(a: string, b: string): number {
    const aParts = normalizeVersion(a);
    const bParts = normalizeVersion(b);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i += 1) {
        const aValue = aParts[i] ?? 0;
        const bValue = bParts[i] ?? 0;
        if (aValue > bValue) {
            return 1;
        }
        if (aValue < bValue) {
            return -1;
        }
    }

    return 0;
}

function normalizeVersion(value: string): number[] {
    return value
        .split('.')
        .map(part => part.trim())
        .map(part => Number.parseInt(part, 10))
        .map(part => (Number.isFinite(part) ? part : 0));
}
