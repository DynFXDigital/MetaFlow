import { Command } from 'commander';
import {
    apply,
    planSynchronization,
    ProjectionMetadata,
} from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';

function formatTargetLabel(projection: ProjectionMetadata | undefined): string {
    if (
        !projection ||
        projection.target === 'generic' ||
        projection.target === 'metaflow'
    ) {
        return '';
    }
    return `[${projection.target}] `;
}

function formatApplyPath(
    relPath: string,
    projectionsByDestination: Map<string, ProjectionMetadata>,
): string {
    return `${formatTargetLabel(projectionsByDestination.get(relPath))}${relPath}`;
}

export function registerApplyCommand(program: Command): void {
    program
        .command('apply')
        .description('Synchronize overlay outputs to .github')
        .option('-f, --force', 'Overwrite drifted files')
        .action((options: { force?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            try {
                const { config } = loaded;
                const files = resolveEffectiveFiles(config, workspaceRoot);
                const plan = planSynchronization({
                    workspaceRoot,
                    effectiveFiles: files,
                    fileNamingStrategy: config.fileNamingStrategy,
                    layerSources: config.layerSources,
                });
                const projectionsByDestination = new Map<string, ProjectionMetadata>(
                    plan.synchronizedFiles.map((entry) => [
                        entry.destinationRelativePath,
                        entry.projection,
                    ]),
                );

                const result = apply({
                    workspaceRoot,
                    effectiveFiles: files,
                    activeProfile: config.activeProfile,
                    fileNamingStrategy: config.fileNamingStrategy,
                    layerSources: config.layerSources,
                    force: options.force ?? false,
                });

                for (const rel of result.written) {
                    console.log(`write  ${formatApplyPath(rel, projectionsByDestination)}`);
                }
                for (const rel of result.removed) {
                    console.log(`remove ${formatApplyPath(rel, projectionsByDestination)}`);
                }
                for (const rel of result.skipped) {
                    console.log(`skip   ${formatApplyPath(rel, projectionsByDestination)}`);
                }

                if (result.warnings.length > 0) {
                    for (const w of result.warnings) {
                        console.warn(`Warning: ${w}`);
                    }
                }

                console.log(
                    `\nDone: ${result.written.length} written, ${result.removed.length} removed, ${result.skipped.length} skipped.`,
                );
            } catch (err: unknown) {
                console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
                process.exitCode = 1;
            }
        });
}
