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
});