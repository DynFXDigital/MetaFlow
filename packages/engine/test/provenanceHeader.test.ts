/**
 * Additional unit tests for provenanceHeader.ts
 *
 * Covers: uncovered branches in generateProvenanceHeader, parseProvenanceHeader,
 * stripProvenanceHeader, and decodeValue catch path.
 */

import * as assert from 'assert';
import {
    generateProvenanceHeader,
    parseProvenanceHeader,
    stripProvenanceHeader,
    computeContentHash,
} from '../src/index';
import type { ProvenanceData } from '../src/index';

describe('provenanceHeader: generateProvenanceHeader', () => {
    it('includes all optional fields when provided', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            sourceRepo: 'https://github.com/org/repo',
            sourceCommit: 'abc123def456',
            scope: 'capabilities/sdlc',
            layers: ['base', 'custom'],
            profile: 'strict',
            contentHash: computeContentHash('hello world'),
        });

        assert.ok(header.includes('source-repo='));
        assert.ok(header.includes('source-commit='));
        assert.ok(header.includes('scope='));
        assert.ok(header.includes('layers='));
        assert.ok(header.includes('profile='));
        assert.ok(header.includes('content-hash='));
        assert.ok(header.includes('synced='));
        // Must be a proper HTML comment
        assert.ok(header.startsWith('<!-- metaflow:provenance'));
        assert.ok(header.includes('-->'));
    });

    it('omits optional fields when absent', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            contentHash: computeContentHash('body'),
        });
        assert.ok(!header.includes('source-repo='));
        assert.ok(!header.includes('source-commit='));
        assert.ok(!header.includes('scope='));
        assert.ok(!header.includes('profile='));
        // layers only shown if non-empty
        assert.ok(!header.includes('layers='));
    });

    it('omits empty layers array', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            layers: [],
            contentHash: computeContentHash('body'),
        });
        assert.ok(!header.includes('layers='));
    });

    it('encodes special characters in values', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            sourceRepo: 'https://github.com/org/repo?ref=main&foo=bar',
            contentHash: computeContentHash('body'),
        });
        // URL-encoded '?' → '%3F', '&' → '%26', '=' → '%3D'
        assert.ok(!header.includes('?'));
        assert.ok(!header.includes('&'));
        assert.ok(header.includes('source-repo='));
    });

    it('URL-encoded sourceRepo round-trips to exact original value after decode', () => {
        const originalUrl = 'https://github.com/org/repo?ref=main&foo=bar';
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            sourceRepo: originalUrl,
            contentHash: computeContentHash('body'),
        });
        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed, 'header should parse successfully');
        assert.strictEqual(
            parsed!.sourceRepo,
            originalUrl,
            'sourceRepo must decode to the exact original URL after encode/decode round-trip',
        );
    });

    it('single-element layers array round-trips to exactly one element', () => {
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            layers: ['only-layer'],
            contentHash: computeContentHash('body'),
        });
        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed);
        assert.deepStrictEqual(
            parsed!.layers,
            ['only-layer'],
            'single-layer array must round-trip to exactly one element',
        );
    });
});

describe('provenanceHeader: parseProvenanceHeader', () => {
    it('returns null when no provenance header found', () => {
        const result = parseProvenanceHeader('# Just a markdown file\nNo provenance here.\n');
        assert.strictEqual(result, null);
    });

    it('returns null for empty string input', () => {
        assert.strictEqual(parseProvenanceHeader(''), null);
    });

    it('returns null when HEADER_START found but no HEADER_END', () => {
        const malformed = '<!-- metaflow:provenance synced=2026-01-01T00:00:00.000Z\ntruncated';
        const result = parseProvenanceHeader(malformed);
        assert.strictEqual(result, null);
    });

    it('returns null when required fields (synced) are missing', () => {
        // content-hash missing → should return null
        const header = '<!-- metaflow:provenance source-repo=test -->\n';
        const result = parseProvenanceHeader(header);
        assert.strictEqual(result, null);
    });

    it('returns null when contentHash is missing', () => {
        const header = '<!-- metaflow:provenance synced=2026-01-01T00:00:00.000Z -->\n';
        const result = parseProvenanceHeader(header);
        assert.strictEqual(result, null);
    });

    it('parses sourceCommit field correctly in = format', () => {
        const data: ProvenanceData = {
            synced: '2026-01-01T00:00:00.000Z',
            sourceCommit: 'abc123def456',
            contentHash: computeContentHash('body'),
        };
        const header = generateProvenanceHeader(data);
        const parsed = parseProvenanceHeader(header);
        assert.ok(parsed);
        assert.strictEqual(parsed!.sourceCommit, 'abc123def456');
    });

    it('parses all fields including layers with multiple entries', () => {
        const data: ProvenanceData = {
            synced: '2026-03-01T12:00:00.000Z',
            sourceRepo: 'myrepo',
            sourceCommit: 'deadbeef',
            scope: 'capabilities/planning',
            layers: ['base', 'override'],
            profile: 'dev',
            contentHash: computeContentHash('hello'),
        };
        const header = generateProvenanceHeader(data);
        const parsed = parseProvenanceHeader(header)!;
        assert.ok(parsed);
        assert.strictEqual(parsed.synced, data.synced);
        assert.strictEqual(parsed.sourceRepo, data.sourceRepo);
        assert.strictEqual(parsed.sourceCommit, data.sourceCommit);
        assert.strictEqual(parsed.scope, data.scope);
        assert.deepStrictEqual(parsed.layers, ['base', 'override']);
        assert.strictEqual(parsed.profile, data.profile);
        assert.strictEqual(parsed.contentHash, data.contentHash);
    });

    it('skips tokens without = in the block', () => {
        // token 'noequals' has no '=' → should be skipped
        const malformed =
            '<!-- metaflow:provenance noequals synced=2026-01-01T00:00:00.000Z content-hash=sha256:abc -->\n';
        const result = parseProvenanceHeader(malformed);
        assert.ok(result);
        assert.strictEqual(result!.synced, '2026-01-01T00:00:00.000Z');
    });

    it('handles malformed % encoding gracefully via decodeValue catch', () => {
        // %XX with invalid hex → decodeURIComponent throws; decodeValue should return raw value
        const malformed =
            '<!-- metaflow:provenance synced=%ZZinvalid content-hash=sha256:abc -->\n';
        // Should not throw
        const result = parseProvenanceHeader(malformed);
        // malformed synced → 'synced' field will be the raw un-decoded value or decoded value
        // Either parsed (with raw value) or null (if synced decodes to something truthy)
        // The key assertion is: no exception is thrown
        assert.ok(result === null || typeof result === 'object');
    });

    it('parses legacy colon-based format without = signs', () => {
        // Legacy format: "key: value" lines instead of "key=encoded-value" tokens
        const legacyHeader =
            [
                '<!-- metaflow:provenance',
                'synced: 2026-01-01T00:00:00.000Z',
                'source-repo: legacy-repo',
                'content-hash: sha256:legacy123',
                '-->',
            ].join('\n') + '\n';

        const result = parseProvenanceHeader(legacyHeader);
        assert.ok(result, 'should parse legacy format');
        assert.strictEqual(result!.synced, '2026-01-01T00:00:00.000Z');
        assert.strictEqual(result!.sourceRepo, 'legacy-repo');
        assert.strictEqual(result!.contentHash, 'sha256:legacy123');
    });

    it('parses legacy format with layers field', () => {
        const legacyHeader =
            [
                '<!-- metaflow:provenance',
                'synced: 2026-01-01T00:00:00.000Z',
                'layers: base,custom,override',
                'content-hash: sha256:abc',
                '-->',
            ].join('\n') + '\n';

        const result = parseProvenanceHeader(legacyHeader);
        assert.ok(result);
        assert.deepStrictEqual(result!.layers, ['base', 'custom', 'override']);
    });

    it('parses legacy format with all fields', () => {
        const legacyHeader =
            [
                '<!-- metaflow:provenance',
                'synced: 2026-01-01T00:00:00.000Z',
                'source-repo: my-repo',
                'source-commit: abcdef',
                'scope: capabilities/core',
                'layers: base',
                'profile: default',
                'content-hash: sha256:xyz',
                '-->',
            ].join('\n') + '\n';

        const result = parseProvenanceHeader(legacyHeader);
        assert.ok(result);
        assert.strictEqual(result!.synced, '2026-01-01T00:00:00.000Z');
        assert.strictEqual(result!.sourceRepo, 'my-repo');
        assert.strictEqual(result!.sourceCommit, 'abcdef');
        assert.strictEqual(result!.scope, 'capabilities/core');
        assert.deepStrictEqual(result!.layers, ['base']);
        assert.strictEqual(result!.profile, 'default');
        assert.strictEqual(result!.contentHash, 'sha256:xyz');
    });

    it('returns null for legacy format missing required fields', () => {
        const legacyHeader =
            ['<!-- metaflow:provenance', 'source-repo: only-optional-field', '-->'].join('\n') +
            '\n';
        const result = parseProvenanceHeader(legacyHeader);
        assert.strictEqual(result, null);
    });

    it('skips lines without colon in legacy format', () => {
        const legacyHeader =
            [
                '<!-- metaflow:provenance',
                'synced: 2026-01-01T00:00:00.000Z',
                'no-colon-here',
                'content-hash: sha256:abc',
                '-->',
            ].join('\n') + '\n';
        const result = parseProvenanceHeader(legacyHeader);
        assert.ok(result);
        assert.strictEqual(result!.contentHash, 'sha256:abc');
    });
});

describe('provenanceHeader: stripProvenanceHeader', () => {
    it('strips header when it precedes body', () => {
        const body = '# Hello World\nContent here.\n';
        const header = generateProvenanceHeader({
            synced: '2026-01-01T00:00:00.000Z',
            contentHash: computeContentHash(body),
        });
        const full = header + body;
        const stripped = stripProvenanceHeader(full);
        assert.strictEqual(stripped, body);
    });

    it('returns original content unchanged when no header present', () => {
        const content = '# Just a file\nNo provenance.\n';
        assert.strictEqual(stripProvenanceHeader(content), content);
    });

    it('strips header when it follows the body (footer placement)', () => {
        const body = '# Markdown File\nBody content.\n';
        const data: ProvenanceData = {
            synced: '2026-01-01T00:00:00.000Z',
            contentHash: computeContentHash(body),
        };
        const header = generateProvenanceHeader(data);
        // Footer: body + separator newline + header
        const full = body + '\n' + header;
        const stripped = stripProvenanceHeader(full);
        // Should get the body back (with the separator newline trimmed)
        assert.ok(stripped.includes('# Markdown File'));
        assert.ok(!stripped.includes('metaflow:provenance'));
    });

    it('removes trailing separator newline when header is a footer', () => {
        const body = '# File\n';
        const data: ProvenanceData = {
            synced: '2026-01-01T00:00:00.000Z',
            contentHash: computeContentHash(body),
        };
        const header = generateProvenanceHeader(data);
        // Simulate: synchronizer writes body + '\n' + header
        const full = body + '\n' + header;
        const stripped = stripProvenanceHeader(full);
        // The double-newline before footer should be reduced to single
        assert.strictEqual(stripped, body);
    });

    it('returns content unchanged when HEADER_END is missing', () => {
        const content = '<!-- metaflow:provenance synced=2026-01-01T00:00:00.000Z\nno end marker\n';
        assert.strictEqual(stripProvenanceHeader(content), content);
    });
});

describe('provenanceHeader: computeContentHash', () => {
    it('returns the same sha256:-prefixed hash for a given string', () => {
        const body = 'Hello World';
        const h1 = computeContentHash(body);
        const h2 = computeContentHash(body);
        assert.strictEqual(h1, h2, 'same input must always produce the same hash');
        assert.ok(h1.startsWith('sha256:'), 'must have sha256: prefix');
        assert.strictEqual(h1.length, 7 + 64, 'sha256: prefix (7 chars) + 64 hex chars');
    });

    it('returns valid sha256: hash for empty string input', () => {
        const h = computeContentHash('');
        assert.ok(h.startsWith('sha256:'), 'empty string hash must have sha256: prefix');
        assert.strictEqual(h.length, 7 + 64, 'must produce exactly 64 hex chars after prefix');
        assert.strictEqual(
            h,
            computeContentHash(''),
            'empty string hash must stay stable across repeated calls',
        );
    });

    it('returns different hashes for different inputs', () => {
        const h1 = computeContentHash('content-a');
        const h2 = computeContentHash('content-b');
        assert.notStrictEqual(h1, h2, 'different inputs must produce different hashes');
    });

    it('empty string hash differs from non-empty string hash', () => {
        const emptyHash = computeContentHash('');
        const nonEmptyHash = computeContentHash('x');
        assert.notStrictEqual(emptyHash, nonEmptyHash);
    });
});
