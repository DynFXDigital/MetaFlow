import * as assert from 'assert';

type DiagnosticsSnapshotModule = typeof import('../../diagnostics/diagnosticsSnapshot');

function loadDiagnosticsSnapshotWithMock(mockVscode: unknown): DiagnosticsSnapshotModule {
    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;
    moduleInternals._load = function patchedLoad(
        request: string,
        parent: NodeModule | null,
        isMain: boolean,
    ): unknown {
        if (request === 'vscode') {
            return mockVscode;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const snapshotPath = require.resolve('../../diagnostics/diagnosticsSnapshot');
    const configDiagnosticsPath = require.resolve('../../diagnostics/configDiagnostics');
    delete require.cache[snapshotPath];
    delete require.cache[configDiagnosticsPath];

    try {
        return require(snapshotPath) as DiagnosticsSnapshotModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

interface MockDiagnostic {
    message: string;
    severity: number;
    range: { start: { line: number; character: number } };
    source?: string;
    code?: string | number;
}

function makeCollection(entries: Array<{ fsPath: string; diagnostics: MockDiagnostic[] }>): never {
    return {
        forEach(
            callback: (uri: { fsPath: string }, diagnostics: MockDiagnostic[]) => void,
        ): void {
            for (const entry of entries) {
                callback({ fsPath: entry.fsPath }, entry.diagnostics);
            }
        },
    } as never;
}

suite('Diagnostics Snapshot', () => {
    test('builds remediation hints for known config diagnostic codes', () => {
        const module = loadDiagnosticsSnapshotWithMock({});
        const collection = makeCollection([
            {
                fsPath: 'C:\\ws\\.metaflow\\config.jsonc',
                diagnostics: [
                    {
                        message: 'Layer path missing',
                        severity: 0,
                        range: { start: { line: 4, character: 2 } },
                        code: 'LAYER_PATH_MISSING',
                    },
                ],
            },
        ]);

        const snapshot = module.buildDiagnosticsSnapshot(
            {
                capabilityWarnings: [],
                governanceContractErrors: [],
            },
            collection,
        );

        assert.strictEqual(snapshot.configDiagnostics.length, 1);
        const configWarning = snapshot.warnings.find((w) => w.category === 'config');
        assert.ok(configWarning);
        assert.ok(configWarning?.remediationHint?.includes('Create the configured capability path'));
    });

    test('builds remediation hints for capability repo-path warnings', () => {
        const module = loadDiagnosticsSnapshotWithMock({});

        const snapshot = module.buildDiagnosticsSnapshot(
            {
                capabilityWarnings: ['[REPO_PATH_MISSING] metadata repo not found'],
                governanceContractErrors: [],
            },
            makeCollection([]),
        );

        const capWarning = snapshot.warnings.find((w) => w.category === 'capability');
        assert.ok(capWarning);
        assert.ok(
            capWarning?.remediationHint?.includes('Create or mount the configured metadata repository'),
        );
    });

    test('summarizes governance violations when compliance is non-compliant', () => {
        const module = loadDiagnosticsSnapshotWithMock({});

        const snapshot = module.buildDiagnosticsSnapshot(
            {
                capabilityWarnings: [],
                governanceContractErrors: [],
                governanceContractPath: 'C:\\ws\\.metaflow\\governance.jsonc',
                governanceCompliance: {
                    status: 'non-compliant',
                    severity: 'error',
                    activeProfile: 'review',
                    activeProfileLocked: false,
                    allowedProfiles: ['default'],
                    lockedProfiles: [],
                    violations: [
                        {
                            id: 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
                            message: 'Active profile review is not allowed.',
                            severity: 'error',
                        },
                    ],
                } as never,
            },
            makeCollection([]),
        );

        const govWarning = snapshot.warnings.find((w) => w.category === 'governance');
        assert.ok(govWarning);
        assert.strictEqual(govWarning?.code, 'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review');
        assert.ok(govWarning?.remediationHint?.includes('Align the active profile'));
        assert.strictEqual(
            snapshot.governance.contractPath,
            'C:\\ws\\.metaflow\\governance.jsonc',
        );
    });

    test('summarizes synchronization planning conflicts with remediation', () => {
        const module = loadDiagnosticsSnapshotWithMock({});

        const snapshot = module.buildDiagnosticsSnapshot(
            {
                capabilityWarnings: [],
                governanceContractErrors: [],
                synchronizationPlanningConflicts: [
                    {
                        kind: 'guarded-native-destination',
                        destinationRelativePath: 'AGENTS.md',
                        fullPath: 'C:\\ws\\AGENTS.md',
                        sources: [
                            {
                                sourceRelativePath: 'AGENTS.md',
                                sourceLayer: 'primary/company/core',
                                sourceRepo: 'primary',
                            },
                        ],
                        remediation:
                            'Remove or rename the unmanaged destination, then rerun MetaFlow.',
                    },
                ],
            },
            makeCollection([]),
        );

        assert.strictEqual(snapshot.synchronizationPlanningConflicts.length, 1);
        const syncWarning = snapshot.warnings.find((w) => w.category === 'synchronization');
        assert.ok(syncWarning);
        assert.strictEqual(syncWarning?.code, 'guarded-native-destination');
        assert.strictEqual(syncWarning?.severity, 'error');
        assert.ok(syncWarning?.message.includes('AGENTS.md'));
        assert.ok(syncWarning?.remediationHint?.includes('Remove or rename'));
    });

    test('clones synchronization planning conflicts in the snapshot payload', () => {
        const module = loadDiagnosticsSnapshotWithMock({});
        const sourceConflict = {
            kind: 'unmanaged-destination' as const,
            destinationRelativePath: '.agents/skills/testing/SKILL.md',
            fullPath: 'C:\\ws\\.agents\\skills\\testing\\SKILL.md',
            sources: [
                {
                    sourceRelativePath: '.agents/skills/testing/SKILL.md',
                    sourceLayer: 'primary/company/core',
                },
            ],
            remediation: 'Review the unmanaged file.',
        };

        const snapshot = module.buildDiagnosticsSnapshot(
            {
                capabilityWarnings: [],
                governanceContractErrors: [],
                synchronizationPlanningConflicts: [sourceConflict],
            },
            makeCollection([]),
        );

        snapshot.synchronizationPlanningConflicts[0].sources[0].sourceLayer = 'mutated';
        assert.strictEqual(sourceConflict.sources[0].sourceLayer, 'primary/company/core');
    });

    test('formats warning messages with code prefix and file location', () => {
        const module = loadDiagnosticsSnapshotWithMock({});

        const capabilityOnly = module.formatDiagnosticsSnapshotWarningMessage({
            category: 'capability',
            message: 'Some capability warning',
        });
        assert.strictEqual(capabilityOnly, 'Some capability warning');

        const withCodeAndLocation = module.formatDiagnosticsSnapshotWarningMessage({
            category: 'config',
            message: 'Layer path missing',
            code: 'LAYER_PATH_MISSING',
            file: 'C:\\ws\\.metaflow\\config.jsonc',
            startLine: 4,
            startColumn: 2,
        });
        assert.ok(withCodeAndLocation.startsWith('[LAYER_PATH_MISSING] Layer path missing'));
        assert.ok(withCodeAndLocation.includes('#L5C3'));

        const alreadyPrefixed = module.formatDiagnosticsSnapshotWarningMessage({
            category: 'config',
            message: '[LAYER_PATH_MISSING] Layer path missing',
            code: 'LAYER_PATH_MISSING',
        });
        assert.strictEqual(alreadyPrefixed, '[LAYER_PATH_MISSING] Layer path missing');
    });
});
