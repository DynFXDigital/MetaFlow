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

function synchronizedPath(relativePath: string, layer = 'company/core', repo = 'default'): string {
    const normalized = relativePath.replace(/\\/g, '/');
    const dir = path.posix.dirname(normalized);
    const base = path.posix.basename(normalized);
    const layerToken = layer.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const prefixed = `_${repo}-${layerToken}__${base}`;
    return dir === '.' ? prefixed : `${dir}/${prefixed}`;
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
        assert.ok(config.metadataRepos, 'config should have metadataRepos');
        assert.ok(config.metadataRepos[0].capabilities, 'config should have grouped capabilities');
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
            config: standardConfig(),
            layers: STANDARD_LAYERS,
        });

        const result = await runCli(['profile', 'set', 'lean', '-w', ws.root]);

        assert.strictEqual(result.exitCode, 0);
        assert.ok(result.stdout.includes('"lean"'));

        // Verify config file was updated
        const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        assert.strictEqual(config.activeProfile, 'lean');
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
                metadataRepo: {
                    localPath: '.ai/ai-metadata',
                    url: 'https://github.com/org/metadata.git',
                    commit: 'abc1234',
                },
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
        assert.ok(result.stdout.includes('No profiles defined'));
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
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    cycles.push(result);
                    // After a cycle fires, verify and close
                    handle.close();
                    assert.ok(cycles.length >= 1, 'should have at least 1 cycle');
                    assert.strictEqual(cycles[0].error, undefined);
                    done();
                },
            });

            // Trigger a change in the metadata repo
            setTimeout(() => {
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
            const handle = startWatch(ws.root, {
                debounceMs: 50,
                force: false,
                onCycle(result) {
                    handle.close();
                    assert.ok(result.error, 'should report error');
                    done();
                },
            });

            // Corrupt the config
            setTimeout(() => {
                const configPath = path.join(ws.root, '.metaflow', 'config.jsonc');
                fs.writeFileSync(configPath, '{ invalid {{', 'utf-8');
            }, 100);
        });
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
        const handle = startWatch(ws.root, {
            debounceMs: 50,
            force: false,
            onCycle(result) {
                cycles.push(result);
                handle.close();
                assert.ok(cycles.length >= 1);
                done();
            },
        });

        // Trigger change in second repo
        setTimeout(() => {
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

        const handle = startWatch(ws.root, {
            debounceMs: 50,
            onCycle(result) {
                handle.close();
                assert.ok(result.error, 'should capture the thrown exception as error');
                done();
            },
        });

        // Trigger a debounced apply cycle via config file change
        setTimeout(() => {
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

    it('should create branch and commit drifted files', async () => {
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
});
