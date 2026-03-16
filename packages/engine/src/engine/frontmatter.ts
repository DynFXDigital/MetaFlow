/**
 * Generic YAML front-matter parser for metadata files.
 *
 * Extracts key-value pairs from files delimited by --- markers.
 * Used to surface name/description/applyTo from instructions, prompts,
 * agents, skills, and similar Markdown-based config files.
 */

export interface FrontmatterResult {
    /** Parsed key-value pairs from front-matter. */
    fields: Record<string, string>;
    /** Markdown body after the closing --- delimiter. */
    body: string;
}

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
 * Parse YAML front-matter from a raw text string.
 * Returns undefined when no valid front-matter delimiters are found.
 */
export function parseFrontmatter(rawText: string): FrontmatterResult | undefined {
    const normalized = rawText.replace(/^\uFEFF/, '');

    if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
        return undefined;
    }

    const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        return undefined;
    }

    const [, frontmatterBody, markdownBody] = match;
    const fields: Record<string, string> = {};

    for (const line of frontmatterBody.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
            continue;
        }
        const kvMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (kvMatch) {
            fields[kvMatch[1]] = stripQuotes(kvMatch[2]);
        }
    }

    return { fields, body: markdownBody };
}
