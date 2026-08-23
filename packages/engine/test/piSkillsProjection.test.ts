import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    inspectAgentPluginPackage,
    PI_PROJECT_PLUGIN_NAME,
    PI_SKILLS_PROJECTION_SCHEMA,
    PiSkillProjectionInput,
    PiSkillsProjectionSource,
    projectPiAgentPluginSkills,
} from '../src';

function source(
    capabilityId: string,
    sourcePath = `skills/${capabilityId}/SKILL.md`,
): PiSkillsProjectionSource {
    return {
        repoId: 'metadata',
        layerId: `metadata/capabilities/${capabilityId}`,
        capabilityId,
        capabilityName: capabilityId,
        sourcePath,
    };
}

function skill(name: string, description = `${name} description`): PiSkillProjectionInput {
    return {
        name,
        content: Buffer.from(
            `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
            'utf8',
        ),
        source: source(name),
    };
}

function contents(result: ReturnType<typeof projectPiAgentPluginSkills>): Map<string, Buffer> {
    assert.strictEqual(result.blocked, false);
    return new Map(
        result.package.files.map((file) => [file.relativePath, Buffer.from(file.content)]),
    );
}

describe('Pi skills projection', () => {
    it('builds a deterministic strict empty package', () => {
        const first = projectPiAgentPluginSkills({ skills: [] });
        const second = projectPiAgentPluginSkills({ skills: [] });

        assert.strictEqual(first.blocked, false);
        assert.strictEqual(second.blocked, false);
        assert.strictEqual(first.package.contentSha.length, 64);
        assert.strictEqual(first.package.version, `0.1.0+${first.package.contentSha}`);
        assert.deepStrictEqual(first.package.manifest, {
            $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
            name: 'metaflow.project',
            version: first.package.version,
        });
        assert.deepStrictEqual(
            first.package.files.map((file) => file.relativePath),
            ['plugin.json'],
        );
        assert.deepStrictEqual(contents(first), contents(second));
    });

    it('preserves exact SKILL.md bytes and keeps provenance outside package content', () => {
        const exactBytes = Buffer.from(
            '\uFEFF---\r\nname: review\r\ndescription: Réview changes.\r\n---\r\n\r\n# Réview\r\n',
            'utf8',
        );
        const result = projectPiAgentPluginSkills({
            skills: [{ name: 'review', content: exactBytes, source: source('review') }],
        });

        assert.strictEqual(result.blocked, false);
        const projected = result.package.files.find(
            (file) => file.relativePath === 'skills/review/SKILL.md',
        );
        assert.ok(projected);
        assert.deepStrictEqual(Buffer.from(projected.content), exactBytes);
        assert.deepStrictEqual(projected.sources, [source('review')]);
        assert.ok(
            !Buffer.from(projected.content).toString('utf8').includes('metadata/capabilities'),
        );
        assert.ok(!contents(result).has('mcp.json'));
    });

    it('is independent of unique skill input order', () => {
        const alpha = skill('alpha');
        const zeta = skill('zeta');
        const forward = projectPiAgentPluginSkills({ skills: [alpha, zeta] });
        const reverse = projectPiAgentPluginSkills({ skills: [zeta, alpha] });

        assert.strictEqual(forward.blocked, false);
        assert.strictEqual(reverse.blocked, false);
        assert.strictEqual(forward.package.contentSha, reverse.package.contentSha);
        assert.strictEqual(forward.package.version, reverse.package.version);
        assert.deepStrictEqual(contents(forward), contents(reverse));
        assert.deepStrictEqual(
            forward.package.files.map((file) => file.relativePath),
            ['plugin.json', 'skills/alpha/SKILL.md', 'skills/zeta/SKILL.md'],
        );
    });

    it('uses the documented canonical hash preimage and excludes provenance', () => {
        const alpha = skill('alpha');
        const first = projectPiAgentPluginSkills({ skills: [alpha] });
        const moved = projectPiAgentPluginSkills({
            skills: [
                {
                    ...alpha,
                    source: source('moved-capability', 'portable/alpha/SKILL.md'),
                },
            ],
        });
        const changedBytes = projectPiAgentPluginSkills({
            skills: [skill('alpha', 'Changed description')],
        });
        const changedPath = projectPiAgentPluginSkills({
            skills: [skill('beta')],
        });
        assert.strictEqual(first.blocked, false);
        assert.strictEqual(moved.blocked, false);
        assert.strictEqual(changedBytes.blocked, false);
        assert.strictEqual(changedPath.blocked, false);

        const expected = createHash('sha256')
            .update(PI_SKILLS_PROJECTION_SCHEMA, 'utf8')
            .update('\u0000')
            .update(AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, 'utf8')
            .update('\u0000')
            .update(PI_PROJECT_PLUGIN_NAME, 'utf8')
            .update('\u0000')
            .update('skills/alpha/SKILL.md', 'utf8')
            .update('\u0000')
            .update(Buffer.from(alpha.content))
            .update('\u0000')
            .digest('hex');

        assert.strictEqual(first.package.contentSha, expected);
        assert.strictEqual(moved.package.contentSha, expected);
        assert.deepStrictEqual(contents(first), contents(moved));
        assert.notDeepStrictEqual(first.package.files[0].sources, moved.package.files[0].sources);
        assert.notStrictEqual(changedBytes.package.contentSha, expected);
        assert.notStrictEqual(changedPath.package.contentSha, expected);
    });

    it('omits an invalid skill input without suppressing valid siblings', () => {
        const result = projectPiAgentPluginSkills({
            skills: [skill('valid'), skill('Invalid Name')],
        });

        assert.strictEqual(result.blocked, false);
        assert.deepStrictEqual(
            result.package.files.map((file) => file.relativePath),
            ['plugin.json', 'skills/valid/SKILL.md'],
        );
        assert.strictEqual(result.omissions.length, 1);
        assert.strictEqual(result.omissions[0].reason, 'invalid-source');
        assert.ok(
            result.diagnostics.some(
                (entry) =>
                    entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_NAME_INVALID' &&
                    entry.severity === 'warning',
            ),
        );
    });

    it('revalidates SKILL.md bytes before emitting an otherwise valid skill name', () => {
        const result = projectPiAgentPluginSkills({
            skills: [
                skill('valid'),
                {
                    name: 'invalid-content',
                    content: Buffer.from(
                        '---\nname: another-name\ndescription: Mismatched metadata.\n---\n',
                        'utf8',
                    ),
                    source: source('invalid-content'),
                },
            ],
        });

        assert.strictEqual(result.blocked, false);
        assert.deepStrictEqual(
            result.package.files.map((file) => file.relativePath),
            ['plugin.json', 'skills/valid/SKILL.md'],
        );
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_INVALID',
            ),
        );
    });

    it('blocks the complete package when active capabilities duplicate a skill name', () => {
        const first = skill('review');
        const second: PiSkillProjectionInput = {
            ...skill('review'),
            content: Buffer.from(
                '---\nname: review\ndescription: Second review skill.\n---\n',
                'utf8',
            ),
            source: source('second-review', 'skills/review/SKILL.md'),
        };
        const result = projectPiAgentPluginSkills({ skills: [second, first] });

        assert.strictEqual(result.blocked, true);
        assert.strictEqual(result.package, undefined);
        assert.strictEqual(result.conflicts.length, 1);
        assert.strictEqual(result.conflicts[0].skillName, 'review');
        assert.deepStrictEqual(
            result.conflicts[0].contenders.map((entry) => entry.capabilityId),
            ['review', 'second-review'],
        );
        assert.strictEqual(
            result.omissions.filter((entry) => entry.reason === 'duplicate-skill').length,
            2,
        );
        assert.ok(
            result.diagnostics.some(
                (entry) =>
                    entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_DUPLICATE' &&
                    entry.severity === 'error',
            ),
        );
        assert.ok(result.diagnostics.every((entry) => !entry.message.includes('\u0000')));
    });

    it('reports host-specific and deferred MCP omissions without materializing them', () => {
        const omissions = [
            {
                artifactType: 'instructions',
                reason: 'non-portable' as const,
                source: source('portable', '.github/instructions/review.instructions.md'),
            },
            {
                artifactType: 'mcp',
                reason: 'mcp-deferred' as const,
                source: source('portable', 'mcp.json'),
            },
        ];
        const result = projectPiAgentPluginSkills({ skills: [skill('portable')], omissions });
        const reversed = projectPiAgentPluginSkills({
            skills: [skill('portable')],
            omissions: [...omissions].reverse(),
        });

        assert.strictEqual(result.blocked, false);
        assert.strictEqual(reversed.blocked, false);
        assert.ok(!contents(result).has('mcp.json'));
        assert.deepStrictEqual(result.omissions, reversed.omissions);
        assert.deepStrictEqual(result.diagnostics, reversed.diagnostics);
        assert.deepStrictEqual(
            result.diagnostics.map((entry) => entry.code),
            [
                'PI_AGENT_PLUGIN_PROJECTION_ARTIFACT_NON_PORTABLE',
                'PI_AGENT_PLUGIN_PROJECTION_MCP_DEFERRED',
            ],
        );
        assert.ok(result.diagnostics.every((entry) => entry.severity === 'info'));
    });

    it('materializes a package accepted by the strict compatibility inspector', () => {
        const result = projectPiAgentPluginSkills({ skills: [skill('alpha'), skill('zeta')] });
        assert.strictEqual(result.blocked, false);
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-pi-projection-'));
        try {
            for (const file of result.package.files) {
                const destination = path.join(root, ...file.relativePath.split('/'));
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.writeFileSync(destination, file.content);
            }

            const inspection = inspectAgentPluginPackage(root);
            assert.strictEqual(inspection.profile, 'agent-plugins-v1');
            assert.strictEqual(inspection.validManifest, true);
            assert.deepStrictEqual(
                inspection.validSkills.map((entry) => entry.name),
                ['alpha', 'zeta'],
            );
            assert.deepStrictEqual(inspection.validMcpServers, []);
            assert.deepStrictEqual(inspection.diagnostics, []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
