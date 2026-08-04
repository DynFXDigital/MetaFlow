import fs from 'node:fs';
import path from 'node:path';

const versionIndex = process.argv.indexOf('--version');
const version = versionIndex >= 0 ? process.argv[versionIndex + 1] : undefined;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
if (!match) {
    throw new Error('Use --version X.Y.Z.');
}
const previousPrereleaseMinor = Number(match[2]) - 1;
const forbiddenHeading = new RegExp(`^##\\s+\\[?\\d+\\.${previousPrereleaseMinor}\\.\\d+\\]?`, 'm');
const changelogFiles = [
    'CHANGELOG.md',
    'src/CHANGELOG.md',
    'packages/engine/CHANGELOG.md',
    'packages/cli/CHANGELOG.md',
];

for (const relativePath of changelogFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    if (/^##\s+\[?Unreleased\]?\s*$/im.test(content)) {
        throw new Error(`${relativePath} retains an Unreleased section on a stable release.`);
    }
    if (forbiddenHeading.test(content)) {
        throw new Error(
            `${relativePath} retains v0.${previousPrereleaseMinor}.x prerelease headings.`,
        );
    }
    if (!new RegExp(`^##\\s+\\[?${version.replaceAll('.', '\\.')}\\]?`, 'm').test(content)) {
        throw new Error(`${relativePath} does not contain a ${version} release heading.`);
    }
}

const releaseNotesPath = path.join('docs', 'releases', `v${version}.md`);
if (!fs.existsSync(path.join(process.cwd(), releaseNotesPath))) {
    throw new Error(`${releaseNotesPath} is required for a stable release.`);
}

console.log(`Stable changelog checks passed for ${version}.`);
