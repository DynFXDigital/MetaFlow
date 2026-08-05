import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    BUILT_IN_CAPABILITY_REPO_ID,
    BUILT_IN_CAPABILITY_STATE_KEY,
    formatBuiltInCapabilityRepoLabel,
    isBuiltInCapabilityActive,
    isBuiltInCapabilityEnabled,
    readBuiltInCapabilityRuntimeState,
    removeBuiltInCapabilityFromConfig,
    resolveBuiltInCapabilityDisplayName,
    resolveBuiltInLayerEnabled,
    sanitizeSynchronizedFiles,
} from '../../builtInCapability';

suite('builtInCapability', () => {
    test('removeBuiltInCapabilityFromConfig removes legacy repo and profile references', () => {
        const config = {
            metadataRepos: [
                { id: 'primary', localPath: '.ai/ai-metadata' },
                { id: BUILT_IN_CAPABILITY_REPO_ID, localPath: 'bundled-metadata' },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core' },
                { repoId: BUILT_IN_CAPABILITY_REPO_ID, path: '.' },
            ],
            profiles: {
                default: {
                    enabledCapabilities: [
                        'primary:company/core',
                        `${BUILT_IN_CAPABILITY_REPO_ID}:.`,
                    ],
                    layerOverrides: [
                        { repoId: 'primary', path: 'company/core', enabled: true },
                        { repoId: BUILT_IN_CAPABILITY_REPO_ID, path: '.', enabled: true },
                    ],
                },
            },
        };

        assert.strictEqual(removeBuiltInCapabilityFromConfig(config as never), true);
        assert.deepStrictEqual(config.metadataRepos, [
            { id: 'primary', localPath: '.ai/ai-metadata' },
        ]);
        assert.deepStrictEqual(config.layerSources, [
            { repoId: 'primary', path: 'company/core' },
        ]);
        assert.deepStrictEqual(config.profiles.default.enabledCapabilities, [
            'primary:company/core',
        ]);
        assert.deepStrictEqual(config.profiles.default.layerOverrides, [
            { repoId: 'primary', path: 'company/core', enabled: true },
        ]);
        assert.strictEqual(removeBuiltInCapabilityFromConfig(config as never), false);
    });

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
            'dynfxdigital.metaflow-ai',
        );
        assert.strictEqual(runtime.enabled, false);
        assert.strictEqual(runtime.sourceRoot, undefined);
        assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow-ai');
        assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow-ai');
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
                'dynfxdigital.metaflow-ai',
            );
            assert.strictEqual(runtime.enabled, true);
            assert.strictEqual(runtime.layerEnabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
            assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow-ai');
            assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow-ai');
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
                'dynfxdigital.metaflow-ai',
            );
            assert.strictEqual(runtime.enabled, false);
            assert.strictEqual(runtime.sourceRoot, sourceRoot);
            assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow-ai');
            assert.strictEqual(runtime.sourceDisplayName, 'dynfxdigital.metaflow-ai');
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
            'dynfxdigital.metaflow-ai',
            'MetaFlow: AI Metadata Overlay',
        );
        assert.strictEqual(runtime.sourceId, 'dynfxdigital.metaflow-ai');
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
                'dynfxdigital.metaflow-ai',
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

    test('nested built-in capabilities default independently of the MetaFlow root layer', () => {
        const state = {
            layerEnabled: false,
            layerStates: {},
        };

        assert.strictEqual(resolveBuiltInLayerEnabled(state, '.'), false);
        assert.strictEqual(
            resolveBuiltInLayerEnabled(
                state,
                'capabilities/metadata-authoring/github-copilot-metadata-authoring',
            ),
            true,
        );
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

    test('isBuiltInCapabilityActive stays true when the built-in repo was disabled by the user', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: false,
                layerEnabled: false,
                disabledByUser: true,
                synchronizedFiles: [],
            }),
            true,
        );
    });

    test('isBuiltInCapabilityActive is false when disabled and no tracked files exist', () => {
        assert.strictEqual(
            isBuiltInCapabilityActive({
                enabled: false,
                layerEnabled: false,
                disabledByUser: false,
                synchronizedFiles: [],
            }),
            false,
        );
    });

    test('isBuiltInCapabilityEnabled is false when the built-in repo is only kept active for recovery', () => {
        assert.strictEqual(
            isBuiltInCapabilityEnabled({
                enabled: false,
                layerEnabled: true,
                disabledByUser: true,
                synchronizedFiles: ['.github/skills/metaflow-capability-review/SKILL.md'],
            }),
            false,
        );
    });

    test('isBuiltInCapabilityEnabled is true only when explicitly enabled', () => {
        assert.strictEqual(
            isBuiltInCapabilityEnabled({
                enabled: true,
                layerEnabled: false,
                disabledByUser: true,
                synchronizedFiles: [],
            }),
            true,
        );
    });
});
