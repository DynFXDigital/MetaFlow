/**
 * Repository manifest parser/loader.
 *
 * Optional repo-root METAFLOW.md frontmatter contract:
 * - optional: name, description
 */

import * as fs from 'fs';
import * as path from 'path';
import { RepoMetadata } from './types';

const REPO_MANIFEST_FILE_NAME = 'METAFLOW.md';

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return trimmed.slice(1, -1);
        }
    }
    return trimmed;
}

/**
 * Parse METAFLOW.md content into normalized repository metadata.
 *
 * Missing or malformed frontmatter is tolerated. Callers simply receive any
 * markdown body without structured metadata in that case.
 */
export function parseRepoManifestContent(rawText: string, manifestPath: string): RepoMetadata {
    const normalized = rawText.replace(/^\uFEFF/, '');
    const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

    if (!frontmatterMatch) {
        return {
            manifestPath,
            body: normalized,
        };
    }

    const [, frontmatterBody, markdownBody] = frontmatterMatch;
    const fields: Record<string, string> = {};

    for (const rawLine of frontmatterBody.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith('#')) {
            continue;
        }

        const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (!keyValueMatch) {
            continue;
        }

        const [, key, rawValue] = keyValueMatch;
        fields[key] = stripQuotes(rawValue);
    }

    return {
        manifestPath,
        name: fields.name?.trim() || undefined,
        description: fields.description?.trim() || undefined,
        body: markdownBody,
    };
}

/**
 * Load METAFLOW.md from a repository root when present.
 */
export function loadRepoManifestForRoot(repoRoot: string): RepoMetadata | undefined {
    const manifestPath = path.join(repoRoot, REPO_MANIFEST_FILE_NAME);
    if (!fs.existsSync(manifestPath)) {
        return undefined;
    }

    try {
        const rawText = fs.readFileSync(manifestPath, 'utf-8');
        return parseRepoManifestContent(rawText, manifestPath);
    } catch {
        return {
            manifestPath,
        };
    }
}

export const repoManifestConstants = {
    REPO_MANIFEST_FILE_NAME,
};
