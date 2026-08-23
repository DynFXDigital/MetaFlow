import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    CURRENT_CONFIG_COMPATIBILITY_VERSION,
    isPiTargetEnabled,
    loadConfigFromPath,
    normalizeConfigShape,
    toAuthoredConfig,
    validateConfig,
} from '../src/index';
import type { MetaFlowConfig } from '../src/index';

function baseConfig(overrides: Partial<MetaFlowConfig> = {}): MetaFlowConfig {
    return {
        compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
        metadataRepos: [{ id: 'metadata', localPath: 'metadata' }],
        profiles: { default: { enabledCapabilities: [] } },
        activeProfile: 'default',
        ...overrides,
    };
}

function validationCodes(config: unknown): Array<string | undefined> {
    return validateConfig(config as MetaFlowConfig).map((error) => error.code);
}

describe('Pi target config v5', () => {
    it('defines v5 as the current compatibility contract', () => {
        assert.strictEqual(CURRENT_CONFIG_COMPATIBILITY_VERSION, 5);
    });

    it('enables Pi only for an explicit current-version true value', () => {
        const enabled = baseConfig({ targets: { pi: { enabled: true } } });
        const normalized = normalizeConfigShape(enabled);

        assert.strictEqual(isPiTargetEnabled(enabled), true);
        assert.strictEqual(isPiTargetEnabled(normalized.config), true);
        assert.deepStrictEqual(normalized.authoredConfig.targets, {
            pi: { enabled: true },
        });

        assert.strictEqual(
            isPiTargetEnabled(baseConfig({ targets: { pi: { enabled: false } } })),
            false,
        );
        assert.strictEqual(isPiTargetEnabled(baseConfig({ targets: { pi: {} } })), false);
        assert.strictEqual(
            isPiTargetEnabled({
                ...enabled,
                compatibilityVersion: 4,
            }),
            false,
        );
    });

    it('does not invent omitted targets and preserves an explicit disabled value', () => {
        const omitted = toAuthoredConfig(baseConfig());
        const disabled = toAuthoredConfig(baseConfig({ targets: { pi: { enabled: false } } }));

        assert.strictEqual(omitted.targets, undefined);
        assert.deepStrictEqual(disabled.targets, { pi: { enabled: false } });
    });

    it('requires v5 whenever targets.pi is authored', () => {
        for (const compatibilityVersion of [undefined, 4]) {
            const config = baseConfig({
                compatibilityVersion,
                targets: { pi: { enabled: true } },
            });
            assert.ok(validationCodes(config).includes('CONFIG_PI_TARGET_VERSION_REQUIRED'));
        }
    });

    it('rejects malformed, unknown, and non-skills Pi target fields', () => {
        const cases: Array<{ targets: unknown; code: string }> = [
            { targets: null, code: 'CONFIG_TARGETS_INVALID' },
            { targets: [], code: 'CONFIG_TARGETS_INVALID' },
            { targets: { other: {} }, code: 'CONFIG_TARGET_UNSUPPORTED' },
            { targets: { pi: null }, code: 'CONFIG_PI_TARGET_INVALID' },
            { targets: { pi: [] }, code: 'CONFIG_PI_TARGET_INVALID' },
            {
                targets: { pi: { enabled: 'yes' } },
                code: 'CONFIG_PI_TARGET_ENABLED_INVALID',
            },
            {
                targets: { pi: { mcp: { enabled: true } } },
                code: 'CONFIG_PI_TARGET_KEY_UNSUPPORTED',
            },
        ];

        for (const testCase of cases) {
            const config = {
                ...baseConfig(),
                targets: testCase.targets,
            };
            assert.ok(
                validationCodes(config).includes(testCase.code),
                `expected ${testCase.code} for ${JSON.stringify(testCase.targets)}`,
            );
        }
    });

    it('rejects future compatibility versions', () => {
        const errors = validateConfig(
            baseConfig({ compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION + 1 }),
        );
        assert.ok(
            errors.some((error) => error.message.includes('newer than the supported version')),
        );
    });

    it('loads JSONC with an enabled Pi target without migration', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-pi-target-'));
        try {
            const configPath = path.join(root, 'config.jsonc');
            fs.writeFileSync(
                configPath,
                `{
  // Pi projection is explicitly opt-in.
  "compatibilityVersion": 5,
  "metadataRepos": [{ "id": "metadata", "localPath": "metadata" }],
  "profiles": { "default": { "enabledCapabilities": [] } },
  "activeProfile": "default",
  "targets": { "pi": { "enabled": true } }
}\n`,
                'utf-8',
            );

            const loaded = loadConfigFromPath(configPath);
            assert.strictEqual(loaded.ok, true);
            if (loaded.ok) {
                assert.strictEqual(loaded.migrationRequired, false);
                assert.strictEqual(isPiTargetEnabled(loaded.config), true);
                assert.deepStrictEqual(loaded.config.targets, { pi: { enabled: true } });
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
