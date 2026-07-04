import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
    buildCodexProjectionBoundaryDocument,
    buildCodexRuntimeEvidenceReviewQueueDocument,
    buildCodexRuntimeEvidenceGuideDocument,
    buildCodexRuntimeEvidenceTemplateDocument,
    buildCodexSupportBoundariesDocument,
    CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS,
    loadConfig,
} from '@metaflow/engine';
import type {
    CodexRuntimeEvidenceGateCondition,
    CodexRuntimeEvidenceReviewQueueId,
    CodexRuntimeEvidenceTemplateDocument,
    CodexSupportBoundariesDocument,
    TargetCapabilityConcept,
} from '@metaflow/engine';
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
    runtimeEvidenceTemplate?: boolean;
    runtimeEvidenceTemplateDir?: string;
    runtimeEvidenceConcept?: string;
    runtimeEvidenceGuide?: boolean;
    runtimeEvidenceReviewQueue?: string;
    projectionBoundaryReview?: boolean;
}

const FAIL_ON_CONDITIONS = [
    'missing-evidence',
    'diagnostics',
    'error-diagnostics',
    'failed',
    'not-run',
    'partial',
] as const;

type FailOnCondition = CodexRuntimeEvidenceGateCondition;

const FAIL_ON_PRESETS: Record<string, FailOnCondition[]> = {
    'release-ready': ['missing-evidence', 'diagnostics', 'failed', 'not-run'],
    'runtime-complete': ['missing-evidence', 'diagnostics', 'failed', 'not-run', 'partial'],
    all: [...FAIL_ON_CONDITIONS],
};

const FAIL_ON_ALLOWED_VALUES = [...FAIL_ON_CONDITIONS, ...Object.keys(FAIL_ON_PRESETS)];

function parseFailOnConditions(raw: string | undefined): FailOnCondition[] | undefined {
    if (!raw) {
        return [];
    }
    const requested = raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const expanded = requested.flatMap((item) => {
        const preset = FAIL_ON_PRESETS[item];
        return preset ?? [item];
    });
    if (expanded.some((item) => !FAIL_ON_CONDITIONS.includes(item as FailOnCondition))) {
        return undefined;
    }
    return [...new Set(expanded)] as FailOnCondition[];
}

function evaluateFailOnConditions(
    document: CodexSupportBoundariesDocument,
    conditions: FailOnCondition[],
): string[] {
    const failures: string[] = [];
    for (const condition of conditions) {
        const result = document.runtimeEvidenceGateSummary[condition];
        if (result.triggered) {
            failures.push(`${condition}: ${result.message}`);
        }
    }
    return failures;
}

function parseRuntimeEvidenceConcepts(raw: string | undefined): string[] {
    if (!raw) {
        return [];
    }
    return [
        ...new Set(
            raw
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ];
}

function validateRuntimeEvidenceConcepts(
    document: CodexSupportBoundariesDocument,
    concepts: string[],
): string[] {
    if (concepts.length === 0) {
        return [];
    }
    const supportedConcepts = new Set(
        document.runtimeEvidenceChecklist.map((item) => item.concept),
    );
    return concepts.filter((concept) => !supportedConcepts.has(concept as never));
}

function parseRuntimeEvidenceReviewQueue(
    raw: string | undefined,
): CodexRuntimeEvidenceReviewQueueId | undefined {
    if (!raw) {
        return undefined;
    }
    const normalized = raw.trim();
    return CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS.includes(
        normalized as CodexRuntimeEvidenceReviewQueueId,
    )
        ? (normalized as CodexRuntimeEvidenceReviewQueueId)
        : undefined;
}

function writeRuntimeEvidenceTemplateRecords(
    workspaceRoot: string,
    directory: string,
    report: CodexRuntimeEvidenceTemplateDocument,
    force: boolean | undefined,
): string[] | undefined {
    let outputDirectory: string;
    try {
        outputDirectory = resolveWorkspaceOutputPath(workspaceRoot, directory);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${message}`);
        process.exitCode = 1;
        return undefined;
    }

    if (fs.existsSync(outputDirectory) && !fs.statSync(outputDirectory).isDirectory()) {
        console.error(
            `Error: Runtime evidence template output path is not a directory: ${path.relative(workspaceRoot, outputDirectory)}`,
        );
        process.exitCode = 1;
        return undefined;
    }

    const writes = report.records.map((record) => ({
        record,
        outputPath: path.join(outputDirectory, path.basename(record.suggestedPath)),
    }));
    const existing = writes.filter((write) => fs.existsSync(write.outputPath));
    if (existing.length > 0 && !force) {
        console.error(
            `Error: Runtime evidence template file already exists: ${path.relative(workspaceRoot, existing[0].outputPath)}`,
        );
        console.error('Use --force to overwrite existing template files.');
        process.exitCode = 1;
        return undefined;
    }

    fs.mkdirSync(outputDirectory, { recursive: true });
    for (const write of writes) {
        fs.writeFileSync(
            write.outputPath,
            `${JSON.stringify(write.record.content, null, 2)}\n`,
            'utf-8',
        );
    }
    return writes.map((write) => path.relative(workspaceRoot, write.outputPath));
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
            `Exit with code 1 when comma-separated checks or presets match: ${FAIL_ON_ALLOWED_VALUES.join(', ')}`,
        )
        .option(
            '--runtime-evidence-template',
            'Output a review-only JSON template bundle for missing or blocked Codex runtime evidence',
        )
        .option(
            '--runtime-evidence-template-dir <path>',
            'Write review-only runtime evidence template records as individual JSON files under a workspace-relative directory',
        )
        .option(
            '--runtime-evidence-concept <concepts>',
            'Limit runtime evidence template output to comma-separated runtime-only Codex concepts',
        )
        .option(
            '--runtime-evidence-guide',
            'Output a review-only runtime evidence collection guide for selected Codex concepts',
        )
        .option(
            '--runtime-evidence-review-queue <queue>',
            `Output a focused runtime evidence review queue: ${CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS.join(', ')}`,
        )
        .option(
            '--projection-boundary-review',
            'Output a focused Codex repository projection boundary review document',
        )
        .action((options: CodexSupportBoundariesOptions) => {
            const workspaceRoot = getWorkspaceRoot(program);
            if (options.runtimeEvidenceTemplateDir && options.out) {
                console.error(
                    'Error: --runtime-evidence-template-dir cannot be combined with --out.',
                );
                process.exitCode = 1;
                return;
            }
            if (
                options.runtimeEvidenceGuide &&
                (options.runtimeEvidenceTemplate ||
                    options.runtimeEvidenceTemplateDir ||
                    options.runtimeEvidenceReviewQueue ||
                    options.projectionBoundaryReview)
            ) {
                console.error(
                    'Error: --runtime-evidence-guide cannot be combined with runtime evidence template, review-queue, or projection-boundary output options.',
                );
                process.exitCode = 1;
                return;
            }
            if (
                options.runtimeEvidenceReviewQueue &&
                (options.runtimeEvidenceTemplate ||
                    options.runtimeEvidenceTemplateDir ||
                    options.projectionBoundaryReview)
            ) {
                console.error(
                    'Error: --runtime-evidence-review-queue cannot be combined with runtime evidence template or projection-boundary output options.',
                );
                process.exitCode = 1;
                return;
            }
            if (
                options.projectionBoundaryReview &&
                (options.runtimeEvidenceTemplate || options.runtimeEvidenceTemplateDir)
            ) {
                console.error(
                    'Error: --projection-boundary-review cannot be combined with runtime evidence template output options.',
                );
                process.exitCode = 1;
                return;
            }
            if (
                options.runtimeEvidenceConcept &&
                !options.runtimeEvidenceTemplate &&
                !options.runtimeEvidenceTemplateDir &&
                !options.runtimeEvidenceGuide
            ) {
                console.error(
                    'Error: --runtime-evidence-concept requires --runtime-evidence-template, --runtime-evidence-template-dir, or --runtime-evidence-guide.',
                );
                process.exitCode = 1;
                return;
            }
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
                    `Error: --fail-on must be a comma-separated list containing only: ${FAIL_ON_ALLOWED_VALUES.join(', ')}`,
                );
                process.exitCode = 1;
                return;
            }
            const runtimeEvidenceConcepts = parseRuntimeEvidenceConcepts(
                options.runtimeEvidenceConcept,
            );
            if (options.runtimeEvidenceGuide && runtimeEvidenceConcepts.length === 0) {
                console.error(
                    'Error: --runtime-evidence-guide requires --runtime-evidence-concept.',
                );
                process.exitCode = 1;
                return;
            }
            const invalidRuntimeEvidenceConcepts = validateRuntimeEvidenceConcepts(
                document,
                runtimeEvidenceConcepts,
            );
            if (invalidRuntimeEvidenceConcepts.length > 0) {
                console.error(
                    `Error: Unknown Codex runtime evidence concept(s): ${invalidRuntimeEvidenceConcepts.join(', ')}`,
                );
                console.error(
                    `Valid concepts: ${document.runtimeEvidenceChecklist.map((item) => item.concept).join(', ')}`,
                );
                process.exitCode = 1;
                return;
            }
            const failOnFailures = evaluateFailOnConditions(document, failOnConditions);
            if (options.projectionBoundaryReview) {
                const projectionBoundaryReport = buildCodexProjectionBoundaryDocument(document);
                const projectionBoundaryPayload = options.json
                    ? `${JSON.stringify(projectionBoundaryReport, null, 2)}\n`
                    : projectionBoundaryReport.content;
                if (!options.out) {
                    process.stdout.write(projectionBoundaryPayload);
                    if (failOnFailures.length > 0) {
                        console.error(
                            `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                        );
                        process.exitCode = 1;
                    }
                    return;
                }
                let projectionBoundaryOutputPath: string;
                try {
                    projectionBoundaryOutputPath = resolveWorkspaceOutputPath(
                        workspaceRoot,
                        options.out,
                    );
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`Error: ${message}`);
                    process.exitCode = 1;
                    return;
                }
                if (fs.existsSync(projectionBoundaryOutputPath) && !options.force) {
                    console.error(
                        `Error: Output file already exists: ${path.relative(workspaceRoot, projectionBoundaryOutputPath)}`,
                    );
                    console.error('Use --force to overwrite it.');
                    process.exitCode = 1;
                    return;
                }
                fs.mkdirSync(path.dirname(projectionBoundaryOutputPath), { recursive: true });
                fs.writeFileSync(projectionBoundaryOutputPath, projectionBoundaryPayload, 'utf-8');
                console.log(
                    `Wrote Codex projection boundary review: ${path.relative(workspaceRoot, projectionBoundaryOutputPath)}`,
                );
                if (failOnFailures.length > 0) {
                    console.error(
                        `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                    );
                    process.exitCode = 1;
                }
                return;
            }
            if (options.runtimeEvidenceReviewQueue) {
                const reviewQueue = parseRuntimeEvidenceReviewQueue(
                    options.runtimeEvidenceReviewQueue,
                );
                if (!reviewQueue) {
                    console.error(
                        `Error: --runtime-evidence-review-queue must be one of: ${CODEX_RUNTIME_EVIDENCE_REVIEW_QUEUE_IDS.join(', ')}`,
                    );
                    process.exitCode = 1;
                    return;
                }
                const queueReport = buildCodexRuntimeEvidenceReviewQueueDocument(
                    document,
                    reviewQueue,
                );
                const queuePayload = options.json
                    ? `${JSON.stringify(queueReport, null, 2)}\n`
                    : queueReport.content;
                if (!options.out) {
                    process.stdout.write(queuePayload);
                    if (failOnFailures.length > 0) {
                        console.error(
                            `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                        );
                        process.exitCode = 1;
                    }
                    return;
                }
                let queueOutputPath: string;
                try {
                    queueOutputPath = resolveWorkspaceOutputPath(workspaceRoot, options.out);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`Error: ${message}`);
                    process.exitCode = 1;
                    return;
                }
                if (fs.existsSync(queueOutputPath) && !options.force) {
                    console.error(
                        `Error: Output file already exists: ${path.relative(workspaceRoot, queueOutputPath)}`,
                    );
                    console.error('Use --force to overwrite it.');
                    process.exitCode = 1;
                    return;
                }
                fs.mkdirSync(path.dirname(queueOutputPath), { recursive: true });
                fs.writeFileSync(queueOutputPath, queuePayload, 'utf-8');
                console.log(
                    `Wrote Codex runtime evidence review queue: ${path.relative(workspaceRoot, queueOutputPath)}`,
                );
                if (failOnFailures.length > 0) {
                    console.error(
                        `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                    );
                    process.exitCode = 1;
                }
                return;
            }
            if (options.runtimeEvidenceGuide) {
                const guideReport = buildCodexRuntimeEvidenceGuideDocument(
                    document,
                    runtimeEvidenceConcepts as TargetCapabilityConcept[],
                );
                const guidePayload = options.json
                    ? `${JSON.stringify(guideReport, null, 2)}\n`
                    : guideReport.content;
                if (!options.out) {
                    process.stdout.write(guidePayload);
                    if (failOnFailures.length > 0) {
                        console.error(
                            `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                        );
                        process.exitCode = 1;
                    }
                    return;
                }
                let guideOutputPath: string;
                try {
                    guideOutputPath = resolveWorkspaceOutputPath(workspaceRoot, options.out);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`Error: ${message}`);
                    process.exitCode = 1;
                    return;
                }
                if (fs.existsSync(guideOutputPath) && !options.force) {
                    console.error(
                        `Error: Output file already exists: ${path.relative(workspaceRoot, guideOutputPath)}`,
                    );
                    console.error('Use --force to overwrite it.');
                    process.exitCode = 1;
                    return;
                }
                fs.mkdirSync(path.dirname(guideOutputPath), { recursive: true });
                fs.writeFileSync(guideOutputPath, guidePayload, 'utf-8');
                console.log(
                    `Wrote Codex runtime evidence guide: ${path.relative(workspaceRoot, guideOutputPath)}`,
                );
                if (failOnFailures.length > 0) {
                    console.error(
                        `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                    );
                    process.exitCode = 1;
                }
                return;
            }
            const runtimeEvidenceTemplateReport = options.runtimeEvidenceTemplateDir
                ? buildCodexRuntimeEvidenceTemplateDocument(
                      document,
                      runtimeEvidenceConcepts as TargetCapabilityConcept[],
                  )
                : undefined;
            if (options.runtimeEvidenceTemplateDir) {
                const written = writeRuntimeEvidenceTemplateRecords(
                    workspaceRoot,
                    options.runtimeEvidenceTemplateDir,
                    runtimeEvidenceTemplateReport!,
                    options.force,
                );
                if (!written) {
                    return;
                }
                console.log(
                    `Wrote ${written.length} Codex runtime evidence template file(s) to ${options.runtimeEvidenceTemplateDir}.`,
                );
                if (failOnFailures.length > 0) {
                    console.error(
                        `Codex support boundary gate failed: ${failOnFailures.join('; ')}`,
                    );
                    process.exitCode = 1;
                }
                return;
            }

            const payload = options.runtimeEvidenceTemplate
                ? `${JSON.stringify(
                      buildCodexRuntimeEvidenceTemplateDocument(
                          document,
                          runtimeEvidenceConcepts as TargetCapabilityConcept[],
                      ),
                      null,
                      2,
                  )}\n`
                : options.json
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
                options.runtimeEvidenceTemplate
                    ? `Wrote Codex runtime evidence template: ${path.relative(workspaceRoot, outputPath)}`
                    : `Wrote Codex support boundaries report: ${path.relative(workspaceRoot, outputPath)}`,
            );

            if (failOnFailures.length > 0) {
                console.error(`Codex support boundary gate failed: ${failOnFailures.join('; ')}`);
                process.exitCode = 1;
            }
        });
}
