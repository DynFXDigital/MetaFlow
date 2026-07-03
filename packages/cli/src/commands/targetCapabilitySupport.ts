import {
    buildTargetCapabilitySupportReference,
    getTargetCapabilityMatrix,
    TargetCapabilityMatrixEntry,
    TargetCapabilitySupportReference,
} from '@metaflow/engine';

export interface TargetCapabilitySummary {
    target: string;
    adapterVersion: string;
    counts: Record<string, number>;
    total: number;
}

export interface TargetCapabilitySupportSummary {
    entries: number;
    targets: TargetCapabilitySummary[];
    supportReference: TargetCapabilitySupportReference | null;
}

export function summarizeTargetCapabilityMatrix(
    entries: TargetCapabilityMatrixEntry[],
): TargetCapabilitySummary[] {
    const byTarget = new Map<
        string,
        { adapterVersion: string; counts: Record<string, number>; total: number }
    >();
    for (const entry of entries) {
        const summary = byTarget.get(entry.target) ?? {
            adapterVersion: entry.adapterVersion,
            counts: {},
            total: 0,
        };
        summary.total += 1;
        summary.counts[entry.support] = (summary.counts[entry.support] ?? 0) + 1;
        byTarget.set(entry.target, summary);
    }
    return Array.from(byTarget.entries())
        .sort((left, right) =>
            left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
        )
        .map(([target, summary]) => ({
            target,
            adapterVersion: summary.adapterVersion,
            counts: Object.fromEntries(
                Object.entries(summary.counts).sort((left, right) =>
                    left[0].localeCompare(right[0], undefined, { sensitivity: 'base' }),
                ),
            ),
            total: summary.total,
        }));
}

export function buildTargetCapabilitySupportSummary(): TargetCapabilitySupportSummary {
    const matrix = getTargetCapabilityMatrix();
    return {
        entries: matrix.length,
        targets: summarizeTargetCapabilityMatrix(matrix),
        supportReference: buildTargetCapabilitySupportReference(matrix) ?? null,
    };
}

export function formatTargetCapabilitySummaryLines(
    summary: TargetCapabilitySupportSummary,
): string[] {
    const lines = [`Target Capability Support: ${summary.entries}`];
    for (const target of summary.targets) {
        const counts = Object.entries(target.counts)
            .map(([support, count]) => `${support}=${count}`)
            .join(', ');
        lines.push(`  - ${target.target} (${target.adapterVersion}): ${counts}`);
    }
    if (summary.supportReference) {
        const references = summary.supportReference.targets
            .map(
                (entry) =>
                    `${entry.target}=${entry.runtimeOnlyCount} see ${entry.documentation}`,
            )
            .join('; ');
        lines.push(
            `  Runtime-only support boundaries: ${summary.supportReference.runtimeOnlyCount} rows require operator or harness evidence; ${references}.`,
        );
    }
    return lines;
}
