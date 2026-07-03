import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { buildCodexSupportBoundariesDocument, loadConfig } from '@metaflow/engine';
import {
    getWorkspaceRoot,
    resolveRuntimeEvidenceRecords,
    resolveWorkspaceOutputPath,
} from './common';

interface CodexSupportBoundariesOptions {
    json?: boolean;
    out?: string;
    force?: boolean;
    failOn?: string;
}

const FAIL_ON_CONDITIONS = [
    'missing-evidence',
    'diagnostics',
    'error-diagnostics',
    'failed',
    'not-run',
] as const;

type FailOnCondition = (typeof FAIL_ON_CONDITIONS)[number];

function parseFailOnConditions(raw: string | undefined): FailOnCondition[] | undefined {
    if (!raw) {
        return [];
    }
    const requested = raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const invalid = requested.filter(
        (item): item is string => !FAIL_ON_CONDITIONS.includes(item as FailOnCondition),
    );
    if (invalid.length > 0) {
        return undefined;
    }
    return [...new Set(requested)] as FailOnCondition[];
}

function evaluateFailOnConditions(
    document: ReturnType<typeof buildCodexSupportBoundariesDocument>,
    conditions: FailOnCondition[],
): string[] {
    const summary = document.runtimeEvidenceCoverageSummary;
    const failures: string[] = [];
    for (const condition of conditions) {
        switch (condition) {
            case 'missing-evidence':
                if (summary.conceptsWithoutEvidence > 0) {
                    failures.push(
                        `missing-evidence: ${summary.conceptsWithoutEvidence} runtime-only concept(s) have no matching evidence`,
                    );
                }
                break;
            case 'diagnostics':
                if (summary.recordsWithWarnings > 0) {
                    failures.push(
                        `diagnostics: ${summary.recordsWithWarnings} runtime evidence record(s) have diagnostics`,
                    );
                }
                break;
            case 'error-diagnostics':
                if (summary.diagnosticRecordsBySeverity.error > 0) {
                    failures.push(
                        `error-diagnostics: ${summary.diagnosticRecordsBySeverity.error} runtime evidence record(s) have error diagnostics`,
                    );
                }
                break;
            case 'failed':
                if (summary.byStatus.failed > 0) {
                    failures.push(
                        `failed: ${summary.byStatus.failed} runtime-only concept(s) are covered by failed evidence`,
                    );
                }
                break;
            case 'not-run':
                if (summary.byStatus['not-run'] > 0) {
                    failures.push(
                        `not-run: ${summary.byStatus['not-run']} runtime-only concept(s) are covered by not-run evidence`,
                    );
                }
                break;
        }
    }
    return failures;
}

export function registerCodexSupportBoundariesCommand(program: Command): void {
    program
        .command('codex-support-boundaries')
        .description('Print Codex file-backed and runtime-only support boundaries')
        .option('--json', 'Output report metadata and Markdown content as JSON')
        .option('-o, --out <path>', 'Write output to a workspace-relative path instead of stdout')
        .option('--force', 'Overwrite an existing output file')
        .option(
            '--fail-on <checks>',
            `Exit with code 1 when comma-separated checks match: ${FAIL_ON_CONDITIONS.join(', ')}`,
        )
        .action((options: CodexSupportBoundariesOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            const loaded = loadConfig(workspaceRoot);
            const runtimeEvidenceRecords = loaded.ok
                ? resolveRuntimeEvidenceRecords(loaded.config, workspaceRoot)
                : [];
            const document = buildCodexSupportBoundariesDocument({
                runtimeEvidenceRecords,
            });
            const failOnConditions = parseFailOnConditions(options.failOn);
            if (!failOnConditions) {
                console.error(
                    `Error: --fail-on must be a comma-separated list containing only: ${FAIL_ON_CONDITIONS.join(', ')}`,
                );
                process.exitCode = 1;
                return;
            }
            const failOnFailures = evaluateFailOnConditions(document, failOnConditions);
            const payload = options.json
                ? `${JSON.stringify(document, null, 2)}\n`
                : document.content;

            if (!options.out) {
                process.stdout.write(payload);
                if (failOnFailures.length > 0) {
                    console.error(
                        `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                    );
                    process.exitCode = 1;
                }
                return;
            }

            let outputPath: string;
            try {
                outputPath = resolveWorkspaceOutputPath(workspaceRoot, options.out);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Error: ${message}`);
                process.exitCode = 1;
                return;
            }

            if (fs.existsSync(outputPath) && !options.force) {
                console.error(
                    `Error: Output file already exists: ${path.relative(workspaceRoot, outputPath)}`,
                );
                console.error('Use --force to overwrite it.');
                process.exitCode = 1;
                return;
            }

            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, payload, 'utf-8');
            console.log(
                `Wrote Codex support boundaries report: ${path.relative(workspaceRoot, outputPath)}`,
            );

            if (failOnFailures.length > 0) {
                console.error(`Codex support boundary gate failed: ${failOnFailures.join('; ')}`);
                process.exitCode = 1;
            }
        });
}
