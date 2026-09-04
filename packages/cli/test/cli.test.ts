/**
 * CLI integration tests.
 *
 * Exercises the full MetaFlow CLI workflow end-to-end using temporary
 * workspaces with real filesystem operations.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import packageMetadata from '../package.json';
import { createTestWorkspace, runCli, standardConfig, TestWorkspace } from './helpers';
import { startWatch, WatchCycleResult } from '../src/commands/watch';
import { promoteAuto } from '../src/commands/promote';
import { execSync } from 'child_process';
import { AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID } from '@metaflow/engine';

// ── Helpers ────────────────────────────────────────────────────────

const STANDARD_LAYERS = {
    'company/core': [
        { relativePath: 'skills/testing/SKILL.md', content: '# Testing Skill\nTest content.' },
        { relativePath: 'agents/reviewer.agent.md', content: '# Reviewer Agent\nReview code.' },
        {
            relativePath: 'instructions/coding.md',
            content: '# Coding Instructions\nWrite clean code.',
        },
        { relativePath: 'prompts/review.prompt.md', content: '# Review Prompt\nReview the PR.' },
    ],
};

const PI_PLUGIN_LAYERS = {
    'company/core': [
        {
            relativePath: 'plugin.json',
            content: JSON.stringify({
                $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
                name: 'company.core',
            }),
        },
        {
            relativePath: 'skills/testing/SKILL.md',
            content:
                '---\nname: testing\ndescription: Test the current workspace\n---\n\n# Testing\n',
        },
    ],
};

function piConfig(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
    return standardConfig({ targets: { pi: { enabled: true } }, ...overrides });
}

function piTargetPath(root: string, relativePath = ''): string {
    return path.join(root, '.pi', 'plugins', 'company.core', ...relativePath.split('/'));
}

function namedPiTargetPath(root: string, pluginName: string, relativePath = ''): string {
    return path.join(root, '.pi', 'plugins', pluginName, ...relativePath.split('/'));
}

function piStatePath(root: string): string {
    return path.join(root, '.metaflow', 'pi-target-state.json');
}

function synchronizedPath(relativePath: string, layer = 'company/core', repo = 'default'): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const dir = path.posix.dirname(normalized);
    const base = path.posix.basename(normalized);
    const layerToken = layer.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const prefixed = `_${repo}-${layerToken}__${base}`;
    return dir === '.' ? prefixed : `${dir}/${prefixed}`;
}

function originalSynchronizedPath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

// ── Init command ───────────────────────────────────────────────────

describe('CLI: init', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should create .metaflow/config.jsonc in an empty workspace', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['init', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created:'));

        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        assert.ok(fs.existsSync(configPath), '.metaflow/config.jsonc should exist');

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(config.compatibilityVersion, 6);
        assert.strictEqual(config.targets, undefined);
        assert.ok(config.metadataRepos, 'config should have metadataRepos');
        assert.strictEqual(config.metadataRepos[0].capabilities, undefined);
        assert.deepStrictEqual(config.profiles?.default?.enabledCapabilities, []);
    });

    it('should refuse to overwrite existing config without --force', async () => {
        ws = createTestWorkspace({ config: standardConfig() });
        const result = await runCli(['init', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('already exists'));
    });

    it('should overwrite existing config with --force', async () => {
        ws = createTestWorkspace({ config: standardConfig() });
        const result = await runCli(['init', '--force', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created:'));
    });
});

// ── Status command ─────────────────────────────────────────────────

describe('CLI: status', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should display overlay status with file counts', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Config:'), 'should show config path');
        assert.ok(result.stdout.includes('Capabilities:'), 'should show configured capabilities');
        assert.ok(result.stdout.includes('Profile: default'), 'should show active profile');
        assert.ok(result.stdout.includes('Injection:'), 'should show injection mode summary');
        assert.ok(
            result.stdout.includes('Settings Entries:'),
            'should show settings entry summary',
        );
        assert.ok(
            result.stdout.includes('chat.instructionsFilesLocations'),
            'should show injected settings keys',
        );
        assert.ok(result.stdout.includes('Sources:'), 'should show provenance source summary');
        assert.ok(result.stdout.includes('Files:'), 'should show file count');
    });

    it('should fail gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
    });

    it('should include capability metadata when CAPABILITY.md is present', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'CAPABILITY.md',
                        content: [
                            '---',
                            'name: SDLC Traceability',
                            'description: Traceability metadata capability.',
                            'license: MIT',
                            '---',
                        ].join('\n'),
                    },
                    {
                        relativePath: 'instructions/coding.md',
                        content: '# Coding Instructions',
                    },
                ],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Capabilities: 1'));
        assert.ok(result.stdout.includes('SDLC Traceability'));
        assert.ok(result.stdout.includes('Traceability metadata capability.'));
        assert.ok(result.stdout.includes('license: MIT'));
    });

    it('should include warning file path for malformed capability manifest', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: {
                'company/core': [
                    {
                        relativePath: 'CAPABILITY.md',
                        content: [
                            '---',
                            'name SDLC Traceability',
                            'description: Missing colon in previous line causes warning',
                            '---',
                        ].join('\n'),
                    },
                    {
                        relativePath: 'instructions/coding.md',
                        content: '# Coding Instructions',
                    },
                ],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);
        const manifestPath = path.join(
            ws.root,
            '.ai',
            'ai-metadata',
            'company',
            'core',
            'CAPABILITY.md',
        );

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('CAPABILITY_FRONTMATTER_LINE_INVALID'));
        assert.ok(result.stdout.includes(manifestPath));
    });
});

// ── Preview command ────────────────────────────────────────────────

describe('CLI: preview', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should list effective files and pending adds', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['preview', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Effective files:'));
        // synchronized files should show up
        assert.ok(result.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));
        assert.ok(result.stdout.includes(synchronizedPath('agents/reviewer.agent.md')));
        // settings files should appear too (they're in effective list)
        assert.ok(result.stdout.includes('instructions/coding.md'));
        assert.ok(
            result.stdout.includes(' @ '),
            'preview should include human-readable source provenance',
        );
        assert.ok(result.stdout.includes('Summary:'), 'preview should show classification summary');
        assert.ok(
            result.stdout.includes('Settings Entries:'),
            'preview should show settings entry summary',
        );
        assert.ok(
            result.stdout.includes('Sources:'),
            'preview should show aggregated provenance sources',
        );
    });

    it('should show no files for empty overlay', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: { 'company/core': [] },
        });

        const result = await runCli(['preview', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No files in overlay'));
    });

    it('previews an enabled current-version root instruction without writing config', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const before = fs.readFileSync(configPath, 'utf-8');

        const result = await runCli(['preview', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.ok(
            data.pendingChanges.some(
                (change: { relativePath: string }) =>
                    change.relativePath === 'copilot-instructions.md',
            ),
        );
        assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
    });

    it('fails a stale root-enabled preview clearly without migrating config', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 4,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const before = fs.readFileSync(configPath, 'utf-8');

        const result = await runCli(['preview', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Configuration migration is required'));
        assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
    });

    it('should preserve original relative paths when fileNamingStrategy is original-unless-conflict', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
            layers: STANDARD_LAYERS,
        });

        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(
            previewResult.stdout.includes(originalSynchronizedPath('skills/testing/SKILL.md')),
        );
        assert.ok(!previewResult.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));

        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(fs.existsSync(path.join(ws.root, '.github', 'skills', 'testing', 'SKILL.md')));

        const validateResult = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(validateResult.exitCode, 0);
    });

    it('should fail preview and apply with the same remap message after prefixed outputs already exist', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const initialApply = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(initialApply.exitCode, 0);

        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const previewResult = await runCli(['preview', '-w', ws.root]);
        const applyResult = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(previewResult.exitCode, 1);
        assert.strictEqual(applyResult.exitCode, 1);
        assert.ok(previewResult.stderr.includes('Automatic migration is not supported'));
        assert.ok(applyResult.stderr.includes('Automatic migration is not supported'));
    });

    it('exits early when the config cannot be loaded', async () => {
        ws = createTestWorkspace({});
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ not valid jsonc',
            'utf-8',
        );

        const result = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('emits a JSON error object when preview fails in --json mode', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const initialApply = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(initialApply.exitCode, 0);

        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.ok(typeof data.error === 'string' && data.error.length > 0);
    });

    it('prints surfaced capability conflict warnings', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/extra' },
                ],
                profiles: {
                    default: {
                        enabledCapabilities: ['primary:company/core', 'primary:company/extra'],
                    },
                    lean: { enabledCapabilities: [] },
                },
            }),
            layers: {
                'company/core': [{ relativePath: 'skills/dup/SKILL.md', content: 'A' }],
                'company/extra': [{ relativePath: 'skills/dup/SKILL.md', content: 'B' }],
            },
        });

        const result = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Warnings ('), result.stdout);
        assert.ok(result.stdout.includes('CAPABILITY_CONFLICT'), result.stdout);
    });
});

// ── Apply command ──────────────────────────────────────────────────

describe('CLI: apply', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should synchronize classified files to .github/', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Done:'));

        // Synchronized files should exist in .github/
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        assert.ok(fs.existsSync(skillPath), 'skill file should be synchronized');
        assert.ok(fs.existsSync(agentPath), 'agent file should be synchronized');

        // Should have provenance header
        const skillContent = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(skillContent.includes('metaflow:provenance'), 'should have provenance header');
        assert.ok(skillContent.includes('# Testing Skill'), 'should preserve original content');

        // Settings files should NOT be synchronized into .github
        const instrPath = path.join(ws.root, '.github', 'instructions', 'coding.md');
        assert.ok(!fs.existsSync(instrPath), 'settings file should not be synchronized');
    });

    it('migrates v4 and applies an existing root opt-in on the first invocation', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 4,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        const result = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(fs.existsSync(path.join(ws.root, '.github', 'copilot-instructions.md')));
        const persisted = JSON.parse(
            fs.readFileSync(path.join(ws.root, '.metaflow', 'config.jsonc'), 'utf-8'),
        );
        assert.strictEqual(persisted.compatibilityVersion, 6);
        assert.strictEqual(persisted.synchronization?.repoWideCopilotInstructions, true);
    });

    it('should create managed state after apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        assert.ok(fs.existsSync(statePath), 'managed state should be created');

        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        assert.strictEqual(state.version, 1);
        assert.ok(
            state.files[synchronizedPath('skills/testing/SKILL.md')],
            'state should track skill file',
        );
        assert.ok(
            state.files[synchronizedPath('agents/reviewer.agent.md')],
            'state should track agent file',
        );
        assert.strictEqual(
            state.files[synchronizedPath('skills/testing/SKILL.md')].sourceRelativePath,
            'skills/testing/SKILL.md',
        );
    });

    it('should be idempotent — second apply produces same output', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // First apply
        const r1 = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(r1.exitCode, 0);

        // Read file content after first apply
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        const contentAfterFirst = fs.readFileSync(skillPath, 'utf-8');

        // Second apply (updates the provenance timestamp, but body is same)
        const r2 = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(r2.exitCode, 0);

        // The file should still exist and contain the original body
        const contentAfterSecond = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(contentAfterSecond.includes('# Testing Skill'));
    });
});

describe('CLI: Pi Agent Plugin target', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('previews an enabled package without writing target output', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });

        const result = await runCli(['preview', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.piTarget.enabled, true);
        assert.strictEqual(data.piTarget.blocked, false);
        assert.deepStrictEqual(
            data.piTarget.pendingChanges.map(
                (entry: { relativePath: string }) => entry.relativePath,
            ),
            [
                '.pi/plugins/company.core/plugin.json',
                '.pi/plugins/company.core/skills/testing/SKILL.md',
            ],
        );
        assert.strictEqual(data.piTarget.stateAction, 'write');
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root)), false);
        assert.strictEqual(fs.existsSync(piStatePath(ws.root)), false);
    });

    it('applies idempotently and validates the strict generated package', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });

        const first = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(first.exitCode, 0);
        assert.ok(first.stdout.includes('pi write'));
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root, 'plugin.json')), true);
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root, 'skills/testing/SKILL.md')), true);
        assert.strictEqual(fs.existsSync(piStatePath(ws.root)), true);
        assert.deepStrictEqual(fs.readdirSync(piTargetPath(ws.root)).sort(), [
            'plugin.json',
            'skills',
        ]);

        const second = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(second.exitCode, 0);
        assert.ok(second.stdout.includes('Pi 0 written, 0 removed'));

        const validated = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(validated.exitCode, 0);
        const data = JSON.parse(validated.stdout);
        assert.strictEqual(data.piTarget.valid, true);
        assert.strictEqual(data.piTarget.stateAction, 'none');
        assert.deepStrictEqual(data.piTarget.pendingChanges, []);
    });

    it('projects only capabilities selected by the active profile', async () => {
        const duplicateSkill = (label: string) =>
            `---\nname: testing\ndescription: ${label}\n---\n\n# ${label}\n`;
        ws = createTestWorkspace({
            config: piConfig({
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/inactive' },
                ],
                profiles: {
                    default: { enabledCapabilities: ['primary:company/core'] },
                    inactive: { enabledCapabilities: ['primary:company/inactive'] },
                },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: 'plugin.json',
                        content: JSON.stringify({
                            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
                            name: 'company.core',
                        }),
                    },
                    {
                        relativePath: 'skills/testing/SKILL.md',
                        content: duplicateSkill('Active skill'),
                    },
                ],
                'company/inactive': [
                    {
                        relativePath: 'plugin.json',
                        content: JSON.stringify({
                            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
                            name: 'company.inactive',
                        }),
                    },
                    {
                        relativePath: 'skills/testing/SKILL.md',
                        content: duplicateSkill('Inactive skill'),
                    },
                ],
            },
        });

        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        assert.ok(
            fs
                .readFileSync(piTargetPath(ws.root, 'skills/testing/SKILL.md'), 'utf8')
                .includes('# Active skill'),
        );

        assert.strictEqual(
            (await runCli(['profile', 'set', 'inactive', '-w', ws.root])).exitCode,
            0,
        );
        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        assert.ok(
            fs
                .readFileSync(
                    namedPiTargetPath(ws.root, 'company.inactive', 'skills/testing/SKILL.md'),
                    'utf8',
                )
                .includes('# Inactive skill'),
        );
        assert.strictEqual(fs.existsSync(namedPiTargetPath(ws.root, 'company.core')), false);
    });

    it('removes stale skills, then disables only the managed package and ledger', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });
        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        const sourceSkill = path.join(
            ws.metadataRepo,
            'company',
            'core',
            'skills',
            'testing',
            'SKILL.md',
        );
        fs.rmSync(sourceSkill);

        const staleApply = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(staleApply.exitCode, 0);
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root, 'skills/testing/SKILL.md')), false);
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root, 'plugin.json')), true);

        const neighboringPlugin = path.join(ws.root, '.pi', 'plugins', 'neighbor', 'plugin.json');
        const mcpPath = path.join(ws.root, '.pi', 'mcp.json');
        fs.mkdirSync(path.dirname(neighboringPlugin), { recursive: true });
        fs.writeFileSync(neighboringPlugin, 'neighbor\n');
        fs.writeFileSync(mcpPath, 'user mcp\n');
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.targets.pi.enabled = false;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const disabled = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(disabled.exitCode, 0);
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root)), false);
        assert.strictEqual(fs.existsSync(piStatePath(ws.root)), false);
        assert.strictEqual(fs.readFileSync(neighboringPlugin, 'utf8'), 'neighbor\n');
        assert.strictEqual(fs.readFileSync(mcpPath, 'utf8'), 'user mcp\n');
    });

    it('blocks an untracked package before writing ordinary overlay output', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });
        fs.mkdirSync(piTargetPath(ws.root), { recursive: true });
        fs.writeFileSync(piTargetPath(ws.root, 'plugin.json'), 'user package\n');

        const result = await runCli(['apply', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('PI_TARGET_ROOT_UNTRACKED'));
        assert.strictEqual(
            fs.readFileSync(piTargetPath(ws.root, 'plugin.json'), 'utf8'),
            'user package\n',
        );
        assert.strictEqual(fs.existsSync(path.join(ws.root, '.github')), false);
        assert.strictEqual(fs.existsSync(piStatePath(ws.root)), false);
    });

    it('reports target drift and blocks apply and clean without force override', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });
        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        const generatedSkill = piTargetPath(ws.root, 'skills/testing/SKILL.md');
        fs.writeFileSync(generatedSkill, 'user edit\n');
        const synchronizedSkill = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );

        const validated = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(validated.exitCode, 1);
        const data = JSON.parse(validated.stdout);
        assert.strictEqual(data.piTarget.blocked, true);
        assert.ok(
            data.piTarget.diagnostics.some(
                (entry: { code: string }) => entry.code === 'PI_TARGET_DRIFT',
            ),
        );

        const reapplied = await runCli(['apply', '--force', '-w', ws.root]);
        assert.strictEqual(reapplied.exitCode, 1);
        assert.strictEqual(fs.readFileSync(generatedSkill, 'utf8'), 'user edit\n');

        const cleaned = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(cleaned.exitCode, 1);
        assert.strictEqual(fs.readFileSync(generatedSkill, 'utf8'), 'user edit\n');
        assert.strictEqual(fs.existsSync(synchronizedSkill), true);
    });

    it('clean removes managed Pi output while preserving unrelated .pi content', async () => {
        ws = createTestWorkspace({ config: piConfig(), layers: PI_PLUGIN_LAYERS });
        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        const neighboringPlugin = path.join(ws.root, '.pi', 'plugins', 'neighbor', 'plugin.json');
        const mcpPath = path.join(ws.root, '.pi', 'mcp.json');
        fs.mkdirSync(path.dirname(neighboringPlugin), { recursive: true });
        fs.writeFileSync(neighboringPlugin, 'neighbor\n');
        fs.writeFileSync(mcpPath, 'user mcp\n');

        const result = await runCli(['clean', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(fs.existsSync(piTargetPath(ws.root)), false);
        assert.strictEqual(fs.existsSync(piStatePath(ws.root)), false);
        assert.strictEqual(fs.readFileSync(neighboringPlugin, 'utf8'), 'neighbor\n');
        assert.strictEqual(fs.readFileSync(mcpPath, 'utf8'), 'user mcp\n');
    });
});

// ── Drift detection + promote ──────────────────────────────────────

describe('CLI: drift and promote', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should detect no drift on clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No locally modified files'));
    });

    it('should detect drift after manual file edit (exit code 2)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply first
        await runCli(['apply', '-w', ws.root]);

        // Manually edit a managed file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'I was locally modified by the user.\n');

        // Promote should detect drift
        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 2);
        assert.ok(result.stdout.includes('locally modified'));
        assert.ok(result.stdout.includes(synchronizedPath('skills/testing/SKILL.md')));
    });

    it('should skip drifted files on re-apply (without --force)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually edit
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Locally modified.\n');

        // Re-apply should skip the drifted file
        const result = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('skip'));

        // Drifted content should be preserved
        const content = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(content.includes('Locally modified'));
    });

    it('should overwrite drifted files with --force', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually edit
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Locally modified.\n');

        // Force apply should overwrite
        const result = await runCli(['apply', '--force', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        // Content should be restored from source
        const content = fs.readFileSync(skillPath, 'utf-8');
        assert.ok(content.includes('# Testing Skill'));
    });
});

// ── Clean command ──────────────────────────────────────────────────

describe('CLI: clean', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should remove all managed files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply first
        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        assert.ok(fs.existsSync(skillPath), 'file should exist after apply');

        // Clean
        const result = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Done:'));
        assert.ok(!fs.existsSync(skillPath), 'file should be removed after clean');
    });

    it('should not remove drifted files during clean', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Modify a file to cause drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'User content.\n');

        // Clean should skip the drifted file
        const result = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(fs.existsSync(skillPath), 'drifted file should be preserved');
        assert.ok(result.stdout.includes('skip'));
    });
});

// ── Profile command ────────────────────────────────────────────────

describe('CLI: profile', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should list available profiles', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'list', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('default'));
        assert.ok(result.stdout.includes('(active)'));
        assert.ok(result.stdout.includes('lean'));
    });

    it('should set active profile', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ targets: { pi: { enabled: true } } }),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'set', 'lean', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('"lean"'));

        // Verify config file was updated
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(config.activeProfile, 'lean');
        assert.deepStrictEqual(config.targets, { pi: { enabled: true } });
    });

    it('should reject unknown profile name', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'set', 'nonexistent', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('not found'));
    });

    it('profile switch should affect synchronization', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with default profile (all files)
        await runCli(['apply', '-w', ws.root]);
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        assert.ok(fs.existsSync(agentPath), 'agent file should exist with default profile');

        // Switch to lean profile (disables agents/**) and re-apply
        await runCli(['profile', 'set', 'lean', '-w', ws.root]);
        await runCli(['apply', '-w', ws.root]);

        // After lean profile, agent file should be removed (no longer in overlay)
        assert.ok(!fs.existsSync(agentPath), 'agent file should be removed with lean profile');
    });
});

// ── Full lifecycle ─────────────────────────────────────────────────

describe('CLI: full lifecycle', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('init → status → preview → apply → promote → clean', async () => {
        // 1. Start with empty workspace + metadata repo
        ws = createTestWorkspace({
            layers: STANDARD_LAYERS,
        });

        // 2. Init a config
        const initResult = await runCli(['init', '-w', ws.root]);
        assert.strictEqual(initResult.exitCode, 0);

        // 3. Overwrite with our standard config (init creates a template)
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, JSON.stringify(standardConfig(), null, 2), 'utf-8');

        // 4. Status
        const statusResult = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(statusResult.exitCode, 0);
        assert.ok(statusResult.stdout.includes('Files:'));

        // 5. Preview
        const previewResult = await runCli(['preview', '-w', ws.root]);
        assert.strictEqual(previewResult.exitCode, 0);
        assert.ok(previewResult.stdout.includes('Effective files:'));

        // 6. Apply
        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);
        assert.ok(applyResult.stdout.includes('Done:'));

        // 7. Promote (should be clean)
        const promoteResult = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(promoteResult.exitCode, 0);
        assert.ok(promoteResult.stdout.includes('No locally modified'));

        // 8. Clean
        const cleanResult = await runCli(['clean', '-w', ws.root]);
        assert.strictEqual(cleanResult.exitCode, 0);
        assert.ok(cleanResult.stdout.includes('Done:'));
    });
});

// ── JSON output ────────────────────────────────────────────────────

describe('CLI: --json output', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('status --json returns valid JSON', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.ok(data.configPath);
        assert.strictEqual(data.activeProfile, 'default');
        assert.strictEqual(data.injection.modes.instructions, 'settings');
        assert.ok(Array.isArray(data.injection.settingsEntries));
        assert.ok(Array.isArray(data.sources));
        assert.strictEqual(data.synchronization.repoWideCopilotInstructions, false);
        assert.strictEqual(data.synchronization.migrationRequired, false);
        assert.ok(Array.isArray(data.synchronization.retained));
        assert.strictEqual(data.agentPlugins.disposition, 'compatibility');
        assert.ok(typeof data.agentPlugins.summary.standardConformancePercent === 'number');
        assert.ok(typeof data.agentPlugins.summary.portablePercent === 'number');
        assert.ok(typeof data.files.total === 'number');
        assert.ok(typeof data.files.settings === 'number');
        assert.ok(typeof data.files.synchronized === 'number');
    });

    it('preview --json returns valid JSON with files and changes', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['preview', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.ok(Array.isArray(data.effectiveFiles));
        assert.ok(Array.isArray(data.pendingChanges));
        assert.ok(data.effectiveFiles.length > 0);

        // Check structure
        const first = data.effectiveFiles[0];
        assert.ok(first.relativePath);
        assert.ok(first.classification);
        assert.ok(first.sourceLayer);
    });
});

// ── Agent Plugins conformance ─────────────────────────────────────

describe('CLI: Agent Plugins conformance', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    const conformanceLayers = {
        'company/core': [
            {
                relativePath: 'skills/portable/SKILL.md',
                content: '---\nname: portable\ndescription: Portable workflow\n---\n\n# Portable\n',
            },
            {
                relativePath: '.github/skills/legacy/SKILL.md',
                content:
                    '---\nname: legacy\ndescription: Legacy packaged workflow\n---\n\n# Legacy\n',
            },
            {
                relativePath: '.github/prompts/review.prompt.md',
                content: '# Review prompt\n',
            },
        ],
    };

    it('reports audit diagnostics and conformance scores as JSON', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: conformanceLayers,
        });

        const result = await runCli(['agent-plugins', 'report', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const report = JSON.parse(result.stdout);
        assert.strictEqual(report.disposition, 'audit-standard');
        assert.deepStrictEqual(report.summary, {
            total: 3,
            portable: 1,
            clientExtensions: 0,
            legacyHost: 1,
            noEquivalent: 1,
            invalid: 0,
            standardConformancePercent: 33,
            portablePercent: 33,
        });
        assert.ok(
            report.diagnostics.some(
                (entry: { code: string }) =>
                    entry.code === 'AGENT_PLUGIN_SAFE_RELOCATION_AVAILABLE',
            ),
        );
        assert.ok(
            report.diagnostics.some(
                (entry: { code: string }) => entry.code === 'AGENT_METADATA_NO_STANDARD_EQUIVALENT',
            ),
        );
    });

    it('audits strict package control files, client extensions, and invalid components', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: 'plugin.json',
                        content: JSON.stringify({
                            $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
                            name: 'strict-audit',
                            extensions: { 'com.github.copilot': {} },
                        }),
                    },
                    {
                        relativePath: 'mcp.json',
                        content: JSON.stringify({
                            $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
                            mcpServers: {},
                        }),
                    },
                    {
                        relativePath: 'com.github.copilot/prompts/review.prompt.md',
                        content: '# Copilot prompt\n',
                    },
                    {
                        relativePath: 'skills/broken/SKILL.md',
                        content: '# Missing required frontmatter\n',
                    },
                ],
            },
        });

        const result = await runCli(['agent-plugins', 'report', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        const report = JSON.parse(result.stdout);
        assert.deepStrictEqual(report.summary, {
            total: 4,
            portable: 2,
            clientExtensions: 1,
            legacyHost: 0,
            noEquivalent: 0,
            invalid: 1,
            standardConformancePercent: 75,
            portablePercent: 50,
        });
        assert.strictEqual(
            report.diagnostics.find(
                (entry: { code: string }) =>
                    entry.code === 'AGENT_PLUGIN_SKILL_FRONTMATTER_INVALID',
            )?.severity,
            'error',
        );
        assert.ok(
            report.diagnostics.some(
                (entry: { code: string }) =>
                    entry.code === 'AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE',
            ),
        );
        assert.ok(
            report.diagnostics.some(
                (entry: { code: string }) =>
                    entry.code === 'AGENT_PLUGIN_VENDOR_EXTENSION_NONPORTABLE',
            ),
        );

        const humanReport = await runCli(['agent-plugins', 'report', '-w', ws.root]);
        assert.strictEqual(humanReport.exitCode, 0);
        assert.match(humanReport.stdout, /\[ERROR\] AGENT_PLUGIN_SKILL_FRONTMATTER_INVALID:/);
        assert.match(humanReport.stdout, /\[WARNING\] AGENT_PLUGIN_CLIENT_EXTENSION_NONPORTABLE:/);

        const humanStatus = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(humanStatus.exitCode, 0);
        assert.ok(humanStatus.stdout.includes('Agent Plugins diagnostics:'));
        assert.match(humanStatus.stdout, /\[ERROR\] AGENT_PLUGIN_SKILL_FRONTMATTER_INVALID:/);
    });

    it('keeps prefer-standard quiet while retaining the same semantic report', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'prefer-standard',
                },
            }),
            layers: conformanceLayers,
        });

        const result = await runCli(['agent-plugins', 'report', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const report = JSON.parse(result.stdout);
        assert.strictEqual(report.disposition, 'prefer-standard');
        assert.strictEqual(report.summary.standardConformancePercent, 33);
        assert.deepStrictEqual(report.diagnostics, []);
    });

    it('audits every configured capability rather than only the active profile', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/inactive' },
                ],
                profiles: {
                    default: { enabledCapabilities: ['primary:company/core'] },
                },
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: 'skills/portable/SKILL.md',
                        content: '# Portable\n',
                    },
                ],
                'company/inactive': [
                    {
                        relativePath: '.github/prompts/inactive.prompt.md',
                        content: '# Inactive prompt\n',
                    },
                ],
            },
        });

        const result = await runCli(['agent-plugins', 'report', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        const report = JSON.parse(result.stdout);
        assert.strictEqual(report.summary.total, 2);
        assert.ok(
            report.classifications.some(
                (entry: { layerId: string; sourcePath: string }) =>
                    entry.layerId.endsWith('company/inactive') &&
                    entry.sourcePath === '.github/prompts/inactive.prompt.md',
            ),
        );
    });

    it('requires explicit migration decisions and never writes source metadata', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: conformanceLayers,
        });
        const promptPath = path.join(
            ws.metadataRepo,
            'company',
            'core',
            '.github',
            'prompts',
            'review.prompt.md',
        );
        const before = fs.readFileSync(promptPath, 'utf-8');

        const pending = await runCli(['agent-plugins', 'plan-migration', '--json', '-w', ws.root]);
        assert.strictEqual(pending.exitCode, 0);
        const pendingPlan = JSON.parse(pending.stdout);
        assert.strictEqual(pendingPlan.blocked, true);
        assert.strictEqual(pendingPlan.candidates.length, 2);
        assert.strictEqual(pendingPlan.unresolvedCandidateIds.length, 2);
        assert.deepStrictEqual(pendingPlan.operations, []);

        const promptCandidate = pendingPlan.candidates.find(
            (candidate: { id: string; classification: { sourcePath: string } }) =>
                candidate.classification.sourcePath === '.github/prompts/review.prompt.md',
        );
        assert.ok(promptCandidate);
        const projectionDecisions = pendingPlan.candidates.flatMap((candidate: { id: string }) => [
            '--decision',
            `${candidate.id}=${candidate.id === promptCandidate.id ? 'add-standard-alongside' : 'keep-vendor'}`,
        ]);
        const projected = await runCli([
            'agent-plugins',
            'plan-migration',
            '--json',
            ...projectionDecisions,
            '-w',
            ws.root,
        ]);
        assert.strictEqual(projected.exitCode, 0);
        const projectedPlan = JSON.parse(projected.stdout);
        const promptOperation = projectedPlan.operations.find(
            (operation: { candidateId: string }) => operation.candidateId === promptCandidate.id,
        );
        assert.deepStrictEqual(promptOperation, {
            candidateId: promptCandidate.id,
            decision: 'add-standard-alongside',
            action: 'project-copy',
            sourcePath: '.github/prompts/review.prompt.md',
            targetPath: 'com.github.copilot/prompts/review.prompt.md',
            targetCoverage: 'client-extension',
            disclosedLoss: 'none',
        });
        assert.strictEqual(fs.readFileSync(promptPath, 'utf-8'), before);
        assert.strictEqual(fs.existsSync(path.join(ws.root, 'com.github.copilot')), false);

        const decisionArgs = pendingPlan.candidates.flatMap((candidate: { id: string }) => [
            '--decision',
            `${candidate.id}=keep-vendor`,
        ]);
        const decided = await runCli([
            'agent-plugins',
            'plan-migration',
            '--json',
            ...decisionArgs,
            '-w',
            ws.root,
        ]);
        assert.strictEqual(decided.exitCode, 0);
        const decidedPlan = JSON.parse(decided.stdout);
        assert.strictEqual(decidedPlan.blocked, false);
        assert.strictEqual(decidedPlan.operations.length, 2);
        assert.ok(
            decidedPlan.operations.every(
                (operation: { decision: string; action: string }) =>
                    operation.decision === 'keep-vendor' && operation.action === 'keep',
            ),
        );
        assert.strictEqual(fs.readFileSync(promptPath, 'utf-8'), before);
        assert.strictEqual(fs.existsSync(path.join(ws.root, 'com.github.copilot')), false);
    });

    it('plans the complete legacy projection matrix without writing package output', async () => {
        const projections = [
            [
                '.github/prompts/review.prompt.md',
                'com.github.copilot/prompts/review.prompt.md',
                'client-extension',
            ],
            [
                '.github/commands/review.md',
                'com.github.copilot/commands/review.md',
                'client-extension',
            ],
            [
                '.github/instructions/typescript.instructions.md',
                'com.github.copilot/rules/typescript.instructions.md',
                'client-extension',
            ],
            [
                '.github/rules/typescript.md',
                'com.github.copilot/rules/typescript.md',
                'client-extension',
            ],
            [
                '.github/copilot-instructions.md',
                'com.github.copilot/rules/copilot-instructions.md',
                'client-extension',
            ],
            [
                '.github/agents/reviewer.agent.md',
                'com.github.copilot/agents/reviewer.agent.md',
                'client-extension',
            ],
            ['hooks.json', 'com.github.copilot/hooks/hooks.json', 'client-extension'],
            [
                '.github/hooks/scripts/check.js',
                'com.github.copilot/hooks/scripts/check.js',
                'client-extension',
            ],
            ['.github/skills/testing/SKILL.md', 'skills/testing/SKILL.md', 'portable'],
        ] as const;
        const contents = Object.fromEntries(
            projections.map(([source]) => [source, `unchanged:${source}\n`]),
        );
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: {
                'company/core': Object.entries(contents).map(([relativePath, content]) => ({
                    relativePath,
                    content,
                })),
            },
        });
        const packageRoot = path.join(ws.metadataRepo, 'company', 'core');

        const pending = await runCli(['agent-plugins', 'plan-migration', '--json', '-w', ws.root]);
        assert.strictEqual(pending.exitCode, 0);
        const pendingPlan = JSON.parse(pending.stdout);
        assert.strictEqual(pendingPlan.blocked, true);
        assert.deepStrictEqual(
            pendingPlan.candidates.map(
                (candidate: { classification: { sourcePath: string } }) =>
                    candidate.classification.sourcePath,
            ),
            projections.map(([sourcePath]) => sourcePath).sort(),
        );

        const decided = await runCli([
            'agent-plugins',
            'plan-migration',
            '--json',
            ...pendingPlan.candidates.flatMap((candidate: { id: string }) => [
                '--decision',
                `${candidate.id}=add-standard-alongside`,
            ]),
            '-w',
            ws.root,
        ]);
        assert.strictEqual(decided.exitCode, 0);
        const decidedPlan = JSON.parse(decided.stdout);
        assert.strictEqual(decidedPlan.blocked, false);

        for (const [sourcePath, targetPath, targetCoverage] of projections) {
            const operation = decidedPlan.operations.find(
                (entry: { sourcePath: string }) => entry.sourcePath === sourcePath,
            );
            assert.ok(operation, sourcePath);
            assert.strictEqual(operation.action, 'project-copy', sourcePath);
            assert.strictEqual(operation.targetPath, targetPath, sourcePath);
            assert.strictEqual(operation.targetCoverage, targetCoverage, sourcePath);
            assert.strictEqual(operation.disclosedLoss, 'none', sourcePath);
            assert.strictEqual(
                fs.readFileSync(path.join(packageRoot, ...sourcePath.split('/')), 'utf-8'),
                contents[sourcePath],
                sourcePath,
            );
            assert.strictEqual(
                fs.existsSync(path.join(packageRoot, ...targetPath.split('/'))),
                false,
                targetPath,
            );
        }
    });

    it('surfaces audit warnings during validate without failing an otherwise clean workspace', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                agentPlugins: {
                    targetVersion: '1.0.0',
                    disposition: 'audit-standard',
                },
            }),
            layers: conformanceLayers,
        });

        assert.strictEqual((await runCli(['apply', '-w', ws.root])).exitCode, 0);
        const result = await runCli(['validate', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Agent Plugins v1:'));
        assert.ok(result.stdout.includes('[WARNING] AGENT_METADATA_NO_STANDARD_EQUIVALENT:'));
    });
});

// ── Error handling ─────────────────────────────────────────────────

describe('CLI: error handling', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should handle missing metadata repo gracefully', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            // No layers created — repo path doesn't exist on disk
            noRepo: true,
        });

        // Status should still work (0 files)
        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Files:'));
    });

    it('should handle invalid JSON config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{ invalid json {{', 'utf-8');

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });

    it('should show help text', async () => {
        const result = await runCli(['--help']);
        assert.ok(result.stdout.includes('metaflow'));
        assert.ok(result.stdout.includes('status'));
        assert.ok(result.stdout.includes('apply'));
        assert.ok(result.stdout.includes('clean'));
        assert.ok(result.stdout.includes('validate'));
        assert.ok(result.stdout.includes('agent-plugins'));
    });

    it('should show version', async () => {
        const result = await runCli(['--version']);
        assert.ok(result.stdout.includes(packageMetadata.version));
    });
});

// ── Validate command (CI) ──────────────────────────────────────────

describe('CLI: validate', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should pass validation after clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('passed'));
    });

    it('should fail validation when drifted', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Manually modify a managed file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'User edits.\n');

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('failed'));
        assert.ok(result.stdout.includes('drifted'));
    });

    it('should fail validation when files are missing (never applied)', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't apply — validate should detect unmanaged files
        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('unmanaged'));
    });

    it('validate --json returns structured result', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, true);
        assert.strictEqual(data.summary.drifted, 0);
        assert.strictEqual(data.summary.missing, 0);
        assert.strictEqual(data.summary.unmanaged, 0);
        assert.strictEqual(data.summary.stale, 0);
        assert.strictEqual(data.agentPlugins.disposition, 'compatibility');
        assert.ok(Array.isArray(data.agentPlugins.classifications));
    });

    it('validate --json shows drift details', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Drift a file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, 'Drifted!\n');

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, false);
        assert.strictEqual(data.summary.drifted, 1);
        assert.ok(data.drifted.includes(synchronizedPath('skills/testing/SKILL.md')));
    });

    it('validate includes repo-wide copilot instructions in expected synchronized files', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 6,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        const beforeApply = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(beforeApply.exitCode, 1);
        const beforeData = JSON.parse(beforeApply.stdout);
        assert.ok(beforeData.unmanaged.includes('copilot-instructions.md'));

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(path.join(ws.root, '.github', 'copilot-instructions.md'), 'local edit');

        const afterDrift = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(afterDrift.exitCode, 1);
        const afterData = JSON.parse(afterDrift.stdout);
        assert.ok(afterData.drifted.includes('copilot-instructions.md'));
    });

    it('fails stale root-enabled validation clearly without migrating config', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 4,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const before = fs.readFileSync(configPath, 'utf-8');

        const result = await runCli(['validate', '--json', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, false);
        assert.ok(data.error.includes('Configuration migration is required'));
        assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), before);
    });
});

// ── Multi-repo ─────────────────────────────────────────────────────

describe('CLI: multi-repo', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should resolve layers from multiple repos', async () => {
        // Create a workspace with two separate metadata repos
        ws = createTestWorkspace({});

        // Create repo A
        const repoA = path.join(ws.root, 'repos', 'company-metadata');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(
            path.join(repoA, 'core', 'skills', 'testing.md'),
            '# Company Testing Skill',
        );

        // Create repo B
        const repoB = path.join(ws.root, 'repos', 'team-metadata');
        fs.mkdirSync(path.join(repoB, 'team', 'agents'), { recursive: true });
        fs.writeFileSync(
            path.join(repoB, 'team', 'agents', 'reviewer.md'),
            '# Team Reviewer Agent',
        );

        // Write multi-repo config
        const config = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company-metadata' },
                { id: 'team', localPath: 'repos/team-metadata' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core' },
                { repoId: 'team', path: 'team' },
            ],
            injection: {
                skills: 'synchronize',
                agents: 'synchronize',
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        // Status should show both repos
        const statusResult = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(statusResult.exitCode, 0);
        assert.ok(statusResult.stdout.includes('Repos:'));

        // Apply should synchronize files from both repos
        const applyResult = await runCli(['apply', '-w', ws.root]);
        assert.strictEqual(applyResult.exitCode, 0);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing.md', 'core', 'company'),
        );
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.md', 'team', 'team'),
        );
        assert.ok(fs.existsSync(skillPath), 'company skill should be synchronized');
        assert.ok(fs.existsSync(agentPath), 'team agent should be synchronized');

        // Validate should pass
        const validateResult = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(validateResult.exitCode, 0);
    });

    it('multi-repo later layer overrides earlier for same path', async () => {
        ws = createTestWorkspace({});

        // Repo A: base skill
        const repoA = path.join(ws.root, 'repos', 'base');
        fs.mkdirSync(path.join(repoA, 'layer', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'layer', 'skills', 'shared.md'), '# Base version');

        // Repo B: override same skill
        const repoB = path.join(ws.root, 'repos', 'override');
        fs.mkdirSync(path.join(repoB, 'layer', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoB, 'layer', 'skills', 'shared.md'), '# Override version');

        const config = {
            metadataRepos: [
                { id: 'base', localPath: 'repos/base' },
                { id: 'override', localPath: 'repos/override' },
            ],
            layerSources: [
                { repoId: 'base', path: 'layer' },
                { repoId: 'override', path: 'layer' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        await runCli(['apply', '-w', ws.root]);

        const content = fs.readFileSync(
            path.join(
                ws.root,
                '.github',
                synchronizedPath('skills/shared.md', 'layer', 'override'),
            ),
            'utf-8',
        );
        assert.ok(content.includes('Override version'), 'later layer should win');
    });
});

// ── Coverage-targeted tests ────────────────────────────────────────

describe('CLI: coverage - validate edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should report missing files when managed file is deleted from disk', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        // Delete a managed file from .github/
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.unlinkSync(skillPath);

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('missing'), 'should report missing files');
    });

    it('should report stale files when overlay shrinks after apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with all files
        await runCli(['apply', '-w', ws.root]);

        // Remove a layer source file from the metadata repo so it's no longer in the overlay
        const agentSource = path.join(
            ws.metadataRepo,
            'company',
            'core',
            'agents',
            'reviewer.agent.md',
        );
        fs.unlinkSync(agentSource);

        // Validate should detect stale files (agents tracked but no longer in overlay)
        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stdout.includes('stale'), 'should report stale files');
    });

    it('exits early when the config cannot be loaded', async () => {
        ws = createTestWorkspace({});
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ not valid jsonc',
            'utf-8',
        );

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('reports a validation error as text when overlay resolution throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['validate', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });

    it('reports a validation error as JSON when overlay resolution throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        const result = await runCli(['validate', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.valid, false);
        assert.ok(typeof data.error === 'string' && data.error.length > 0);
    });
});

describe('CLI: coverage - promote edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('standard promote with no managed files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't apply — no managed state yet
        // promote (non-auto) should say "No managed files"
        const result = await runCli(['promote', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('No managed files'));
    });

    it('promoteAuto with multi-repo config (no single metadataRepo)', () => {
        ws = createTestWorkspace({});

        // Create multi-repo config with no single metadataRepo
        const config = {
            metadataRepos: [{ id: 'company', localPath: 'repos/company-metadata' }],
            layerSources: [{ repoId: 'company', path: 'core' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        // Create managed state manually to get past "no managed files"
        const stateDir = path.join(ws.root, '.metaflow');
        fs.mkdirSync(stateDir, { recursive: true });
        const state = {
            version: 1,
            files: { 'skills/test.md': { hash: 'abc', sourceLayer: 'core', appliedAt: '' } },
        };
        fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(state));

        // Create the synchronized file with different content to simulate drift
        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('not a git repository'));
    });

    it('promoteAuto reports a config load failure', () => {
        ws = createTestWorkspace({});

        // Invalid JSONC so loadConfig fails.
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            '{ this is not valid json',
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/test.md': { hash: 'abc', sourceLayer: 'core', appliedAt: '' },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('Cannot load config'), result.error);
    });

    it('promoteAuto refuses drift spanning multiple metadata repositories', () => {
        ws = createTestWorkspace({});

        const config = {
            metadataRepos: [
                { id: 'repoA', localPath: 'repos/a' },
                { id: 'repoB', localPath: 'repos/b' },
            ],
            layerSources: [
                { repoId: 'repoA', path: 'core' },
                { repoId: 'repoB', path: 'core' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/a.md': {
                    hash: 'abc',
                    sourceLayer: 'repoA/core',
                    sourceRepo: 'repoA',
                    appliedAt: '',
                },
                'skills/b.md': {
                    hash: 'def',
                    sourceLayer: 'repoB/core',
                    sourceRepo: 'repoB',
                    appliedAt: '',
                },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'a.md'), 'drifted a');
        fs.writeFileSync(path.join(matDir, 'b.md'), 'drifted b');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('multiple metadata repositories'), result.error);
    });

    it('promoteAuto cannot determine the repo path when the source repo is unresolved', () => {
        ws = createTestWorkspace({});

        const config = {
            metadataRepos: [
                { id: 'repoA', localPath: 'repos/a' },
                { id: 'repoB', localPath: 'repos/b' },
            ],
            layerSources: [{ repoId: 'repoA', path: 'core' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const state = {
            version: 1,
            files: {
                'skills/test.md': {
                    hash: 'abc',
                    sourceLayer: 'ghost/core',
                    sourceRepo: 'ghost',
                    appliedAt: '',
                },
            },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'state.json'),
            JSON.stringify(state),
            'utf-8',
        );

        const matDir = path.join(ws.root, '.github', 'skills');
        fs.mkdirSync(matDir, { recursive: true });
        fs.writeFileSync(path.join(matDir, 'test.md'), 'drifted content');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('Cannot determine metadata repo path'), result.error);
    });

    it('promote --auto --json with error shows error in JSON', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply, then drift a file
        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        // Don't init git — promote --auto should fail with "not a git repo"
        const result = await runCli(['promote', '--auto', '--json', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.committed, false);
        assert.ok(data.error);
    });

    it('promote --auto without --json shows error text on failure', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        // No git init — should fail
        const result = await runCli(['promote', '--auto', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('not a git'));
    });

    it('promote --auto success without --json shows branch and file list', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Init git in metadata repo
        execSync('git init', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git add .', { cwd: ws.metadataRepo, stdio: 'pipe' });
        execSync('git commit -m "initial" --allow-empty', { cwd: ws.metadataRepo, stdio: 'pipe' });

        await runCli(['apply', '-w', ws.root]);
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = await runCli([
            'promote',
            '--auto',
            '--branch',
            'display-test',
            '-w',
            ws.root,
        ]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Created branch: display-test'));
        assert.ok(result.stdout.includes('Promoted'));
        assert.ok(result.stdout.includes('committed'));
    });
});

describe('CLI: coverage - status edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should display repo URL and commit when provided', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/ai-metadata',
                        url: 'https://github.com/org/metadata.git',
                        commit: 'abc1234',
                    },
                ],
            }),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('URL:'));
        assert.ok(result.stdout.includes('https://github.com/org/metadata.git'));
        assert.ok(result.stdout.includes('Commit:'));
        assert.ok(result.stdout.includes('abc1234'));
    });

    it('prints surfaced capability conflict warnings', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                layerSources: [
                    { repoId: 'primary', path: 'company/core' },
                    { repoId: 'primary', path: 'company/extra' },
                ],
                profiles: {
                    default: {
                        enabledCapabilities: ['primary:company/core', 'primary:company/extra'],
                    },
                    lean: { enabledCapabilities: [] },
                },
            }),
            layers: {
                'company/core': [{ relativePath: 'skills/dup/SKILL.md', content: 'A' }],
                'company/extra': [{ relativePath: 'skills/dup/SKILL.md', content: 'B' }],
            },
        });

        const result = await runCli(['status', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('Warnings:'), result.stdout);
        assert.ok(result.stdout.includes('CAPABILITY_CONFLICT'), result.stdout);
    });
});

describe('CLI: coverage - profile edge cases', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('should handle config with no profiles defined', async () => {
        ws = createTestWorkspace({
            config: standardConfig({ profiles: undefined, activeProfile: undefined }),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'list', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('default'));
    });

    it('profile list fails gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['profile', 'list', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });

    it('profile set fails gracefully with missing config', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const result = await runCli(['profile', 'set', 'default', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
    });
});

// ── Watch command ──────────────────────────────────────────────────

describe('CLI: watch', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    it('startWatch triggers apply cycle on metadata change', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Do an initial apply so managed state exists
        runCli(['apply', '-w', ws.root]).then(() => {
            const cycles: WatchCycleResult[] = [];
            let changeTimer: ReturnType<typeof setTimeout> | undefined;
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    if (changeTimer) {
                        clearTimeout(changeTimer);
                        changeTimer = undefined;
                    }
                    cycles.push(result);
                    // After a cycle fires, verify and close
                    handle.close();
                    assert.ok(cycles.length >= 1, 'should have at least 1 cycle');
                    assert.strictEqual(cycles[0].error, undefined);
                    done();
                },
            });

            // Trigger a change in the metadata repo
            changeTimer = setTimeout(() => {
                const newFile = path.join(
                    ws.metadataRepo,
                    'company',
                    'core',
                    'skills',
                    'new-skill.md',
                );
                fs.writeFileSync(newFile, '# New Skill\nAdded during watch.');
            }, 100);
        });
    });

    it('startWatch reports errors for invalid config', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply initially...
        runCli(['apply', '-w', ws.root]).then(() => {
            let changeTimer: ReturnType<typeof setTimeout> | undefined;
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    if (changeTimer) {
                        clearTimeout(changeTimer);
                        changeTimer = undefined;
                    }
                    handle.close();
                    assert.ok(result.error, 'should report error');
                    done();
                },
            });

            // Corrupt the config
            changeTimer = setTimeout(() => {
                const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.writeFileSync(configPath, '{ invalid {{', 'utf-8');
            }, 100);
        });
    });

    it('startWatch migrates v4 and applies an existing root opt-in in the first cycle', (done) => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 4,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        let changeTimer: ReturnType<typeof setTimeout> | undefined;
        const handle = startWatch(ws.root, {
            debounceMs: 50,
            onCycle(result) {
                if (changeTimer) {
                    clearTimeout(changeTimer);
                    changeTimer = undefined;
                }
                handle.close();
                try {
                    assert.strictEqual(result.error, undefined);
                    assert.ok(
                        fs.existsSync(path.join(ws.root, '.github', 'copilot-instructions.md')),
                    );
                    const persisted = JSON.parse(
                        fs.readFileSync(path.join(ws.root, '.metaflow', 'config.jsonc'), 'utf-8'),
                    );
                    assert.strictEqual(persisted.compatibilityVersion, 6);
                    done();
                } catch (error) {
                    done(error);
                }
            },
        });

        changeTimer = setTimeout(() => {
            fs.appendFileSync(path.join(ws.root, '.metaflow', 'config.jsonc'), ' ');
        }, 30);
    });

    it('close() stops the watcher', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const handle = startWatch(ws.root, {
            debounceMs: 50,
            force: false,
        });

        // Should not throw
        handle.close();
        handle.close(); // close is idempotent
    });

    it('watch command appears in help', async () => {
        const result = await runCli(['--help']);
        assert.ok(result.stdout.includes('watch'));
    });

    it('startWatch with multi-repo config watches all repos', (done) => {
        ws = createTestWorkspace({});

        // Create two repos
        const repoA = path.join(ws.root, 'repos', 'company');
        fs.mkdirSync(path.join(repoA, 'core', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoA, 'core', 'skills', 'a.md'), '# A');

        const repoB = path.join(ws.root, 'repos', 'team');
        fs.mkdirSync(path.join(repoB, 'team', 'skills'), { recursive: true });
        fs.writeFileSync(path.join(repoB, 'team', 'skills', 'b.md'), '# B');

        const config = {
            metadataRepos: [
                { id: 'company', localPath: 'repos/company' },
                { id: 'team', localPath: 'repos/team' },
            ],
            layerSources: [
                { repoId: 'company', path: 'core' },
                { repoId: 'team', path: 'team' },
            ],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        const cycles: WatchCycleResult[] = [];
        let changeTimer: ReturnType<typeof setTimeout> | undefined;
        const handle = startWatch(ws.root, {
            debounceMs: 50,
            force: false,
            onCycle(result) {
                if (changeTimer) {
                    clearTimeout(changeTimer);
                    changeTimer = undefined;
                }
                cycles.push(result);
                handle.close();
                assert.ok(cycles.length >= 1);
                done();
            },
        });

        // Trigger change in second repo
        changeTimer = setTimeout(() => {
            fs.writeFileSync(path.join(repoB, 'team', 'skills', 'new.md'), '# New');
        }, 100);
    });

    // ── New coverage tests for watch.ts gaps ─────────────────────────

    it('startWatch catches unexpected exceptions from apply and reports them via onCycle', (done) => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Make .github a regular file so apply's fs.mkdirSync throws ENOTDIR
        const githubPath = path.join(ws.root, '.github');
        fs.writeFileSync(githubPath, 'not-a-directory');
        let changeTimer: ReturnType<typeof setTimeout> | undefined;

        const handle = startWatch(ws.root, {
            debounceMs: 50,
            onCycle(result) {
                if (changeTimer) {
                    clearTimeout(changeTimer);
                    changeTimer = undefined;
                }
                handle.close();
                assert.ok(result.error, 'should capture the thrown exception as error');
                done();
            },
        });

        // Trigger a debounced apply cycle via config file change
        changeTimer = setTimeout(() => {
            const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
            fs.appendFileSync(configPath, ' ');
        }, 30);
    });

    it('startWatch gracefully swallows fs.watch failure on config file', () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');

        // Patch the underlying CommonJS require('fs') module so fs.watch throws
        // for the config file path. The __createBinding getter in the compiled
        // __importStar wrapper delegates to require('fs')['watch'], so this patch
        // is visible to watch.ts without modifying its import binding.
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, ...rest: any[]): fs.FSWatcher {
            if (p === configPath) {
                throw new Error('simulated fs.watch failure on config file');
            }
            return origWatch.apply(fsMod, [p, ...rest] as any);
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        let handle: { close(): void } | undefined;
        try {
            // startWatch must NOT throw — the catch block at lines 88-90 swallows the error
            handle = startWatch(ws.root, { debounceMs: 100 });
        } finally {
            fsMod.watch = origWatch; // always restore
            handle?.close();
        }
        // reaching here without throw is the assertion
    });

    it('startWatch gracefully swallows fs.watch failure for multi-repo directory', () => {
        ws = createTestWorkspace({});

        const repoPath = path.join(ws.root, 'repos', 'meta');
        fs.mkdirSync(repoPath, { recursive: true });
        fs.writeFileSync(path.join(repoPath, 'skill.md'), '# Skill');

        const config = {
            metadataRepos: [{ id: 'meta', localPath: 'repos/meta' }],
            layerSources: [{ repoId: 'meta', path: '.' }],
            injection: { skills: 'synchronize' },
        };
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(config, null, 2),
            'utf-8',
        );

        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, ...rest: any[]): fs.FSWatcher {
            if (p === repoPath) {
                throw new Error('simulated recursive fs.watch failure for repo directory');
            }
            return origWatch.apply(fsMod, [p, ...rest] as any);
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        let handle: { close(): void } | undefined;
        try {
            // startWatch must NOT throw — the catch block at lines 124-125 swallows the error
            handle = startWatch(ws.root, { debounceMs: 100 });
        } finally {
            fsMod.watch = origWatch;
            handle?.close();
        }
    });

    it('watch CLI command exits with error code 1 when config is invalid', async () => {
        ws = createTestWorkspace({ noRepo: true });
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        fs.writeFileSync(configPath, '{ invalid json }', 'utf-8');

        const result = await runCli(['watch', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'), 'should print config error message to stderr');
    });

    it('watch CLI command prints watching message, performs initial apply, and handles cycles', function (done) {
        this.timeout(5000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Patch require('fs').watch to produce non-persistent watchers and capture
        // them for deterministic cleanup, preventing the test process from hanging.
        const createdWatchers: fs.FSWatcher[] = [];
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod: any = require('fs');
        const origWatch: typeof fs.watch = fsMod.watch;
        fsMod.watch = function (p: string, opts: any, cb: any): fs.FSWatcher {
            const safeOpts = {
                ...(typeof opts === 'object' && opts !== null ? opts : {}),
                persistent: false,
            };
            const w = (origWatch as any)(p, safeOpts, cb);
            createdWatchers.push(w);
            return w;
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        function cleanup(err?: unknown): void {
            fsMod.watch = origWatch;
            for (const w of createdWatchers) {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            }
            done(err);
        }

        // Do an initial apply so the workspace has managed files
        runCli(['apply', '-w', ws.root])
            .then(() => runCli(['watch', '-w', ws.root]))
            .then((result) => {
                assert.strictEqual(result.exitCode, 0);
                assert.ok(
                    result.stdout.includes('Watching for changes'),
                    'should log watching heading',
                );
                assert.ok(
                    result.stdout.includes('Initial apply:'),
                    'should log initial apply summary',
                );

                // Trigger a file change so the onCycle callback (lines 187-195) executes
                const configFilePath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.appendFileSync(configFilePath, ' ');

                // Wait long enough for debounce (300 ms default) + cycle to complete
                setTimeout(() => cleanup(), 700);
            })
            .catch((err: unknown) => cleanup(err));
    });

    it('watch CLI command onCycle handler logs error when config becomes invalid mid-watch', function (done) {
        this.timeout(5000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const createdWatchers2: fs.FSWatcher[] = [];
        /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
        const fsMod2: any = require('fs');
        const origWatch2: typeof fs.watch = fsMod2.watch;
        fsMod2.watch = function (p: string, opts: any, cb: any): fs.FSWatcher {
            const safeOpts = {
                ...(typeof opts === 'object' && opts !== null ? opts : {}),
                persistent: false,
            };
            const w = (origWatch2 as any)(p, safeOpts, cb);
            createdWatchers2.push(w);
            return w;
        };
        /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

        function cleanup2(err?: unknown): void {
            fsMod2.watch = origWatch2;
            for (const w of createdWatchers2) {
                try {
                    w.close();
                } catch {
                    /* ignore */
                }
            }
            done(err);
        }

        runCli(['watch', '-w', ws.root])
            .then((result) => {
                assert.strictEqual(result.exitCode, 0);

                // Corrupt the config so the next cycle produces result.error, covering
                // the console.error branch (line 189) inside onCycle in registerWatchCommand
                const configFilePath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.writeFileSync(configFilePath, '{ invalid json }', 'utf-8');

                // Wait for debounce + error cycle to complete
                setTimeout(() => cleanup2(), 700);
            })
            .catch((err: unknown) => cleanup2(err));
    });

    it('watch CLI command exits with error code 1 when the initial apply throws', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Apply with the default strategy, then switch to original-unless-conflict so the
        // next overlay resolution throws an unsupported-migration error during initial apply.
        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.metaflow', 'config.jsonc'),
            JSON.stringify(
                standardConfig({ fileNamingStrategy: 'original-unless-conflict' }),
                null,
                2,
            ),
            'utf-8',
        );

        // The command returns before starting any watchers, so no cleanup is required.
        const result = await runCli(['watch', '-w', ws.root]);
        assert.strictEqual(result.exitCode, 1);
        assert.ok(result.stderr.includes('Error:'));
    });
});

// ── Promote --auto ─────────────────────────────────────────────────

describe('CLI: promote --auto', () => {
    let ws: TestWorkspace;

    afterEach(() => ws?.cleanup());

    function gitInit(dir: string): void {
        execSync('git init', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
        execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
        // Initial commit so we can create branches
        execSync('git add .', { cwd: dir, stdio: 'pipe' });
        execSync('git commit -m "initial" --allow-empty', { cwd: dir, stdio: 'pipe' });
    }

    it('should report no drifted files when clean', () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = promoteAuto(ws.root, {});
        // No managed state yet, so no files to check
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('No managed files'));
    });

    it('should report no drift after clean apply', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        await runCli(['apply', '-w', ws.root]);

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('No drifted'));
    });

    it('should create branch and commit drifted files', async function () {
        this.timeout(15000);

        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Init git in metadata repo
        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift a file
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Improved Testing Skill\nUpdated locally.');

        const result = promoteAuto(ws.root, {
            branch: 'test-promote',
            message: 'test: promote drifted files',
        });

        assert.strictEqual(result.committed, true);
        assert.strictEqual(result.branch, 'test-promote');
        assert.ok(result.filesPromoted.length > 0);
        assert.ok(result.filesPromoted.includes(synchronizedPath('skills/testing/SKILL.md')));
        assert.strictEqual(result.error, undefined);

        // Verify the file was written to the source layer in the repo
        const promotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            'skills',
            'testing',
            'SKILL.md',
        );
        assert.ok(fs.existsSync(promotedFile), 'promoted file should exist in repo');

        const content = fs.readFileSync(promotedFile, 'utf-8');
        assert.ok(content.includes('Improved Testing Skill'), 'promoted content matches drift');
        assert.ok(!content.includes('metaflow:provenance'), 'provenance header stripped');

        // Verify git branch was created
        const branch = execSync('git branch --show-current', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        assert.strictEqual(branch, 'test-promote');
    });

    it('promotes repo-wide copilot instructions back under the authored .github root', async () => {
        ws = createTestWorkspace({
            config: standardConfig({
                compatibilityVersion: 6,
                synchronization: { repoWideCopilotInstructions: true },
            }),
            layers: {
                'company/core': [
                    {
                        relativePath: '.github/copilot-instructions.md',
                        content: '# Repo-wide Copilot Instructions',
                    },
                ],
            },
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);
        fs.writeFileSync(
            path.join(ws.root, '.github', 'copilot-instructions.md'),
            '# Updated Repo-wide Copilot Instructions',
        );

        const result = promoteAuto(ws.root, {
            noBranch: true,
            message: 'test: promote repo-wide instructions',
        });

        assert.strictEqual(result.committed, true);
        assert.ok(result.filesPromoted.includes('copilot-instructions.md'));

        const promotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            '.github',
            'copilot-instructions.md',
        );
        assert.ok(fs.existsSync(promotedFile), 'promoted file should stay under .github');
        assert.ok(
            fs
                .readFileSync(promotedFile, 'utf-8')
                .includes('Updated Repo-wide Copilot Instructions'),
        );
    });

    it('should fall back to tracked synchronized relative path for older managed state files', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        delete state.files[synchronizedPath('skills/testing/SKILL.md')].sourceRelativePath;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Older State Fallback');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, true);
        const fallbackPromotedFile = path.join(
            ws.metadataRepo,
            'company',
            'core',
            synchronizedPath('skills/testing/SKILL.md').replace(/\//g, path.sep),
        );
        assert.ok(
            fs.existsSync(fallbackPromotedFile),
            'older state fallback should keep prior target path behavior',
        );
    });

    it('promote --auto --no-branch commits on current branch', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, true);
        assert.ok(result.filesPromoted.length > 0);

        // Should still be on the default branch (main or master)
        const branch = execSync('git branch --show-current', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        // Should NOT be a promote/* branch
        assert.ok(!branch.startsWith('promote/'), 'should stay on original branch');
    });

    it('promote --auto accepts quoted commit messages without shell escaping issues', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const commitMessage = 'test: promote "quoted" drifted files';
        const result = promoteAuto(ws.root, {
            noBranch: true,
            message: commitMessage,
        });

        assert.strictEqual(result.committed, true);

        const loggedMessage = execSync('git log -1 --pretty=%B', {
            cwd: ws.metadataRepo,
            encoding: 'utf-8',
        }).trim();
        assert.strictEqual(loggedMessage, commitMessage);
    });

    it('promote --auto fails for non-git metadata repo', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        // Don't init git — metadata repo is not a git repo
        await runCli(['apply', '-w', ws.root]);

        // Drift
        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Modified');

        const result = promoteAuto(ws.root, {});
        assert.strictEqual(result.committed, false);
        assert.ok(result.error?.includes('not a git'), result.error);
    });

    it('promote --auto --json returns structured result via CLI', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        // Drift
        const agentPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('agents/reviewer.agent.md'),
        );
        fs.writeFileSync(agentPath, '# Updated Agent');

        const result = await runCli([
            'promote',
            '--auto',
            '--json',
            '--branch',
            'json-test',
            '-w',
            ws.root,
        ]);

        const data = JSON.parse(result.stdout);
        assert.strictEqual(data.committed, true);
        assert.strictEqual(data.branch, 'json-test');
        assert.ok(data.filesPromoted.length > 0);
        assert.strictEqual(data.error, undefined);
    });

    it('promote --auto reports no files could be promoted when source layer metadata is missing', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        // Strip the sourceLayer from every tracked file so promotion has no target.
        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const key of Object.keys(state.files)) {
            delete state.files[key].sourceLayer;
        }
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, false);
        assert.deepStrictEqual(result.filesPromoted, []);
        assert.ok(result.error?.includes('No files could be promoted'), result.error);
    });

    it('promote --auto skips files whose authored path escapes the layer root', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        // Force an unsafe authored relative path on every tracked file.
        const statePath = path.join(ws.root, '.metaflow', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const key of Object.keys(state.files)) {
            state.files[key].sourceRelativePath = '../escape.md';
        }
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');

        const result = promoteAuto(ws.root, { noBranch: true });

        assert.strictEqual(result.committed, false);
        assert.deepStrictEqual(result.filesPromoted, []);
        assert.ok(result.error?.includes('No files could be promoted'), result.error);
    });

    it('promote --auto returns the git error when branch creation fails', async () => {
        ws = createTestWorkspace({
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        gitInit(ws.metadataRepo);
        // Pre-create the target branch so `git checkout -b` fails inside promoteAuto.
        execSync('git branch collision', { cwd: ws.metadataRepo, stdio: 'pipe' });

        await runCli(['apply', '-w', ws.root]);

        const skillPath = path.join(
            ws.root,
            '.github',
            synchronizedPath('skills/testing/SKILL.md'),
        );
        fs.writeFileSync(skillPath, '# Updated Skill');

        const result = promoteAuto(ws.root, { branch: 'collision' });

        assert.strictEqual(result.committed, false);
        assert.strictEqual(result.branch, 'collision');
        assert.ok(result.error && result.error.length > 0);
    });
});
