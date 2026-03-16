import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    BUILT_IN_CAPABILITY_STATE_KEY,
    formatBuiltInCapabilityRepoLabel,
    isBuiltInCapabilityActive,
    readBuiltInCapabilityRuntimeState,
    resolveBuiltInCapabilityDisplayName,
    sanitizeSynchronizedFiles,
} from '../../builtInCapability';

suite('builtInCapability', () => {
    test('sanitizeSynchronizedFiles keeps only unique .github paths', () => {
        const values = sanitizeSynchronizedFiles([
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
                        synchronizedFiles: ['.github/instructions/a.md'],
                    } as T;
                }
                return undefined;
            },
        };

        const runtime = readBuiltInCapabilityRuntimeState(
            memento,
            path.join(os.tmpdir(), 'missing-extension-root'),
            'dynfxdigital.metaflow',
        );
        assert.strictEqual(runtime.enabled, false);
        assert.strictEqual(runtime.sourceRoot, undefined);
        assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow');
        assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow');
        assert.strictEqual(runtime.layerEnabled, true);
        assert.deepStrictEqual(runtime.synchronizedFiles, ['.github/instructions/a.md']);
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
                        synchronizedFiles: ['.github/skills/s.skill.md'],
                    } as T;
                }
                return undefined;
            },
        };

        try {
            const runtime = readBuiltInCapabilityRuntimeState(
                memento,
                extensionPath,
                'dynfxdigital.metaflow',
            );
            assert.strictEqual(runtime.enabled, true);
            assert.strictEqual(runtime.layerEnabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
            assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow');
            assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow');
            assert.deepStrictEqual(runtime.synchronizedFiles, ['.github/skills/s.skill.md']);
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
            const runtime = readBuiltInCapabilityRuntimeState(
                memento,
                extensionPath,
                'dynfxdigital.metaflow',
            );
            assert.strictEqual(runtime.enabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
            assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow');
            assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow');
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('readBuiltInCapabilityRuntimeState falls back sourceId when extension id is unavailable', () => {
        const runtime = readBuiltInCapabilityRuntimeState(
            { get: () => undefined },
            path.join(os.tmpdir(), 'missing-extension-root'),
        );
        assert.strictEqual(runtime.sourceId, 'unknown.extension');
        assert.strictEqual(runtime.sourceDisplayName, 'unknown.extension');
    });

    test('readBuiltInCapabilityRuntimeState uses display name when provided', () => {
        const runtime = readBuiltInCapabilityRuntimeState(
            { get: () => undefined },
            path.join(os.tmpdir(), 'missing-extension-root'),
            'dynfxdigital.metaflow',
            'MetaFlow: AI Metadata Overlay',
        );
        assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow');
        assert.strictEqual(runtime.sourceDisplayName, 'MetaFlow: AI Metadata Overlay');
    });

    test('readBuiltInCapabilityRuntimeState prefers an explicit source root override', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-built-in-override-'));
        const extensionPath = path.join(tempRoot, 'extension');
        const overrideRoot = path.join(
            tempRoot,
            'storage',
            'bundled-metadata',
            'metaflow-ai-metadata',
        );
        fs.mkdirSync(path.join(extensionPath, 'assets', 'metaflow-ai-metadata'), {
            recursive: true,
        });
        fs.mkdirSync(overrideRoot, { recursive: true });

        try {
            const runtime = readBuiltInCapabilityRuntimeState(
                {
                    get<T>(key: string): T | undefined {
                        if (key === BUILT_IN_CAPABILITY_STATE_KEY) {
                            return {
                                enabled: true,
                                layerEnabled: true,
                                synchronizedFiles: [],
                            } as T;
                        }
                        return undefined;
                    },
                },
                extensionPath,
                'dynfxdigital.metaflow',
                'MetaFlow: AI Metadata Overlay',
                overrideRoot,
            );

            assert.strictEqual(runtime.sourceRoot, overrideRoot);
            assert.strictEqual(runtime.enabled, true);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('formatBuiltInCapabilityRepoLabel uses the built-in label', () => {
        assert.strictEqual(formatBuiltInCapabilityRepoLabel(), 'MetaFlow');
    });

    test('formatBuiltInCapabilityRepoLabel is stable without inputs', () => {
        assert.strictEqual(formatBuiltInCapabilityRepoLabel(), 'MetaFlow');
    });

    test('resolveBuiltInCapabilityDisplayName prefers capability name when present', () => {
        assert.strictEqual(
            resolveBuiltInCapabilityDisplayName(
                'Bundled Capability',
                'MetaFlow: AI Metadata Overlay',
            ),
            'Bundled Capability',
        );
    });

    test('resolveBuiltInCapabilityDisplayName falls back to source display name before generic label', () => {
        assert.strictEqual(
            resolveBuiltInCapabilityDisplayName(undefined, 'MetaFlow: AI Metadata Overlay'),
            'MetaFlow: AI Metadata Overlay',
        );
    });

    test('resolveBuiltInCapabilityDisplayName falls back to generic label when names are absent', () => {
        assert.strictEqual(resolveBuiltInCapabilityDisplayName(undefined, '   '), 'MetaFlow');
    });

    test('isBuiltInCapabilityActive is true when explicitly enabled', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: true,
                layerEnabled: false,
                synchronizedFiles: [],
            }),
            true,
        );
    });

    test('isBuiltInCapabilityActive keeps legacy Synchronized installs active when layer is enabled', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: false,
                layerEnabled: true,
                synchronizedFiles: ['.github/skills/metaflow-capability-review/SKILL.md'],
            }),
            true,
        );
    });

    test('isBuiltInCapabilityActive stays true when tracked Synchronized files exist even if layer is disabled', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: false,
                layerEnabled: false,
                synchronizedFiles: ['.github/skills/metaflow-capability-review/SKILL.md'],
            }),
            true,
        );
    });

    test('isBuiltInCapabilityActive is false when disabled and no tracked files exist', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: false,
                layerEnabled: false,
                synchronizedFiles: [],
            }),
            false,
        );
    });
});
