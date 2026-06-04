import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    applyCapabilityReferenceRepairs,
    buildCapabilityIdentityIndexFromConfig,
    capabilityIdentityIndexToManagedState,
    collectCapabilityIdentityIndexWarnings,
    managedStateToCapabilityIdentityIndex,
    reconcileConfiguredCapabilityReferences,
    loadManagedState,
    saveManagedState,
    type CapabilityIdentityIndex,
    type MetaFlowConfig,
} from '../src/index';

function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'capability-identity-test-'));
}

function writeCapability(
    root: string,
    layerPath: string,
    frontmatter: Record<string, string>,
): void {
    const capabilityRoot = path.join(root, layerPath);
    fs.mkdirSync(capabilityRoot, { recursive: true });
    const lines = [
        '---',
        ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`),
        '---',
        '',
        `# Capability: ${frontmatter.name ?? layerPath}`,
        '',
    ];
    fs.writeFileSync(path.join(capabilityRoot, 'CAPABILITY.md'), lines.join('\n'), 'utf-8');
}

describe('capability identity index', () => {
    let workspaceRoot: string;

    beforeEach(() => {
        workspaceRoot = tmpDir();
    });

    afterEach(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('builds current index entries from configured metadata repositories', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/planning', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Planning',
            description: 'Planning guidance.',
            previousIds: '[old-planning]',
            previousPaths: '[capabilities/old-planning]',
        });

        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'primary', localPath: 'repo' }],
        };

        const index = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);

        assert.strictEqual(index.entries.length, 1);
        assert.strictEqual(index.entries[0].repoId, 'primary');
        assert.strictEqual(index.entries[0].path, 'capabilities/planning');
        assert.strictEqual(index.entries[0].id, 'planning');
        assert.strictEqual(index.entries[0].uid, '123e4567-e89b-42d3-a456-426614174000');
        assert.deepStrictEqual(index.entries[0].previousIds, ['old-planning']);
        assert.deepStrictEqual(index.entries[0].previousPaths, ['capabilities/old-planning']);
        assert.strictEqual(index.entries[0].name, 'Planning');
        assert.strictEqual(index.entries[0].description, 'Planning guidance.');
        assert.strictEqual(
            index.entries[0].manifestPath,
            path.join(repoRoot, 'capabilities/planning/CAPABILITY.md'),
        );
    });

    it('persists capability identity snapshots in managed state', () => {
        const index: CapabilityIdentityIndex = {
            generatedAt: '2026-06-04T00:00:00.000Z',
            entries: [
                {
                    repoId: 'primary',
                    path: 'capabilities/planning',
                    id: 'planning',
                    uid: '123e4567-e89b-42d3-a456-426614174000',
                },
            ],
        };
        const state = loadManagedState(workspaceRoot);
        state.capabilityIdentity = capabilityIdentityIndexToManagedState(index);

        saveManagedState(workspaceRoot, state);

        const loaded = loadManagedState(workspaceRoot);
        assert.deepStrictEqual(loaded.capabilityIdentity, state.capabilityIdentity);
        assert.deepStrictEqual(managedStateToCapabilityIdentityIndex(loaded.capabilityIdentity), index);
    });

    it('classifies stale configured paths by last-known uid', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/project-management/planning', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Planning',
            description: 'Planning guidance.',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/planning', enabled: true }],
                },
            ],
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
        const lastKnown: CapabilityIdentityIndex = {
            generatedAt: '2026-06-03T00:00:00.000Z',
            entries: [
                {
                    repoId: 'primary',
                    path: 'capabilities/planning',
                    id: 'planning',
                    uid: '123e4567-e89b-42d3-a456-426614174000',
                },
            ],
        };

        const resolutions = reconcileConfiguredCapabilityReferences(
            config,
            workspaceRoot,
            current,
            lastKnown,
        );

        assert.strictEqual(resolutions.length, 1);
        assert.strictEqual(resolutions[0].kind, 'uid-match');
        assert.strictEqual(
            resolutions[0].candidates[0].path,
            'capabilities/project-management/planning',
        );
    });

    it('classifies stale configured paths by declared previous path alias', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/project-management/planning', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Planning',
            description: 'Planning guidance.',
            previousPaths: '[capabilities/planning]',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/planning', enabled: true }],
                },
            ],
        };

        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
        const resolutions = reconcileConfiguredCapabilityReferences(config, workspaceRoot, current);

        assert.strictEqual(resolutions.length, 1);
        assert.strictEqual(resolutions[0].kind, 'alias-match');
        assert.strictEqual(resolutions[0].matchReason, 'previousPath');
    });

    it('classifies duplicate uid candidates as ambiguous', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/one', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'One',
            description: 'First guidance.',
        });
        writeCapability(repoRoot, 'capabilities/two', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Two',
            description: 'Second guidance.',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/old', enabled: true }],
                },
            ],
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
        const lastKnown: CapabilityIdentityIndex = {
            generatedAt: '2026-06-03T00:00:00.000Z',
            entries: [
                {
                    repoId: 'primary',
                    path: 'capabilities/old',
                    id: 'old',
                    uid: '123e4567-e89b-42d3-a456-426614174000',
                },
            ],
        };

        const warnings = collectCapabilityIdentityIndexWarnings(current);
        const resolutions = reconcileConfiguredCapabilityReferences(
            config,
            workspaceRoot,
            current,
            lastKnown,
        );

        assert.ok(warnings.some((warning) => warning.code === 'CAPABILITY_IDENTITY_UID_DUPLICATE'));
        assert.strictEqual(resolutions[0].kind, 'ambiguous');
        assert.strictEqual(resolutions[0].candidates.length, 2);
    });

    it('leaves disabled stale references out by default', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/current', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Current',
            description: 'Current guidance.',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/missing', enabled: false }],
                },
            ],
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);

        assert.deepStrictEqual(
            reconcileConfiguredCapabilityReferences(config, workspaceRoot, current),
            [],
        );
        assert.strictEqual(
            reconcileConfiguredCapabilityReferences(config, workspaceRoot, current, undefined, {
                includeDisabled: true,
            })[0].kind,
            'no-match',
        );
    });

    it('repairs deterministic stale capability paths in authored repo config', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/project-management/planning', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Planning',
            description: 'Planning guidance.',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/planning', enabled: true }],
                },
            ],
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
        const lastKnown: CapabilityIdentityIndex = {
            generatedAt: '2026-06-03T00:00:00.000Z',
            entries: [
                {
                    repoId: 'primary',
                    path: 'capabilities/planning',
                    id: 'planning',
                    uid: '123e4567-e89b-42d3-a456-426614174000',
                },
            ],
        };

        const repairResult = applyCapabilityReferenceRepairs(
            config,
            reconcileConfiguredCapabilityReferences(config, workspaceRoot, current, lastKnown),
        );

        assert.deepStrictEqual(repairResult.repaired, [
            {
                source: 'metadataRepos.capabilities',
                repoId: 'primary',
                oldPath: 'capabilities/planning',
                newPath: 'capabilities/project-management/planning',
                kind: 'uid-match',
                matchReason: 'uid',
            },
        ]);
        assert.strictEqual(
            config.metadataRepos?.[0].capabilities?.[0].path,
            'capabilities/project-management/planning',
        );
    });

    it('repairs deterministic stale profile override paths', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/project-management/planning', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Planning',
            description: 'Planning guidance.',
            previousPaths: '[capabilities/planning]',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [{ id: 'primary', localPath: 'repo' }],
            profiles: {
                default: {
                    layerOverrides: [
                        {
                            repoId: 'primary',
                            path: 'capabilities/planning',
                            enabled: true,
                        },
                    ],
                },
            },
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);

        const repairResult = applyCapabilityReferenceRepairs(
            config,
            reconcileConfiguredCapabilityReferences(config, workspaceRoot, current),
        );

        assert.deepStrictEqual(repairResult.repaired, [
            {
                source: 'profiles.layerOverrides',
                repoId: 'primary',
                oldPath: 'capabilities/planning',
                newPath: 'capabilities/project-management/planning',
                kind: 'alias-match',
                matchReason: 'previousPath',
                profileId: 'default',
            },
        ]);
        assert.strictEqual(
            config.profiles?.default.layerOverrides?.[0].path,
            'capabilities/project-management/planning',
        );
    });

    it('does not repair ambiguous stale capability paths', () => {
        const repoRoot = path.join(workspaceRoot, 'repo');
        writeCapability(repoRoot, 'capabilities/one', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'One',
            description: 'First guidance.',
        });
        writeCapability(repoRoot, 'capabilities/two', {
            uid: '123e4567-e89b-42d3-a456-426614174000',
            name: 'Two',
            description: 'Second guidance.',
        });
        const config: MetaFlowConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: 'repo',
                    capabilities: [{ path: 'capabilities/old', enabled: true }],
                },
            ],
        };
        const current = buildCapabilityIdentityIndexFromConfig(config, workspaceRoot);
        const lastKnown: CapabilityIdentityIndex = {
            generatedAt: '2026-06-03T00:00:00.000Z',
            entries: [
                {
                    repoId: 'primary',
                    path: 'capabilities/old',
                    id: 'old',
                    uid: '123e4567-e89b-42d3-a456-426614174000',
                },
            ],
        };

        const repairResult = applyCapabilityReferenceRepairs(
            config,
            reconcileConfiguredCapabilityReferences(config, workspaceRoot, current, lastKnown),
        );

        assert.deepStrictEqual(repairResult.repaired, []);
        assert.strictEqual(config.metadataRepos?.[0].capabilities?.[0].path, 'capabilities/old');
    });
});
