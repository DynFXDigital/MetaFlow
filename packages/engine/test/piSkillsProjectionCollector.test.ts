import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
    AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
    collectPiSkillsProjectionInput,
    inspectAgentPluginPackage,
    MetaFlowConfig,
    projectPiAgentPluginSkills,
    projectResolvedPiAgentPluginSkills,
    resolveLayers,
} from '../src';

function writeFile(root: string, relativePath: string, content: string): void {
    const destination = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, 'utf8');
}

function writePortableCapability(
    repoRoot: string,
    capabilityPath: string,
    pluginName: string,
    skills: Readonly<Record<string, string>>,
    options: { mcp?: boolean; hostArtifact?: boolean } = {},
): string {
    const root = path.join(repoRoot, ...capabilityPath.split('/'));
    fs.mkdirSync(root, { recursive: true });
    writeFile(root, 'README.md', `# ${pluginName}\n`);
    writeFile(
        root,
        'plugin.json',
        JSON.stringify({ $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID, name: pluginName }),
    );
    for (const [name, content] of Object.entries(skills)) {
        writeFile(root, `skills/${name}/SKILL.md`, content);
    }
    if (options.mcp) {
        writeFile(
            root,
            'mcp.json',
            JSON.stringify({
                $schema: AGENT_PLUGINS_V1_MCP_SCHEMA_ID,
                mcpServers: {
                    local: { type: 'stdio', command: 'node', args: ['server.js'] },
                },
            }),
        );
    }
    if (options.hostArtifact) {
        writeFile(root, '.github/instructions/review.instructions.md', '# Host instructions\n');
    }
    return root;
}

function validSkill(name: string, description = `${name} description`): string {
    return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

function config(repoRoot: string, capabilityPaths: string[]): MetaFlowConfig {
    return {
        metadataRepos: [{ id: 'metadata', localPath: repoRoot }],
        layerSources: capabilityPaths.map((capabilityPath) => ({
            repoId: 'metadata',
            path: capabilityPath,
        })),
    };
}

describe('Pi skills projection collector', () => {
    let workspaceRoot: string;
    let repoRoot: string;

    beforeEach(() => {
        workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-pi-collector-'));
        repoRoot = path.join(workspaceRoot, 'metadata');
        fs.mkdirSync(repoRoot, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    it('collects exact manifest and skill bytes while blocking deferred MCP behavior', () => {
        const skillBytes = validSkill('review', 'Réview exact bytes');
        writePortableCapability(
            repoRoot,
            'capabilities/review',
            'portable.review',
            { review: skillBytes },
            { mcp: true, hostArtifact: true },
        );
        const layers = resolveLayers(config(repoRoot, ['capabilities/review']), workspaceRoot);

        const input = collectPiSkillsProjectionInput(layers);
        assert.strictEqual(input.plugins.length, 1);
        assert.strictEqual(input.plugins[0].manifest.name, 'portable.review');
        assert.strictEqual(input.plugins[0].skills.length, 1);
        assert.strictEqual(
            Buffer.from(input.plugins[0].skills[0].content).toString('utf8'),
            skillBytes,
        );
        assert.strictEqual(input.plugins[0].skills[0].source.repoId, 'metadata');
        assert.strictEqual(input.plugins[0].skills[0].source.capabilityId, 'review');
        assert.strictEqual(input.plugins[0].skills[0].source.sourcePath, 'skills/review/SKILL.md');
        assert.ok(input.omissions?.some((entry) => entry.reason === 'mcp-deferred'));
        assert.ok(
            input.omissions?.some(
                (entry) =>
                    entry.reason === 'non-portable' &&
                    entry.source.sourcePath === '.github/instructions/review.instructions.md',
            ),
        );

        const projection = projectResolvedPiAgentPluginSkills(layers);
        assert.strictEqual(projection.blocked, true);
        assert.strictEqual(projection.packages, undefined);
        assert.ok(
            projection.diagnostics.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_PLUGIN_MCP_UNSUPPORTED',
            ),
        );
    });

    it('blocks a dangling root mcp.json instead of projecting an incomplete package', function () {
        const root = writePortableCapability(
            repoRoot,
            'capabilities/dangling-mcp',
            'portable.dangling-mcp',
            { review: validSkill('review') },
        );
        const mcpPath = path.join(root, 'mcp.json');
        try {
            fs.symlinkSync(path.join(workspaceRoot, 'missing-mcp.json'), mcpPath, 'file');
        } catch {
            this.skip();
            return;
        }
        const layers = resolveLayers(
            config(repoRoot, ['capabilities/dangling-mcp']),
            workspaceRoot,
        );

        const input = collectPiSkillsProjectionInput(layers);
        assert.strictEqual(input.plugins[0].mcpSource?.sourcePath, 'mcp.json');
        const result = projectPiAgentPluginSkills(input);
        assert.strictEqual(result.blocked, true);
        assert.ok(
            result.diagnostics.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_MCP_DEFERRED',
            ),
        );
    });

    it('collects a descriptorless strict plugin from resolver-owned package metadata', () => {
        const root = path.join(repoRoot, 'capabilities', 'descriptorless');
        fs.mkdirSync(root, { recursive: true });
        writeFile(
            root,
            'plugin.json',
            JSON.stringify({
                $schema: AGENT_PLUGINS_V1_PLUGIN_SCHEMA_ID,
                name: 'portable.descriptorless',
            }),
        );
        writeFile(root, 'skills/review/SKILL.md', validSkill('review'));

        const layers = resolveLayers(
            config(repoRoot, ['capabilities/descriptorless']),
            workspaceRoot,
        );
        assert.strictEqual(layers[0].capability, undefined);
        assert.strictEqual(layers[0].rootPath, root);
        assert.strictEqual(layers[0].capabilityId, 'descriptorless');
        assert.strictEqual(
            layers[0].agentPluginCompatibilityInspection?.profile,
            'agent-plugins-v1',
        );

        const input = collectPiSkillsProjectionInput(layers);
        assert.deepStrictEqual(
            input.plugins[0].skills.map((entry) => [entry.name, entry.source.capabilityId]),
            [['review', 'descriptorless']],
        );
    });

    it('does not fabricate plugin omissions for ordinary non-plugin layers', () => {
        const root = path.join(repoRoot, 'capabilities', 'ordinary');
        fs.mkdirSync(root, { recursive: true });
        writeFile(root, 'README.md', '# Ordinary capability\n');
        writeFile(root, 'instructions/review.instructions.md', '# Review\n');

        const layers = resolveLayers(config(repoRoot, ['capabilities/ordinary']), workspaceRoot);
        const input = collectPiSkillsProjectionInput(layers);

        assert.deepStrictEqual(input.plugins, []);
        assert.ok(!input.omissions?.some((entry) => entry.artifactType === 'plugin'));
        assert.ok(
            input.omissions?.some(
                (entry) => entry.artifactType === 'instructions' && entry.reason === 'non-portable',
            ),
        );
    });

    it('reports an explicitly enabled capability whose plugin manifest is missing', () => {
        const root = path.join(repoRoot, 'capabilities', 'missing-plugin');
        fs.mkdirSync(root, { recursive: true });
        writeFile(
            root,
            'CAPABILITY.md',
            '---\nname: Missing plugin\ndescription: Missing plugin fixture\nagentPlugin: true\n---\n',
        );

        const layers = resolveLayers(
            config(repoRoot, ['capabilities/missing-plugin']),
            workspaceRoot,
        );
        const input = collectPiSkillsProjectionInput(layers);

        const diagnostic = input.diagnostics?.find(
            (entry) => entry.code === 'CAPABILITY_AGENT_PLUGIN_MANIFEST_MISSING',
        );
        assert.ok(diagnostic);
        assert.strictEqual(diagnostic.filePath, 'plugin.json');
        assert.strictEqual(
            diagnostic.message,
            'The capability enables agent-plugin packaging, but plugin.json is missing at the package root.',
        );
        assert.ok(
            input.omissions?.some(
                (entry) => entry.artifactType === 'plugin' && entry.reason === 'invalid-source',
            ),
        );
        assert.ok(!JSON.stringify(input).includes(workspaceRoot));
    });

    it('keeps inspector diagnostics root-relative and free of raw filesystem errors', () => {
        const root = path.join(repoRoot, 'capabilities', 'invalid-json');
        fs.mkdirSync(root, { recursive: true });
        writeFile(root, 'plugin.json', '{ invalid json');
        const layers = resolveLayers(
            config(repoRoot, ['capabilities/invalid-json']),
            workspaceRoot,
        );

        const input = collectPiSkillsProjectionInput(layers);
        const diagnostic = input.diagnostics?.find(
            (entry) => entry.code === 'AGENT_PLUGIN_MANIFEST_JSON_INVALID',
        );
        assert.ok(diagnostic);
        assert.strictEqual(diagnostic.filePath, 'plugin.json');
        assert.strictEqual(diagnostic.source?.sourcePath, 'plugin.json');
        assert.strictEqual(
            diagnostic.message,
            'plugin.json could not be read as a valid JSON object.',
        );
        assert.ok(!JSON.stringify(input).includes(workspaceRoot));
    });

    it('keeps legacy host packages and host-rooted skills out of the portable target', () => {
        const root = path.join(repoRoot, 'capabilities', 'legacy');
        fs.mkdirSync(root, { recursive: true });
        writeFile(root, 'README.md', '# Legacy plugin\n');
        writeFile(
            root,
            'plugin.json',
            JSON.stringify({
                name: 'legacy-plugin',
                version: '1.0.0',
                skills: '.github/skills',
            }),
        );
        writeFile(root, '.github/skills/review/SKILL.md', validSkill('review'));
        const layers = resolveLayers(config(repoRoot, ['capabilities/legacy']), workspaceRoot);

        const input = collectPiSkillsProjectionInput(layers);
        assert.deepStrictEqual(input.plugins, []);
        assert.ok(input.omissions?.some((entry) => entry.reason === 'unsupported-profile'));
        assert.ok(
            input.omissions?.some(
                (entry) =>
                    entry.reason === 'non-portable' &&
                    entry.source.sourcePath === '.github/skills/review/SKILL.md',
            ),
        );
    });

    it('preserves valid siblings while mapping strict inspection failures', () => {
        writePortableCapability(repoRoot, 'capabilities/mixed', 'portable.mixed', {
            valid: validSkill('valid'),
            invalid: '---\nname: another-name\ndescription: mismatch\n---\n',
        });
        const layers = resolveLayers(config(repoRoot, ['capabilities/mixed']), workspaceRoot);

        const input = collectPiSkillsProjectionInput(layers);
        assert.deepStrictEqual(
            input.plugins[0].skills.map((entry) => entry.name),
            ['valid'],
        );
        assert.ok(input.diagnostics?.some((entry) => entry.code === 'AGENT_PLUGIN_SKILL_INVALID'));
        assert.ok(
            input.omissions?.some(
                (entry) =>
                    entry.reason === 'invalid-source' &&
                    entry.source.sourcePath === 'skills/invalid/SKILL.md',
            ),
        );
    });

    it('fails a skill read closed when the inspected file disappears', () => {
        const root = writePortableCapability(
            repoRoot,
            'capabilities/volatile',
            'portable.volatile',
            { volatile: validSkill('volatile') },
        );
        const layers = resolveLayers(config(repoRoot, ['capabilities/volatile']), workspaceRoot);
        fs.rmSync(path.join(root, 'skills', 'volatile', 'SKILL.md'));

        const input = collectPiSkillsProjectionInput(layers);
        assert.deepStrictEqual(input.plugins[0].skills, []);
        assert.ok(
            input.diagnostics?.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_READ_FAILED',
            ),
        );
        assert.deepStrictEqual(
            input.omissions?.filter(
                (entry) => entry.source.sourcePath === 'skills/volatile/SKILL.md',
            ),
            [
                {
                    artifactType: 'skills',
                    reason: 'invalid-source',
                    source: {
                        layerId: 'metadata/capabilities/volatile',
                        repoId: 'metadata',
                        capabilityId: 'volatile',
                        capabilityName: 'portable.volatile',
                        sourcePath: 'skills/volatile/SKILL.md',
                    },
                    outputPath: 'skills/volatile/SKILL.md',
                },
            ],
        );
        assert.ok(!JSON.stringify(input).includes(workspaceRoot));
    });

    it('fails a skill read closed when its inspected path is replaced by an external link', function () {
        const root = writePortableCapability(
            repoRoot,
            'capabilities/replaced',
            'portable.replaced',
            { replaced: validSkill('replaced') },
        );
        const layers = resolveLayers(config(repoRoot, ['capabilities/replaced']), workspaceRoot);
        const skillPath = path.join(root, 'skills', 'replaced', 'SKILL.md');
        const outsideRoot = path.join(workspaceRoot, 'outside');
        fs.mkdirSync(outsideRoot, { recursive: true });
        const outsideSkill = path.join(outsideRoot, 'SKILL.md');
        fs.writeFileSync(outsideSkill, validSkill('replaced'), 'utf8');
        fs.rmSync(skillPath);
        try {
            fs.symlinkSync(outsideSkill, skillPath, 'file');
        } catch {
            this.skip();
            return;
        }

        const input = collectPiSkillsProjectionInput(layers);
        assert.deepStrictEqual(input.plugins[0].skills, []);
        assert.ok(
            input.diagnostics?.some(
                (entry) => entry.code === 'PI_AGENT_PLUGIN_PROJECTION_SKILL_READ_FAILED',
            ),
        );
        assert.ok(!JSON.stringify(input).includes(outsideRoot));
    });

    it('passes duplicate names from distinct resolved capabilities to the blocking projector', () => {
        writePortableCapability(repoRoot, 'capabilities/first', 'portable.first', {
            review: validSkill('review', 'First review'),
        });
        writePortableCapability(repoRoot, 'capabilities/second', 'portable.second', {
            review: validSkill('review', 'Second review'),
        });
        const layers = resolveLayers(
            config(repoRoot, ['capabilities/second', 'capabilities/first']),
            workspaceRoot,
        );

        const result = projectResolvedPiAgentPluginSkills(layers);
        assert.strictEqual(result.blocked, true);
        assert.strictEqual(result.packages, undefined);
        assert.deepStrictEqual(
            result.conflicts[0].contenders.map((entry) => entry.capabilityId),
            ['first', 'second'],
        );
    });

    it('collects a deterministic DTO independent of resolved layer order', () => {
        writePortableCapability(
            repoRoot,
            'capabilities/second',
            'portable.second',
            { second: validSkill('second') },
            { hostArtifact: true },
        );
        writePortableCapability(
            repoRoot,
            'capabilities/first',
            'portable.first',
            { first: validSkill('first') },
            { mcp: true },
        );
        const layers = resolveLayers(
            config(repoRoot, ['capabilities/second', 'capabilities/first']),
            workspaceRoot,
        );

        assert.deepStrictEqual(
            collectPiSkillsProjectionInput(layers),
            collectPiSkillsProjectionInput([...layers].reverse()),
        );
    });

    it('uses only enabled resolved layers and materializes inspector-valid output', () => {
        writePortableCapability(repoRoot, 'capabilities/enabled', 'portable.enabled', {
            enabled: validSkill('enabled'),
        });
        writePortableCapability(repoRoot, 'capabilities/disabled', 'portable.disabled', {
            disabled: validSkill('disabled'),
        });
        const targetConfig = config(repoRoot, ['capabilities/enabled', 'capabilities/disabled']);
        targetConfig.layerSources![1].enabled = false;
        const layers = resolveLayers(targetConfig, workspaceRoot);
        const result = projectResolvedPiAgentPluginSkills(layers);
        assert.strictEqual(result.blocked, false);
        assert.deepStrictEqual(
            result.packages.map((entry) => entry.name),
            ['portable.enabled'],
        );
        assert.deepStrictEqual(
            result.packages[0].files.map((file) => file.relativePath),
            ['plugin.json', 'skills/enabled/SKILL.md'],
        );

        const materialized = path.join(workspaceRoot, 'projected');
        for (const file of result.packages[0].files) {
            const destination = path.join(materialized, ...file.relativePath.split('/'));
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.writeFileSync(destination, file.content);
        }
        const inspection = inspectAgentPluginPackage(materialized);
        assert.strictEqual(inspection.validManifest, true);
        assert.deepStrictEqual(
            inspection.validSkills.map((entry) => entry.name),
            ['enabled'],
        );
    });
});
