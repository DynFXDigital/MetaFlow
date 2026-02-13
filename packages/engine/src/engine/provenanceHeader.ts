/**
 * Provenance header generator and parser.
 *
 * Generates machine-readable HTML comment blocks for materialized files
 * and parses them back for drift detection and provenance tracking.
 *
 * Pure TypeScript — no VS Code imports.
 */

/** Provenance data embedded in materialized files. */
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

/**
 * Generate a provenance header comment block.
 *
 * @param data Provenance data to embed.
 * @returns The provenance comment block string (with trailing newline).
 */
export function generateProvenanceHeader(data: ProvenanceData): string {
    const lines: string[] = [HEADER_START];
    lines.push(`synced: ${data.synced}`);
    if (data.sourceRepo) {
        lines.push(`source-repo: ${data.sourceRepo}`);
    }
    if (data.sourceCommit) {
        lines.push(`source-commit: ${data.sourceCommit}`);
    }
    if (data.scope) {
        lines.push(`scope: ${data.scope}`);
    }
    if (data.layers && data.layers.length > 0) {
        lines.push(`layers: ${data.layers.join(', ')}`);
    }
    if (data.profile) {
        lines.push(`profile: ${data.profile}`);
    }
    lines.push(`content-hash: ${data.contentHash}`);
    lines.push(HEADER_END);
    return lines.join('\n') + '\n';
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

    const block = content.substring(startIdx + HEADER_START.length, endIdx).trim();
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const data: Partial<ProvenanceData> = {};
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
                data.layers = value.split(',').map(s => s.trim());
                break;
            case 'profile':
                data.profile = value;
                break;
            case 'content-hash':
                data.contentHash = value;
                break;
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
    // Remove from start of header through end marker + newline
    const afterEnd = endIdx + HEADER_END.length;
    const suffix = content.substring(afterEnd);
    const prefix = content.substring(0, startIdx);
    // Trim leading newline from body
    const body = (prefix + suffix).replace(/^\n/, '');
    return body;
}