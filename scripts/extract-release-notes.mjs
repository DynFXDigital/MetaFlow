import fs from 'node:fs';
import path from 'node:path';

function readOption(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

const version = readOption('--version');
const output = readOption('--output');
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error('Use --version X.Y.Z.');
}
if (!output) {
    throw new Error('Use --output <path>.');
}

const changelog = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
const heading = new RegExp(`^##\\s+\\[?${version.replaceAll('.', '\\.')}\\]?[^\\n]*$`, 'm');
const match = heading.exec(changelog);
if (!match) {
    throw new Error(`CHANGELOG.md does not contain a ${version} release entry.`);
}

const bodyStart = match.index + match[0].length;
const nextHeading = /^##\s+/gm;
nextHeading.lastIndex = bodyStart;
const nextMatch = nextHeading.exec(changelog);
const notes = changelog.slice(bodyStart, nextMatch?.index).trim();
if (!notes) {
    throw new Error(`CHANGELOG.md has no user-facing notes for ${version}.`);
}

fs.writeFileSync(output, `${notes}\n`, 'utf8');
