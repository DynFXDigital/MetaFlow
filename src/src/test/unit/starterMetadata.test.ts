import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scaffoldMetaFlowAiMetadata } from '../../commands/starterMetadata';

suite('metaFlowAiMetadata', () => {
    test('returns undefined when starter assets are missing', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-missing-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        fs.mkdirSync(workspaceRoot, { recursive: true });
        fs.mkdirSync(extensionPath, { recursive: true });

        const result = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.strictEqual(result, undefined);

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('copies starter files and skips existing files unless overwrite is enabled', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-starter-copy-'));
        const workspaceRoot = path.join(tempRoot, 'workspace');
        const extensionPath = path.join(tempRoot, 'extension');

        const sourceInstruction = path.join(
            extensionPath,
            'assets',
            'metaflow-ai-metadata',
            '.github',
            'instructions',
            'starter.instructions.md'
        );
        fs.mkdirSync(path.dirname(sourceInstruction), { recursive: true });
        fs.writeFileSync(sourceInstruction, '# starter\n', 'utf-8');

        fs.mkdirSync(workspaceRoot, { recursive: true });

        const first = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.ok(first);
        assert.strictEqual(first?.writtenFiles.length, 1);
        assert.strictEqual(first?.skippedFiles.length, 0);

        const targetInstruction = path.join(workspaceRoot, '.github', 'instructions', 'starter.instructions.md');
        fs.writeFileSync(targetInstruction, '# custom\n', 'utf-8');

        const second = await scaffoldMetaFlowAiMetadata({ workspaceRoot, extensionPath });
        assert.ok(second);
        assert.strictEqual(second?.writtenFiles.length, 0);
        assert.strictEqual(second?.skippedFiles.length, 1);
        assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# custom\n');

        const third = await scaffoldMetaFlowAiMetadata({
            workspaceRoot,
            extensionPath,
            overwriteExisting: true,
        });
        assert.ok(third);
        assert.strictEqual(third?.writtenFiles.length, 1);
        assert.strictEqual(fs.readFileSync(targetInstruction, 'utf-8'), '# starter\n');

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });
});
