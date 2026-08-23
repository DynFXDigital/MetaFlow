import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    inspectAgentPluginPackage,
    PiAgentPluginProjectionInput,
    PiSkillProjectionInput,
    PiSkillsProjectionSource,
    projectPiAgentPluginSkills,
} from '../src';

function source(capabilityId: string, sourcePath = 'plugin.json'): PiSkillsProjectionSource {
    return {
        repoId: 'metadata',
        layerId: `metadata/capabilities/${capabilityId}`,
        capabilityId,
        capabilityName: capabilityId,
        sourcePath,
    };
}

function skill(
    name: string,
    capabilityId = name,
    description = `${name} description`,
): PiSkillProjectionInput {
    return {
        name,
        content: Buffer.from(
            `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
            'utf8',
        ),
        source: source(capabilityId, `skills/${name}/SKILL.md`),
    };
}

function plugin(
    name: string,
    skills: readonly PiSkillProjectionInput[] = [],
    capabilityId = name,
    manifest: Partial<PiAgentPluginProjectionInput['manifest']> = {},
): PiAgentPluginProjectionInput {
    return {
        manifest: { name, ...manifest },
        source: source(capabilityId),
        skills,
    };
}

describe('Pi skills projection', () => {
    it('does not fabricate a package for an empty active plugin set', () => {
        const result = projectPiAgentPluginSkills({ plugins: [] });
        assert.strictEqual(result.blocked, false);
        assert.deepStrictEqual(result.packages, []);
    });

    it('projects one source plugin 1:1 with its original portable manifest', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.review', [skill('review', 'review')], 'review', {
                    version: '2.4.0',
                    description: 'Portable review tools',
                    author: { name: 'Example' },
                    keywords: ['review', 'portable'],
                }),
            ],
        });

        assert.strictEqual(result.blocked, false);
        assert.strictEqual(result.packages.length, 1);
        const projected = result.packages[0];
        assert.strictEqual(projected.name, 'portable.review');
        assert.strictEqual(projected.relativeRoot, '.pi/plugins/portable.review');
        assert.deepStrictEqual(projected.manifest, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'portable.review',
            version: '2.4.0',
            description: 'Portable review tools',
            author: { name: 'Example' },
            keywords: ['review', 'portable'],
        });
        const manifestBytes = Buffer.from(
            projected.files.find((file) => file.relativePath === 'plugin.json')!.content,
        ).toString('utf8');
        assert.ok(!manifestBytes.toLowerCase().includes('metaflow'));
        assert.deepStrictEqual(
            projected.files.map((file) => file.relativePath),
            ['plugin.json', 'skills/review/SKILL.md'],
        );
    });

    it('preserves exact SKILL.md bytes and keeps provenance outside package content', () => {
        const exactBytes = Buffer.from(
            '\uFEFF---\r\nname: review\r\ndescription: Réview changes.\r\n---\r\n\r\n# Réview\r\n',
            'utf8',
        );
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.review', [
                    {
                        name: 'review',
                        content: exactBytes,
                        source: source('review', 'skills/review/SKILL.md'),
                    },
                ]),
            ],
        });

        assert.strictEqual(result.blocked, false);
        const projected = result.packages[0].files.find(
            (file) => file.relativePath === 'skills/review/SKILL.md',
        );
        assert.ok(projected);
        assert.deepStrictEqual(Buffer.from(projected.content), exactBytes);
        assert.deepStrictEqual(projected.sources, [source('review', 'skills/review/SKILL.md')]);
        assert.ok(
            !Buffer.from(projected.content).toString('utf8').includes('metadata/capabilities'),
        );
    });

    it('projects multiple plugins independently and deterministically', () => {
        const first = plugin('portable.first', [skill('first')]);
        const second = plugin('portable.second', [skill('second')]);
        const forward = projectPiAgentPluginSkills({ plugins: [first, second] });
        const reverse = projectPiAgentPluginSkills({ plugins: [second, first] });

        assert.strictEqual(forward.blocked, false);
        assert.strictEqual(reverse.blocked, false);
        assert.deepStrictEqual(forward.packages, reverse.packages);
        assert.deepStrictEqual(
            forward.packages.map((entry) => entry.relativeRoot),
            ['.pi/plugins/portable.first', '.pi/plugins/portable.second'],
        );
        assert.deepStrictEqual(
            forward.packages.map((entry) =>
                entry.files
                    .filter((file) => file.relativePath.startsWith('skills/'))
                    .map((file) => file.relativePath),
            ),
            [['skills/first/SKILL.md'], ['skills/second/SKILL.md']],
        );
    });

    it('blocks duplicate active plugin names instead of selecting a winner', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.same', [skill('first')], 'first'),
                plugin('portable.same', [skill('second')], 'second'),
            ],
        });

        assert.strictEqual(result.blocked, true);
        assert.strictEqual(result.packages, undefined);
        assert.strictEqual(result.conflicts[0].kind, 'plugin-name');
        assert.deepStrictEqual(
            result.conflicts[0].contenders.map((entry) => entry.capabilityId),
            ['first', 'second'],
        );
    });

    it('blocks skill names that would be ambiguous in Pi global command discovery', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.first', [skill('review', 'first')], 'first'),
                plugin('portable.second', [skill('review', 'second')], 'second'),
            ],
        });

        assert.strictEqual(result.blocked, true);
        assert.strictEqual(result.conflicts[0].kind, 'skill-name');
        assert.strictEqual(result.conflicts[0].skillName, 'review');
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE',
            ),
        );
    });

    it('blocks an MCP-bearing source rather than emitting an incomplete same-name plugin', () => {
        const review = plugin('portable.review', [skill('review')]);
        const result = projectPiAgentPluginSkills({
            plugins: [{ ...review, mcpSource: source('portable.review', 'mcp.json') }],
        });

        assert.strictEqual(result.blocked, true);
        assert.ok(result.omissions.some((entry) => entry.reason === 'mcp-deferred'));
        assert.ok(
            result.diagnostics.some(
                (entry) =>
                    entry.code === 'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_MCP_UNSUPPORTED' &&
                    entry.severity === 'error',
            ),
        );
    });

    it('blocks client-extension metadata that the skills-only target cannot reproduce', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.review', [skill('review')], 'portable.review', {
                    extensions: { 'dev.pi.agent': { prompts: ['prompts/review.md'] } },
                }),
            ],
        });

        assert.strictEqual(result.blocked, true);
        assert.ok(
            result.diagnostics.some(
                (entry) =>
                    entry.code === 'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_EXTENSIONS_UNSUPPORTED',
            ),
        );
    });

    it('omits an invalid skill without suppressing its valid plugin-local sibling', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [
                plugin('portable.mixed', [
                    skill('valid'),
                    {
                        name: 'invalid',
                        content: Buffer.from('not frontmatter\n'),
                        source: source('mixed', 'skills/invalid/SKILL.md'),
                    },
                ]),
            ],
        });

        assert.strictEqual(result.blocked, false);
        assert.deepStrictEqual(
            result.packages[0].files.map((file) => file.relativePath),
            ['plugin.json', 'skills/valid/SKILL.md'],
        );
        assert.ok(result.omissions.some((entry) => entry.reason === 'invalid-source'));
    });

    it('materializes each package as strict Agent Plugins v1 input', () => {
        const result = projectPiAgentPluginSkills({
            plugins: [plugin('portable.alpha', [skill('alpha')])],
        });
        assert.strictEqual(result.blocked, false);
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-pi-projection-'));
        try {
            for (const file of result.packages[0].files) {
                const destination = path.join(root, ...file.relativePath.split('/'));
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.writeFileSync(destination, file.content);
            }
            const inspection = inspectAgentPluginPackage(root);
            assert.strictEqual(inspection.validManifest, true);
            assert.strictEqual(inspection.manifest?.name, 'portable.alpha');
            assert.deepStrictEqual(
                inspection.validSkills.map((entry) => entry.name),
                ['alpha'],
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
