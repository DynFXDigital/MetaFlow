import * as path from 'path';

export function resolveRepoDisplayLabel(
    repoId: string,
    configName: string | undefined,
    localPath: string | undefined,
    manifestName?: string,
): string {
    const trimmedConfigName = configName?.trim();
    if (trimmedConfigName && trimmedConfigName !== repoId) {
        return trimmedConfigName;
    }

    const trimmedManifestName = manifestName?.trim();
    if (trimmedManifestName) {
        return trimmedManifestName;
    }

    const baseName = localPath ? path.basename(localPath.replace(/[\\/]+$/, '')) : '';
    return baseName || repoId;
}
