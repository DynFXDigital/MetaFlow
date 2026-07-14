export interface PhaseTiming {
    label: string;
    durationMs: number;
}

export interface PerformanceTimer {
    mark(label: string): PhaseTiming;
    elapsedMs(): number;
    records(): readonly PhaseTiming[];
}

type MonotonicClock = () => number;

function defaultMonotonicClock(): number {
    return Number(process.hrtime.bigint()) / 1_000_000;
}

export function createPerformanceTimer(clock: MonotonicClock = defaultMonotonicClock): PerformanceTimer {
    const startedAt = clock();
    const timings: PhaseTiming[] = [];

    return {
        mark: (label) => {
            const timing = { label, durationMs: Math.max(0, clock() - startedAt) };
            timings.push(timing);
            return timing;
        },
        elapsedMs: () => Math.max(0, clock() - startedAt),
        records: () => timings,
    };
}
