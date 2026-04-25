import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getArtifactType } from '@metaflow/engine';

const ASSET_ROOT = path.resolve(__dirname, '../../../assets/metaflow-ai-metadata');
const GITHUB_ROOT = path.join(ASSET_ROOT, '.github');

suite('bundled metadata assets', () => {
    test('bundled capability contract guidance requires H1 headings to use the frontmatter name', () => {
        const instructionPath = path.join(
            GITHUB_ROOT,
            'instructions/metaflow-capability-contract.instructions.md',
        );

        const content = fs.readFileSync(instructionPath, 'utf-8');

        assert.ok(
            content.includes('Use the frontmatter `name` as the user-facing capability title throughout the file.'),
            'Expected bundled CAPABILITY contract guidance to require the frontmatter name as the user-facing title.',
        );
        assert.ok(
            content.includes('Set the first heading to `# Capability: <Frontmatter Name>`'),
            'Expected bundled CAPABILITY contract guidance to require the H1 heading to match the frontmatter name.',
        );
    });

    test('bundled metadata-authoring assets are present and avoid exact global applyTo scopes', () => {
        const requiredPaths = [
            'agents/github-copilot-metadata-authoring-steward.agent.md',
            'prompts/create-agents-md.prompt.md',
            'prompts/review-metadata-authoring-capability.prompt.md',
            'skills/ai-metadata/SKILL.md',
            'skills/ai-metadata/BestPractices.md',
            'skills/ai-metadata/Compatibility.md',
            'skills/ai-metadata/References.md',
            'skills/ai-metadata/ReflectionReinforcement.md',
            'instructions/ai-metadata-agent-skills.instructions.md',
            'instructions/ai-metadata-agent.instructions.md',
            'instructions/ai-metadata-agents.instructions.md',
            'instructions/ai-metadata-agents-md.instructions.md',
            'instructions/ai-metadata-hooks.instructions.md',
            'instructions/ai-metadata-prompts.instructions.md',
        ];

        for (const relativePath of requiredPaths) {
            const absolutePath = path.join(GITHUB_ROOT, relativePath);
            assert.ok(fs.existsSync(absolutePath), `Expected bundled metadata asset: ${relativePath}`);
        }

        const instructionPaths = requiredPaths.filter((relativePath) =>
            relativePath.startsWith('instructions/'),
        );
        const exactGlobalApplyToPattern = /^applyTo:\s*['\"]\*\*['\"]\s*$/m;

        for (const relativePath of instructionPaths) {
            const absolutePath = path.join(GITHUB_ROOT, relativePath);
            const content = fs.readFileSync(absolutePath, 'utf-8');
            assert.ok(
                !exactGlobalApplyToPattern.test(content),
                `Bundled metadata-authoring instruction must not use exact global applyTo scope: ${relativePath}`,
            );
        }
    });

    test('bundled .github artifacts classify into the correct artifact buckets', () => {
        const artifactFiles: string[] = [];
        const visit = (dir: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    visit(fullPath);
                } else {
                    const relativePath = path.relative(ASSET_ROOT, fullPath).replace(/\\/g, '/');
                    artifactFiles.push(relativePath);
                }
            }
        };
        visit(GITHUB_ROOT);

        const instructionFiles = artifactFiles.filter((f) => getArtifactType(f) === 'instructions');
        const promptFiles = artifactFiles.filter((f) => getArtifactType(f) === 'prompts');
        const agentFiles = artifactFiles.filter((f) => getArtifactType(f) === 'agents');
        const skillFiles = artifactFiles.filter((f) => getArtifactType(f) === 'skills');

        assert.ok(instructionFiles.length > 0, 'Expected at least one instructions artifact in .github');
        assert.ok(promptFiles.length > 0, 'Expected at least one prompts artifact in .github');
        assert.ok(agentFiles.length > 0, 'Expected at least one agents artifact in .github');
        assert.ok(skillFiles.length > 0, 'Expected at least one skills artifact in .github');

        for (const filePath of instructionFiles) {
            assert.ok(filePath.startsWith('.github/instructions/'), `Expected instructions artifact under .github/instructions/: ${filePath}`);
        }
        for (const filePath of promptFiles) {
            assert.ok(filePath.startsWith('.github/prompts/'), `Expected prompts artifact under .github/prompts/: ${filePath}`);
        }
        for (const filePath of agentFiles) {
            assert.ok(filePath.startsWith('.github/agents/'), `Expected agents artifact under .github/agents/: ${filePath}`);
        }
        for (const filePath of skillFiles) {
            assert.ok(filePath.startsWith('.github/skills/'), `Expected skills artifact under .github/skills/: ${filePath}`);
        }
    });

    test('bundled instruction files cover GitHub Copilot, Claude, and Codex/AGENTS.md authoring surfaces', () => {
        const agentsMdInstructionPath = path.join(
            GITHUB_ROOT,
            'instructions/ai-metadata-agents-md.instructions.md',
        );
        const agentsMdContent = fs.readFileSync(agentsMdInstructionPath, 'utf-8');

        assert.ok(
            agentsMdContent.includes('CLAUDE.md'),
            'Expected bundled agents-md instruction to cover CLAUDE.md authoring',
        );
        assert.ok(
            agentsMdContent.includes('AGENTS.md'),
            'Expected bundled agents-md instruction to cover AGENTS.md (Codex/OpenAI) authoring',
        );

        const compatibilityPath = path.join(
            GITHUB_ROOT,
            'skills/ai-metadata/Compatibility.md',
        );
        const compatibilityContent = fs.readFileSync(compatibilityPath, 'utf-8');

        assert.ok(
            compatibilityContent.includes('CLAUDE.md'),
            'Expected bundled compatibility notes to mention CLAUDE.md',
        );
        assert.ok(
            compatibilityContent.includes('.claude/skills/'),
            'Expected bundled compatibility notes to mention .claude/skills/ path',
        );
    });

    test('bundled Codex metadata capability includes a repository skill payload', () => {
        const codexSkillPath = path.join(
            ASSET_ROOT,
            'capabilities',
            'metadata-authoring',
            'codex-metadata-authoring',
            '.agents',
            'skills',
            'codex-metadata',
            'SKILL.md',
        );

        assert.ok(fs.existsSync(codexSkillPath), 'Expected bundled Codex metadata skill');

        const relativePath = path
            .relative(
                path.join(
                    ASSET_ROOT,
                    'capabilities',
                    'metadata-authoring',
                    'codex-metadata-authoring',
                ),
                codexSkillPath,
            )
            .replace(/\\/g, '/');
        assert.strictEqual(getArtifactType(relativePath), 'skills');

        const content = fs.readFileSync(codexSkillPath, 'utf-8');
        assert.ok(
            content.includes('AGENTS.md'),
            'Expected Codex metadata skill to cover AGENTS.md',
        );
        assert.ok(
            content.includes('.codex/config.toml'),
            'Expected Codex metadata skill to cover project config',
        );
        assert.ok(
            content.includes('.agents/skills/'),
            'Expected Codex metadata skill to cover repository skills',
        );
    });
});
