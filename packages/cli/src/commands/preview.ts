import { Command } from 'commander';
import { computeSettingsEntries, preview } from '@metaflow/engine';
import {
    formatSurfacedConflictWarnings,
    getWorkspaceRoot,
    loadConfigOrExit,
    resolveEffectiveFiles,
    resolveSurfacedFileConflicts,
} from './common';

function formatFileProvenance(sourceLayer: string, sourceRepo?: string): string {
    return sourceRepo ? `${sourceLayer} (${sourceRepo})` : sourceLayer;
}

function summarizeSources(files: Array<{ sourceLayer: string; sourceRepo?: string }>): string[] {
    const counts = new Map<string, number>();

    for (const file of files) {
        const label = formatFileProvenance(file.sourceLayer, file.sourceRepo);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }))
        .map(([label, count]) => `${label}: ${count}`);
}

function summarizeSettingsEntries(
    entries: Array<{ key: string; value: string | string[] | Record<string, boolean> }>,
): string[] {
    return entries
        .map((entry) => {
            const locations = Array.isArray(entry.value)
                ? entry.value
                : typeof entry.value === 'string'
                  ? [entry.value]
                  : Object.keys(entry.value);
            const joinedLocations = locations
                .sort((left, right) => left.localeCompare(right))
                .join(', ');
            return `${entry.key}: ${joinedLocations}`;
        })
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function registerPreviewCommand(program: Command): void {
    program
        .command('preview')
        .description('Preview effective files and pending changes')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config } = loaded;
            const files = resolveEffectiveFiles(config, workspaceRoot);
            const changes = preview(workspaceRoot, files);
            const conflicts = resolveSurfacedFileConflicts(config, workspaceRoot);
            const warnings = formatSurfacedConflictWarnings(conflicts);
            const settingsEntries = computeSettingsEntries(files, workspaceRoot, config);
            const settingsEntrySummary = summarizeSettingsEntries(settingsEntries);
            const sourceSummary = summarizeSources(files);
            const settingsCount = files.filter((file) => file.classification === 'settings').length;
            const synchronizedCount = files.length - settingsCount;

            if (options.json) {
                const data = {
                    summary: {
                        total: files.length,
                        settings: settingsCount,
                        synchronized: synchronizedCount,
                        sourceCount: sourceSummary.length,
                    },
                    effectiveFiles: files.map((f) => ({
                        relativePath: f.relativePath,
                        classification: f.classification,
                        sourceLayer: f.sourceLayer,
                        sourceRepo: f.sourceRepo ?? null,
                    })),
                    pendingChanges: changes.map((c) => ({
                        relativePath: c.relativePath,
                        action: c.action,
                        reason: c.reason ?? null,
                    })),
                    settingsEntries,
                    sources: sourceSummary,
                    surfacedFileConflicts: conflicts,
                    warnings,
                };
                console.log(JSON.stringify(data, null, 2));
                return;
            }

            if (files.length === 0) {
                console.log('No files in overlay.');
                return;
            }

            console.log('Effective files:');
            for (const f of files) {
                console.log(
                    `  [${f.classification}] ${f.relativePath} @ ${formatFileProvenance(f.sourceLayer, f.sourceRepo)}`,
                );
            }
            console.log(
                `\nSummary: ${files.length} total (${settingsCount} settings, ${synchronizedCount} synchronized)`,
            );
            if (settingsEntrySummary.length > 0) {
                console.log(`Settings Entries: ${settingsEntrySummary.length}`);
                for (const summary of settingsEntrySummary) {
                    console.log(`  - ${summary}`);
                }
            }
            if (sourceSummary.length > 0) {
                console.log(`Sources: ${sourceSummary.length}`);
                for (const source of sourceSummary) {
                    console.log(`  - ${source}`);
                }
            }

            if (changes.length > 0) {
                console.log(`\nPending changes (${changes.length}):`);
                for (const c of changes) {
                    const suffix = c.reason ? ` (${c.reason})` : '';
                    console.log(`  ${c.action} ${c.relativePath}${suffix}`);
                }
            }

            if (warnings.length > 0) {
                console.log(`\nWarnings (${warnings.length}):`);
                for (const warning of warnings) {
                    console.log(`  ! ${warning}`);
                }
            }
        });
}
