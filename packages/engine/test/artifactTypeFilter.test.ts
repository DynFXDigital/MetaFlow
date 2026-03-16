/**
 * Artifact-type filter tests.
 *
 * Covers getArtifactType helper (ATF-01) and applyExcludedTypeFilters (ATF-02 through ATF-05).
 */

import * as assert from 'assert';
import { getArtifactType, applyExcludedTypeFilters, EffectiveFile } from '../src/index';

// ── Helpers ────────────────────────────────────────────────────────

function makeFile(
    relativePath: string,
    sourceLayer: string = 'repo/.',
    sourceRepo: string = 'repo',
): EffectiveFile {
    return {
        relativePath,
        sourcePath: `/abs/${relativePath}`,
        sourceLayer,
        sourceRepo,
        classification: 'synchronized',
    };
}

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

// ── applyExcludedTypeFilters ───────────────────────────────────────

describe('applyExcludedTypeFilters', () => {
    const instructionsFile = makeFile('.github/instructions/a.md', 'repo/.');
    const promptsFile = makeFile('.github/prompts/p.md', 'repo/.');
    const agentsFile = makeFile('.github/agents/a.md', 'repo/.');
    const skillsFile = makeFile('.github/skills/s/SKILL.md', 'repo/.');
    const otherFile = makeFile('hooks/pre.sh', 'repo/.');

    it('ATF-02: absent layerSources returns all files', () => {
        const files = [instructionsFile, promptsFile];
        const result = applyExcludedTypeFilters(files, undefined);
        assert.deepStrictEqual(result, files);
    });

    it('ATF-03: empty layerSources array returns all files', () => {
        const files = [instructionsFile, promptsFile];
        const result = applyExcludedTypeFilters(files, []);
        assert.deepStrictEqual(result, files);
    });

    it('ATF-04: file excluded when its type is in excludedTypes', () => {
        const result = applyExcludedTypeFilters(
            [instructionsFile, promptsFile],
            [{ repoId: 'repo', path: '.', excludedTypes: ['instructions'] }],
        );
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], promptsFile);
    });

    it('ATF-05: file passes when excludedTypes is empty array on its layer', () => {
        const result = applyExcludedTypeFilters(
            [instructionsFile, promptsFile],
            [{ repoId: 'repo', path: '.', excludedTypes: [] }],
        );
        assert.deepStrictEqual(result, [instructionsFile, promptsFile]);
    });

    it('ATF-06: other-type file is not affected by excludedTypes', () => {
        // 'other' cannot appear in excludedTypes; even if someone puts a matching
        // type key, the filter logic uses 'other' as the classification.
        const result = applyExcludedTypeFilters(
            [otherFile],
            [
                {
                    repoId: 'repo',
                    path: '.',
                    excludedTypes: ['instructions', 'prompts', 'agents', 'skills'],
                },
            ],
        );
        assert.deepStrictEqual(result, [otherFile]);
    });

    it('ATF-07: multiple excluded types all suppress correctly', () => {
        const result = applyExcludedTypeFilters(
            [instructionsFile, promptsFile, agentsFile, skillsFile],
            [{ repoId: 'repo', path: '.', excludedTypes: ['instructions', 'agents'] }],
        );
        assert.strictEqual(result.length, 2);
        assert.ok(result.includes(promptsFile));
        assert.ok(result.includes(skillsFile));
    });

    it('ATF-08: excludedTypes only affects the matching layer, not others', () => {
        const fileLayer1 = makeFile('.github/instructions/a.md', 'repo/layerA', 'repo');
        const fileLayer2 = makeFile('.github/instructions/b.md', 'repo/layerB', 'repo');

        const result = applyExcludedTypeFilters(
            [fileLayer1, fileLayer2],
            [
                { repoId: 'repo', path: 'layerA', excludedTypes: ['instructions'] },
                { repoId: 'repo', path: 'layerB' },
            ],
        );
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], fileLayer2);
    });

    it('ATF-09: Windows-style layer paths still match excludedTypes filters', () => {
        const file = makeFile('.github/instructions/a.md', 'repo/team/core', 'repo');

        const result = applyExcludedTypeFilters(
            [file],
            [{ repoId: 'repo', path: 'team\\core', excludedTypes: ['instructions'] }],
        );

        assert.deepStrictEqual(result, []);
    });
});
