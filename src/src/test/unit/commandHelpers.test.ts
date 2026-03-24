import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    DEFAULT_FILES_VIEW_MODE,
    DEFAULT_LAYERS_VIEW_MODE,
    DEFAULT_PROFILE_ID,
    addProfileToConfig,
    cloneProfileConfig,
    deleteProfileFromConfig,
    deriveProfileId,
    isInjectionMode,
    deriveRepoId,
    ensureMultiRepoConfig,
    extractProfileId,
    extractLayerIndex,
    extractLayerCheckedState,
    extractLayerPath,
    getProfileDisplayName,
    extractRepoId,
    extractRefreshCommandOptions,
    extractApplyCommandOptions,
    extractRepoScopeOptions,
    normalizeFilesViewMode,
    normalizeLayersViewMode,
    normalizeAiMetadataAutoApplyMode,
    projectConfigForProfile,
    normalizeLayerPath,
    normalizeAndDeduplicateLayerPaths,
    pruneStaleLayerSources,
    readManagedViewsState,
    writeManagedViewsState,
} from '../../commands/commandHelpers';

suite('Command Helpers', () => {
    test('validates injection mode values', () => {
        assert.strictEqual(isInjectionMode('settings'), true);
        assert.strictEqual(isInjectionMode('synchronize'), true);
        assert.strictEqual(isInjectionMode('invalid'), false);
    });

    test('derives repo id from URL and deduplicates', () => {
        const repoId = deriveRepoId(
            'C:/tmp/local-folder',
            'https://github.com/org/ai-metadata.git',
            new Set<string>(['ai-metadata', 'ai-metadata-2']),
        );

        assert.strictEqual(repoId, 'ai-metadata-3');
    });

    test('derives profile ids from display names and deduplicates', () => {
        assert.strictEqual(deriveProfileId('My Review Profile', new Set()), 'my-review-profile');
        assert.strictEqual(
            deriveProfileId(
                'My Review Profile',
                new Set(['my-review-profile', 'my-review-profile-2']),
            ),
            'my-review-profile-3',
        );
        assert.strictEqual(deriveProfileId('###', new Set()), 'profile');
    });

    test('derives repo id from local path when URL missing', () => {
        const repoId = deriveRepoId('C:/tmp/My Metadata Source', undefined, new Set<string>());
        assert.strictEqual(repoId, 'my-metadata-source');
    });

    test('falls back to source when derived slug is empty', () => {
        const fromUrl = deriveRepoId(
            'C:/tmp/local',
            'https://example.com/###.git',
            new Set<string>(),
        );
        const fromPath = deriveRepoId('', undefined, new Set<string>());

        assert.strictEqual(fromUrl, 'source');
        assert.strictEqual(fromPath, 'source');
    });

    test('converts legacy single-repo config to multi-repo config', () => {
        const config = {
            metadataRepo: { localPath: '.ai/metadata' },
            layers: ['company', 'team/default'],
        };

        const result = ensureMultiRepoConfig(config as never);

        assert.strictEqual(result.metadataRepos.length, 1);
        assert.strictEqual(result.metadataRepos[0].id, 'primary');
        assert.strictEqual(result.layerSources.length, 2);
        assert.strictEqual(result.layerSources[0].repoId, 'primary');
        assert.strictEqual('metadataRepo' in config, false);
        assert.strictEqual('layers' in config, false);
    });

    test('returns existing multi-repo config without conversion', () => {
        const config = {
            metadataRepos: [{ id: 'primary', localPath: '.ai/metadata', enabled: true }],
            layerSources: [{ repoId: 'primary', path: 'company', enabled: true }],
        };

        const result = ensureMultiRepoConfig(config as never);

        assert.strictEqual(result.metadataRepos, config.metadataRepos);
        assert.strictEqual(result.layerSources, config.layerSources);
    });

    test('throws for invalid legacy config conversion request', () => {
        assert.throws(
            () => ensureMultiRepoConfig({ metadataRepo: { localPath: '.ai/metadata' } } as never),
            /Cannot convert config to multi-repo mode/,
        );
    });

    test('derives layerSources from capabilities when metadataRepos exists without layerSources', () => {
        const config = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'company', enabled: true },
                        { path: 'team', enabled: false, excludedTypes: ['agents'] },
                    ],
                },
            ],
        };

        const result = ensureMultiRepoConfig(config as never);

        assert.strictEqual(result.metadataRepos.length, 1);
        assert.strictEqual(result.layerSources.length, 2);
        assert.strictEqual(result.layerSources[0].repoId, 'primary');
        assert.strictEqual(result.layerSources[0].path, 'company');
        assert.strictEqual(result.layerSources[0].enabled, true);
        assert.strictEqual(result.layerSources[1].path, 'team');
        assert.strictEqual(result.layerSources[1].enabled, false);
    });

    test('extracts layer index from number and object', () => {
        assert.strictEqual(extractLayerIndex(3), 3);
        assert.strictEqual(extractLayerIndex(null), undefined);
        assert.strictEqual(extractLayerIndex({ layerIndex: 5 }), 5);
        assert.strictEqual(extractLayerIndex({ layerIndex: '5' }), undefined);
    });

    test('extracts checked state and repo id from command args', () => {
        assert.strictEqual(extractLayerCheckedState({ checked: true }), true);
        assert.strictEqual(extractLayerCheckedState(null), undefined);
        assert.strictEqual(extractLayerCheckedState({}), undefined);
        assert.strictEqual(extractLayerCheckedState({ checked: 'true' }), undefined);

        assert.strictEqual(
            extractLayerPath({ layerPath: 'capabilities/devtools' }),
            'capabilities/devtools',
        );
        assert.strictEqual(extractLayerPath({ layerPath: 7 }), undefined);
        assert.strictEqual(extractLayerPath(null), undefined);
        assert.strictEqual(
            extractLayerPath({ pathKey: 'capabilities/devtools' }),
            'capabilities/devtools',
        );
        assert.strictEqual(
            extractLayerPath({ id: 'tree:layer:primary:capabilities/devtools' }),
            'capabilities/devtools',
        );
        assert.strictEqual(extractLayerPath({ id: 'tree:folder:primary:.' }), '.');

        assert.strictEqual(extractRepoId('primary'), 'primary');
        assert.strictEqual(extractRepoId(null), undefined);
        assert.strictEqual(extractRepoId({ repoId: 'secondary' }), 'secondary');
        assert.strictEqual(extractRepoId({ repoId: 1 }), undefined);
        assert.strictEqual(
            extractRepoId({ id: 'tree:layer:secondary:capabilities/devtools' }),
            'secondary',
        );

        assert.strictEqual(extractProfileId('review'), 'review');
        assert.strictEqual(extractProfileId({ profileId: 'lean' }), 'lean');
        assert.strictEqual(extractProfileId({ profileId: 7 }), undefined);
        assert.strictEqual(extractProfileId(null), undefined);
        assert.strictEqual(extractProfileId({}), undefined);
    });

    test('uses display names when present and falls back to profile id', () => {
        assert.strictEqual(getProfileDisplayName('default', { displayName: 'Default' }), 'Default');
        assert.strictEqual(getProfileDisplayName('lean', { displayName: '   ' }), 'lean');
        assert.strictEqual(getProfileDisplayName('review'), 'review');
    });

    test('clones profile config arrays without sharing references', () => {
        const original = {
            displayName: 'Review',
            enable: ['**/*'],
            disable: ['agents/**'],
            layerOverrides: [
                {
                    repoId: 'primary',
                    path: 'standards/sdlc',
                    enabled: false,
                    excludedTypes: ['agents' as const],
                },
            ],
        };
        const cloned = cloneProfileConfig(original);

        assert.deepStrictEqual(cloned, original);
        assert.notStrictEqual(cloned.enable, original.enable);
        assert.notStrictEqual(cloned.disable, original.disable);
        assert.notStrictEqual(cloned.layerOverrides, original.layerOverrides);
        assert.notStrictEqual(cloned.layerOverrides?.[0], original.layerOverrides?.[0]);
        assert.notStrictEqual(
            cloned.layerOverrides?.[0]?.excludedTypes,
            original.layerOverrides?.[0]?.excludedTypes,
        );
    });

    test('cloneProfileConfig handles partially defined profile fields', () => {
        // profile with no displayName — hits the : {} branch for displayName
        const noDisplayName = cloneProfileConfig({ enable: ['**/*'] });
        assert.strictEqual(noDisplayName.displayName, undefined);
        assert.deepStrictEqual(noDisplayName.enable, ['**/*']);
        assert.strictEqual(noDisplayName.disable, undefined);

        // profile with no enable — hits the : {} branch for enable
        const noEnable = cloneProfileConfig({ displayName: 'Minimal', disable: ['x'] });
        assert.strictEqual(noEnable.displayName, 'Minimal');
        assert.strictEqual(noEnable.enable, undefined);
    });

    test('adds profiles with generated ids and optional cloning', () => {
        const config: {
            profiles: Record<
                string,
                { displayName: string; enable?: string[]; disable?: string[] }
            >;
        } = {
            profiles: {
                [DEFAULT_PROFILE_ID]: { displayName: 'Default', enable: ['**/*'] },
                lean: { displayName: 'Lean', disable: ['agents/**'] },
            },
        };

        const created = addProfileToConfig(config as never, 'Review');
        assert.strictEqual(created.profileId, 'review');
        assert.deepStrictEqual(config.profiles.review, { displayName: 'Review' });

        const duplicated = addProfileToConfig(config as never, 'Copy of Lean', 'lean');
        assert.strictEqual(duplicated.profileId, 'copy-of-lean');
        assert.deepStrictEqual(config.profiles['copy-of-lean'], {
            displayName: 'Copy of Lean',
            disable: ['agents/**'],
        });
    });

    test('rejects duplicate display names and unknown duplicate sources', () => {
        const config = {
            profiles: {
                default: { displayName: 'Default' },
                lean: { displayName: 'Lean' },
            },
        };

        assert.throws(() => addProfileToConfig(config as never, 'Lean'), /already exists/);
        assert.throws(
            () => addProfileToConfig(config as never, 'Copy', 'missing'),
            /was not found/,
        );
    });

    test('addProfileToConfig rejects empty or whitespace-only display names', () => {
        const config = { profiles: { default: { displayName: 'Default' } } };

        assert.throws(() => addProfileToConfig(config as never, ''), /Profile name is required/);
        assert.throws(() => addProfileToConfig(config as never, '   '), /Profile name is required/);
    });

    test('deletes non-default profiles and falls back active profile when needed', () => {
        const config: {
            profiles: Record<string, { displayName: string }>;
            activeProfile: string;
        } = {
            profiles: {
                default: { displayName: 'Default' },
                lean: { displayName: 'Lean' },
                review: { displayName: 'Review' },
            },
            activeProfile: 'review',
        };

        const nextActiveProfile = deleteProfileFromConfig(config as never, 'review');
        assert.strictEqual(nextActiveProfile, 'default');
        assert.strictEqual(config.activeProfile, 'default');
        assert.ok(!config.profiles.review);

        assert.throws(
            () => deleteProfileFromConfig(config as never, 'default'),
            /cannot be deleted/,
        );
    });

    test('deleteProfileFromConfig returns current activeProfile when deleted profile was not active', () => {
        const config = {
            profiles: {
                default: { displayName: 'Default' },
                lean: { displayName: 'Lean' },
                review: { displayName: 'Review' },
            },
            activeProfile: 'lean',
        };

        const result = deleteProfileFromConfig(config as never, 'review');

        assert.strictEqual(result, 'lean');
        assert.strictEqual(config.activeProfile, 'lean');
        assert.ok(!config.profiles.review);
    });

    test('deleteProfileFromConfig uses first available profile when fallback profile is missing', () => {
        const config = {
            profiles: {
                lean: { displayName: 'Lean' },
                review: { displayName: 'Review' },
            },
            activeProfile: 'review',
        };

        // No 'default' profile; fallback resolves to first remaining key
        const result = deleteProfileFromConfig(config as never, 'review');

        assert.strictEqual(result, 'lean');
        assert.strictEqual(config.activeProfile, 'lean');
        assert.ok(!config.profiles.review);
    });

    test('deleteProfileFromConfig throws when profile does not exist', () => {
        const config = {
            profiles: { default: { displayName: 'Default' }, lean: { displayName: 'Lean' } },
            activeProfile: 'default',
        };

        assert.throws(
            () => deleteProfileFromConfig(config as never, 'nonexistent'),
            /was not found/,
        );
    });

    test('extracts refresh/apply options and ignores invalid types', () => {
        assert.deepStrictEqual(extractRefreshCommandOptions(undefined), {});
        assert.deepStrictEqual(
            extractRefreshCommandOptions({
                skipAutoApply: true,
                forceDiscovery: false,
                forceDiscoveryRepoId: 'repo-a',
            }),
            {
                skipAutoApply: true,
                skipRepoSync: undefined,
                forceDiscovery: false,
                forceDiscoveryRepoId: 'repo-a',
            },
        );
        assert.deepStrictEqual(
            extractRefreshCommandOptions({
                skipAutoApply: 'x',
                forceDiscovery: 1,
                forceDiscoveryRepoId: 7,
            }),
            {
                skipAutoApply: undefined,
                skipRepoSync: undefined,
                forceDiscovery: undefined,
                forceDiscoveryRepoId: undefined,
            },
        );
        assert.deepStrictEqual(extractRefreshCommandOptions({ skipRepoSync: true }), {
            skipAutoApply: undefined,
            skipRepoSync: true,
            forceDiscovery: undefined,
            forceDiscoveryRepoId: undefined,
        });

        assert.deepStrictEqual(extractApplyCommandOptions({ skipRefresh: true }), {
            skipRefresh: true,
        });
        assert.deepStrictEqual(extractApplyCommandOptions(null), {});
        assert.deepStrictEqual(extractApplyCommandOptions({ skipRefresh: 'false' }), {
            skipRefresh: undefined,
        });

        assert.deepStrictEqual(extractRepoScopeOptions('repo-a'), {
            repoId: 'repo-a',
            allRepos: false,
            silent: false,
        });
        assert.deepStrictEqual(
            extractRepoScopeOptions({ repoId: 'repo-b', allRepos: true, silent: true }),
            { repoId: 'repo-b', allRepos: true, silent: true },
        );
        assert.deepStrictEqual(
            extractRepoScopeOptions({ repoId: 4, allRepos: 'yes', silent: 'no' }),
            { repoId: undefined, allRepos: undefined, silent: undefined },
        );
        assert.deepStrictEqual(extractRepoScopeOptions(undefined), {});
    });

    test('normalizes view mode settings to safe defaults', () => {
        assert.strictEqual(normalizeFilesViewMode('repoTree'), 'repoTree');
        assert.strictEqual(normalizeFilesViewMode('other'), DEFAULT_FILES_VIEW_MODE);

        assert.strictEqual(normalizeLayersViewMode('tree'), 'tree');
        assert.strictEqual(normalizeLayersViewMode('flat'), 'flat');
        assert.strictEqual(normalizeLayersViewMode('other'), DEFAULT_LAYERS_VIEW_MODE);
    });

    test('TC-0605: reads managed view mode defaults when no state exists', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-views-'));

        try {
            assert.deepStrictEqual(readManagedViewsState(tmpDir), {
                filesViewMode: DEFAULT_FILES_VIEW_MODE,
                layersViewMode: DEFAULT_LAYERS_VIEW_MODE,
            });
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('TC-0606: writes managed view modes to state.json without overwriting the other preference', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-views-'));

        try {
            const first = writeManagedViewsState(tmpDir, { layersViewMode: 'flat' });
            assert.deepStrictEqual(first, {
                filesViewMode: DEFAULT_FILES_VIEW_MODE,
                layersViewMode: 'flat',
            });

            const second = writeManagedViewsState(tmpDir, { filesViewMode: 'repoTree' });
            assert.deepStrictEqual(second, {
                filesViewMode: 'repoTree',
                layersViewMode: 'flat',
            });

            assert.deepStrictEqual(readManagedViewsState(tmpDir), second);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('normalizes ai metadata auto-apply mode settings', () => {
        assert.strictEqual(normalizeAiMetadataAutoApplyMode('off'), 'off');
        assert.strictEqual(normalizeAiMetadataAutoApplyMode('synchronize'), 'synchronize');
        assert.strictEqual(normalizeAiMetadataAutoApplyMode('builtinLayer'), 'builtinLayer');
        assert.strictEqual(normalizeAiMetadataAutoApplyMode('invalid'), 'off');
        assert.strictEqual(normalizeAiMetadataAutoApplyMode(undefined), 'off');
    });

    test('normalizes and deduplicates layer paths', () => {
        const config = {
            layerSources: [
                { repoId: 'primary', path: 'company/.github', enabled: false },
                { repoId: 'primary', path: 'company', enabled: true },
                { repoId: 'secondary', path: '.github', enabled: true },
            ],
            layers: ['team/.github', 'team', '.github'],
        };

        const changed = normalizeAndDeduplicateLayerPaths(config as never);

        assert.strictEqual(changed, true);
        assert.deepStrictEqual(config.layerSources, [
            { repoId: 'primary', path: 'company', enabled: true },
            { repoId: 'secondary', path: '.', enabled: true },
        ]);
        assert.deepStrictEqual(config.layers, ['team', '.']);
        assert.strictEqual(normalizeLayerPath('company/.github'), 'company');
    });

    test('reports unchanged for already normalized config', () => {
        const config = {
            layerSources: [{ repoId: 'primary', path: 'company', enabled: true }],
            layers: ['company', '.'],
        };

        const changed = normalizeAndDeduplicateLayerPaths(config as never);
        assert.strictEqual(changed, false);
    });

    test('projectConfigForProfile applies layer overrides without mutating the global baseline', () => {
        const config = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'company/core', enabled: true },
                        { path: 'standards/sdlc', enabled: true, excludedTypes: ['agents'] },
                    ],
                },
            ],
            layerSources: [
                { repoId: 'primary', path: 'company/core', enabled: true },
                {
                    repoId: 'primary',
                    path: 'standards/sdlc',
                    enabled: true,
                    excludedTypes: ['agents'],
                },
            ],
            profiles: {
                default: { displayName: 'Default' },
                focused: {
                    displayName: 'Focused',
                    layerOverrides: [
                        {
                            repoId: 'primary',
                            path: 'standards/sdlc',
                            enabled: false,
                            excludedTypes: [],
                        },
                    ],
                },
            },
            activeProfile: 'focused',
        };

        const projected = projectConfigForProfile(config as never);

        assert.notStrictEqual(projected, config);
        assert.strictEqual(
            projected.layerSources?.find((layer) => layer.path === 'standards/sdlc')?.enabled,
            false,
        );
        assert.deepStrictEqual(
            projected.layerSources?.find((layer) => layer.path === 'standards/sdlc')?.excludedTypes,
            [],
        );
        assert.strictEqual(
            config.layerSources?.find((layer) => layer.path === 'standards/sdlc')?.enabled,
            true,
        );
        assert.deepStrictEqual(
            config.layerSources?.find((layer) => layer.path === 'standards/sdlc')?.excludedTypes,
            ['agents'],
        );
        assert.strictEqual(
            projected.metadataRepos?.[0]?.capabilities?.find(
                (capability) => capability.path === 'standards/sdlc',
            )?.enabled,
            false,
        );
    });
});

suite('pruneStaleLayerSources', () => {
    let tmpDir: string;

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-prune-'));
    });

    teardown(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('removes multi-repo layer sources whose directories do not exist', () => {
        const repoRoot = path.join(tmpDir, 'org');
        fs.mkdirSync(path.join(repoRoot, 'present'), { recursive: true });

        const config = {
            metadataRepos: [{ id: 'org', localPath: repoRoot, enabled: true }],
            layerSources: [
                { repoId: 'org', path: 'present', enabled: true },
                { repoId: 'org', path: 'removed', enabled: true },
            ],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, ['org/removed']);
        assert.strictEqual(config.layerSources.length, 1);
        assert.strictEqual(config.layerSources[0].path, 'present');
    });

    test('removes single-repo layers whose directories do not exist', () => {
        const repoRoot = path.join(tmpDir, 'meta');
        fs.mkdirSync(path.join(repoRoot, 'live'), { recursive: true });

        const config = {
            metadataRepo: { localPath: repoRoot },
            layers: ['live', 'gone'],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, ['gone']);
        assert.deepStrictEqual(config.layers, ['live']);
    });

    test('returns empty array when all layers exist', () => {
        const repoRoot = path.join(tmpDir, 'org');
        fs.mkdirSync(path.join(repoRoot, 'a'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'b'), { recursive: true });

        const config = {
            metadataRepos: [{ id: 'org', localPath: repoRoot, enabled: true }],
            layerSources: [
                { repoId: 'org', path: 'a', enabled: true },
                { repoId: 'org', path: 'b', enabled: true },
            ],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, []);
        assert.strictEqual(config.layerSources.length, 2);
    });

    test('leaves entries with unknown repoId untouched', () => {
        const config = {
            metadataRepos: [{ id: 'known', localPath: tmpDir, enabled: true }],
            layerSources: [{ repoId: 'unknown', path: 'whatever', enabled: true }],
        };

        const pruned = pruneStaleLayerSources(config as never, tmpDir);
        assert.deepStrictEqual(pruned, []);
        assert.strictEqual(config.layerSources.length, 1);
    });
});
