import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type ExtensionPackageJson = {
    main?: string;
    activationEvents?: string[];
    scripts?: Record<string, string>;
    contributes?: {
        configuration?: {
            properties?: Record<string, {
                default?: unknown;
                enum?: string[];
            }>;
        };
    };
};

const EXTENSION_ROOT = path.resolve(__dirname, '../../..');

suite('Extension Packaging Regression Guards', () => {
    test('package.json points extension main to dist bundle', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
        ) as ExtensionPackageJson;

        assert.strictEqual(packageJson.main, './dist/extension.js');
    });

    test('activation events include unified config location', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
        ) as ExtensionPackageJson;

        const activationEvents = packageJson.activationEvents ?? [];
        assert.ok(activationEvents.includes('onStartupFinished'));
        assert.ok(activationEvents.includes('workspaceContains:**/.metaflow/config.jsonc'));
    });

    test('vscode prepublish uses bundle script', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
        ) as ExtensionPackageJson;

        assert.strictEqual(packageJson.scripts?.['vscode:prepublish'], 'npm run bundle');
    });

    test('esbuild config prefers ESM module entrypoints', () => {
        const esbuildConfigPath = path.join(EXTENSION_ROOT, 'esbuild.js');
        const esbuildConfigSource = fs.readFileSync(esbuildConfigPath, 'utf-8');

        assert.ok(
            esbuildConfigSource.includes("mainFields: ['module', 'main']"),
            'Expected esbuild config to contain mainFields preferring module over main'
        );
    });

    test('initConfig uses vscode workspace.fs API', () => {
        const initConfigPath = path.join(EXTENSION_ROOT, 'src', 'commands', 'initConfig.ts');
        const initConfigSource = fs.readFileSync(initConfigPath, 'utf-8');

        assert.ok(initConfigSource.includes('vscode.workspace.fs.writeFile'));
        assert.ok(initConfigSource.includes('vscode.workspace.fs.stat'));
        assert.ok(!initConfigSource.includes('fs.writeFileSync('));
    });

    test('repo update interval setting exposes expected preset values', () => {
        const packageJsonPath = path.join(EXTENSION_ROOT, 'package.json');
        const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, 'utf-8')
        ) as ExtensionPackageJson;

        const intervalSetting = packageJson.contributes?.configuration?.properties?.['metaflow.repoUpdateCheckInterval'];
        assert.ok(intervalSetting, 'Expected metaflow.repoUpdateCheckInterval setting to be contributed');
        assert.strictEqual(intervalSetting?.default, 'daily');
        assert.deepStrictEqual(intervalSetting?.enum, ['hourly', 'daily', 'weekly', 'monthly']);
    });
});
