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

const notesPath = path.join(process.cwd(), 'docs', 'releases', `v${version}.md`);
if (!fs.existsSync(notesPath)) {
    throw new Error(`Create docs/releases/v${version}.md before publishing the release.`);
}

const notes = fs.readFileSync(notesPath, 'utf8').trim();
if (!notes) {
    throw new Error(`${path.relative(process.cwd(), notesPath)} must contain user-facing notes.`);
}

fs.writeFileSync(output, `${notes}\n`, 'utf8');
