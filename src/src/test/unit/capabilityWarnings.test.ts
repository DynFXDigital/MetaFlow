import * as assert from 'assert';
import { formatCapabilityWarningMessage } from '../../commands/capabilityWarnings';

suite('Capability warning formatting', () => {
    test('CW-01: includes file path when provided', () => {
        const message = formatCapabilityWarningMessage({
            code: 'CAPABILITY_INVALID',
            message: 'Invalid capability metadata.',
            filePath: 'layer/CAPABILITY.md',
        });

        assert.strictEqual(
            message,
            '[CAPABILITY_INVALID] Invalid capability metadata. [layer/CAPABILITY.md]',
        );
    });

    test('CW-02: omits file path suffix when absent', () => {
        const message = formatCapabilityWarningMessage({
            code: 'CAPABILITY_INVALID',
            message: 'Invalid capability metadata.',
        });

        assert.strictEqual(message, '[CAPABILITY_INVALID] Invalid capability metadata.');
    });

    test('CW-03: normalizes legacy code and Windows-style paths', () => {
        const message = formatCapabilityWarningMessage({
            code: 'CAPABILITY_FRONTMATTER_MISSING',
            message: 'Capability frontmatter is missing.',
            filePath: 'layer\\nested\\CAPABILITY.md',
        });

        assert.strictEqual(
            message,
            '[CAPABILITY_NO_FRONTMATTER] Capability frontmatter is missing. [layer/nested/CAPABILITY.md]',
        );
    });
});
