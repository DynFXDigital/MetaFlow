import * as assert from 'assert';
import {
    generateProvenanceHeader,
    parseProvenanceHeader,
    stripProvenanceHeader,
    ProvenanceData,
} from '@metaflow/engine';

suite('provenanceHeader', () => {
    const fullData: ProvenanceData = {
        synced: '2026-02-07T12:00:00.000Z',
        sourceRepo: 'https://github.com/org/standards',
        sourceCommit: 'abc123',
        scope: 'company/core',
        layers: ['base', 'team'],
        profile: 'default',
        contentHash: 'sha256:deadbeef',
    };
    test('write and parse round-trip with all fields', () => {
        const header = generateProvenanceHeader(fullData);
        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed);
        assert.strictEqual(parsed!.synced, fullData.synced);
        assert.strictEqual(parsed!.sourceRepo, fullData.sourceRepo);
        assert.strictEqual(parsed!.sourceCommit, fullData.sourceCommit);
        assert.strictEqual(parsed!.scope, fullData.scope);
        assert.deepStrictEqual(parsed!.layers, fullData.layers);
        assert.strictEqual(parsed!.profile, fullData.profile);
        assert.strictEqual(parsed!.contentHash, fullData.contentHash);
    });

    test('write and parse with minimal fields', () => {
        const minimal: ProvenanceData = {
            synced: '2026-01-01T00:00:00Z',
            contentHash: 'sha256:abc',
        };
        const header = generateProvenanceHeader(minimal);
        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed);
        assert.strictEqual(parsed!.synced, minimal.synced);
        assert.strictEqual(parsed!.contentHash, minimal.contentHash);
        assert.strictEqual(parsed!.sourceRepo, undefined);
        assert.strictEqual(parsed!.sourceCommit, undefined);
        assert.strictEqual(parsed!.scope, undefined);
        assert.strictEqual(parsed!.layers, undefined);
        assert.strictEqual(parsed!.profile, undefined);
    });

    test('parse file without provenance returns null', () => {
        const content = '# Just a markdown file\nNo provenance here.';
        assert.strictEqual(parseProvenanceHeader(content), null);
    });

    test('parse incomplete provenance returns null', () => {
        const content = '<!-- metaflow:provenance\nsynced: 2026-01-01\n-->';
        // Missing contentHash — required field
        assert.strictEqual(parseProvenanceHeader(content), null);
    });

    test('stripProvenanceHeader removes header', () => {
        const body = '# My File\nContent here.';
        const header = generateProvenanceHeader(fullData);
        const full = header + body;
        const stripped = stripProvenanceHeader(full);
        assert.strictEqual(stripped, body);
    });

    test('stripProvenanceHeader on file without header returns content', () => {
        const body = '# No header\nJust content.';
        assert.strictEqual(stripProvenanceHeader(body), body);
    });
});
