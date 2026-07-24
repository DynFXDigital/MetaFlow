import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectAgentPluginHookWarnings } from '../src';
import type { ArtifactClassification, EffectiveFile } from '../src';

function writeFixture(rootPath: string, relativePath: string, content: string): string {
    const filePath = path.join(rootPath, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

function effectiveFile(
    rootPath: string,
    sourceRelativePath: string,
    effectiveRelativePath = sourceRelativePath,
    classification: ArtifactClassification = 'plugin',
): EffectiveFile {
    return {
        relativePath: effectiveRelativePath,
        sourcePath: path.join(rootPath, ...sourceRelativePath.split('/')),
        sourceLayer: 'test-capability',
        sourceCapabilityId: 'test-capability',
        classification,
    };
}

function warningCodes(files: EffectiveFile[]): string[] {
    return collectAgentPluginHookWarnings(files).map((warning) => warning.code);
}

describe('collectAgentPluginHookWarnings', () => {
    let rootPath: string;

    beforeEach(() => {
        rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-plugin-hooks-'));
    });

    afterEach(() => {
        fs.rmSync(rootPath, { recursive: true, force: true });
    });

    it('accepts the emitted OpenPlugin shim pattern even with a root fallback manifest', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(rootPath, 'plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'node "${PLUGIN_ROOT}/scripts/guard.mjs"',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.mjs', 'export {};');

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.mjs'),
        ]);

        assert.deepStrictEqual(warnings, []);
    });

    it('warns when a root Copilot plugin keeps an undiscoverable workspace-relative hook script', () => {
        writeFixture(rootPath, 'plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            '.github/hooks/protected-branch.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'pwsh -NoProfile -File ./.github/hooks/scripts/guard.ps1',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, '.github/hooks/scripts/guard.ps1', 'exit 0');

        const codes = warningCodes([
            effectiveFile(rootPath, 'plugin.json'),
            effectiveFile(
                rootPath,
                '.github/hooks/protected-branch.json',
                'hooks/protected-branch.json',
            ),
            effectiveFile(rootPath, '.github/hooks/scripts/guard.ps1', 'hooks/scripts/guard.ps1'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CONFIG_UNDISCOVERABLE'));
        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT'));
    });

    it('does not apply plugin-root rules to settings-injected hooks', () => {
        writeFixture(
            rootPath,
            '.github/hooks/repository.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'pwsh -File ./.github/hooks/scripts/guard.ps1',
                        },
                    ],
                },
            }),
        );

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(
                rootPath,
                '.github/hooks/repository.json',
                'hooks/repository.json',
                'settings',
            ),
        ]);

        assert.deepStrictEqual(warnings, []);
    });

    it('validates a settings-classified hook when another artifact registers its plugin root', () => {
        writeFixture(rootPath, 'plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            '.github/hooks/repository.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'pwsh -File ./.github/hooks/scripts/guard.ps1',
                        },
                    ],
                },
            }),
        );

        const codes = warningCodes([
            effectiveFile(rootPath, 'plugin.json'),
            effectiveFile(
                rootPath,
                '.github/hooks/repository.json',
                'hooks/repository.json',
                'settings',
            ),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CONFIG_UNDISCOVERABLE'));
        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT'));
    });

    it('uses manifest precedence when validating plugin-root tokens', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(rootPath, 'plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(rootPath, '.claude-plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs"',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.mjs', 'export {};');

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'plugin.json'),
            effectiveFile(rootPath, '.claude-plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.mjs'),
        ]);

        assert.ok(
            warnings.some(
                (entry) =>
                    entry.code === 'AGENT_PLUGIN_HOOK_ROOT_TOKEN_UNSUPPORTED' &&
                    entry.message.includes('.plugin/plugin.json'),
            ),
        );
    });

    it('ignores inline hooks from inactive lower-precedence manifests', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            '.claude-plugin/plugin.json',
            JSON.stringify({
                name: 'guard',
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-only.mjs"',
                        },
                    ],
                },
            }),
        );

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, '.claude-plugin/plugin.json'),
        ]);

        assert.deepStrictEqual(warnings, []);
    });

    it('warns when a plugin-root token names a missing packaged target', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'node "${PLUGIN_ROOT}/scripts/missing.mjs"',
                        },
                    ],
                },
            }),
        );

        const codes = warningCodes([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_TARGET_MISSING'));
    });

    it('validates shell-specific plugin-root environment paths', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            powershell: 'pwsh -File "$env:PLUGIN_ROOT/scripts/missing.ps1"',
                        },
                    ],
                },
            }),
        );

        const codes = warningCodes([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_TARGET_MISSING'));
    });

    it('honors an explicit hook config path in the selected manifest', () => {
        writeFixture(
            rootPath,
            '.plugin/plugin.json',
            JSON.stringify({
                name: 'guard',
                hooks: './.github/hooks/custom.json',
            }),
        );
        writeFixture(
            rootPath,
            '.github/hooks/custom.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'pwsh -File "${PLUGIN_ROOT}/.github/hooks/scripts/guard.ps1"',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, '.github/hooks/scripts/guard.ps1', 'exit 0');

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, '.github/hooks/custom.json', 'hooks/custom.json'),
            effectiveFile(rootPath, '.github/hooks/scripts/guard.ps1', 'hooks/scripts/guard.ps1'),
        ]);

        assert.deepStrictEqual(warnings, []);
    });

    it('warns when an explicit manifest hook config path is missing', () => {
        writeFixture(
            rootPath,
            '.plugin/plugin.json',
            JSON.stringify({ name: 'guard', hooks: './hooks/missing.json' }),
        );

        const codes = warningCodes([effectiveFile(rootPath, '.plugin/plugin.json')]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_TARGET_MISSING'));
    });

    it('warns when an explicit manifest hook config path escapes the plugin root', () => {
        writeFixture(
            rootPath,
            '.plugin/plugin.json',
            JSON.stringify({ name: 'guard', hooks: '../outside/hooks.json' }),
        );

        const codes = warningCodes([effectiveFile(rootPath, '.plugin/plugin.json')]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_TARGET_OUTSIDE_ROOT'));
    });

    it('skips ordinary PATH-resolved commands and accepts plugin-root cwd', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        { type: 'command', command: 'eslint --fix' },
                        {
                            type: 'command',
                            command: './scripts/guard.sh',
                            cwd: '${PLUGIN_ROOT}',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.sh', '#!/usr/bin/env bash');

        const warnings = collectAgentPluginHookWarnings([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.sh'),
        ]);

        assert.deepStrictEqual(warnings, []);
    });

    it('warns when plugin-root cwd escapes and does not suppress a relative script warning', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: './scripts/guard.sh',
                            cwd: '${PLUGIN_ROOT}/../outside',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.sh', '#!/usr/bin/env bash');

        const codes = warningCodes([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.sh'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_TARGET_OUTSIDE_ROOT'));
        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT'));
    });

    it('does not skip workspace-relative scripts in compound commands', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: './scripts/guard.sh && echo complete',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.sh', '#!/usr/bin/env bash');

        const codes = warningCodes([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.sh'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT'));
    });

    it('finds a relative script after cmd slash options', () => {
        writeFixture(rootPath, '.plugin/plugin.json', JSON.stringify({ name: 'guard' }));
        writeFixture(
            rootPath,
            'hooks/hooks.json',
            JSON.stringify({
                hooks: {
                    PreToolUse: [
                        {
                            type: 'command',
                            command: 'cmd /d /c .\\scripts\\guard.cmd',
                        },
                    ],
                },
            }),
        );
        writeFixture(rootPath, 'scripts/guard.cmd', '@exit /b 0');

        const codes = warningCodes([
            effectiveFile(rootPath, '.plugin/plugin.json'),
            effectiveFile(rootPath, 'hooks/hooks.json'),
            effectiveFile(rootPath, 'scripts/guard.cmd'),
        ]);

        assert.ok(codes.includes('AGENT_PLUGIN_HOOK_CWD_RELATIVE_SCRIPT'));
    });
});
