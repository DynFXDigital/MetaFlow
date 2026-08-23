import * as assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    PI_PROJECT_PLUGINS_RELATIVE_ROOT,
    PI_TARGET_STATE_RELATIVE_PATH,
    PiAgentPluginProjectionInput,
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

function pluginRoot(root: string, pluginName: string): string {
    return path.join(root, ...PI_PROJECT_PLUGINS_RELATIVE_ROOT.split('/'), pluginName);
}

function pluginPath(root: string, pluginName: string, relativePath = ''): string {
    return path.join(pluginRoot(root, pluginName), ...relativePath.split('/').filter(Boolean));
}

function targetStatePath(root: string): string {
    return path.join(root, ...PI_TARGET_STATE_RELATIVE_PATH.split('/'));
}

function writeTargetLock(root: string, pid: number): string {
    const target = path.join(root, '.metaflow', 'pi-target.lock');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
        target,
        `${JSON.stringify({
            schemaVersion: 1,
            pid,
            token: '22222222-2222-4222-8222-222222222222',
        })}\n`,
    );
    return target;
}

function source(capabilityId: string, sourcePath: string) {
    return {
        repoId: 'metadata',
        layerId: `metadata/capabilities/${capabilityId}`,
        capabilityId,
        capabilityName: capabilityId,
        sourcePath,
    };
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
        source: source(capabilityId, `skills/${name}/SKILL.md`),
    };
}

function plugin(
    name: string,
    skills: readonly PiSkillProjectionInput[],
    capabilityId = name,
): PiAgentPluginProjectionInput {
    return {
        manifest: { name, version: '1.0.0' },
        source: source(capabilityId, 'plugin.json'),
        skills,
    };
}

function projection(
    ...plugins: PiAgentPluginProjectionInput[]
): Extract<PiSkillsProjectionResult, { blocked: false }> {
    const result = projectPiAgentPluginSkills({ plugins });
    if (result.blocked) {
        assert.fail('Expected a successful Pi projection');
    }
    return result;
}

function removeWorkspace(root: string): void {
    fs.rmSync(root, { recursive: true, force: true });
}

function rawHash(target: string): string {
    return createHash('sha256').update(fs.readFileSync(target)).digest('hex');
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

function writeProjectedPackage(
    root: string,
    projectedPackage: Extract<PiSkillsProjectionResult, { blocked: false }>['packages'][number],
): void {
    fs.mkdirSync(root, { recursive: true });
    for (const file of projectedPackage.files) {
        const destination = path.join(root, ...file.relativePath.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, file.content);
    }
}

describe('Pi project plugin synchronizer', () => {
    it('keeps an omitted or disabled target as a filesystem no-op', () => {
        const root = workspace();
        try {
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.strictEqual(fs.existsSync(path.join(root, '.pi')), false);
            assert.strictEqual(fs.existsSync(path.join(root, '.metaflow')), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('previews and publishes one original-name root for each source plugin', () => {
        const root = workspace();
        try {
            const projected = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.zeta', [skill('zeta')]),
            );
            const preview = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.strictEqual(preview.blocked, false);
            assert.deepStrictEqual(
                preview.changes.map((entry) => entry.relativePath),
                [
                    '.pi/plugins/portable.alpha/plugin.json',
                    '.pi/plugins/portable.alpha/skills/alpha/SKILL.md',
                    '.pi/plugins/portable.zeta/plugin.json',
                    '.pi/plugins/portable.zeta/skills/zeta/SKILL.md',
                ],
            );
            assert.strictEqual(fs.existsSync(path.join(root, '.pi')), false);

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
            assert.strictEqual(
                JSON.parse(
                    fs.readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'), 'utf8'),
                ).name,
                'portable.alpha',
            );
            assert.ok(
                !fs
                    .readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'), 'utf8')
                    .toLowerCase()
                    .includes('metaflow'),
            );

            const loaded = loadPiTargetState(root);
            assert.strictEqual(loaded.state?.schemaVersion, 2);
            assert.deepStrictEqual(Object.keys(loaded.state?.plugins ?? {}), [
                'portable.alpha',
                'portable.zeta',
            ]);
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.metaflow')).sort(), [
                'pi-target-state.json',
            ]);
        } finally {
            removeWorkspace(root);
        }
    });

    it('is idempotent for unchanged packages and provenance', () => {
        const root = workspace();
        try {
            const projected = projection(plugin('portable.alpha', [skill('alpha')]));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            const stateBefore = fs.readFileSync(targetStatePath(root));
            const manifestBefore = fs.readFileSync(
                pluginPath(root, 'portable.alpha', 'plugin.json'),
            );

            const second = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.deepStrictEqual(second.plan.changes, []);
            assert.strictEqual(second.plan.stateAction, 'none');
            assert.deepStrictEqual(fs.readFileSync(targetStatePath(root)), stateBefore);
            assert.deepStrictEqual(
                fs.readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json')),
                manifestBefore,
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('updates and removes managed roots while preserving unrelated Pi content', () => {
        const root = workspace();
        try {
            const first = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.stale', [skill('stale')]),
            );
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: first,
            });
            const neighbor = pluginPath(root, 'user-owned', 'plugin.json');
            fs.mkdirSync(path.dirname(neighbor), { recursive: true });
            fs.writeFileSync(neighbor, 'user-owned\n');
            const mcp = path.join(root, '.pi', 'mcp.json');
            fs.writeFileSync(mcp, 'user-owned-mcp\n');

            const next = projection(
                plugin('portable.alpha', [skill('alpha', 'changed')]),
                plugin('portable.new', [skill('new')]),
            );
            const applied = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });
            assert.strictEqual(applied.plan.blocked, false);
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.stale')), false);
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.new')), true);
            assert.strictEqual(fs.readFileSync(neighbor, 'utf8'), 'user-owned\n');
            assert.strictEqual(fs.readFileSync(mcp, 'utf8'), 'user-owned-mcp\n');
        } finally {
            removeWorkspace(root);
        }
    });

    it('updates provenance state without replacing byte-identical package roots', () => {
        const root = workspace();
        try {
            const originalSkill = skill('alpha');
            const movedSkill = {
                ...originalSkill,
                source: source('moved-alpha', 'skills/alpha/SKILL.md'),
            };
            const first = projection(plugin('portable.alpha', [originalSkill]));
            const moved = projection(plugin('portable.alpha', [movedSkill]));
            assert.strictEqual(first.packages[0].contentSha, moved.packages[0].contentSha);
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: first,
            });
            const rootIdentity = identity(pluginRoot(root, 'portable.alpha'));

            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: moved,
            });
            assert.deepStrictEqual(plan.changes, []);
            assert.strictEqual(plan.stateAction, 'write');
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: moved,
            });
            assert.deepStrictEqual(identity(pluginRoot(root, 'portable.alpha')), rootIdentity);
            assert.strictEqual(
                loadPiTargetState(root).state?.plugins['portable.alpha'].files[
                    'skills/alpha/SKILL.md'
                ].sources[0].capabilityId,
                'moved-alpha',
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed on an unmanaged root with the desired source name', () => {
        const root = workspace();
        try {
            fs.mkdirSync(pluginRoot(root, 'portable.alpha'), { recursive: true });
            fs.writeFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'), 'user-owned\n');
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some((entry) => entry.code === 'PI_TARGET_ROOT_UNTRACKED'),
            );
            assert.strictEqual(
                fs.readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'), 'utf8'),
                'user-owned\n',
            );
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('blocks the complete set when one managed root drifts or gains unmanaged content', () => {
        const root = workspace();
        try {
            const projected = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.beta', [skill('beta')]),
            );
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            fs.writeFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'), 'drifted\n');
            fs.writeFileSync(pluginPath(root, 'portable.alpha', 'extra.txt'), 'preserve\n');

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
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.beta')), true);
            assert.strictEqual(
                fs.readFileSync(pluginPath(root, 'portable.alpha', 'extra.txt'), 'utf8'),
                'preserve\n',
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('disables by removing only verified managed roots and their ledger', () => {
        const root = workspace();
        try {
            const projected = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.beta', [skill('beta')]),
            );
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            const neighbor = pluginPath(root, 'neighbor', 'plugin.json');
            fs.mkdirSync(path.dirname(neighbor), { recursive: true });
            fs.writeFileSync(neighbor, 'neighbor\n');

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.alpha')), false);
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.beta')), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
            assert.strictEqual(fs.readFileSync(neighbor, 'utf8'), 'neighbor\n');
        } finally {
            removeWorkspace(root);
        }
    });

    it('preserves existing managed output when a later projection is blocked', () => {
        const root = workspace();
        try {
            const initial = projection(plugin('portable.alpha', [skill('alpha')]));
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: initial,
            });
            const before = fs.readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json'));
            const duplicate = projectPiAgentPluginSkills({
                plugins: [
                    plugin('portable.first', [skill('review', 'first', 'first')]),
                    plugin('portable.second', [skill('review', 'second', 'second')]),
                ],
            });
            assert.strictEqual(duplicate.blocked, true);

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: duplicate,
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.deepStrictEqual(
                fs.readFileSync(pluginPath(root, 'portable.alpha', 'plugin.json')),
                before,
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('rejects forged package output before staging', () => {
        const root = workspace();
        try {
            const valid = projection(plugin('portable.alpha', [skill('alpha')]));
            const forged = {
                ...valid,
                packages: [
                    {
                        ...valid.packages[0],
                        files: [
                            ...valid.packages[0].files,
                            {
                                relativePath: 'mcp.json',
                                content: Buffer.from('{}\n'),
                                contentHash: rawHashFromBytes(Buffer.from('{}\n')),
                                sources: [],
                            },
                        ],
                    },
                ],
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
            assert.strictEqual(fs.existsSync(path.join(root, '.pi')), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('migrates a verified aggregate v1 root into the per-plugin set', () => {
        const root = workspace();
        try {
            const legacyRoot = pluginRoot(root, 'metaflow.project');
            fs.mkdirSync(legacyRoot, { recursive: true });
            fs.writeFileSync(path.join(legacyRoot, 'plugin.json'), '{"name":"metaflow.project"}\n');
            fs.mkdirSync(path.join(legacyRoot, 'skills', 'legacy'), { recursive: true });
            fs.writeFileSync(path.join(legacyRoot, 'skills', 'legacy', 'SKILL.md'), 'legacy\n');
            const legacySource = source('legacy', 'plugin.json');
            fs.mkdirSync(path.dirname(targetStatePath(root)), { recursive: true });
            fs.writeFileSync(
                targetStatePath(root),
                `${JSON.stringify(
                    {
                        schemaVersion: 1,
                        outputRoot: '.pi/plugins/metaflow.project',
                        projection: { contentSha: 'a'.repeat(64), version: '0.1.0+legacy' },
                        files: {
                            'plugin.json': {
                                contentHash: rawHash(path.join(legacyRoot, 'plugin.json')),
                                sources: [legacySource],
                            },
                            'skills/legacy/SKILL.md': {
                                contentHash: rawHash(
                                    path.join(legacyRoot, 'skills', 'legacy', 'SKILL.md'),
                                ),
                                sources: [source('legacy', 'skills/legacy/SKILL.md')],
                            },
                        },
                    },
                    null,
                    2,
                )}\n`,
            );
            assert.ok(
                loadPiTargetState(root).diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_STATE_LEGACY_MIGRATION_PENDING',
                ),
            );

            const projected = projection(plugin('portable.alpha', [skill('alpha')]));
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projected,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.strictEqual(fs.existsSync(legacyRoot), false);
            assert.strictEqual(fs.existsSync(pluginRoot(root, 'portable.alpha')), true);
            assert.deepStrictEqual(Object.keys(loadPiTargetState(root).state?.plugins ?? {}), [
                'portable.alpha',
            ]);
        } finally {
            removeWorkspace(root);
        }
    });

    it('cleans a verified aggregate v1 root without fabricating a replacement package', () => {
        const root = workspace();
        try {
            const legacyRoot = pluginRoot(root, 'metaflow.project');
            fs.mkdirSync(legacyRoot, { recursive: true });
            fs.writeFileSync(path.join(legacyRoot, 'plugin.json'), '{"name":"metaflow.project"}\n');
            fs.mkdirSync(path.join(legacyRoot, 'skills', 'legacy'), { recursive: true });
            fs.writeFileSync(path.join(legacyRoot, 'skills', 'legacy', 'SKILL.md'), 'legacy\n');
            fs.mkdirSync(path.dirname(targetStatePath(root)), { recursive: true });
            fs.writeFileSync(
                targetStatePath(root),
                `${JSON.stringify(
                    {
                        schemaVersion: 1,
                        outputRoot: '.pi/plugins/metaflow.project',
                        projection: { contentSha: 'a'.repeat(64), version: '0.1.0+legacy' },
                        files: {
                            'plugin.json': {
                                contentHash: rawHash(path.join(legacyRoot, 'plugin.json')),
                                sources: [source('legacy', 'plugin.json')],
                            },
                            'skills/legacy/SKILL.md': {
                                contentHash: rawHash(
                                    path.join(legacyRoot, 'skills', 'legacy', 'SKILL.md'),
                                ),
                                sources: [source('legacy', 'skills/legacy/SKILL.md')],
                            },
                        },
                    },
                    null,
                    2,
                )}\n`,
            );

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: false,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.strictEqual(fs.existsSync(legacyRoot), false);
            assert.strictEqual(fs.existsSync(targetStatePath(root)), false);
            assert.strictEqual(fs.existsSync(path.join(root, '.pi', 'plugins')), true);
        } finally {
            removeWorkspace(root);
        }
    });

    it('treats malformed or future target state as blocking', () => {
        const root = workspace();
        try {
            fs.mkdirSync(path.dirname(targetStatePath(root)), { recursive: true });
            fs.writeFileSync(targetStatePath(root), '{"schemaVersion":99}\n');
            const plan = planPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(plan.blocked, true);
            assert.ok(
                plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_STATE_VERSION_UNSUPPORTED',
                ),
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed while another reconciliation holds the project lock', () => {
        const root = workspace();
        try {
            writeTargetLock(root, process.pid);
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECONCILIATION_BUSY',
                ),
            );
        } finally {
            removeWorkspace(root);
        }
    });

    it('fails closed on malformed lock ownership without reclaiming or mutating output', () => {
        const root = workspace();
        try {
            const lock = path.join(root, '.metaflow', 'pi-target.lock');
            fs.mkdirSync(path.dirname(lock), { recursive: true });
            fs.writeFileSync(lock, '{"schemaVersion":99,"pid":1,"token":"unknown"}\n');

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.ok(
                result.plan.diagnostics.some(
                    (entry) => entry.code === 'PI_TARGET_RECONCILIATION_BUSY',
                ),
            );
            assert.strictEqual(
                fs.readFileSync(lock, 'utf8'),
                '{"schemaVersion":99,"pid":1,"token":"unknown"}\n',
            );
            assert.strictEqual(fs.existsSync(path.join(root, '.pi')), false);
        } finally {
            removeWorkspace(root);
        }
    });

    it('rolls back a partially installed multi-root transaction before replanning', () => {
        const root = workspace();
        const donor = workspace();
        try {
            const previous = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.beta', [skill('beta')]),
            );
            const next = projection(
                plugin('portable.alpha', [skill('alpha-next')]),
                plugin('portable.beta', [skill('beta-next')]),
            );
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            applyPiProjectPluginSynchronization({
                workspaceRoot: donor,
                enabled: true,
                projection: next,
            });

            const transactionId = '11111111-1111-4111-8111-111111111111';
            const transactionRoot = path.join(
                root,
                '.metaflow',
                `.pi-target-transaction-${transactionId}`,
            );
            const nextParent = path.join(transactionRoot, 'next');
            const previousParent = path.join(transactionRoot, 'previous');
            fs.mkdirSync(nextParent, { recursive: true });
            fs.mkdirSync(previousParent);
            const rootActions = ['portable.alpha', 'portable.beta'].map((pluginName) => {
                const previousSnapshot = rootSnapshot(pluginRoot(root, pluginName));
                const nextSnapshot = rootSnapshot(pluginRoot(donor, pluginName));
                fs.renameSync(pluginRoot(donor, pluginName), path.join(nextParent, pluginName));
                return {
                    pluginName,
                    action: 'replace',
                    previousRoot: previousSnapshot,
                    nextRoot: nextSnapshot,
                };
            });
            fs.renameSync(targetStatePath(donor), path.join(transactionRoot, 'next-state.json'));
            const previousState = fileSnapshot(targetStatePath(root));
            const nextState = fileSnapshot(path.join(transactionRoot, 'next-state.json'));

            fs.renameSync(
                pluginRoot(root, 'portable.alpha'),
                path.join(previousParent, 'portable.alpha'),
            );
            fs.renameSync(
                path.join(nextParent, 'portable.alpha'),
                pluginRoot(root, 'portable.alpha'),
            );
            const journal = {
                schemaVersion: 2,
                transactionId,
                committed: false,
                rootActions,
                stateAction: 'write',
                transactionRootIdentity: identity(transactionRoot),
                previousState,
                nextState,
            };
            fs.writeFileSync(
                path.join(root, '.metaflow', 'pi-target-transaction.json'),
                `${JSON.stringify(journal, null, 2)}\n`,
            );
            const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
            assert.ok(exited.pid);
            const staleLock = writeTargetLock(root, exited.pid!);

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.strictEqual(
                fs.existsSync(pluginPath(root, 'portable.alpha', 'skills/alpha/SKILL.md')),
                true,
            );
            assert.strictEqual(
                fs.existsSync(pluginPath(root, 'portable.alpha', 'skills/alpha-next/SKILL.md')),
                false,
            );
            assert.strictEqual(
                fs.existsSync(pluginPath(root, 'portable.beta', 'skills/beta/SKILL.md')),
                true,
            );
            assert.strictEqual(fs.existsSync(transactionRoot), false);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target-transaction.json')),
                false,
            );
            assert.strictEqual(fs.existsSync(staleLock), false);
        } finally {
            removeWorkspace(root);
            removeWorkspace(donor);
        }
    });

    it('finalizes a committed multi-root transaction after reclaiming its stale owner lock', () => {
        const root = workspace();
        const donor = workspace();
        try {
            const previous = projection(
                plugin('portable.alpha', [skill('alpha')]),
                plugin('portable.beta', [skill('beta')]),
            );
            const next = projection(
                plugin('portable.alpha', [skill('alpha-next')]),
                plugin('portable.beta', [skill('beta-next')]),
            );
            applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: previous,
            });
            applyPiProjectPluginSynchronization({
                workspaceRoot: donor,
                enabled: true,
                projection: next,
            });

            const transactionId = '33333333-3333-4333-8333-333333333333';
            const transactionRoot = path.join(
                root,
                '.metaflow',
                `.pi-target-transaction-${transactionId}`,
            );
            const nextParent = path.join(transactionRoot, 'next');
            const previousParent = path.join(transactionRoot, 'previous');
            fs.mkdirSync(nextParent, { recursive: true });
            fs.mkdirSync(previousParent);
            const rootActions = ['portable.alpha', 'portable.beta'].map((pluginName) => {
                const previousSnapshot = rootSnapshot(pluginRoot(root, pluginName));
                const nextSnapshot = rootSnapshot(pluginRoot(donor, pluginName));
                fs.renameSync(pluginRoot(donor, pluginName), path.join(nextParent, pluginName));
                fs.renameSync(pluginRoot(root, pluginName), path.join(previousParent, pluginName));
                fs.renameSync(path.join(nextParent, pluginName), pluginRoot(root, pluginName));
                return {
                    pluginName,
                    action: 'replace',
                    previousRoot: previousSnapshot,
                    nextRoot: nextSnapshot,
                };
            });
            const previousState = fileSnapshot(targetStatePath(root));
            const nextState = fileSnapshot(targetStatePath(donor));
            fs.renameSync(targetStatePath(root), path.join(transactionRoot, 'previous-state.json'));
            fs.renameSync(targetStatePath(donor), targetStatePath(root));
            const journal = {
                schemaVersion: 2,
                transactionId,
                committed: true,
                rootActions,
                stateAction: 'write',
                transactionRootIdentity: identity(transactionRoot),
                previousState,
                nextState,
            };
            fs.writeFileSync(
                path.join(root, '.metaflow', 'pi-target-transaction.json'),
                `${JSON.stringify(journal, null, 2)}\n`,
            );
            const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
            assert.ok(exited.pid);
            writeTargetLock(root, exited.pid!);

            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: next,
            });
            assert.strictEqual(result.plan.blocked, false);
            assert.deepStrictEqual(result.plan.changes, []);
            assert.strictEqual(
                fs.existsSync(pluginPath(root, 'portable.alpha', 'skills/alpha-next/SKILL.md')),
                true,
            );
            assert.strictEqual(
                fs.existsSync(pluginPath(root, 'portable.beta', 'skills/beta-next/SKILL.md')),
                true,
            );
            assert.strictEqual(fs.existsSync(transactionRoot), false);
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target-transaction.json')),
                false,
            );
            assert.strictEqual(
                fs.existsSync(path.join(root, '.metaflow', 'pi-target.lock')),
                false,
            );
        } finally {
            removeWorkspace(root);
            removeWorkspace(donor);
        }
    });

    it('rejects a linked desired root without following or removing its target', function () {
        const root = workspace();
        const outside = workspace();
        try {
            fs.writeFileSync(path.join(outside, 'plugin.json'), 'outside\n');
            fs.mkdirSync(path.join(root, '.pi', 'plugins'), { recursive: true });
            try {
                fs.symlinkSync(outside, pluginRoot(root, 'portable.alpha'), 'junction');
            } catch {
                this.skip();
                return;
            }
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.strictEqual(
                fs.readFileSync(path.join(outside, 'plugin.json'), 'utf8'),
                'outside\n',
            );
        } finally {
            removeWorkspace(root);
            removeWorkspace(outside);
        }
    });

    it('rejects a dangling desired-root link without replacing it', function () {
        const root = workspace();
        const outside = workspace();
        try {
            fs.mkdirSync(path.join(root, '.pi', 'plugins'), { recursive: true });
            const target = path.join(outside, 'missing');
            try {
                fs.symlinkSync(target, pluginRoot(root, 'portable.alpha'), 'junction');
            } catch {
                this.skip();
                return;
            }
            const result = applyPiProjectPluginSynchronization({
                workspaceRoot: root,
                enabled: true,
                projection: projection(plugin('portable.alpha', [skill('alpha')])),
            });
            assert.strictEqual(result.plan.blocked, true);
            assert.strictEqual(
                fs.lstatSync(pluginRoot(root, 'portable.alpha')).isSymbolicLink(),
                true,
            );
            assert.strictEqual(fs.existsSync(target), false);
        } finally {
            removeWorkspace(root);
            removeWorkspace(outside);
        }
    });
});

function rawHashFromBytes(content: Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}
