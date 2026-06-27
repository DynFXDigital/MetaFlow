/**
 * Artifact-type filter tests.
 *
 * Covers getArtifactType helper (ATF-01).
 */

import * as assert from 'assert';
import { getArtifactType } from '../src/index';

// ── getArtifactType ────────────────────────────────────────────────

describe('getArtifactType', () => {
    it('ATF-01a: instructions path returns instructions', () => {
        assert.strictEqual(getArtifactType('instructions/foo.md'), 'instructions');
    });

    it('ATF-01b: .github/instructions path returns instructions', () => {
        assert.strictEqual(getArtifactType('.github/instructions/foo.md'), 'instructions');
    });

    it('ATF-01c: prompts path returns prompts', () => {
        assert.strictEqual(getArtifactType('.github/prompts/p.prompt.md'), 'prompts');
    });

    it('ATF-01d: agents path returns agents', () => {
        assert.strictEqual(getArtifactType('.github/agents/a.agent.md'), 'agents');
    });

    it('ATF-01e: skills path returns skills', () => {
        assert.strictEqual(getArtifactType('.github/skills/s/SKILL.md'), 'skills');
    });

    it('ATF-01ea: hooks path returns hooks', () => {
        assert.strictEqual(getArtifactType('.github/hooks/prompt-injection-guard.json'), 'hooks');
    });

    it('ATF-01e2: Codex repository skill path returns skills', () => {
        assert.strictEqual(getArtifactType('.agents/skills/codex-metadata/SKILL.md'), 'skills');
    });

    it('ATF-01e3: Codex project instruction paths return instructions', () => {
        assert.strictEqual(getArtifactType('AGENTS.md'), 'instructions');
        assert.strictEqual(getArtifactType('AGENTS.override.md'), 'instructions');
    });

    it('ATF-01e4: Codex project config agent paths return agents', () => {
        assert.strictEqual(getArtifactType('.codex/agents/reviewer.toml'), 'agents');
    });

    it('ATF-01f: unknown prefix returns other', () => {
        assert.strictEqual(getArtifactType('unknown/file.md'), 'other');
    });

    it('ATF-01g: root-level file returns other', () => {
        assert.strictEqual(getArtifactType('settings.json'), 'other');
    });

    it('ATF-01h: backslash paths are normalised', () => {
        assert.strictEqual(getArtifactType('.github\\instructions\\foo.md'), 'instructions');
    });
});
