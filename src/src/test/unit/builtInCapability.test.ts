import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    BUILT_IN_CAPABILITY_STATE_KEY,
    readBuiltInCapabilityRuntimeState,
    sanitizeMaterializedFiles,
} from '../../builtInCapability';

suite('builtInCapability', () => {
    test('sanitizeMaterializedFiles keeps only unique .github paths', () => {
        const values = sanitizeMaterializedFiles([
            '.github/instructions/a.md',
            '.github/instructions/a.md',
            './.github/prompts/p.prompt.md',
            'README.md',
            '',
        ]);

        assert.deepStrictEqual(values, [
            '.github/instructions/a.md',
            '.github/prompts/p.prompt.md',
        ]);
    });

    test('readBuiltInCapabilityRuntimeState disables built-in mode when assets are unavailable', () => {
        const memento = {
            get<T>(key: string): T | undefined {
                if (key === BUILT_IN_CAPABILITY_STATE_KEY) {
                    return {
                        enabled: true,
                        layerEnabled: true,
                        materializedFiles: ['.github/instructions/a.md'],
                    } as T;
                }
                return undefined;
            },
        };

        const runtime = readBuiltInCapabilityRuntimeState(memento, path.join(os.tmpdir(), 'missing-extension-root'));
        assert.strictEqual(runtime.enabled, false);
        assert.strictEqual(runtime.sourceRoot, undefined);
        assert.strictEqual(runtime.layerEnabled, true);
        assert.deepStrictEqual(runtime.materializedFiles, ['.github/instructions/a.md']);
    });

    test('readBuiltInCapabilityRuntimeState reads payload when bundled assets exist', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-built-in-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const sourceRoot = path.join(extensionPath, 'assets', 'metaflow-ai-metadata');
        fs.mkdirSync(sourceRoot, { recursive: true });

        const memento = {
            get<T>(key: string): T | undefined {
                if (key === BUILT_IN_CAPABILITY_STATE_KEY) {
                    return {
                        enabled: true,
                        layerEnabled: false,
                        materializedFiles: ['.github/skills/s.skill.md'],
                    } as T;
                }
                return undefined;
            },
        };

        try {
            const runtime = readBuiltInCapabilityRuntimeState(memento, extensionPath);
            assert.strictEqual(runtime.enabled, true);
            assert.strictEqual(runtime.layerEnabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
            assert.deepStrictEqual(runtime.materializedFiles, ['.github/skills/s.skill.md']);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('readBuiltInCapabilityRuntimeState ignores unknown legacy-only payloads', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-built-in-no-legacy-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const sourceRoot = path.join(extensionPath, 'assets', 'metaflow-ai-metadata');
        fs.mkdirSync(sourceRoot, { recursive: true });

        const memento = {
            get<T>(key: string): T | undefined {
                if (key === BUILT_IN_CAPABILITY_STATE_KEY) {
                    return undefined;
                }
                if (key === 'metaflow.builtInCapability.enabled') {
                    return true as T;
                }
                return undefined;
            },
        };

        try {
            const runtime = readBuiltInCapabilityRuntimeState(memento, extensionPath);
            assert.strictEqual(runtime.enabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
