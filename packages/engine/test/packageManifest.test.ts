import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    loadPackageManifestsForLayer,
    parsePackageManifestContent,
} from '../src/index';

describe('packageManifest parser', () => {
    it('parses canonical package metadata', () => {
        const parsed = parsePackageManifestContent(
            JSON.stringify({
                schemaVersion: 'metaflow.package/v1',
                id: 'release-operations',
                name: 'Release Operations',
                kind: 'agent-plugin',
                agents: ['release-steward'],
                skills: ['release-readiness'],
                instructions: ['release-policy'],
                prompts: ['release-prompt'],
                mcpServers: ['github'],
                tools: ['create-pr'],
                hooks: ['release-gate'],
                policyGrants: ['github-pr-read'],
                targets: {
                    codex: { pluginName: 'release-operations', enabled: true },
                    'github-copilot': { pluginName: 'release-operations' },
                },
                validationEvidence: ['RUN-055'],
                description: 'Release workflow package.',
            }),
            '/tmp/.metaflow/packages/release-operations.json',
            new Set(['github-pr-read']),
            {
                agents: new Set(['release-steward']),
                skills: new Set(['release-readiness']),
                instructions: new Set(['release-policy']),
                prompts: new Set(['release-prompt']),
                mcpServers: new Set(['github']),
                tools: new Set(['create-pr']),
                hooks: new Set(['release-gate']),
            },
        );

        assert.strictEqual(parsed.id, 'release-operations');
        assert.strictEqual(parsed.name, 'Release Operations');
        assert.strictEqual(parsed.kind, 'agent-plugin');
        assert.deepStrictEqual(parsed.agents, ['release-steward']);
        assert.deepStrictEqual(parsed.skills, ['release-readiness']);
        assert.deepStrictEqual(parsed.instructions, ['release-policy']);
        assert.deepStrictEqual(parsed.prompts, ['release-prompt']);
        assert.deepStrictEqual(parsed.mcpServers, ['github']);
        assert.deepStrictEqual(parsed.tools, ['create-pr']);
        assert.deepStrictEqual(parsed.hooks, ['release-gate']);
        assert.deepStrictEqual(parsed.policyGrants, ['github-pr-read']);
        assert.deepStrictEqual(parsed.targets.codex, {
            pluginName: 'release-operations',
            enabled: true,
        });
        assert.deepStrictEqual(parsed.validationEvidence, ['RUN-055']);
        assert.strictEqual(parsed.description, 'Release workflow package.');
        assert.deepStrictEqual(parsed.warnings, []);
    });

    it('warns on invalid canonical package metadata shapes', () => {
        const parsed = parsePackageManifestContent(
            JSON.stringify({
                schemaVersion: 'wrong',
                id: 'Bad ID',
                name: '',
                kind: '',
                agents: [''],
                skills: 'release-readiness',
                targets: { codex: { pluginName: '', enabled: 'yes' }, '': {} },
                policyGrants: ['missing-grant'],
                validationEvidence: [7],
                description: '',
                extra: true,
            }),
            '/tmp/.metaflow/packages/bad.json',
            new Set(['known-grant']),
        );

        const codes = parsed.warnings.map((warning) => warning.code);
        assert.ok(codes.includes('PACKAGE_SCHEMA_VERSION_INVALID'));
        assert.ok(codes.includes('PACKAGE_ID_INVALID'));
        assert.ok(codes.includes('PACKAGE_NAME_REQUIRED'));
        assert.ok(codes.includes('PACKAGE_KIND_REQUIRED'));
        assert.ok(codes.includes('PACKAGE_AGENTS_INVALID'));
        assert.ok(codes.includes('PACKAGE_SKILLS_INVALID'));
        assert.ok(codes.includes('PACKAGE_TARGETS_INVALID'));
        assert.ok(codes.includes('PACKAGE_TARGET_PLUGIN_NAME_INVALID'));
        assert.ok(codes.includes('PACKAGE_TARGET_ENABLED_INVALID'));
        assert.ok(codes.includes('PACKAGE_POLICY_GRANT_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_VALIDATION_EVIDENCE_INVALID'));
        assert.ok(codes.includes('PACKAGE_DESCRIPTION_INVALID'));
        assert.ok(codes.includes('PACKAGE_UNKNOWN_FIELD'));
    });

    it('warns on unknown canonical package component references', () => {
        const parsed = parsePackageManifestContent(
            JSON.stringify({
                schemaVersion: 'metaflow.package/v1',
                id: 'release-operations',
                name: 'Release Operations',
                kind: 'agent-plugin',
                agents: ['missing-agent'],
                skills: ['missing-skill'],
                instructions: ['missing-instruction'],
                prompts: ['missing-prompt'],
                mcpServers: ['missing-mcp'],
                tools: ['missing-tool'],
                hooks: ['missing-hook'],
                policyGrants: ['missing-grant'],
            }),
            '/tmp/.metaflow/packages/release-operations.json',
            new Set(['known-grant']),
            {
                agents: new Set(['known-agent']),
                skills: new Set(['known-skill']),
                instructions: new Set(['known-instruction']),
                prompts: new Set(['known-prompt']),
                mcpServers: new Set(['known-mcp']),
                tools: new Set(['known-tool']),
                hooks: new Set(['known-hook']),
            },
        );

        const codes = parsed.warnings.map((warning) => warning.code);
        assert.ok(codes.includes('PACKAGE_AGENT_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_SKILL_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_INSTRUCTION_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_PROMPT_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_MCP_SERVER_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_TOOL_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_HOOK_UNKNOWN'));
        assert.ok(codes.includes('PACKAGE_POLICY_GRANT_UNKNOWN'));
    });

    it('loads package manifests from a capability layer', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-manifest-test-'));
        try {
            const packagesDir = path.join(tmpDir, '.metaflow', 'packages');
            fs.mkdirSync(packagesDir, { recursive: true });
            fs.writeFileSync(
                path.join(packagesDir, 'release-operations.json'),
                JSON.stringify({
                    schemaVersion: 'metaflow.package/v1',
                    id: 'release-operations',
                    name: 'Release Operations',
                    kind: 'agent-plugin',
                    targets: { codex: { pluginName: 'release-operations' } },
                }),
                'utf-8',
            );

            const manifests = loadPackageManifestsForLayer(tmpDir);
            assert.strictEqual(manifests.length, 1);
            assert.strictEqual(manifests[0].id, 'release-operations');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
