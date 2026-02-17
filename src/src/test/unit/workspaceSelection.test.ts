import * as assert from 'assert';
import { pickWorkspaceFolder, WorkspaceFolderLike } from '../../commands/workspaceSelection';

function folder(fsPath: string): WorkspaceFolderLike {
    return { uri: { fsPath } };
}

suite('Workspace Selection', () => {
    test('returns undefined when there are no folders', () => {
        const selected = pickWorkspaceFolder([], undefined, () => false);
        assert.strictEqual(selected, undefined);
    });

    test('prefers the only folder containing .metaflow.json', () => {
        const alpha = folder('/workspace/alpha');
        const beta = folder('/workspace/beta');

        const selected = pickWorkspaceFolder(
            [alpha, beta],
            alpha,
            f => f.uri.fsPath === beta.uri.fsPath
        );

        assert.strictEqual(selected?.uri.fsPath, beta.uri.fsPath);
    });

    test('prefers active folder when multiple folders contain .metaflow.json', () => {
        const alpha = folder('/workspace/alpha');
        const beta = folder('/workspace/beta');

        const selected = pickWorkspaceFolder(
            [alpha, beta],
            beta,
            () => true
        );

        assert.strictEqual(selected?.uri.fsPath, beta.uri.fsPath);
    });

    test('falls back to first config folder when active folder has no config', () => {
        const alpha = folder('/workspace/alpha');
        const beta = folder('/workspace/beta');
        const gamma = folder('/workspace/gamma');

        const selected = pickWorkspaceFolder(
            [alpha, beta, gamma],
            gamma,
            f => f.uri.fsPath !== gamma.uri.fsPath
        );

        assert.strictEqual(selected?.uri.fsPath, alpha.uri.fsPath);
    });

    test('uses active folder when no folders contain .metaflow.json', () => {
        const alpha = folder('/workspace/alpha');
        const beta = folder('/workspace/beta');

        const selected = pickWorkspaceFolder(
            [alpha, beta],
            beta,
            () => false
        );

        assert.strictEqual(selected?.uri.fsPath, beta.uri.fsPath);
    });
});