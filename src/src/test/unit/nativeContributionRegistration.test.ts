import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildNativeContributionContextValues,
    METAFLOW_NATIVE_CONTEXT_KEYS,
} from '../../nativeContributions';
import type { BuiltInCapabilityRuntimeState } from '../../builtInCapability';

type ContributionManifest = {
    path: string;
    when?: string;
};

type ExtensionPackageJson = {
    activationEvents?: string[];
    contributes?: {
        chatAgents?: ContributionManifest[];
        chatInstructions?: ContributionManifest[];
        chatPromptFiles?: ContributionManifest[];
        chatSkills?: ContributionManifest[];
        chatParticipants?: Array<{
            id: string;
            name: string;
            commands?: Array<{ name: string }>;
        }>;
    };
};

const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

function readPackageJson(): ExtensionPackageJson {
    return JSON.parse(
        fs.readFileSync(path.join(EXTENSION_ROOT, 'package.json'), 'utf-8'),
    ) as ExtensionPackageJson;
}

suite('Native contribution registration', () => {
    test('registers the built-in MetaFlow capability through native VS Code contribution points', () => {
        const manifest = readPackageJson();
        const contributions = manifest.contributes;
        const participant = contributions?.chatParticipants?.find(
            (entry) => entry.id === 'dynfxdigital.metaflow-ai.metaflow',
        );

        assert.ok(
            manifest.activationEvents?.includes(
                'onChatParticipant:dynfxdigital.metaflow-ai.metaflow',
            ),
            'expected the MetaFlow participant activation event',
        );
        assert.ok(participant, 'expected the native MetaFlow chat participant');
        assert.strictEqual(participant?.name, 'metaflow');
        assert.deepStrictEqual(
            participant?.commands?.map((command) => command.name),
            ['review', 'author', 'diagnose'],
        );

        for (const [kind, entries] of [
            ['agents', contributions?.chatAgents],
            ['instructions', contributions?.chatInstructions],
            ['prompt files', contributions?.chatPromptFiles],
            ['skills', contributions?.chatSkills],
        ] as const) {
            assert.ok(entries && entries.length > 0, `expected native ${kind} contributions`);
            for (const entry of entries ?? []) {
                const assetPath = path.resolve(EXTENSION_ROOT, entry.path);
                assert.ok(fs.existsSync(assetPath), `expected contribution asset: ${entry.path}`);
                assert.ok(entry.when, `expected a visibility condition for ${entry.path}`);
                assert.match(entry.when, /metaflow\.builtIn\.enabled/);
            }
        }
    });

    test('maps built-in repository and capability state to contribution context keys', () => {
        const state: BuiltInCapabilityRuntimeState = {
            enabled: true,
            layerEnabled: true,
            synchronizedFiles: [],
            layerStates: {
                'capabilities/metadata-authoring/github-copilot-metadata-authoring': false,
                'capabilities/metadata-authoring/claude-code-metadata-authoring': true,
            },
            sourceId: 'dynfxdigital.metaflow-ai',
            sourceDisplayName: 'MetaFlow',
        };

        const values = buildNativeContributionContextValues(state);

        assert.strictEqual(values[METAFLOW_NATIVE_CONTEXT_KEYS.enabled], true);
        assert.strictEqual(values[METAFLOW_NATIVE_CONTEXT_KEYS.metaflow], true);
        assert.strictEqual(
            values[METAFLOW_NATIVE_CONTEXT_KEYS.githubCopilotMetadataAuthoring],
            false,
        );
        assert.strictEqual(
            values[METAFLOW_NATIVE_CONTEXT_KEYS.claudeCodeMetadataAuthoring],
            true,
        );
        assert.strictEqual(
            values[METAFLOW_NATIVE_CONTEXT_KEYS.codexMetadataAuthoring],
            true,
        );

        const rootDisabledValues = buildNativeContributionContextValues({
            ...state,
            layerEnabled: false,
            layerStates: {
                ...state.layerStates,
                'capabilities/metadata-authoring/github-copilot-metadata-authoring': true,
            },
        });
        assert.strictEqual(rootDisabledValues[METAFLOW_NATIVE_CONTEXT_KEYS.enabled], true);
        assert.strictEqual(rootDisabledValues[METAFLOW_NATIVE_CONTEXT_KEYS.metaflow], false);
        assert.strictEqual(
            rootDisabledValues[METAFLOW_NATIVE_CONTEXT_KEYS.githubCopilotMetadataAuthoring],
            true,
        );

        const independentlyDefaultedValues = buildNativeContributionContextValues({
            ...state,
            layerEnabled: false,
            layerStates: {},
        });
        assert.strictEqual(
            independentlyDefaultedValues[METAFLOW_NATIVE_CONTEXT_KEYS.metaflow],
            false,
        );
        assert.strictEqual(
            independentlyDefaultedValues[METAFLOW_NATIVE_CONTEXT_KEYS.githubCopilotMetadataAuthoring],
            true,
        );
        assert.strictEqual(
            independentlyDefaultedValues[METAFLOW_NATIVE_CONTEXT_KEYS.claudeCodeMetadataAuthoring],
            true,
        );
        assert.strictEqual(
            independentlyDefaultedValues[METAFLOW_NATIVE_CONTEXT_KEYS.codexMetadataAuthoring],
            true,
        );

        const disabledValues = buildNativeContributionContextValues({
            ...state,
            enabled: false,
        });
        assert.ok(Object.values(disabledValues).every((value) => value === false));
    });
});
