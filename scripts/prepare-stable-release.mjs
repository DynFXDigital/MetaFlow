import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changelogFiles = [
    'CHANGELOG.md',
    'src/CHANGELOG.md',
    'packages/engine/CHANGELOG.md',
    'packages/cli/CHANGELOG.md',
];
const packageFiles = [
    'src/package.json',
    'packages/engine/package.json',
    'packages/cli/package.json',
];

function readOption(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseVersion(value, label) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? '');
    if (!match) {
        throw new Error(`${label} must be a semantic version such as 0.6.0.`);
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function parseSections(content) {
    const matches = [...content.matchAll(/^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+.*)?$/gm)];
    if (matches.length === 0) {
        throw new Error('Expected at least one level-two changelog heading.');
    }
    return {
        preamble: content.slice(0, matches[0].index).trimEnd(),
        sections: matches.map((match, index) => ({
            version: match[1],
            body: content.slice(match.index + match[0].length, matches[index + 1]?.index).trim(),
        })),
    };
}

function normalizeChangelog(filePath, promotedVersion, prereleaseMinor, correctionVersion) {
    const source = fs.readFileSync(filePath, 'utf8');
    const { preamble, sections } = parseSections(source);
    const prereleasePattern = new RegExp(`^\\d+\\.${prereleaseMinor}\\.\\d+$`);
    const collapsed = sections.filter(
        (section) => section.version === 'Unreleased' || prereleasePattern.test(section.version),
    );
    const retained = sections.filter(
        (section) => section.version !== 'Unreleased' && !prereleasePattern.test(section.version),
    );
    const existingPromotion = retained.find((section) => section.version === promotedVersion);
    const existingCorrection = retained.find((section) => section.version === correctionVersion);
    const promotionBodies = [...(existingPromotion ? [existingPromotion] : []), ...collapsed]
        .map((section) => section.body)
        .filter(Boolean);

    if (!existingPromotion && promotionBodies.length === 0) {
        throw new Error(
            `${filePath} has no Unreleased or v0.${prereleaseMinor}.x content to promote.`,
        );
    }

    const promotion = {
        version: promotedVersion,
        body:
            promotionBodies.length > 0
                ? promotionBodies.join('\n\n')
                : '### Stable promotion\n\n- Promoted the prerelease release notes to stable.',
    };
    const withoutPromotion = retained.filter(
        (section) => section.version !== promotedVersion && section.version !== correctionVersion,
    );
    const correction =
        correctionVersion === promotedVersion
            ? []
            : [
                  {
                      version: correctionVersion,
                      body:
                          existingCorrection?.body ??
                          '### Fixed\n\n- Normalize the stable changelog after the v0.4.0 promotion.',
                  },
              ];
    const nextSections = [...correction, promotion, ...withoutPromotion];
    const rendered = nextSections
        .map((section) => `## ${section.version}\n\n${section.body}`.trimEnd())
        .join('\n\n');
    fs.writeFileSync(filePath, `${preamble}\n\n${rendered}\n`, 'utf8');
}

function updateVersions(releaseVersion) {
    for (const relativePath of packageFiles) {
        const filePath = path.join(root, relativePath);
        const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        packageJson.version = releaseVersion;
        fs.writeFileSync(filePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
    }

    const lockPath = path.join(root, 'package-lock.json');
    const lockfile = fs.readFileSync(lockPath, 'utf8');
    let foundWorkspaceVersion = false;
    const nextLockfile = lockfile.replace(
        /("(?:packages\/cli|packages\/engine|src)":\s*\{\s*"name":\s*"[^"]+",\s*"version":\s*")\d+\.\d+\.\d+(")/g,
        (_match, prefix, suffix) => {
            foundWorkspaceVersion = true;
            return `${prefix}${releaseVersion}${suffix}`;
        },
    );
    if (!foundWorkspaceVersion) {
        throw new Error('Did not find workspace package versions in package-lock.json.');
    }
    if (nextLockfile !== lockfile) {
        fs.writeFileSync(lockPath, nextLockfile, 'utf8');
    }
}

const promotedVersion = readOption('--promote-version');
const releaseVersion = readOption('--release-version') ?? promotedVersion;
const promoted = parseVersion(promotedVersion, '--promote-version');
const release = parseVersion(releaseVersion, '--release-version');

if (promoted.minor % 2 !== 0 || release.minor !== promoted.minor) {
    throw new Error('Stable promotion and release versions must use the same even minor lane.');
}
if (release.patch < promoted.patch) {
    throw new Error('The corrective release patch cannot precede the promoted stable version.');
}

for (const relativePath of changelogFiles) {
    normalizeChangelog(
        path.join(root, relativePath),
        promotedVersion,
        promoted.minor - 1,
        releaseVersion,
    );
}
updateVersions(releaseVersion);
console.log(
    `Prepared stable changelogs for ${promotedVersion} and release version ${releaseVersion}.`,
);
