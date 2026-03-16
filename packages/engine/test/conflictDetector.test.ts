/**
 * Unit tests for conflictDetector.ts
 *
 * Covers: detectSurfacedFileConflicts and formatSurfacedFileConflictMessage
 */

import * as assert from 'assert';
import { detectSurfacedFileConflicts, formatSurfacedFileConflictMessage } from '../src/index';
import type { LayerContent, SurfacedFileConflict, SurfacedFileConflictSource } from '../src/index';

// ── Helpers ────────────────────────────────────────────────────────

function makeLayer(
    layerId: string,
    files: Array<{ relativePath: string; absolutePath: string }>,
    opts?: { repoId?: string; capabilityId?: string; capabilityName?: string },
): LayerContent {
    return {
        layerId,
        repoId: opts?.repoId,
        files,
        capability: opts?.capabilityId
            ? {
                  id: opts.capabilityId,
                  manifestPath: `/fake/${opts.capabilityId}/CAPABILITY.md`,
                  name: opts.capabilityName,
                  warnings: [],
              }
            : undefined,
    };
}

function f(relativePath: string, base = '/src'): { relativePath: string; absolutePath: string } {
    return { relativePath, absolutePath: `${base}/${relativePath}` };
}

function makeConflict(opts: {
    path: string;
    contenders: Array<{
        layer: string;
        capabilityName?: string;
        capabilityId?: string;
        sourceRepo?: string;
    }>;
}): SurfacedFileConflict {
    const sources: SurfacedFileConflictSource[] = opts.contenders.map((c) => ({
        relativePath: opts.path,
        sourcePath: `/src/${c.layer}/${opts.path}`,
        sourceLayer: c.layer,
        sourceCapabilityName: c.capabilityName,
        sourceCapabilityId: c.capabilityId,
        sourceRepo: c.sourceRepo,
    }));
    return {
        relativePath: opts.path,
        winner: sources[sources.length - 1],
        overridden: sources.slice(0, -1),
        contenders: sources,
    };
}

// ── detectSurfacedFileConflicts ────────────────────────────────────

describe('conflictDetector: detectSurfacedFileConflicts', () => {
    it('returns empty array for zero layers', () => {
        assert.deepStrictEqual(detectSurfacedFileConflicts([]), []);
    });

    it('returns empty array for a single layer with multiple files', () => {
        const layers = [makeLayer('core', [f('instructions/a.md'), f('skills/b.md')])];
        assert.deepStrictEqual(detectSurfacedFileConflicts(layers), []);
    });

    it('returns empty when all paths are unique across multiple layers', () => {
        const layers = [
            makeLayer('core', [f('instructions/a.md')]),
            makeLayer('custom', [f('skills/b.md')]),
        ];
        assert.deepStrictEqual(detectSurfacedFileConflicts(layers), []);
    });

    it('returns empty when all layers have empty file lists', () => {
        const layers = [makeLayer('a', []), makeLayer('b', []), makeLayer('c', [])];
        assert.deepStrictEqual(detectSurfacedFileConflicts(layers), []);
    });

    it('detects a two-layer conflict on the same path', () => {
        const layers = [
            makeLayer('core', [f('instructions/coding.md', '/repo-a')]),
            makeLayer('custom', [f('instructions/coding.md', '/repo-b')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].relativePath, 'instructions/coding.md');
        assert.strictEqual(conflicts[0].contenders.length, 2);
        assert.strictEqual(conflicts[0].winner.sourceLayer, 'custom');
        assert.strictEqual(conflicts[0].overridden.length, 1);
        assert.strictEqual(conflicts[0].overridden[0].sourceLayer, 'core');
    });

    it('detects a three-layer conflict with correct winner and overridden order', () => {
        const layers = [
            makeLayer('base', [f('skills/test.md')]),
            makeLayer('mid', [f('skills/test.md')]),
            makeLayer('top', [f('skills/test.md')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);

        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].winner.sourceLayer, 'top');
        assert.strictEqual(conflicts[0].overridden.length, 2);
        assert.strictEqual(conflicts[0].overridden[0].sourceLayer, 'base');
        assert.strictEqual(conflicts[0].overridden[1].sourceLayer, 'mid');
        assert.deepStrictEqual(
            conflicts[0].contenders.map((c) => c.sourceLayer),
            ['base', 'mid', 'top'],
        );
    });

    it('normalizes backslash paths to forward slashes', () => {
        const layers = [
            makeLayer('core', [
                { relativePath: 'instructions\\coding.md', absolutePath: '/a/coding.md' },
            ]),
            makeLayer('custom', [
                { relativePath: 'instructions\\coding.md', absolutePath: '/b/coding.md' },
            ]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].relativePath, 'instructions/coding.md');
    });

    it('sorts multiple conflicts alphabetically by relativePath', () => {
        const layers = [
            makeLayer('a', [f('skills/z.md'), f('agents/a.md')]),
            makeLayer('b', [f('skills/z.md'), f('agents/a.md')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 2);
        assert.strictEqual(conflicts[0].relativePath, 'agents/a.md');
        assert.strictEqual(conflicts[1].relativePath, 'skills/z.md');
    });

    it('includes sourceRepo in conflict sources when provided', () => {
        const layers = [
            makeLayer('r1/core', [f('agents/a.md')], {
                repoId: 'r1',
                capabilityId: 'core',
                capabilityName: 'Core Cap',
            }),
            makeLayer('r1/custom', [f('agents/a.md')], {
                repoId: 'r1',
                capabilityId: 'custom',
                capabilityName: 'Custom Cap',
            }),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].winner.sourceRepo, 'r1');
        assert.strictEqual(conflicts[0].winner.sourceCapabilityName, 'Custom Cap');
        assert.strictEqual(conflicts[0].overridden[0].sourceCapabilityName, 'Core Cap');
    });

    it('omits sourceRepo from conflict sources when layer has no repoId', () => {
        const layers = [
            makeLayer('core', [f('skills/a.md')]),
            makeLayer('custom', [f('skills/a.md')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].winner.sourceRepo, undefined);
    });

    it('detects multiple independent conflicts in one call', () => {
        const layers = [
            makeLayer('a', [f('instructions/x.md'), f('skills/y.md')]),
            makeLayer('b', [f('instructions/x.md'), f('agents/z.md')]),
            makeLayer('c', [f('skills/y.md'), f('agents/z.md')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 3);
        // Sorted: agents/z.md, instructions/x.md, skills/y.md
        assert.strictEqual(conflicts[0].relativePath, 'agents/z.md');
        assert.strictEqual(conflicts[1].relativePath, 'instructions/x.md');
        assert.strictEqual(conflicts[2].relativePath, 'skills/y.md');
    });

    it('only conflicts on files from enabled layers after profile filtering', () => {
        // With a profile that disable all, effectively no files surfaced → no conflicts
        const layers = [
            makeLayer('core', [f('skills/x.md')]),
            makeLayer('custom', [f('skills/x.md')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers, {
            profile: { disable: ['skills/**'] },
        });
        assert.deepStrictEqual(conflicts, []);
    });

    it('propagates capabilityId and capabilityDescription to conflict sources', () => {
        const layers = [
            makeLayer('r1/core', [f('prompts/a.md')], { repoId: 'r1', capabilityId: 'core-id' }),
            makeLayer('r1/ext', [f('prompts/a.md')], {
                repoId: 'r1',
                capabilityId: 'ext-id',
                capabilityName: 'Extension',
            }),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(conflicts[0].overridden[0].sourceCapabilityId, 'core-id');
        assert.strictEqual(conflicts[0].winner.sourceCapabilityId, 'ext-id');
        assert.strictEqual(conflicts[0].winner.sourceCapabilityName, 'Extension');
    });

    it('winner.sourcePath equals the absolutePath from the winning layer file entry', () => {
        const layers = [
            makeLayer('core', [
                {
                    relativePath: 'instructions/coding.md',
                    absolutePath: '/repo-a/instructions/coding.md',
                },
            ]),
            makeLayer('custom', [
                {
                    relativePath: 'instructions/coding.md',
                    absolutePath: '/repo-b/instructions/coding.md',
                },
            ]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(
            conflicts[0].winner.sourcePath,
            '/repo-b/instructions/coding.md',
            'winner.sourcePath must equal the absolutePath from the last (winning) layer',
        );
        assert.strictEqual(
            conflicts[0].overridden[0].sourcePath,
            '/repo-a/instructions/coding.md',
            'overridden sourcePath must equal the absolutePath from the overridden layer',
        );
    });

    it('last layer always wins in a 5-layer conflict (last-layer-wins contract)', () => {
        const layers = [
            makeLayer('L0', [f('shared.md', '/base-0')]),
            makeLayer('L1', [f('shared.md', '/base-1')]),
            makeLayer('L2', [f('shared.md', '/base-2')]),
            makeLayer('L3', [f('shared.md', '/base-3')]),
            makeLayer('L4', [f('shared.md', '/base-4')]),
        ];
        const conflicts = detectSurfacedFileConflicts(layers);
        assert.strictEqual(conflicts.length, 1);
        assert.strictEqual(
            conflicts[0].winner.sourceLayer,
            'L4',
            'last layer (L4) must always be the winner',
        );
        assert.strictEqual(
            conflicts[0].overridden.length,
            4,
            'all other four layers should be overridden',
        );
        assert.deepStrictEqual(
            conflicts[0].overridden.map((c) => c.sourceLayer),
            ['L0', 'L1', 'L2', 'L3'],
            'overridden layers must preserve insertion order',
        );
    });
});

// ── formatSurfacedFileConflictMessage ─────────────────────────────

describe('conflictDetector: formatSurfacedFileConflictMessage', () => {
    it('includes [CAPABILITY_CONFLICT] marker and file path', () => {
        const conflict = makeConflict({
            path: 'instructions/coding.md',
            contenders: [{ layer: 'core' }, { layer: 'custom' }],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('[CAPABILITY_CONFLICT]'));
        assert.ok(msg.includes('instructions/coding.md'));
    });

    it('shows just sourceLayer when no capabilityName or capabilityId', () => {
        const conflict = makeConflict({
            path: 'skills/test.md',
            contenders: [{ layer: 'layer-a' }, { layer: 'layer-b' }],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('layer-a'));
        assert.ok(msg.includes('layer-b'));
        // No "name [layer]" wrapper expected
        assert.ok(!msg.includes('[layer-a]'));
        assert.ok(!msg.includes('[layer-b]'));
    });

    it('shows "name [layer]" when capabilityName differs from sourceLayer', () => {
        const conflict = makeConflict({
            path: 'skills/test.md',
            contenders: [
                { layer: 'primary/core', capabilityName: 'Core Capability' },
                { layer: 'primary/custom', capabilityName: 'Custom Capability' },
            ],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('Core Capability [primary/core]'));
        assert.ok(msg.includes('Custom Capability [primary/custom]'));
    });

    it('shows just sourceLayer when capabilityName equals sourceLayer', () => {
        const conflict = makeConflict({
            path: 'skills/test.md',
            contenders: [
                { layer: 'my-layer', capabilityName: 'my-layer' },
                { layer: 'other-layer' },
            ],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('my-layer'));
        // Should NOT produce "my-layer [my-layer]" when name === layer
        assert.ok(!msg.includes('my-layer [my-layer]'));
    });

    it('uses capabilityId as label fallback when name is absent but id differs from layer', () => {
        const conflict = makeConflict({
            path: 'agents/bot.md',
            contenders: [
                { layer: 'primary/core', capabilityId: 'core-id' },
                { layer: 'primary/custom', capabilityId: 'custom-id' },
            ],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('core-id [primary/core]'));
        assert.ok(msg.includes('custom-id [primary/custom]'));
    });

    it('reports correct contender count in the message', () => {
        const conflict = makeConflict({
            path: 'agents/bot.md',
            contenders: [{ layer: 'a' }, { layer: 'b' }, { layer: 'c' }],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('3 enabled capabilities'));
    });

    it('identifies the winner in the message', () => {
        const conflict = makeConflict({
            path: 'skills/x.md',
            contenders: [{ layer: 'loser-layer' }, { layer: 'winner-layer' }],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('using winner-layer'));
    });

    it('lists contenders in the Contenders section', () => {
        const conflict = makeConflict({
            path: 'instructions/a.md',
            contenders: [{ layer: 'base', capabilityName: 'Base Cap' }, { layer: 'override' }],
        });
        const msg = formatSurfacedFileConflictMessage(conflict);
        assert.ok(msg.includes('Contenders:'));
        assert.ok(msg.includes('Base Cap [base]'));
        assert.ok(msg.includes('override'));
    });
});
