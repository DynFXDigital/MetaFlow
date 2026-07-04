import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import {
    buildCodexRuntimeEvidenceGuideDocument,
    buildCodexSupportBoundariesDocument,
    loadConfig,
} from '@metaflow/engine';
import type {
    CodexRuntimeEvidenceGateCondition,
    CodexSupportBoundariesDocument,
    RuntimeEvidenceStatus,
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
}

interface RuntimeEvidenceTemplateRecord {
    suggestedPath: string;
    content: {
        schemaVersion: 'metaflow.runtimeEvidence/v1';
        id: string;
        target: 'codex';
        concepts: string[];
        harness: string;
        adapterVersion: string;
        scenario: string;
        status: RuntimeEvidenceStatus;
        command: string;
        evidence: string[];
        evidenceArtifacts: Array<{
            kind: 'report';
            ref: string;
            description: string;
        }>;
        limitations: string[];
        policyGrants: string[];
        description: string;
    };
}

interface RuntimeEvidenceTemplateReport {
    schemaVersion: 'metaflow.runtimeEvidenceTemplate/v1';
    generatedBy: string;
    generatedAt: string;
    adapterVersion: string;
    target: 'codex';
    source: 'runtimeEvidenceActionPlan';
    filters?: {
        concepts: string[];
    };
    records: RuntimeEvidenceTemplateRecord[];
}

const FAIL_ON_CONDITIONS = [
    'missing-evidence',
    'diagnostics',
    'error-diagnostics',
    'failed',
    'not-run',
] as const;

type FailOnCondition = CodexRuntimeEvidenceGateCondition;

const FAIL_ON_PRESETS: Record<string, FailOnCondition[]> = {
    'release-ready': ['missing-evidence', 'diagnostics', 'failed', 'not-run'],
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

function toKebabCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function buildRuntimeEvidenceTemplateReport(
    document: CodexSupportBoundariesDocument,
    concepts: string[] = [],
): RuntimeEvidenceTemplateReport {
    const seenConcepts = new Set<string>();
    const requestedConcepts = new Set(concepts);
    const records: RuntimeEvidenceTemplateRecord[] = [];
    for (const action of document.runtimeEvidenceActionPlan) {
        for (const detail of action.conceptDetails) {
            if (requestedConcepts.size > 0 && !requestedConcepts.has(detail.concept)) {
                continue;
            }
            if (seenConcepts.has(detail.concept)) {
                continue;
            }
            seenConcepts.add(detail.concept);
            const conceptSlug = toKebabCase(detail.concept);
            const authority =
                detail.authorityImplications.length > 0
                    ? detail.authorityImplications.join(' ')
                    : 'No explicit authority implication is recorded for this concept.';
            records.push({
                suggestedPath: `.metaflow/runtime-evidence/codex-${conceptSlug}.json`,
                content: {
                    schemaVersion: 'metaflow.runtimeEvidence/v1',
                    id: `codex-${conceptSlug}`,
                    target: 'codex',
                    concepts: [detail.concept],
                    harness: `TODO: Codex runtime surface (${detail.nativeSurfaces.join(', ')})`,
                    adapterVersion: document.adapterVersion,
                    scenario: detail.runtimeEvidenceExpected,
                    status: 'not-run',
                    command: 'TODO: command, hosted workflow, UI procedure, or review procedure used for validation',
                    evidence: [],
                    evidenceArtifacts: [
                        {
                            kind: 'report',
                            ref: `doc/ftr/TODO-codex-${conceptSlug}.md`,
                            description: 'TODO: replace with the reviewed runtime evidence artifact.',
                        },
                    ],
                    limitations: [
                        'TODO: document uncovered Codex surfaces, connectors, permissions, environments, or platform limits.',
                    ],
                    policyGrants: [],
                    description: [
                        `Runtime evidence template for ${detail.concept}.`,
                        `Coverage status at template generation: ${detail.coverageStatus}.`,
                        `Authority implications: ${authority}`,
                    ].join(' '),
                },
            });
        }
    }

    return {
        schemaVersion: 'metaflow.runtimeEvidenceTemplate/v1',
        generatedBy: 'metaflow codex-support-boundaries --runtime-evidence-template',
        generatedAt: document.generatedAt,
        adapterVersion: document.adapterVersion,
        target: 'codex',
        source: 'runtimeEvidenceActionPlan',
        ...(concepts.length > 0 ? { filters: { concepts } } : {}),
        records,
    };
}

function writeRuntimeEvidenceTemplateRecords(
    workspaceRoot: string,
    directory: string,
    report: RuntimeEvidenceTemplateReport,
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
                (options.runtimeEvidenceTemplate || options.runtimeEvidenceTemplateDir)
            ) {
                console.error(
                    'Error: --runtime-evidence-guide cannot be combined with runtime evidence template output options.',
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
                ? buildRuntimeEvidenceTemplateReport(document, runtimeEvidenceConcepts)
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
                ? `${JSON.stringify(buildRuntimeEvidenceTemplateReport(document, runtimeEvidenceConcepts), null, 2)}\n`
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
