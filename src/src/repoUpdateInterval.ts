export type RepoUpdateCheckInterval = 'hourly' | 'daily' | 'weekly' | 'monthly';

export const DEFAULT_REPO_UPDATE_CHECK_INTERVAL: RepoUpdateCheckInterval = 'daily';

export function normalizeRepoUpdateCheckInterval(value: unknown): RepoUpdateCheckInterval {
    if (value === 'hourly' || value === 'daily' || value === 'weekly' || value === 'monthly') {
        return value;
    }
    return DEFAULT_REPO_UPDATE_CHECK_INTERVAL;
}

export function getRepoUpdateCheckIntervalMs(interval: RepoUpdateCheckInterval): number {
    const hourMs = 60 * 60 * 1000;
    switch (interval) {
        case 'hourly':
            return hourMs;
        case 'daily':
            return 24 * hourMs;
        case 'weekly':
            return 7 * 24 * hourMs;
        case 'monthly':
            return 30 * 24 * hourMs;
        default:
            return 24 * hourMs;
    }
}
