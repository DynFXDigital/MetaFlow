import * as assert from 'assert';
import {
    parseRepoManifestContent,
    loadRepoManifestForRoot,
    repoManifestConstants,
} from '../src/index';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('repoManifest parser', () => {
    it('parses optional name and description fields', () => {
        const content = [
            '---',
            'name: MetaFlow',
            'description: Shared repository-level metadata.',
            '---',
            '',
            '# MetaFlow',
        ].join('\n');

        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');

        assert.strictEqual(parsed.name, 'MetaFlow');
        assert.strictEqual(parsed.description, 'Shared repository-level metadata.');
        assert.ok(parsed.body?.includes('# MetaFlow'));
    });

    it('tolerates markdown without frontmatter', () => {
        const parsed = parseRepoManifestContent('# Repo Notes\n', '/tmp/METAFLOW.md');

        assert.strictEqual(parsed.name, undefined);
        assert.strictEqual(parsed.description, undefined);
        assert.strictEqual(parsed.body, '# Repo Notes\n');
    });

    it('loads METAFLOW.md from repo root', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-manifest-test-'));
        try {
            const filePath = path.join(tmpDir, repoManifestConstants.REPO_MANIFEST_FILE_NAME);
            fs.writeFileSync(
                filePath,
                [
                    '---',
                    'name: Core Metadata',
                    'description: Shared AI metadata repository.',
                    '---',
                ].join('\n'),
                'utf-8',
            );

            const loaded = loadRepoManifestForRoot(tmpDir);
            assert.ok(loaded);
            assert.strictEqual(loaded?.manifestPath, filePath);
            assert.strictEqual(loaded?.name, 'Core Metadata');
            assert.strictEqual(loaded?.description, 'Shared AI metadata repository.');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('strips single-quoted name and description values', () => {
        const content = [
            '---',
            "name: 'Single Quoted Name'",
            "description: 'Single quoted description'",
            '---',
        ].join('\n');
        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');
        assert.strictEqual(parsed.name, 'Single Quoted Name');
        assert.strictEqual(parsed.description, 'Single quoted description');
    });

    it('strips double-quoted name and description values', () => {
        const content = [
            '---',
            'name: "Double Quoted Name"',
            'description: "Double quoted description"',
            '---',
        ].join('\n');
        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');
        assert.strictEqual(parsed.name, 'Double Quoted Name');
        assert.strictEqual(parsed.description, 'Double quoted description');
    });

    it('strips BOM from beginning of file content', () => {
        const content = '\uFEFF---\nname: BOM Test\ndescription: Has BOM.\n---\n';
        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');
        assert.strictEqual(parsed.name, 'BOM Test');
        assert.strictEqual(parsed.description, 'Has BOM.');
    });

    it('skips comment lines and empty lines in frontmatter', () => {
        const content = [
            '---',
            '# This is a comment',
            '',
            'name: Valid Name',
            '# Another comment',
            'description: Valid Desc',
            '---',
        ].join('\n');
        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');
        assert.strictEqual(parsed.name, 'Valid Name');
        assert.strictEqual(parsed.description, 'Valid Desc');
    });

    it('skips invalid key-value lines in frontmatter', () => {
        const content = [
            '---',
            'name: Good Name',
            '!!invalid-line-format',
            'description: Good Desc',
            '---',
        ].join('\n');
        const parsed = parseRepoManifestContent(content, '/tmp/METAFLOW.md');
        assert.strictEqual(parsed.name, 'Good Name');
        assert.strictEqual(parsed.description, 'Good Desc');
    });

    it('returns only manifestPath when METAFLOW.md cannot be read', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-manifest-test-'));
        try {
            // Create a directory at the manifest path — readFileSync will fail
            const manifestPath = path.join(tmpDir, repoManifestConstants.REPO_MANIFEST_FILE_NAME);
            fs.mkdirSync(manifestPath);

            const loaded = loadRepoManifestForRoot(tmpDir);
            assert.ok(loaded, 'should return an object even on read failure');
            assert.strictEqual(loaded!.manifestPath, manifestPath);
            assert.strictEqual(loaded!.name, undefined);
            assert.strictEqual(loaded!.description, undefined);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('returns undefined when METAFLOW.md does not exist', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-manifest-test-'));
        try {
            const loaded = loadRepoManifestForRoot(tmpDir);
            assert.strictEqual(loaded, undefined);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
