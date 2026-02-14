import { Command } from 'commander';
import * as path from 'path';
import { checkAllDrift, loadManagedState, EffectiveFile } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit, resolveEffectiveFiles } from './common';

function slugToken(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

function getLayerToken(file: EffectiveFile): string {
    const sourceLayer = file.sourceLayer.replace(/\\/g, '/');
    const sourceRepo = (file.sourceRepo ?? '').replace(/\\/g, '/');

    if (sourceRepo && sourceLayer.startsWith(`${sourceRepo}/`)) {
        return sourceLayer.slice(sourceRepo.length + 1);
    }

    return sourceLayer;
}

function toMaterializedRelativePath(file: EffectiveFile): string {
    const normalizedPath = file.relativePath.replace(/\\/g, '/');
    const dirName = path.posix.dirname(normalizedPath);
    const baseName = path.posix.basename(normalizedPath);

    const repoToken = slugToken(file.sourceRepo ?? 'default') || 'default';
    const layerToken = slugToken(getLayerToken(file)) || 'layer';
    const prefixedBaseName = `_${repoToken}-${layerToken}__${baseName}`;

    if (dirName === '.' || dirName === '') {
        return prefixedBaseName;
    }

    return `${dirName}/${prefixedBaseName}`;
}

export function registerValidateCommand(program: Command): void {
    program
        .command('validate')
        .description('Validate managed files match expected overlay state (for CI)')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const workspaceRoot = getWorkspaceRoot(program);

            // Check config first
            const loaded = loadConfigOrExit(workspaceRoot);
            if (!loaded) {
                return;
            }
            const { config } = loaded;

            // Resolve expected overlay state
            const files = resolveEffectiveFiles(config, workspaceRoot);
            const expectedMaterialized = new Set(
                files
                    .filter(f => f.classification === 'materialized')
                    .map(f => toMaterializedRelativePath(f))
            );

            // Load current managed state
            const state = loadManagedState(workspaceRoot);
            const tracked = Object.keys(state.files);

            // Check drift on all tracked files
            const drift = checkAllDrift(workspaceRoot, '.github', state);
            const drifted = drift.filter(d => d.status === 'drifted');
            const missing = drift.filter(d => d.status === 'missing');

            // Check for files that should be tracked but aren't
            const trackedSet = new Set(tracked);
            const unmanaged = [...expectedMaterialized].filter(f => !trackedSet.has(f));

            // Check for tracked files that are no longer expected
            const stale = tracked.filter(f => !expectedMaterialized.has(f));

            const isValid = drifted.length === 0 && missing.length === 0 &&
                            unmanaged.length === 0 && stale.length === 0;

            if (options.json) {
                const data = {
                    valid: isValid,
                    summary: {
                        expected: expectedMaterialized.size,
                        tracked: tracked.length,
                        drifted: drifted.length,
                        missing: missing.length,
                        unmanaged: unmanaged.length,
                        stale: stale.length,
                    },
                    drifted: drifted.map(d => d.relativePath),
                    missing: missing.map(d => d.relativePath),
                    unmanaged,
                    stale,
                };
                console.log(JSON.stringify(data, null, 2));
            } else {
                if (isValid) {
                    console.log(`Validation passed: ${tracked.length} managed files in sync.`);
                } else {
                    console.log('Validation failed:');
                    if (drifted.length > 0) {
                        console.log(`  ${drifted.length} drifted file(s):`);
                        for (const d of drifted) {
                            console.log(`    - ${d.relativePath}`);
                        }
                    }
                    if (missing.length > 0) {
                        console.log(`  ${missing.length} missing file(s):`);
                        for (const d of missing) {
                            console.log(`    - ${d.relativePath}`);
                        }
                    }
                    if (unmanaged.length > 0) {
                        console.log(`  ${unmanaged.length} unmanaged file(s) (need 'apply'):`);
                        for (const f of unmanaged) {
                            console.log(`    - ${f}`);
                        }
                    }
                    if (stale.length > 0) {
                        console.log(`  ${stale.length} stale file(s) (no longer in overlay):`);
                        for (const f of stale) {
                            console.log(`    - ${f}`);
                        }
                    }
                }
            }

            if (!isValid) {
                process.exitCode = 1;
            }
        });
}
