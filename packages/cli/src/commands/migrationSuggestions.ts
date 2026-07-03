import * as path from 'path';
import { Command } from 'commander';
import { LayerContent, resolveLayers } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit } from './common';

interface MigrationSuggestionsOptions {
    json?: boolean;
}

interface MigrationSuggestion {
    sourcePath: string;
    sourceLayer: string;
    sourceRepo?: string;
    sourceFormat: 'legacy' | 'codex' | 'github-copilot';
    canonicalPath: string;
    canonicalKind:
        | 'capabilityNarrative'
        | 'instruction'
        | 'prompt'
        | 'skill'
        | 'agent'
        | 'projectConfig'
        | 'hook';
    action: 'create' | 'review-duplicate';
    lossiness: 'none' | 'manual-review';
    note: string;
}

interface MigrationSuggestionsReport {
    generatedBy: string;
    managed: false;
    writesFiles: false;
    summary: {
        suggestions: number;
        duplicates: number;
        byCanonicalKind: Record<string, number>;
    };
    suggestions: MigrationSuggestion[];
    warnings: string[];
}

interface MigrationSource {
    sourcePath: string;
    sourceLayer: string;
    sourceRepo?: string;
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function stripKnownMarkdownSuffix(fileName: string): string {
    return fileName
        .replace(/\.prompt\.md$/i, '')
        .replace(/\.instructions\.md$/i, '')
        .replace(/\.md$/i, '');
}

function slugFromFileName(fileName: string, fallback: string): string {
    const base = stripKnownMarkdownSuffix(path.posix.basename(fileName));
    const slug = base
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function buildSuggestion(source: MigrationSource): Omit<MigrationSuggestion, 'action'> | undefined {
    const sourcePath = normalizeRelativePath(source.sourcePath);
    if (sourcePath.startsWith('.metaflow/')) {
        return undefined;
    }

    const provenance = {
        sourcePath,
        sourceLayer: source.sourceLayer,
        ...(source.sourceRepo ? { sourceRepo: source.sourceRepo } : {}),
    };

    if (sourcePath === 'CAPABILITY.md') {
        return {
            ...provenance,
            sourceFormat: 'legacy',
            canonicalPath: '.metaflow/README.md',
            canonicalKind: 'capabilityNarrative',
            lossiness: 'manual-review',
            note: 'Move human-readable capability narrative into .metaflow/README.md and review structured identity for .metaflow/capability.json.',
        };
    }

    if (sourcePath === 'AGENTS.md' || sourcePath === 'AGENTS.override.md') {
        const id = sourcePath === 'AGENTS.override.md' ? 'agents-override' : 'agents';
        return {
            ...provenance,
            sourceFormat: 'codex',
            canonicalPath: `.metaflow/instructions/${id}.md`,
            canonicalKind: 'instruction',
            lossiness: 'manual-review',
            note: 'Codex project instructions can be represented as canonical instructions with Codex target constraints.',
        };
    }

    const githubInstruction = sourcePath.match(/^\.github\/instructions\/([^/]+\.md)$/);
    if (githubInstruction) {
        const id = slugFromFileName(githubInstruction[1], 'instruction');
        return {
            ...provenance,
            sourceFormat: 'github-copilot',
            canonicalPath: `.metaflow/instructions/${id}.md`,
            canonicalKind: 'instruction',
            lossiness: 'manual-review',
            note: 'Review applyTo and target constraints before converting Copilot instructions to canonical instructions.',
        };
    }

    const legacyInstruction = sourcePath.match(/^instructions\/([^/]+\.md)$/);
    if (legacyInstruction) {
        const id = slugFromFileName(legacyInstruction[1], 'instruction');
        return {
            ...provenance,
            sourceFormat: 'legacy',
            canonicalPath: `.metaflow/instructions/${id}.md`,
            canonicalKind: 'instruction',
            lossiness: 'manual-review',
            note: 'Review target constraints before converting legacy instruction Markdown to canonical instructions.',
        };
    }

    const prompt = sourcePath.match(/^(?:\.github\/)?prompts\/([^/]+\.md)$/);
    if (prompt) {
        const id = slugFromFileName(prompt[1], 'prompt');
        return {
            ...provenance,
            sourceFormat: sourcePath.startsWith('.github/') ? 'github-copilot' : 'legacy',
            canonicalPath: `.metaflow/prompts/${id}.md`,
            canonicalKind: 'prompt',
            lossiness: 'manual-review',
            note: 'Review prompt variables and target constraints before converting to canonical prompt metadata.',
        };
    }

    const skill = sourcePath.match(
        /^(?:(?:\.github\/(?:\.agents\/)?|\.?agents\/)|\.github\/)skills\/([^/]+)\/SKILL\.md$/,
    );
    if (skill) {
        return {
            ...provenance,
            sourceFormat: sourcePath.startsWith('.github/') ? 'github-copilot' : 'codex',
            canonicalPath: `.metaflow/skills/${skill[1]}/SKILL.md`,
            canonicalKind: 'skill',
            lossiness: 'none',
            note: 'Repository skills are the most portable first-class migration target.',
        };
    }

    const codexAgent = sourcePath.match(/^\.codex\/agents\/([^/]+)\.toml$/);
    if (codexAgent) {
        return {
            ...provenance,
            sourceFormat: 'codex',
            canonicalPath: `.metaflow/agents/${codexAgent[1]}.json`,
            canonicalKind: 'agent',
            lossiness: 'manual-review',
            note: 'Codex agent TOML requires manual review before conversion to canonical agent profile JSON.',
        };
    }

    if (sourcePath === '.codex/config.toml') {
        return {
            ...provenance,
            sourceFormat: 'codex',
            canonicalPath: '.metaflow/project-config/default.json',
            canonicalKind: 'projectConfig',
            lossiness: 'manual-review',
            note: 'Project config controls policy-sensitive Codex behavior and requires explicit review before canonicalization.',
        };
    }

    if (sourcePath === '.codex/hooks.json') {
        return {
            ...provenance,
            sourceFormat: 'codex',
            canonicalPath: '.metaflow/hooks/codex-hooks.json',
            canonicalKind: 'hook',
            lossiness: 'manual-review',
            note: 'Hook semantics and failure behavior require manual review before conversion to canonical hook metadata.',
        };
    }

    return undefined;
}

function collectMigrationSources(layers: LayerContent[]): MigrationSource[] {
    const sources: MigrationSource[] = [];
    for (const layer of layers) {
        const capabilityManifestPath = layer.capability?.manifestPath.replace(/\\/g, '/');
        if (capabilityManifestPath?.endsWith('/CAPABILITY.md')) {
            sources.push({
                sourcePath: 'CAPABILITY.md',
                sourceLayer: layer.layerId,
                ...(layer.repoId ? { sourceRepo: layer.repoId } : {}),
            });
        }
        for (const file of layer.files) {
            sources.push({
                sourcePath: normalizeRelativePath(file.sourceRelativePath ?? file.relativePath),
                sourceLayer: layer.layerId,
                ...(layer.repoId ? { sourceRepo: layer.repoId } : {}),
            });
        }
    }
    return sources;
}

function buildMigrationSuggestionsReport(layers: LayerContent[]): MigrationSuggestionsReport {
    const sources = collectMigrationSources(layers);
    const canonicalPaths = new Set(sources.map((source) => normalizeRelativePath(source.sourcePath)));
    const suggestions: MigrationSuggestion[] = [];
    const warnings: string[] = [];

    for (const source of sources) {
        const suggestion = buildSuggestion(source);
        if (!suggestion) {
            continue;
        }
        const action = canonicalPaths.has(suggestion.canonicalPath) ? 'review-duplicate' : 'create';
        suggestions.push({ ...suggestion, action });
        if (action === 'review-duplicate') {
            warnings.push(
                `${suggestion.sourcePath} maps to ${suggestion.canonicalPath}, but that canonical path already exists. Review duplicate native and canonical copies before migration.`,
            );
        }
    }

    suggestions.sort((left, right) =>
        left.canonicalPath.localeCompare(right.canonicalPath, undefined, {
            sensitivity: 'base',
        }),
    );

    const byCanonicalKind: Record<string, number> = {};
    for (const suggestion of suggestions) {
        byCanonicalKind[suggestion.canonicalKind] =
            (byCanonicalKind[suggestion.canonicalKind] ?? 0) + 1;
    }

    return {
        generatedBy: 'metaflow migration-suggestions',
        managed: false,
        writesFiles: false,
        summary: {
            suggestions: suggestions.length,
            duplicates: suggestions.filter((suggestion) => suggestion.action === 'review-duplicate')
                .length,
            byCanonicalKind,
        },
        suggestions,
        warnings,
    };
}

function formatReport(report: MigrationSuggestionsReport): string {
    const lines = [
        'MetaFlow Migration Suggestions',
        '',
        `Suggestions: ${report.summary.suggestions}`,
        `Duplicate review items: ${report.summary.duplicates}`,
        'Writes files: no',
    ];

    if (report.suggestions.length === 0) {
        lines.push('', 'No legacy or host-native metadata migration suggestions found.');
    } else {
        lines.push('', 'Suggested canonical candidates:');
        for (const suggestion of report.suggestions) {
            lines.push(
                `- ${suggestion.sourcePath} -> ${suggestion.canonicalPath} (${suggestion.canonicalKind}, ${suggestion.sourceFormat}, ${suggestion.lossiness}, ${suggestion.action})`,
            );
            lines.push(`  ${suggestion.note}`);
        }
    }

    if (report.warnings.length > 0) {
        lines.push('', 'Warnings:');
        for (const warning of report.warnings) {
            lines.push(`- ${warning}`);
        }
    }

    return `${lines.join('\n')}\n`;
}

export function registerMigrationSuggestionsCommand(program: Command): void {
    program
        .command('migration-suggestions')
        .description('Suggest non-destructive canonical .metaflow migration candidates')
        .option('--json', 'Output the full migration suggestion report as JSON')
        .action((options: MigrationSuggestionsOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }

            const report = buildMigrationSuggestionsReport(
                resolveLayers(loaded.config, workspaceRoot),
            );
            const payload = options.json
                ? `${JSON.stringify(report, null, 2)}\n`
                : formatReport(report);
            process.stdout.write(payload);
        });
}
