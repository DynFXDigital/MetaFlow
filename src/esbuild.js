const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcher = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            for (const { text, location } of result.errors) {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            }
            console.log('[watch] build finished');
        });
    },
};

const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    mainFields: ['module', 'main'],
    format: 'cjs',
    platform: 'node',
    target: 'ES2022',
    sourcemap: true,
    minify: production,
    plugins: [esbuildProblemMatcher],
};

if (watch) {
    esbuild.context(buildOptions).then(ctx => ctx.watch());
} else {
    esbuild.build(buildOptions).catch(() => process.exit(1));
}
