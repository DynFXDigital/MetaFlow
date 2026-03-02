import * as assert from 'assert';
import {
    evaluateAiToolsCompatibility,
    getAiToolsMinVersion,
} from '../../commands/aiTools';

suite('aiTools', () => {
    test('returns minimum VS Code version for AI tools lane', () => {
        assert.strictEqual(getAiToolsMinVersion(), '1.109.0');
    });

    test('accepts compatible VS Code versions', () => {
        const compatible = evaluateAiToolsCompatibility('1.109.5');
        assert.strictEqual(compatible.supported, true);
        assert.strictEqual(compatible.reason, undefined);

        const newer = evaluateAiToolsCompatibility('1.110.0');
        assert.strictEqual(newer.supported, true);
    });

    test('rejects lower VS Code versions with actionable reason', () => {
        const incompatible = evaluateAiToolsCompatibility('1.108.9');
        assert.strictEqual(incompatible.supported, false);
        assert.ok(incompatible.reason?.includes('1.109.0+'));
    });
});
