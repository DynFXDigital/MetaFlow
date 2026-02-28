export interface CapabilityWarningLike {
    code: string;
    message: string;
    filePath?: string;
}

export function formatCapabilityWarningMessage(warning: CapabilityWarningLike): string {
    const location = warning.filePath ? ` [${warning.filePath}]` : '';
    return `[${warning.code}] ${warning.message}${location}`;
}
