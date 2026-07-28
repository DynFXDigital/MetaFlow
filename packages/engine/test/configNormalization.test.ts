import * as assert from 'assert';
import { normalizeConfigShape, toAuthoredConfig } from '../src/index';
import type { MetaFlowConfig } from '../src/index';

describe('config normalization: atomic capability selections', () => {
    it('marks legacy top-level filters for persistence removal', () => {
        const normalized = normalizeConfigShape({
            metadataRepos: [{ id: 'primary', localPath: '.ai/metadata' }],
            filters: { include: [], exclude: [] },
            profiles: { default: { enabledCapabilities: [] } },
        } as MetaFlowConfig & { filters: unknown });

        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(normalized.authoredConfig, 'filters'),
            false,
        );
        assert.strictEqual(normalized.migrated, true);
        assert.ok(
            normalized.migrationMessages.some((message) => message.includes('top-level filters')),
        );
    });

    it('writes repository descriptors and profile string references only', () => {
        const authored = toAuthoredConfig({
            compatibilityVersion: 2,
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/metadata',
                    enabled: true,
                    capabilities: [
                        { path: 'baseline', enabled: true },
                        { path: 'optional', enabled: false },
                    ],
                },
            ],
            profiles: {
                default: {
                    enable: ['**/*'],
                    layerOverrides: [{ repoId: 'primary', path: 'optional', enabled: true }],
                },
            },
        });

        assert.strictEqual(authored.compatibilityVersion, 3);
        assert.deepStrictEqual(authored.metadataRepos, [
            { id: 'primary', localPath: '.ai/metadata' },
        ]);
        assert.deepStrictEqual(authored.profiles, {
            default: { enabledCapabilities: ['primary:baseline', 'primary:optional'] },
        });
        assert.strictEqual(authored.layerSources, undefined);
    });

    it('preserves an explicitly disabled repository during authored serialization', () => {
        const authored = toAuthoredConfig({
            metadataRepos: [
                { id: 'enabled', localPath: 'repos/enabled', enabled: true },
                { id: 'disabled', localPath: 'repos/disabled', enabled: false },
            ],
            profiles: { default: { enabledCapabilities: [] } },
        });

        assert.deepStrictEqual(authored.metadataRepos, [
            { id: 'enabled', localPath: 'repos/enabled' },
            { id: 'disabled', localPath: 'repos/disabled', enabled: false },
        ]);
    });

    it('preserves explicit canonical selections and removes legacy profile fields', () => {
        const authored = toAuthoredConfig({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            profiles: {
                lean: {
                    displayName: 'Lean',
                    enabledCapabilities: ['r1:team/core', 'r1:team/core', 'r1:base/.github'],
                    disable: ['agents/**'],
                },
            },
            activeProfile: 'lean',
        });

        assert.deepStrictEqual(authored.profiles, {
            lean: {
                displayName: 'Lean',
                enabledCapabilities: ['r1:base', 'r1:team/core'],
            },
        });
        assert.strictEqual(authored.activeProfile, 'lean');
    });

    it('keeps capability injection and naming settings in sparse overrides', () => {
        const authored = toAuthoredConfig({
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    injection: { instructions: 'settings' },
                    capabilities: [
                        {
                            path: 'core',
                            injection: { skills: 'synchronize' },
                            fileNamingStrategy: 'original-unless-conflict',
                        },
                    ],
                },
            ],
            profiles: { default: { enabledCapabilities: ['r1:core'] } },
        });

        assert.deepStrictEqual(authored.capabilityOverrides, {
            'r1:core': {
                injection: { skills: 'synchronize' },
                fileNamingStrategy: 'original-unless-conflict',
            },
        });
    });

    it('normalizes runtime catalog entries with active selection state', () => {
        const normalized = normalizeConfigShape({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            profiles: {
                default: { enabledCapabilities: ['r1:core'] },
                lean: { enabledCapabilities: [] },
            },
            activeProfile: 'default',
        });

        assert.deepStrictEqual(normalized.config.layerSources, [
            { repoId: 'r1', path: 'core', enabled: true },
        ]);
        assert.deepStrictEqual(normalized.config.metadataRepos, [
            { id: 'r1', localPath: 'repos/r1' },
        ]);
    });

    it('surfaces every catalog capability when activeProfile names no profile', () => {
        const normalized = normalizeConfigShape({
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            profiles: {
                default: {
                    enabledCapabilities: ['r1:core'],
                },
                review: {
                    enabledCapabilities: ['r1:optional'],
                },
            },
            activeProfile: 'missing',
        });

        assert.deepStrictEqual(normalized.config.layerSources, [
            { repoId: 'r1', path: 'core', enabled: true },
            { repoId: 'r1', path: 'optional', enabled: true },
        ]);
    });

    it('migrates legacy disabled inventory without selecting it', () => {
        const normalized = normalizeConfigShape({
            metadataRepos: [
                {
                    id: 'r1',
                    localPath: 'repos/r1',
                    capabilities: [
                        { path: 'core', enabled: true },
                        { path: 'optional', enabled: false },
                    ],
                },
            ],
        });

        assert.deepStrictEqual(normalized.authoredConfig.profiles, {
            default: { enabledCapabilities: ['r1:core'] },
        });
        assert.strictEqual(normalized.authoredConfig.metadataRepos?.[0].capabilities, undefined);
        assert.ok(
            normalized.migrationMessages.some((message) => message.includes('enabledCapabilities')),
        );
    });

    it('is idempotent after canonical migration', () => {
        const source: MetaFlowConfig = {
            metadataRepos: [{ id: 'r1', localPath: 'repos/r1' }],
            profiles: { default: { enabledCapabilities: ['r1:core'] } },
            activeProfile: 'default',
        };
        const first = normalizeConfigShape(source);
        const second = normalizeConfigShape(first.config);

        assert.deepStrictEqual(second.config, first.config);
        assert.strictEqual(second.migrated, false);
    });
});
