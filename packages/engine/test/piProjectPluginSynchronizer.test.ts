import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    PI_PROJECT_PLUGIN_RELATIVE_ROOT,
    PI_TARGET_STATE_RELATIVE_PATH,
    PiSkillProjectionInput,
    PiSkillsProjectionResult,
    applyPiProjectPluginSynchronization,
    loadPiTargetState,
    planPiProjectPluginSynchronization,
    projectPiAgentPluginSkills,
} from '../src';

function workspace(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-pi-target-'));
}

function targetPath(root: string, relativePath = ''): string {
    return path.join(
        root,
        ...PI_PROJECT_PLUGIN_RELATIVE_ROOT.split('/'),
        ...relativePath.split('/'),
    );
}

function targetStatePath(root: string): string {
    return path.join(root, ...PI_TARGET_STATE_RELATIVE_PATH.split('/'));
}

function skill(
    name: string,
    description = `${name} description`,
    capabilityId = name,
): PiSkillProjectionInput {
    return {
        name,
        content: Buffer.from(
            `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
            'utf8',
        ),
        source: {
            repoId: 'metadata',
            layerId: `metadata/capabilities/${capabilityId}`,
            capabilityId,
            capabilityName: capabilityId,
            sourcePath: `skills/${name}/SKILL.md`,
        },
    };
}

function projection(
    ...skills: PiSkillProjectionInput[]
): Extract<PiSkillsProjectionResult, { blocked: false }> {
    const result = projectPiAgentPluginSkills({ skills });
    if (result.blocked) {
        assert.fail('Expected a successful Pi skills projection');
    }
    return result;
}

function read(root: string, relativePath: string): Buffer {
    return fs.readFileSync(targetPath(root, relativePath));
}

function removeWorkspace(root: string): void {
    fs.rmSync(root, { recursive: true, force: true });
}

function identity(target: string): Record<string, number> {
    const stats = fs.lstatSync(target);
    return {
        dev: stats.dev,
        ino: stats.ino,
        size: stats.size,
        birthtimeMs: stats.birthtimeMs,
        mtimeMs: stats.mtimeMs,
    };
}

function rawHash(target: string): string {
    return createHash('sha256').update(fs.readFileSync(target)).digest('hex');
}

function fileSnapshot(target: string): Record<string, unknown> {
    return { identity: identity(target), contentHash: rawHash(target) };
}

function rootSnapshot(root: string): Record<string, unknown> {
    const files: Record<string, unknown> = {};
    const directories: Record<string, unknown> = {};
    const visit = (directory: string, relativeDirectory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            const absolutePath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                directories[relativePath] = identity(absolutePath);
                visit(absolutePath, relativePath);
            } else {
                files[relativePath] = fileSnapshot(absolutePath);
            }
        }
    };
    visit(root, '');
    return { identity: identity(root), files, directories };
}

function prepareInterruptedReplacement(
    root: string,
    nextProjection: Extract<PiSkillsProjectionResult, { blocked: false }>,
    committed: boolean,
    phase:
        | 'prepared'
        | 'root-backed-up'
        | 'root-installed'
        | 'state-backup-linked'
        | 'state-backed-up'
        | 'state-installed' = 'state-installed',
): { transactionRoot: string; journalPath: string; previousPlugin: Buffer } {
    const donor = workspace();
    const transactionId = '11111111-1111-4111-8111-111111111111';
    const transactionRoot = path.join(root, '.metaflow', `.pi-target-transaction-${transactionId}`);
    const journalPath = path.join(root, '.metaflow', 'pi-target-transaction.json');
    fs.mkdirSync(transactionRoot);
    applyPiProjectPluginSynchronization({
        workspaceRoot: donor,
        enabled: true,
        projection: nextProjection,
    });
    const previousPlugin = fs.readFileSync(targetPath(root, 'plugin.json'));
    const previousRootSnapshot = rootSnapshot(targetPath(root));
    const previousStateSnapshot = fileSnapshot(targetStatePath(root));
    const nextRootPath = targetPath(donor);
    const nextStatePath = targetStatePath(donor);
    const nextRootSnapshot = rootSnapshot(nextRootPath);
    const nextStateSnapshot = fileSnapshot(nextStatePath);

    fs.renameSync(nextRootPath, path.join(transactionRoot, 'next-package'));
    fs.renameSync(nextStatePath, path.join(transactionRoot, 'next-state.json'));
    if (phase !== 'prepared') {
        fs.renameSync(targetPath(root), path.join(transactionRoot, 'previous-package'));
    }
    if (
        phase === 'root-installed' ||
        phase === 'state-backup-linked' ||
        phase === 'state-backed-up' ||
        phase === 'state-installed'
    ) {
        fs.renameSync(path.join(transactionRoot, 'next-package'), targetPath(root));
    }
    if (phase === 'state-backup-linked') {
        fs.linkSync(targetStatePath(root), path.join(transactionRoot, 'previous-state.json'));
    } else if (phase === 'state-backed-up' || phase === 'state-installed') {
        fs.renameSync(targetStatePath(root), path.join(transactionRoot, 'previous-state.json'));
    }
    if (phase === 'state-installed') {
        fs.renameSync(path.join(transactionRoot, 'next-state.json'), targetStatePath(root));
    }
    fs.writeFileSync(
        journalPath,
        `${JSON.stringify(
            {
                schemaVersion: 1,
                transactionId,
                committed,
                rootAction: 'replace',
                stateAction: 'write',
                transactionRootIdentity: identity(transactionRoot),
                previousRoot: previousRootSnapshot,
                previousState: previousStateSnapshot,
                nextRoot: nextRootSnapshot,
                nextState: nextStateSnapshot,
            },
            null,
            2,
        )}\n`,
    );
    removeWorkspace(donor);
    return { transactionRoot, journalPath, previousPlugin };
}

describe('Pi project plugin synchronizer', () => {
    it('keeps an omitted or disabled target as a filesystem no-op', () => {
        const root = workspace();
        try {
            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });

            assert.strictEqual(plan.blocked, false);
            assert.deepStrictEqual(plan.changes, []);
            assert.strictEqual(plan.stateAction, 'none');
            assert.deepStrictEqual(result.written, []);
            assert.deepStrictEqual(result.removed, []);
            assert.strictEqual(fs.existsSync(path.join(root, '.pi')), false);
            assert.strictEqual(fs.existsSync(path.join(root, '.metaflow')), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('previews without writing and atomically publishes a complete package plus separate state', () => {
        const root = workspace();
        try {
            const projected = projection(skill('alpha'), skill('zeta'));
            const preview = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });

            assert.strictEqual(preview.blocked, false);
            assert.deepStrictEqual(
                preview.changes,
                ['plugin.json', 'skills/alpha/SKILL.md', 'skills/zeta/SKILL.md'].map(
                    (relativePath) => ({ relativePath, action: 'add' }),
                ),
            );
            assert.strictEqual(preview.stateAction, 'write');
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);

            const applied = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.strictEqual(applied.plan.blocked, false);
            assert.deepStrictEqual(
                applied.written,
                preview.changes.map((entry) => entry.relativePath),
            );
            assert.strictEqual(applied.stateChanged, true);
            assert.ok(read(root, 'plugin.json').includes(Buffer.from('metaflow.project')));
            assert.deepStrictEqual(read(root, 'skills/alpha/SKILL.md'), skill('alpha').content);

            const loaded = loadPiTargetState(root);
            assert.strictEqual(loaded.exists, true);
            assert.deepStrictEqual(loaded.diagnostics, []);
            assert.ok(loaded.state);
            assert.strictEqual(loaded.state.outputRoot, PI_PROJECT_PLUGIN_RELATIVE_ROOT);
            assert.strictEqual(loaded.state.projection.version, projected.package.version);
            assert.deepStrictEqual(Object.keys(loaded.state.files), [
                'plugin.json',
                'skills/alpha/SKILL.md',
                'skills/zeta/SKILL.md',
            ]);
            assert.ok(!fs.readFileSync(targetStatePath(root), 'utf8').includes('lastApply'));
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.metaflow')).sort(), [
                'pi-target-state.json',
            ]);
        } finally {
            removeWorkspace(root);
        }
    });

    it('is idempotent for unchanged package and provenance inputs', () => {
        const root = workspace();
        try {
            const projected = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            const stateBefore = fs.readFileSync(targetStatePath(root));
            const pluginBefore = fs.readFileSync(targetPath(root, 'plugin.json'));

            const second = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });

            assert.deepStrictEqual(second.plan.changes, []);
            assert.strictEqual(second.plan.stateAction, 'none');
            assert.deepStrictEqual(second.written, []);
            assert.deepStrictEqual(second.removed, []);
            assert.deepStrictEqual(fs.readFileSync(targetStatePath(root)), stateBefore);
            assert.deepStrictEqual(fs.readFileSync(targetPath(root, 'plugin.json')), pluginBefore);
        } finally {
            removeWorkspace(root);
        }
    });

    it('replaces the complete package to update content and remove stale skills', () => {
        const root = workspace();
        try {
            const first = projection(skill('alpha'), skill('stale'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: first,
            });
            const next = projection(skill('alpha', 'changed alpha'));

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });
            assert.strictEqual(plan.blocked, false);
            assert.ok(
                plan.changes.some(
                    (entry) =>
                        entry.relativePath === 'skills/stale/SKILL.md' && entry.action === 'remove',
                ),
            );
            assert.ok(
                plan.changes.some(
                    (entry) =>
                        entry.relativePath === 'skills/alpha/SKILL.md' && entry.action === 'update',
                ),
            );

            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/stale/SKILL.md')), false);
            assert.deepStrictEqual(
                read(root, 'skills/alpha/SKILL.md'),
                skill('alpha', 'changed alpha').content,
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('repairs a missing tracked file from the complete projection', () => {
        const root = workspace();
        try {
            const projected = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            fs.rmSync(targetPath(root, 'skills/alpha/SKILL.md'));

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.strictEqual(plan.blocked, false);
            assert.deepStrictEqual(plan.changes, [
                { relativePath: 'skills/alpha/SKILL.md', action: 'add' },
            ]);

            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.deepStrictEqual(read(root, 'skills/alpha/SKILL.md'), skill('alpha').content);
        } finally {
            removeWorkspace(root);
        }
    });

    it('updates source provenance in state without replacing byte-identical package files', () => {
        const root = workspace();
        try {
            const firstSkill = skill('alpha');
            const movedSkill: PiSkillProjectionInput = {
                ...firstSkill,
                source: {
                    ...firstSkill.source,
                    capabilityId: 'moved-alpha',
                    layerId: 'metadata/capabilities/moved-alpha',
                },
            };
            const first = projection(firstSkill);
            const moved = projection(movedSkill);
            assert.strictEqual(first.blocked, false);
            assert.strictEqual(moved.blocked, false);
            assert.strictEqual(first.package.contentSha, moved.package.contentSha);
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: first,
            });

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: moved,
            });
            assert.deepStrictEqual(plan.changes, []);
            assert.strictEqual(plan.stateAction, 'write');
            const applied = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: moved,
            });
            assert.deepStrictEqual(applied.written, []);
            assert.strictEqual(
                loadPiTargetState(root).state?.files['skills/alpha/SKILL.md'].sources[0]
                    .capabilityId,
                'moved-alpha',
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed on an untracked generated root without changing its bytes', () => {
        const root = workspace();
        try {
            fs.mkdirSync(targetPath(root), { recursive: true });
            fs.writeFileSync(targetPath(root, 'plugin.json'), 'user-owned\n');
            const before = fs.readFileSync(targetPath(root, 'plugin.json'));

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some((entry) => entry.code === 'PI_TARGET_ROOT_UNTRACKED'),
            );
            assert.deepStrictEqual(fs.readFileSync(targetPath(root, 'plugin.json')), before);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('rejects a forged successful projection containing forbidden output', () => {
        const root = workspace();
        try {
            const valid = projection(skill('alpha'));
            const forged = {
                ...valid,
                package: {
                    ...valid.package,
                    files: [
                        ...valid.package.files,
                        {
                            relativePath: 'mcp.json',
                            content: Buffer.from('{}\n'),
                            contentHash: '0'.repeat(64),
                            sources: [],
                        },
                    ],
                },
            };

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: forged,
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_PROJECTION_INVALID',
                ),
            );
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('rejects forged hashes and manifest identity before staging', () => {
        const root = workspace();
        try {
            const valid = projection(skill('alpha'));
            const forged = {
                ...valid,
                package: {
                    ...valid.package,
                    contentSha: 'f'.repeat(64),
                    version: `0.1.0+${'f'.repeat(64)}`,
                    manifest: {
                        ...valid.package.manifest,
                        version: `0.1.0+${'f'.repeat(64)}`,
                    },
                },
            };

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: forged,
            });

            assert.strictEqual(plan.blocked, true);
            assert.ok(
                plan.diagnostics.some((entry) => entry.code === 'PI_TARGET_PROJECTION_INVALID'),
            );
            assert.strictEqual(fs.existsSync(path.join(root, '.metaflow')), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('orders projection and target diagnostics canonically', () => {
        const root = workspace();
        try {
            fs.mkdirSync(targetPath(root), { recursive: true });
            const valid = projection(skill('alpha'));
            const withDiagnostics = {
                ...valid,
                diagnostics: [
                    { code: 'ZETA', message: 'zeta', severity: 'warning' as const },
                    { code: 'ALPHA', message: 'alpha', severity: 'info' as const },
                ],
            };

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: withDiagnostics,
            });

            assert.deepStrictEqual(
                plan.diagnostics.map((entry) => entry.code),
                ['ALPHA', 'PI_TARGET_ROOT_UNTRACKED', 'ZETA'],
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed on drift or unmanaged content without partial cleanup', () => {
        const root = workspace();
        try {
            const projected = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            fs.writeFileSync(targetPath(root, 'plugin.json'), 'drifted\n');
            fs.writeFileSync(targetPath(root, 'unmanaged.txt'), 'preserve\n');
            const stateBefore = fs.readFileSync(targetStatePath(root));

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(result.plan.diagnostics.some((entry) => entry.code === 'PI_TARGET_DRIFT'));
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_UNMANAGED_CONTENT',
                ),
            );
            assert.strictEqual(
                fs.readFileSync(targetPath(root, 'plugin.json'), 'utf8'),
                'drifted\n',
            );
            assert.strictEqual(
                fs.readFileSync(targetPath(root, 'unmanaged.txt'), 'utf8'),
                'preserve\n',
            );
            assert.deepStrictEqual(fs.readFileSync(targetStatePath(root)), stateBefore);
        } finally {
            removeWorkspace(root);
        }
    });

    it('disables by removing only the verified managed root and ledger', () => {
        const root = workspace();
        try {
            const projected = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            const neighboringPlugin = path.join(root, '.pi', 'plugins', 'other', 'plugin.json');
            const mcpConfig = path.join(root, '.pi', 'mcp.json');
            fs.mkdirSync(path.dirname(neighboringPlugin), { recursive: true });
            fs.writeFileSync(neighboringPlugin, 'other\n');
            fs.writeFileSync(mcpConfig, 'mcp-user-owned\n');

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });

            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.removed, ['plugin.json', 'skills/alpha/SKILL.md']);
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
            assert.strictEqual(fs.readFileSync(neighboringPlugin, 'utf8'), 'other\n');
            assert.strictEqual(fs.readFileSync(mcpConfig, 'utf8'), 'mcp-user-owned\n');
        } finally {
            removeWorkspace(root);
        }
    });

    it('preserves an existing package when a later projection is blocked', () => {
        const root = workspace();
        try {
            const initial = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: initial,
            });
            const packageBefore = fs.readFileSync(targetPath(root, 'plugin.json'));
            const stateBefore = fs.readFileSync(targetStatePath(root));
            const duplicate = projectPiAgentPluginSkills({
                skills: [
                    skill('review', 'first', 'first-review'),
                    skill('review', 'second', 'second-review'),
                ],
            });
            assert.strictEqual(duplicate.blocked, true);

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: duplicate,
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_PROJECTION_BLOCKED',
                ),
            );
            assert.deepStrictEqual(fs.readFileSync(targetPath(root, 'plugin.json')), packageBefore);
            assert.deepStrictEqual(fs.readFileSync(targetStatePath(root)), stateBefore);
        } finally {
            removeWorkspace(root);
        }
    });

    it('treats malformed or future target state as blocking instead of untracked', () => {
        const root = workspace();
        try {
            fs.mkdirSync(path.dirname(targetStatePath(root)), { recursive: true });
            fs.writeFileSync(targetStatePath(root), '{"schemaVersion":99}\n');

            const loaded = loadPiTargetState(root);
            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });

            assert.strictEqual(loaded.state, undefined);
            assert.strictEqual(loaded.diagnostics[0].code, 'PI_TARGET_STATE_VERSION_UNSUPPORTED');
            assert.strictEqual(plan.blocked, true);
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed when another reconciliation holds the project-local lock', () => {
        const root = workspace();
        try {
            fs.mkdirSync(path.join(root, '.metaflow'), { recursive: true });
            const lockPath = path.join(root, '.metaflow', 'pi-target.lock');
            fs.writeFileSync(lockPath, 'existing lock\n');

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECONCILIATION_BUSY',
                ),
            );
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
            assert.strictEqual(fs.readFileSync(lockPath, 'utf8'), 'existing lock\n');
        } finally {
            removeWorkspace(root);
        }
    });

    it('rolls back an uncommitted root/state swap before normal planning', () => {
        const root = workspace();
        try {
            const previous = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            const interrupted = prepareInterruptedReplacement(
                root,
                projection(skill('beta')),
                false,
            );

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });

            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.deepStrictEqual(
                fs.readFileSync(targetPath(root, 'plugin.json')),
                interrupted.previousPlugin,
            );
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/alpha/SKILL.md')), true);
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/beta/SKILL.md')), false);
            assert.strictEqual(fs.existsSync(interrupted.transactionRoot), false);
            assert.strictEqual(fs.existsSync(interrupted.journalPath), false);
        } finally {
            removeWorkspace(root);
        }
    });

    for (const phase of [
        'prepared',
        'root-backed-up',
        'root-installed',
        'state-backup-linked',
        'state-backed-up',
    ] as const) {
        it(`recovers an uncommitted ${phase} transaction phase`, () => {
            const root = workspace();
            try {
                const previous = projection(skill('alpha'));
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: previous,
                });
                const interrupted = prepareInterruptedReplacement(
                    root,
                    projection(skill('beta')),
                    false,
                    phase,
                );

                const result = applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: previous,
                });

                assert.strictEqual(result.plan.blocked, false);
                assert.strictEqual(fs.existsSync(targetPath(root, 'skills/alpha/SKILL.md')), true);
                assert.strictEqual(fs.existsSync(targetPath(root, 'skills/beta/SKILL.md')), false);
                assert.strictEqual(fs.existsSync(interrupted.transactionRoot), false);
                assert.strictEqual(fs.existsSync(interrupted.journalPath), false);
            } finally {
                removeWorkspace(root);
            }
        });
    }

    it('finalizes a committed root/state swap before normal planning', () => {
        const root = workspace();
        try {
            const previous = projection(skill('alpha'));
            const next = projection(skill('beta'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            const interrupted = prepareInterruptedReplacement(root, next, true);

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });

            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/alpha/SKILL.md')), false);
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/beta/SKILL.md')), true);
            assert.strictEqual(fs.existsSync(interrupted.transactionRoot), false);
            assert.strictEqual(fs.existsSync(interrupted.journalPath), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('finishes recovery when cleanup removed transaction artifacts before the journal', () => {
        const root = workspace();
        try {
            const previous = projection(skill('alpha'));
            const next = projection(skill('beta'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            const interrupted = prepareInterruptedReplacement(root, next, true);
            fs.rmSync(interrupted.transactionRoot, { recursive: true, force: true });

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });

            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.strictEqual(fs.existsSync(interrupted.journalPath), false);
            assert.strictEqual(fs.existsSync(targetPath(root, 'skills/beta/SKILL.md')), true);
        } finally {
            removeWorkspace(root);
        }
    });

    it('preserves all transaction artifacts when recovery content changed', () => {
        const root = workspace();
        try {
            const previous = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            const interrupted = prepareInterruptedReplacement(
                root,
                projection(skill('beta')),
                false,
            );
            fs.writeFileSync(targetPath(root, 'plugin.json'), 'changed after crash\n');

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECOVERY_CONFLICT',
                ),
            );
            assert.strictEqual(
                fs.readFileSync(targetPath(root, 'plugin.json'), 'utf8'),
                'changed after crash\n',
            );
            assert.strictEqual(fs.existsSync(interrupted.transactionRoot), true);
            assert.strictEqual(fs.existsSync(interrupted.journalPath), true);
            assert.strictEqual(
                fs.existsSync(path.join(interrupted.transactionRoot, 'previous-package')),
                true,
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('restores rather than deletes a root replaced after final preflight', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalRename = nativeFs.renameSync;
        let intercepted = false;
        try {
            const previous = projection(skill('alpha'));
            const next = projection(skill('beta'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            nativeFs.renameSync = ((oldPath, newPath) => {
                if (
                    !intercepted &&
                    path.resolve(String(oldPath)) === path.resolve(targetPath(root)) &&
                    path.basename(String(newPath)) === 'previous-package'
                ) {
                    intercepted = true;
                    fs.rmSync(targetPath(root), { recursive: true, force: true });
                    fs.mkdirSync(targetPath(root), { recursive: true });
                    fs.writeFileSync(targetPath(root, 'plugin.json'), 'concurrent user root\n');
                }
                return originalRename(oldPath, newPath);
            }) as typeof fs.renameSync;

            assert.throws(() =>
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: next,
                }),
            );

            assert.strictEqual(intercepted, true);
            assert.strictEqual(
                fs.readFileSync(targetPath(root, 'plugin.json'), 'utf8'),
                'concurrent user root\n',
            );
            assert.strictEqual(fs.existsSync(targetStatePath(root)), true);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target-transaction.json')),
                false,
            );
        } finally {
            nativeFs.renameSync = originalRename;
            removeWorkspace(root);
        }
    });

    it('preserves a replacement that appears while a retired package is quarantined', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalRename = nativeFs.renameSync;
        let intercepted = false;
        try {
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });
            nativeFs.renameSync = ((oldPath, newPath) => {
                if (
                    !intercepted &&
                    path.basename(String(oldPath)) === 'previous-package' &&
                    path.basename(String(newPath)).includes('.previous-package.metaflow-delete-')
                ) {
                    intercepted = true;
                    fs.rmSync(String(oldPath), { recursive: true, force: true });
                    fs.mkdirSync(String(oldPath));
                    fs.writeFileSync(
                        path.join(String(oldPath), 'user.txt'),
                        'concurrent user data\n',
                    );
                }
                return originalRename(oldPath, newPath);
            }) as typeof fs.renameSync;

            assert.throws(() =>
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: projection(skill('beta')),
                }),
            );

            assert.strictEqual(intercepted, true);
            const transactionDirectories = fs
                .readdirSync(path.join(root, '.metaflow'))
                .filter((entry) => entry.startsWith('.pi-target-transaction-'));
            assert.strictEqual(transactionDirectories.length, 1);
            assert.strictEqual(
                fs.readFileSync(
                    path.join(
                        root,
                        '.metaflow',
                        transactionDirectories[0],
                        'previous-package',
                        'user.txt',
                    ),
                    'utf8',
                ),
                'concurrent user data\n',
            );
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target-transaction.json')),
                true,
            );
        } finally {
            nativeFs.renameSync = originalRename;
            removeWorkspace(root);
        }
    });

    it('preserves a replacement transaction journal instead of deleting it', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalRename = nativeFs.renameSync;
        const journalPath = path.join(root, '.metaflow', 'pi-target-transaction.json');
        let intercepted = false;
        try {
            nativeFs.renameSync = ((oldPath, newPath) => {
                if (
                    !intercepted &&
                    path.resolve(String(oldPath)) === path.resolve(journalPath) &&
                    path
                        .basename(String(newPath))
                        .includes('.pi-target-transaction.json.metaflow-delete-')
                ) {
                    intercepted = true;
                    fs.rmSync(String(oldPath), { force: true });
                    fs.writeFileSync(String(oldPath), 'concurrent journal replacement\n');
                }
                return originalRename(oldPath, newPath);
            }) as typeof fs.renameSync;

            assert.throws(() =>
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: projection(skill('alpha')),
                }),
            );

            assert.strictEqual(intercepted, true);
            assert.strictEqual(
                fs.readFileSync(journalPath, 'utf8'),
                'concurrent journal replacement\n',
            );
        } finally {
            nativeFs.renameSync = originalRename;
            removeWorkspace(root);
        }
    });

    it('preserves a replacement lock and leaves later reconciliation fail-closed', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalRename = nativeFs.renameSync;
        const lockPath = path.join(root, '.metaflow', 'pi-target.lock');
        let intercepted = false;
        try {
            nativeFs.renameSync = ((oldPath, newPath) => {
                if (
                    !intercepted &&
                    path.resolve(String(oldPath)) === path.resolve(lockPath) &&
                    path.basename(String(newPath)).includes('.pi-target.lock.metaflow-delete-')
                ) {
                    intercepted = true;
                    fs.rmSync(String(oldPath), { force: true });
                    fs.writeFileSync(String(oldPath), 'concurrent lock replacement\n');
                }
                return originalRename(oldPath, newPath);
            }) as typeof fs.renameSync;

            const applied = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });
            assert.strictEqual(applied.plan.blocked, false);
            assert.strictEqual(intercepted, true);
            assert.strictEqual(fs.readFileSync(lockPath, 'utf8'), 'concurrent lock replacement\n');

            const next = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('beta')),
            });
            assert.strictEqual(next.plan.blocked, true);
            assert.ok(
                next.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECONCILIATION_BUSY',
                ),
            );
            assert.strictEqual(fs.readFileSync(lockPath, 'utf8'), 'concurrent lock replacement\n');
        } finally {
            nativeFs.renameSync = originalRename;
            removeWorkspace(root);
        }
    });

    it('does not overwrite a journal replacement during no-replace publication', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalLink = nativeFs.linkSync;
        const journalPath = path.join(root, '.metaflow', 'pi-target-transaction.json');
        let intercepted = false;
        try {
            nativeFs.linkSync = ((existingPath, newPath) => {
                if (
                    !intercepted &&
                    path.resolve(String(newPath)) === path.resolve(journalPath) &&
                    path
                        .basename(String(existingPath))
                        .startsWith('pi-target-transaction.json.tmp-')
                ) {
                    intercepted = true;
                    fs.writeFileSync(String(newPath), 'concurrent journal replacement\n');
                }
                return originalLink(existingPath, newPath);
            }) as typeof fs.linkSync;

            assert.throws(() =>
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: projection(skill('alpha')),
                }),
            );

            assert.strictEqual(intercepted, true);
            assert.strictEqual(
                fs.readFileSync(journalPath, 'utf8'),
                'concurrent journal replacement\n',
            );
            assert.strictEqual(fs.existsSync(targetPath(root)), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
        } finally {
            nativeFs.linkSync = originalLink;
            removeWorkspace(root);
        }
    });

    it('does not overwrite a state replacement during no-replace installation', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalLink = nativeFs.linkSync;
        let intercepted = false;
        try {
            const previous = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            nativeFs.linkSync = ((existingPath, newPath) => {
                if (
                    !intercepted &&
                    path.basename(String(existingPath)) === 'next-state.json' &&
                    path.resolve(String(newPath)) === path.resolve(targetStatePath(root))
                ) {
                    intercepted = true;
                    fs.writeFileSync(String(newPath), 'concurrent state replacement\n');
                }
                return originalLink(existingPath, newPath);
            }) as typeof fs.linkSync;

            assert.throws(() =>
                applyPiProjectPluginSynchronization({
                    workspaceRoot: root,
                    enabled: true,
                    projection: projection(skill('beta')),
                }),
            );

            assert.strictEqual(intercepted, true);
            assert.strictEqual(
                fs.readFileSync(targetStatePath(root), 'utf8'),
                'concurrent state replacement\n',
            );
            assert.deepStrictEqual(read(root, 'plugin.json'), previous.package.files[0].content);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target-transaction.json')),
                true,
            );
        } finally {
            nativeFs.linkSync = originalLink;
            removeWorkspace(root);
        }
    });

    it('does not overwrite a state replacement during rollback restoration', () => {
        const root = workspace();
        const nativeFs = require('fs') as typeof fs;
        const originalLink = nativeFs.linkSync;
        let intercepted = false;
        try {
            const previous = projection(skill('alpha'));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            const interrupted = prepareInterruptedReplacement(
                root,
                projection(skill('beta')),
                false,
                'state-backed-up',
            );
            nativeFs.linkSync = ((existingPath, newPath) => {
                if (
                    !intercepted &&
                    path.basename(String(existingPath)) === 'previous-state.json' &&
                    path.resolve(String(newPath)) === path.resolve(targetStatePath(root))
                ) {
                    intercepted = true;
                    fs.writeFileSync(String(newPath), 'concurrent rollback replacement\n');
                }
                return originalLink(existingPath, newPath);
            }) as typeof fs.linkSync;

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });

            assert.strictEqual(intercepted, true);
            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECOVERY_CONFLICT',
                ),
            );
            assert.strictEqual(
                fs.readFileSync(targetStatePath(root), 'utf8'),
                'concurrent rollback replacement\n',
            );
            assert.strictEqual(
                fs.existsSync(path.join(interrupted.transactionRoot, 'previous-state.json')),
                true,
            );
            assert.strictEqual(fs.existsSync(interrupted.journalPath), true);
        } finally {
            nativeFs.linkSync = originalLink;
            removeWorkspace(root);
        }
    });

    it('rejects a generated-root link without following or removing its target', function () {
        const root = workspace();
        const external = workspace();
        try {
            fs.mkdirSync(path.dirname(targetPath(root)), { recursive: true });
            fs.writeFileSync(path.join(external, 'plugin.json'), 'external\n');
            try {
                fs.symlinkSync(
                    external,
                    targetPath(root),
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
                    this.skip();
                    return;
                }
                throw error;
            }

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_PATH_CONTAINMENT',
                ),
            );
            assert.strictEqual(
                fs.readFileSync(path.join(external, 'plugin.json'), 'utf8'),
                'external\n',
            );
        } finally {
            removeWorkspace(root);
            removeWorkspace(external);
        }
    });

    it('rejects a linked target ancestor before creating state or output', function () {
        const root = workspace();
        const external = workspace();
        try {
            try {
                fs.symlinkSync(
                    external,
                    path.join(root, '.pi'),
                    process.platform === 'win32' ? 'junction' : 'dir',
                );
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
                    this.skip();
                    return;
                }
                throw error;
            }

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(skill('alpha')),
            });

            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_PATH_CONTAINMENT',
                ),
            );
            assert.deepStrictEqual(fs.readdirSync(external), []);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
        } finally {
            removeWorkspace(root);
            removeWorkspace(external);
        }
    });
});
