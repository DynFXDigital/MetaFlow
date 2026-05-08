/**
 * Claude Code artifact classification and output routing tests.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    apply,
    checkAllDrift,
    classifySingle,
    EffectiveFile,
    getArtifactType,
    isClaudeArtifactPath,
    loadManagedState,
    planSynchronization,
} from '../src/index';

function makeEffectiveFile(
    relativePath: string,
    sourcePath: string,
    classification: EffectiveFile['classification'] = 'synchronized',
): EffectiveFile {
    return {
        relativePath,
        sourcePath,
        sourceLayer: 'test/layer',
        sourceRepo: 'primary',
        classification,
    };
}

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-claude-test-'));
}

function writeFile(dir: string, relPath: string, content: string): string {
    const fullPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

describe('getArtifactType: Claude Code paths', () => {
    it('returns Claude artifact types for known .claude paths', () => {
        assert.strictEqual(getArtifactType('.claude/rules/foo.md'), 'claude-rules');
        assert.strictEqual(getArtifactType('.claude/agents/agent.md'), 'claude-agents');
        assert.strictEqual(getArtifactType('.claude/skills/name/SKILL.md'), 'claude-skills');
        assert.strictEqual(getArtifactType('.claude/settings/settings.json'), 'claude-settings');
        assert.strictEqual(getArtifactType('.claude/settings.json'), 'claude-settings');
        assert.strictEqual(getArtifactType('.claude\\rules\\foo.md'), 'claude-rules');
    });

    it('keeps unknown Claude paths and GitHub paths classified correctly', () => {
        assert.strictEqual(getArtifactType('.claude/unknown/file.md'), 'other');
        assert.strictEqual(getArtifactType('.github/instructions/foo.md'), 'instructions');
    });
});

describe('isClaudeArtifactPath', () => {
    it('identifies only known Claude artifact paths', () => {
        assert.ok(isClaudeArtifactPath('.claude/rules/foo.md'));
        assert.ok(isClaudeArtifactPath('.claude/agents/a.md'));
        assert.ok(isClaudeArtifactPath('.claude/settings.json'));
        assert.ok(!isClaudeArtifactPath('.github/instructions/foo.md'));
        assert.ok(!isClaudeArtifactPath('instructions/foo.md'));
        assert.ok(!isClaudeArtifactPath('.claude/unknown/file.md'));
    });
});

describe('classifySingle: Claude Code types', () => {
    it('defaults Claude artifacts to synchronized and honors injection overrides', () => {
        assert.strictEqual(classifySingle('.claude/rules/foo.md', undefined), 'synchronized');
        assert.strictEqual(classifySingle('.claude/agents/a.md', undefined), 'synchronized');
        assert.strictEqual(classifySingle('.claude/skills/x/SKILL.md', undefined), 'synchronized');
        assert.strictEqual(classifySingle('.claude/settings.json', undefined), 'synchronized');
        assert.strictEqual(
            classifySingle('.claude/rules/foo.md', { 'claude-rules': 'settings' }),
            'settings',
        );
        assert.strictEqual(
            classifySingle('.claude/agents/a.md', { 'claude-agents': 'settings' }),
            'settings',
        );
    });
});

describe('planSynchronization: Claude Code routing', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });

    afterEach(() => {
        cleanup(tmpDir);
    });

    it('routes Claude files to the workspace root without prefixed names', () => {
        const srcPath = writeFile(tmpDir, 'src/rules/foo.md', '# rule\n');
        const files = [makeEffectiveFile('.claude/rules/foo.md', srcPath)];

        const plan = planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files });

        assert.strictEqual(plan.synchronizedFiles.length, 1);
        const entry = plan.synchronizedFiles[0];
        assert.strictEqual(entry.outputDir, '.');
        assert.strictEqual(entry.destinationRelativePath, '.claude/rules/foo.md');
    });

    it('keeps GitHub synchronized files on the default output directory', () => {
        const srcPath = writeFile(tmpDir, 'src/instructions/foo.md', '# instruction\n');
        const files = [makeEffectiveFile('instructions/foo.md', srcPath)];

        const plan = planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files });

        assert.strictEqual(plan.synchronizedFiles[0].outputDir, '.github');
    });

    it('excludes settings-classified Claude files from the synchronization plan', () => {
        const srcPath = writeFile(tmpDir, 'src/rules/foo.md', '# rule\n');
        const files = [makeEffectiveFile('.claude/rules/foo.md', srcPath, 'settings')];

        const plan = planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files });

        assert.strictEqual(plan.synchronizedFiles.length, 0);
    });

    it('fails before overwriting an unmanaged Claude destination', () => {
        const srcPath = writeFile(tmpDir, 'src/rules/foo.md', '# rule\n');
        writeFile(tmpDir, '.claude/rules/foo.md', '# user-owned rule\n');
        const files = [makeEffectiveFile('.claude/rules/foo.md', srcPath)];

        assert.throws(
            () => planSynchronization({ workspaceRoot: tmpDir, effectiveFiles: files }),
            /Unmanaged destination already exists/,
        );
    });
});

describe('apply: Claude Code output and state tracking', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = makeTempDir();
    });

    afterEach(() => {
        cleanup(tmpDir);
    });

    it('writes Claude files to .claude at the workspace root and records outputDir', () => {
        const srcPath = writeFile(tmpDir, 'src/rules/foo.md', '# rule\n');
        const files = [makeEffectiveFile('.claude/rules/foo.md', srcPath)];

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        const state = loadManagedState(tmpDir);

        assert.deepStrictEqual(result.written, ['.claude/rules/foo.md']);
        assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'foo.md')));
        assert.strictEqual(state.files['.claude/rules/foo.md'].outputDir, '.');
    });

    it('continues omitting outputDir for default .github files', () => {
        const srcPath = writeFile(tmpDir, 'src/instructions/foo.md', '# instruction\n');
        const files = [makeEffectiveFile('instructions/foo.md', srcPath)];

        apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        const state = loadManagedState(tmpDir);

        assert.strictEqual(Object.values(state.files)[0]?.outputDir, undefined);
    });

    it('writes Claude and GitHub files in the same apply run', () => {
        const claudeSrcPath = writeFile(tmpDir, 'src/rules/r.md', '# rule\n');
        const githubSrcPath = writeFile(tmpDir, 'src/instructions/i.md', '# instr\n');
        const files = [
            makeEffectiveFile('.claude/rules/r.md', claudeSrcPath),
            makeEffectiveFile('instructions/i.md', githubSrcPath),
        ];

        const result = apply({ workspaceRoot: tmpDir, effectiveFiles: files });

        assert.strictEqual(result.written.length, 2);
        assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'r.md')));
        assert.ok(
            fs.existsSync(
                path.join(tmpDir, '.github', 'instructions', '_default-test-layer__i.md'),
            ),
        );
    });

    it('checks drift for Claude files at their recorded root output directory', () => {
        const srcPath = writeFile(tmpDir, 'src/rules/foo.md', '# rule\n');
        const files = [makeEffectiveFile('.claude/rules/foo.md', srcPath)];

        apply({ workspaceRoot: tmpDir, effectiveFiles: files });
        const state = loadManagedState(tmpDir);

        const initial = checkAllDrift(tmpDir, '.github', state);
        assert.deepStrictEqual(
            initial.map((result) => result.status),
            ['in-sync'],
        );

        fs.writeFileSync(path.join(tmpDir, '.claude', 'rules', 'foo.md'), '# user edit\n');

        const drifted = checkAllDrift(tmpDir, '.github', state);
        assert.deepStrictEqual(
            drifted.map((result) => result.status),
            ['drifted'],
        );
    });
});
