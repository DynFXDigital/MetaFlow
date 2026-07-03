import { Command } from 'commander';
import {
    getTargetCapabilityMatrix,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportStatus,
} from '@metaflow/engine';

interface TargetSupportOptions {
    json?: boolean;
    target?: string;
    concept?: string;
    support?: TargetCapabilitySupportStatus;
}

const SUPPORT_VALUES = new Set<TargetCapabilitySupportStatus>([
    'supported',
    'partial',
    'generated-substitute',
    'requires-policy-grant',
    'unsupported',
    'runtime-only',
]);

function sortEntries(entries: TargetCapabilityMatrixEntry[]): TargetCapabilityMatrixEntry[] {
    return [...entries].sort((left, right) => {
        const targetCompare = left.target.localeCompare(right.target, undefined, {
            sensitivity: 'base',
        });
        if (targetCompare !== 0) {
            return targetCompare;
        }
        return left.concept.localeCompare(right.concept, undefined, { sensitivity: 'base' });
    });
}

function filterEntries(
    entries: TargetCapabilityMatrixEntry[],
    options: TargetSupportOptions,
): TargetCapabilityMatrixEntry[] {
    return sortEntries(
        entries.filter((entry) => {
            if (options.target && entry.target !== options.target) {
                return false;
            }
            if (options.concept && entry.concept !== options.concept) {
                return false;
            }
            if (options.support && entry.support !== options.support) {
                return false;
            }
            return true;
        }),
    );
}

function summarizeByTarget(entries: TargetCapabilityMatrixEntry[]): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const entry of entries) {
        summary[entry.target] = (summary[entry.target] ?? 0) + 1;
    }
    return Object.fromEntries(
        Object.entries(summary).sort((left, right) =>
            left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
        ),
    );
}

function printEntry(entry: TargetCapabilityMatrixEntry): void {
    console.log(
        `- ${entry.target}/${entry.concept}: ${entry.support} adapter=${entry.adapterVersion}`,
    );
    if (entry.nativeSurfaces.length > 0) {
        console.log(`  surfaces: ${entry.nativeSurfaces.join(', ')}`);
    }
    for (const note of entry.notes) {
        console.log(`  note: ${note}`);
    }
    for (const implication of entry.authorityImplications) {
        console.log(`  authority: ${implication}`);
    }
    if (entry.evidence.length > 0) {
        console.log(`  evidence: ${entry.evidence.join(', ')}`);
    }
}

export function registerTargetSupportCommand(program: Command): void {
    program
        .command('target-support')
        .description('Inspect target capability support for Codex, GitHub Copilot, and generic projections')
        .option('--json', 'Output as JSON')
        .option('--target <target>', 'Filter by target id, such as codex or github-copilot')
        .option('--concept <concept>', 'Filter by canonical concept, such as skills or mcpServers')
        .option(
            '--support <support>',
            'Filter by support state: supported, partial, generated-substitute, requires-policy-grant, unsupported, or runtime-only',
        )
        .action((options: TargetSupportOptions) => {
            if (options.support && !SUPPORT_VALUES.has(options.support)) {
                console.error(
                    `Error: --support must be one of ${Array.from(SUPPORT_VALUES).join(', ')}.`,
                );
                process.exitCode = 1;
                return;
            }

            const entries = filterEntries(getTargetCapabilityMatrix(), options);
            if (entries.length === 0) {
                console.error('Error: No target capability support rows match the requested filters.');
                process.exitCode = 1;
                return;
            }

            if (options.json) {
                console.log(
                    JSON.stringify(
                        {
                            generatedBy: 'metaflow target-support',
                            filters: {
                                ...(options.target ? { target: options.target } : {}),
                                ...(options.concept ? { concept: options.concept } : {}),
                                ...(options.support ? { support: options.support } : {}),
                            },
                            summary: {
                                entries: entries.length,
                                targets: summarizeByTarget(entries),
                            },
                            entries,
                        },
                        null,
                        2,
                    ),
                );
                return;
            }

            console.log(`Target Support Matrix: ${entries.length}`);
            for (const entry of entries) {
                printEntry(entry);
            }
        });
}
