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

function printReport(report: ReturnType<typeof auditAgentMetadataConformance>): void {
    console.log(`Disposition: ${report.disposition}`);
    console.log(
        `Agent Plugins v1 conformance: ${report.summary.standardConformancePercent}% (${report.summary.portable} portable, ${report.summary.clientExtensions} client extension, ${report.summary.legacyHost} legacy, ${report.summary.noEquivalent} no equivalent, ${report.summary.invalid} invalid)`,
    );
    console.log(`Portable metadata: ${report.summary.portablePercent}%`);
    if (report.diagnostics.length > 0) {
        console.log(`Warnings: ${report.diagnostics.length}`);
        for (const diagnostic of report.diagnostics) {
            const location = diagnostic.filePath ? ` [${diagnostic.filePath}]` : '';
            console.log(`  ! ${diagnostic.code}: ${diagnostic.message}${location}`);
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
                    `State: ${plan.blocked ? `awaiting ${plan.unresolvedCandidateIds.length} explicit decision(s)` : 'all candidates decided'}`,
                );
                for (const candidate of plan.candidates) {
                    const destination = candidate.classification.projectedV1Path
                        ? ` -> ${candidate.classification.projectedV1Path}`
                        : ' -> manual standard-shape authoring';
                    console.log(
                        `  - ${candidate.id}: ${candidate.classification.sourcePath}${destination} (${candidate.classification.migrationLoss})`,
                    );
                }
                for (const operation of plan.operations) {
                    console.log(
                        `  = ${operation.candidateId}: ${operation.decision} (${operation.action})`,
                    );
                }
                if (plan.blocked) {
                    console.log(
                        'No source files were changed. Supply --decision once per candidate after reviewing semantic loss.',
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
