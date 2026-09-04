import { Command, OptionValues } from 'commander';
import {
    auditAgentMetadataConformance,
    planAgentMetadataMigration,
    projectConfigForAgentMetadataAudit,
    resolveAgentPluginDisposition,
    resolveLayers,
} from '@metaflow/engine';
import type { AgentMetadataMigrationDecision } from '@metaflow/engine';
import { getWorkspaceRoot, loadConfigOrExit } from './common';

const MIGRATION_DECISIONS = new Set<AgentMetadataMigrationDecision>([
    'keep-vendor',
    'add-standard-alongside',
    'replace-with-disclosed-loss',
]);

function collectDecision(value: string, previous: string[]): string[] {
    return [...previous, value];
}

function parseDecisions(values: readonly string[]): Record<string, AgentMetadataMigrationDecision> {
    const decisions: Record<string, AgentMetadataMigrationDecision> = {};
    for (const value of values) {
        const separator = value.indexOf('=');
        if (separator <= 0) {
            throw new Error(
                `Invalid decision "${value}". Use <candidate-id>=<keep-vendor|add-standard-alongside|replace-with-disclosed-loss>.`,
            );
        }
        const candidateId = value.slice(0, separator);
        const decision = value.slice(separator + 1) as AgentMetadataMigrationDecision;
        if (!MIGRATION_DECISIONS.has(decision)) {
            throw new Error(`Invalid Agent Plugins migration decision "${decision}".`);
        }
        decisions[candidateId] = decision;
    }
    return decisions;
}

function loadReport(program: Command) {
    const workspaceRoot = getWorkspaceRoot(program);
    const loaded = loadConfigOrExit(workspaceRoot);
    if (!loaded) {
        return undefined;
    }
    const layers = resolveLayers(projectConfigForAgentMetadataAudit(loaded.config), workspaceRoot);
    return {
        config: loaded.config,
        report: auditAgentMetadataConformance(layers, resolveAgentPluginDisposition(loaded.config)),
    };
}

/** Preserve conformance severity in every human-readable CLI surface. */
export function formatAgentPluginDiagnostic(diagnostic: {
    code: string;
    message: string;
    filePath?: string;
    severity?: 'error' | 'warning' | 'info';
}): string {
    const severity = (diagnostic.severity ?? 'warning').toUpperCase();
    const location = diagnostic.filePath ? ` [${diagnostic.filePath}]` : '';
    return `[${severity}] ${diagnostic.code}: ${diagnostic.message}${location}`;
}

function printReport(report: ReturnType<typeof auditAgentMetadataConformance>): void {
    console.log(`Disposition: ${report.disposition}`);
    console.log(
        `Agent Plugins v1 conformance: ${report.summary.standardConformancePercent}% (${report.summary.portable} portable, ${report.summary.clientExtensions} client extension, ${report.summary.legacyHost} legacy, ${report.summary.noEquivalent} no equivalent, ${report.summary.invalid} invalid)`,
    );
    console.log(`Portable metadata: ${report.summary.portablePercent}%`);
    if (report.diagnostics.length > 0) {
        console.log(`Diagnostics: ${report.diagnostics.length}`);
        for (const diagnostic of report.diagnostics) {
            console.log(`  ${formatAgentPluginDiagnostic(diagnostic)}`);
        }
    }
}

/** Register read-only conformance reporting and explicit migration planning. */
export function registerAgentPluginsCommand(program: Command): void {
    const agentPlugins = program
        .command('agent-plugins')
        .description('Inspect Agent Plugins v1 conformance and plan explicit metadata migration');

    agentPlugins
        .command('report')
        .description('Report portable, client-extension, and incompatible metadata')
        .option('--json', 'Output as JSON')
        .action((options: { json?: boolean }) => {
            const loaded = loadReport(program);
            if (!loaded) {
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(loaded.report, null, 2));
                return;
            }
            printReport(loaded.report);
        });

    agentPlugins
        .command('plan-migration')
        .description('Build a read-only keep/add/replace plan; never modifies source metadata')
        .option('--json', 'Output as JSON')
        .option(
            '-d, --decision <candidate=decision>',
            'Record one explicit candidate decision (repeatable)',
            collectDecision,
            [],
        )
        .action((options: OptionValues & { json?: boolean; decision?: string[] }) => {
            try {
                const loaded = loadReport(program);
                if (!loaded) {
                    return;
                }
                const decisions = parseDecisions(options.decision ?? []);
                const plan = planAgentMetadataMigration(loaded.report.classifications, decisions);
                if (options.json) {
                    console.log(JSON.stringify(plan, null, 2));
                    return;
                }

                console.log('Agent Plugins migration plan (read-only):');
                console.log(
                    `State: ${
                        plan.unresolvedCandidateIds.length > 0
                            ? `awaiting ${plan.unresolvedCandidateIds.length} explicit decision(s)`
                            : plan.conflicts.length > 0
                              ? `blocked by ${plan.conflicts.length} projection target conflict(s)`
                              : 'all candidates decided'
                    }`,
                );
                for (const candidate of plan.candidates) {
                    const classification = candidate.classification;
                    const destination =
                        classification.packagingProjectionLoss === 'none' &&
                        classification.projectedV1Path
                            ? ` -> ${classification.projectedV1Path} (${classification.projectedV1Coverage}, unchanged package projection)`
                            : ' -> manual standard-shape authoring';
                    const semanticAlternative = classification.suggestedStandardConstruct
                        ? `; possible ${classification.suggestedStandardConstruct} alternative requires ${classification.migrationLoss}`
                        : '';
                    console.log(
                        `  - ${candidate.id}: ${classification.sourcePath}${destination}${semanticAlternative}`,
                    );
                }
                for (const operation of plan.operations) {
                    console.log(
                        `  = ${operation.candidateId}: ${operation.decision} (${operation.action})`,
                    );
                }
                for (const conflict of plan.conflicts) {
                    console.log(
                        `  ! ${conflict.targetPath}: conflicting sources ${conflict.sourcePaths.join(', ')}`,
                    );
                }
                if (plan.unresolvedCandidateIds.length > 0) {
                    console.log(
                        'No source files were changed. Supply --decision once per candidate after reviewing semantic loss.',
                    );
                } else if (plan.conflicts.length > 0) {
                    console.log(
                        'No source files were changed. Resolve each target collision by keeping or reshaping at least one source.',
                    );
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (options.json) {
                    console.log(JSON.stringify({ error: message }, null, 2));
                } else {
                    console.error(`Error: ${message}`);
                }
                process.exitCode = 1;
            }
        });
}
