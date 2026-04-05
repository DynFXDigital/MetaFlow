import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('bundled metadata assets', () => {
    test('bundled capability contract guidance requires H1 headings to use the frontmatter name', () => {
        const instructionPath = path.resolve(
            __dirname,
            '../../../assets/metaflow-ai-metadata/.github/instructions/metaflow-capability-contract.instructions.md',
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
        const assetRoot = path.resolve(__dirname, '../../../assets/metaflow-ai-metadata/.github');
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
            const absolutePath = path.join(assetRoot, relativePath);
            assert.ok(fs.existsSync(absolutePath), `Expected bundled metadata asset: ${relativePath}`);
        }

        const instructionPaths = requiredPaths.filter((relativePath) =>
            relativePath.startsWith('instructions/'),
        );
        const exactGlobalApplyToPattern = /^applyTo:\s*['\"]\*\*['\"]\s*$/m;

        for (const relativePath of instructionPaths) {
            const absolutePath = path.join(assetRoot, relativePath);
            const content = fs.readFileSync(absolutePath, 'utf-8');
            assert.ok(
                !exactGlobalApplyToPattern.test(content),
                `Bundled metadata-authoring instruction must not use exact global applyTo scope: ${relativePath}`,
            );
        }
    });
});