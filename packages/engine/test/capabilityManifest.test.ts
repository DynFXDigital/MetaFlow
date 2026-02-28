import * as assert from 'assert';
import {
    parseCapabilityManifestContent,
    capabilityManifestConstants,
    loadCapabilityManifestForLayer,
} from '../src/index';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('capabilityManifest parser', () => {
    it('parses required fields and body', () => {
        const content = [
            '---',
            'name: SDLC Traceability',
            'description: Traceable requirements and tests.',
            'license: MIT',
            '---',
            '',
            '## Mission',
            'Keep docs testable.',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'sdlc-traceability', '/tmp/CAPABILITY.md');

        assert.strictEqual(parsed.id, 'sdlc-traceability');
        assert.strictEqual(parsed.name, 'SDLC Traceability');
        assert.strictEqual(parsed.description, 'Traceable requirements and tests.');
        assert.strictEqual(parsed.license, 'MIT');
        assert.ok(parsed.body?.includes('## Mission'));
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('warns when frontmatter is missing', () => {
        const parsed = parseCapabilityManifestContent(
            '# No frontmatter\nBody',
            'foo',
            '/tmp/CAPABILITY.md'
        );

        assert.ok(parsed.warnings.some(w => w.code === 'CAPABILITY_FRONTMATTER_MISSING'));
        assert.ok(parsed.warnings.some(w => w.code === 'CAPABILITY_NAME_REQUIRED'));
        assert.ok(parsed.warnings.some(w => w.code === 'CAPABILITY_DESCRIPTION_REQUIRED'));
    });

    it('warns on unknown frontmatter keys', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'owner: platform',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'my-capability', '/tmp/CAPABILITY.md');
        assert.ok(parsed.warnings.some(w => w.code === 'CAPABILITY_UNKNOWN_FIELD'));
    });

    it('accepts fallback license token', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            `license: ${capabilityManifestConstants.FALLBACK_LICENSE_TOKEN}`,
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'my-capability', '/tmp/CAPABILITY.md');
        assert.ok(!parsed.warnings.some(w => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('accepts SPDX-like expression syntax', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: MIT OR Apache-2.0',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'my-capability', '/tmp/CAPABILITY.md');
        assert.ok(!parsed.warnings.some(w => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('warns on invalid license syntax', () => {
        const content = [
            '---',
            'name: My Capability',
            'description: Desc',
            'license: MIT OR',
            '---',
        ].join('\n');

        const parsed = parseCapabilityManifestContent(content, 'my-capability', '/tmp/CAPABILITY.md');
        assert.ok(parsed.warnings.some(w => w.code === 'CAPABILITY_LICENSE_INVALID'));
    });

    it('loads CAPABILITY.md from layer directory', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-manifest-test-'));
        try {
            const filePath = path.join(tmpDir, 'CAPABILITY.md');
            fs.writeFileSync(filePath, [
                '---',
                'name: Capability Name',
                'description: Capability Description',
                '---',
            ].join('\n'), 'utf-8');

            const loaded = loadCapabilityManifestForLayer(tmpDir, 'capability-id');
            assert.ok(loaded);
            assert.strictEqual(loaded?.id, 'capability-id');
            assert.strictEqual(loaded?.manifestPath, filePath);
            assert.strictEqual(loaded?.name, 'Capability Name');
            assert.strictEqual(loaded?.description, 'Capability Description');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
