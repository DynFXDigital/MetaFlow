import * as assert from 'node:assert';
import {
    CURRENT_CONFIG_COMPATIBILITY_VERSION,
    DEFAULT_AGENT_PLUGIN_DISPOSITION,
    normalizeConfigShape,
    prefersAgentPluginsStandard,
    resolveAgentPluginDisposition,
} from '../src/config/configNormalization';
import { validateConfig } from '../src/config/configLoader';
import type { MetaFlowConfig } from '../src/config/configSchema';

function config(overrides: Partial<MetaFlowConfig> = {}): MetaFlowConfig {
    return {
        compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION,
        metadataRepos: [{ id: 'repo', localPath: '.ai/metadata' }],
        profiles: { default: { enabledCapabilities: [] } },
        activeProfile: 'default',
        ...overrides,
    };
}

describe('Agent Plugins disposition config', () => {
    it('defaults to compatibility independently from auto-apply and injection settings', () => {
        const value = config({ injection: { skills: 'synchronize' } });
        assert.strictEqual(DEFAULT_AGENT_PLUGIN_DISPOSITION, 'compatibility');
        assert.strictEqual(resolveAgentPluginDisposition(value), 'compatibility');
        assert.strictEqual(prefersAgentPluginsStandard(value), false);
    });

    it('recognizes both standard-oriented modes', () => {
        for (const disposition of ['prefer-standard', 'audit-standard'] as const) {
            const value = config({
                agentPlugins: { targetVersion: '1.0.0', disposition },
            });
            assert.deepStrictEqual(validateConfig(value), []);
            assert.strictEqual(resolveAgentPluginDisposition(value), disposition);
            assert.strictEqual(prefersAgentPluginsStandard(value), true);
        }
    });

    it('requires the current compatibility contract when the policy is authored', () => {
        const diagnostics = validateConfig({
            ...config(),
            compatibilityVersion: CURRENT_CONFIG_COMPATIBILITY_VERSION - 1,
            agentPlugins: { disposition: 'audit-standard' },
        });
        assert.ok(
            diagnostics.some(
                (entry) => entry.code === 'CONFIG_AGENT_PLUGINS_VERSION_REQUIRED',
            ),
        );
    });

    it('rejects unknown policy values, versions, and keys', () => {
        const diagnostics = validateConfig({
            ...config(),
            agentPlugins: {
                targetVersion: '2.0.0',
                disposition: 'strict',
                extra: true,
            },
        } as unknown as MetaFlowConfig);
        assert.deepStrictEqual(
            diagnostics.map((entry) => entry.code),
            [
                'CONFIG_AGENT_PLUGINS_KEY_UNSUPPORTED',
                'CONFIG_AGENT_PLUGINS_TARGET_VERSION_INVALID',
                'CONFIG_AGENT_PLUGINS_DISPOSITION_INVALID',
            ],
        );
    });

    it('preserves the sparse policy in canonical authored config', () => {
        const normalized = normalizeConfigShape(
            config({ agentPlugins: { disposition: 'prefer-standard' } }),
        );
        assert.deepStrictEqual(normalized.authoredConfig.agentPlugins, {
            disposition: 'prefer-standard',
        });
        assert.deepStrictEqual(normalized.config.agentPlugins, {
            disposition: 'prefer-standard',
        });
    });
});
