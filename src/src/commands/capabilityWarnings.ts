export interface CapabilityWarningLike {
    code: string;
    message: string;
    filePath?: string;
}

export function formatCapabilityWarningMessage(warning: CapabilityWarningLike): string {
    const legacyCode =
        warning.code === 'CAPABILITY_FRONTMATTER_MISSING'
            ? 'CAPABILITY_NO_FRONTMATTER'
            : warning.code;
    const normalizedPath = warning.filePath?.replace(/\\/g, '/');
    const location = normalizedPath ? ` [${normalizedPath}]` : '';
    return `[${legacyCode}] ${warning.message}${location}`;
}
