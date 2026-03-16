import * as assert from 'assert';
import { parseFrontmatter } from '../src/index';

describe('parseFrontmatter', () => {
    it('returns undefined for text without front-matter', () => {
        assert.strictEqual(parseFrontmatter('# Just markdown\nNo front-matter here.'), undefined);
    });

    it('returns undefined for empty string', () => {
        assert.strictEqual(parseFrontmatter(''), undefined);
    });

    it('returns undefined when opening delimiter is missing', () => {
        assert.strictEqual(parseFrontmatter('name: test\n---\nbody'), undefined);
    });

    it('returns undefined when closing delimiter is missing', () => {
        assert.strictEqual(parseFrontmatter('---\nname: test\nbody without closing'), undefined);
    });

    it('parses basic key-value fields', () => {
        const input = '---\nname: My Skill\ndescription: A helpful skill.\n---\n# Body';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'My Skill');
        assert.strictEqual(result.fields.description, 'A helpful skill.');
        assert.strictEqual(result.body, '# Body');
    });

    it('strips double quotes from values', () => {
        const input = '---\ndescription: "Quoted description"\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.description, 'Quoted description');
    });

    it('strips single quotes from values', () => {
        const input = "---\napplyTo: '**/*.ts'\n---\n";
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.applyTo, '**/*.ts');
    });

    it('handles CRLF line endings', () => {
        const input =
            '---\r\nname: CRLF Test\r\ndescription: Works with Windows.\r\n---\r\nBody here.';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'CRLF Test');
        assert.strictEqual(result.fields.description, 'Works with Windows.');
        assert.strictEqual(result.body, 'Body here.');
    });

    it('strips BOM before parsing', () => {
        const input = '\uFEFF---\nname: BOM Test\n---\nBody.';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'BOM Test');
    });

    it('skips blank lines and comments in front-matter', () => {
        const input = '---\nname: Test\n\n# This is a comment\ndescription: Desc\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'Test');
        assert.strictEqual(result.fields.description, 'Desc');
        assert.strictEqual(Object.keys(result.fields).length, 2);
    });

    it('skips lines that do not match key: value format', () => {
        const input =
            '---\nname: Valid\ninvalid line without colon\ndescription: Also valid\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'Valid');
        assert.strictEqual(result.fields.description, 'Also valid');
        assert.strictEqual(Object.keys(result.fields).length, 2);
    });

    it('handles fields with hyphens in keys', () => {
        const input = '---\nargument-hint: Describe your task\napply-to: src/**\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields['argument-hint'], 'Describe your task');
        assert.strictEqual(result.fields['apply-to'], 'src/**');
    });

    it('parses instruction file front-matter', () => {
        const input = [
            '---',
            'description: Instructions for generating concise responses.',
            'applyTo: "**"',
            '---',
            '',
            'Keep your output concise.',
        ].join('\n');
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(
            result.fields.description,
            'Instructions for generating concise responses.',
        );
        assert.strictEqual(result.fields.applyTo, '**');
        assert.ok(result.body.includes('Keep your output concise.'));
    });

    it('parses agent file front-matter', () => {
        const input = [
            '---',
            'name: Critic',
            'description: Adversarial code reviewer.',
            'tools: ["read", "search", "execute"]',
            'infer: false',
            '---',
            '',
            'You are Critic.',
        ].join('\n');
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'Critic');
        assert.strictEqual(result.fields.description, 'Adversarial code reviewer.');
        assert.strictEqual(result.fields.tools, '["read", "search", "execute"]');
        assert.strictEqual(result.fields.infer, 'false');
    });

    it('parses prompt file front-matter', () => {
        const input = [
            '---',
            'description: Create a new plan directory.',
            'agent: agent',
            '---',
            '',
            '# Create a Plan',
        ].join('\n');
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.description, 'Create a new plan directory.');
        assert.strictEqual(result.fields.agent, 'agent');
    });

    it('returns empty body when front-matter is followed by nothing', () => {
        const input = '---\nname: Minimal\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.name, 'Minimal');
        assert.strictEqual(result.body, '');
    });

    it('handles values with colons', () => {
        const input = '---\ndescription: Use: this thing for: stuff.\n---\n';
        const result = parseFrontmatter(input);
        assert.ok(result);
        assert.strictEqual(result.fields.description, 'Use: this thing for: stuff.');
    });
});
