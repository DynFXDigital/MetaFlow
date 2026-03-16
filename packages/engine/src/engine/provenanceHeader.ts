/**
 * Provenance header generator and parser.
 *
 * Generates machine-readable HTML comment blocks for Synchronized files
 * and parses them back for drift detection and provenance tracking.
 *
 * Pure TypeScript — no VS Code imports.
 */

/** Provenance data embedded in Synchronized files. */
export interface ProvenanceData {
    /** ISO-8601 timestamp of last sync. */
    synced: string;
    /** Source repository URL or local path. */
    sourceRepo?: string;
    /** Source commit SHA. */
    sourceCommit?: string;
    /** Scope / layer path. */
    scope?: string;
    /** Layers that contribute to this file (in precedence order). */
    layers?: string[];
    /** Active profile at time of sync. */
    profile?: string;
    /** SHA-256 content hash (of body after header removal). */
    contentHash: string;
}

const HEADER_START = '<!-- metaflow:provenance';
const HEADER_END = '-->';

function encodeValue(value: string): string {
    return encodeURIComponent(value);
}

function decodeValue(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Generate a provenance header comment block.
 *
 * @param data Provenance data to embed.
 * @returns The provenance comment block string (with trailing newline).
 */
export function generateProvenanceHeader(data: ProvenanceData): string {
    const fields: string[] = [`synced=${encodeValue(data.synced)}`];
    if (data.sourceRepo) {
        fields.push(`source-repo=${encodeValue(data.sourceRepo)}`);
    }
    if (data.sourceCommit) {
        fields.push(`source-commit=${encodeValue(data.sourceCommit)}`);
    }
    if (data.scope) {
        fields.push(`scope=${encodeValue(data.scope)}`);
    }
    if (data.layers && data.layers.length > 0) {
        fields.push(`layers=${encodeValue(data.layers.join(','))}`);
    }
    if (data.profile) {
        fields.push(`profile=${encodeValue(data.profile)}`);
    }
    fields.push(`content-hash=${encodeValue(data.contentHash)}`);
    return `${HEADER_START} ${fields.join(' ')} ${HEADER_END}\n`;
}

/**
 * Parse a provenance header from file content.
 *
 * @param content Full file content.
 * @returns Parsed provenance data, or `null` if no provenance header found.
 */
export function parseProvenanceHeader(content: string): ProvenanceData | null {
    const startIdx = content.indexOf(HEADER_START);
    if (startIdx === -1) {
        return null;
    }
    const endIdx = content.indexOf(HEADER_END, startIdx + HEADER_START.length);
    if (endIdx === -1) {
        return null;
    }

    const data: Partial<ProvenanceData> = {};
    const block = content.substring(startIdx + HEADER_START.length, endIdx).trim();

    if (block.includes('=')) {
        const tokens = block.split(/\s+/).filter((t) => t.length > 0);
        for (const token of tokens) {
            const eqIdx = token.indexOf('=');
            if (eqIdx === -1) {
                continue;
            }
            const key = token.substring(0, eqIdx).trim();
            const value = decodeValue(token.substring(eqIdx + 1).trim());

            switch (key) {
                case 'synced':
                    data.synced = value;
                    break;
                case 'source-repo':
                    data.sourceRepo = value;
                    break;
                case 'source-commit':
                    data.sourceCommit = value;
                    break;
                case 'scope':
                    data.scope = value;
                    break;
                case 'layers':
                    data.layers = value
                        .split(',')
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                    break;
                case 'profile':
                    data.profile = value;
                    break;
                case 'content-hash':
                    data.contentHash = value;
                    break;
            }
        }
    } else {
        const lines = block
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) {
                continue;
            }
            const key = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim();

            switch (key) {
                case 'synced':
                    data.synced = value;
                    break;
                case 'source-repo':
                    data.sourceRepo = value;
                    break;
                case 'source-commit':
                    data.sourceCommit = value;
                    break;
                case 'scope':
                    data.scope = value;
                    break;
                case 'layers':
                    data.layers = value
                        .split(',')
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                    break;
                case 'profile':
                    data.profile = value;
                    break;
                case 'content-hash':
                    data.contentHash = value;
                    break;
            }
        }
    }

    if (!data.synced || !data.contentHash) {
        return null; // required fields missing
    }

    return data as ProvenanceData;
}

/**
 * Strip the provenance header from file content, returning only the body.
 *
 * @param content Full file content.
 * @returns Content without the provenance header.
 */
export function stripProvenanceHeader(content: string): string {
    const startIdx = content.indexOf(HEADER_START);
    if (startIdx === -1) {
        return content;
    }
    const endIdx = content.indexOf(HEADER_END, startIdx + HEADER_START.length);
    if (endIdx === -1) {
        return content;
    }
    let removalEnd = endIdx + HEADER_END.length;
    if (removalEnd < content.length && content[removalEnd] === '\n') {
        removalEnd += 1;
    }

    let prefix = content.substring(0, startIdx);
    const suffix = content.substring(removalEnd);

    // If provenance is a footer and we inserted a blank separator line,
    // remove one separator newline so body hashing stays stable.
    if (suffix.length === 0 && prefix.endsWith('\n\n')) {
        prefix = prefix.slice(0, -1);
    }

    return prefix + suffix;
}
