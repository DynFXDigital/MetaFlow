#!/usr/bin/env node
/**
 * One-shot codemod: harden GUI suites against cross-suite config contamination.
 *
 * For each given suite file:
 *  1. Adds `restoreGoldenConfig` to the metaflowGuiHelpers named import (idempotent).
 *  2. Prepends `restoreGoldenConfig(CONFIG_PATH);` before the
 *     `originalConfig = fs.readFileSync(CONFIG_PATH, ...)` snapshot in before(),
 *     so the suite self-heals a dirty live config on entry and seeds its restore
 *     baseline from the immutable golden copy.
 *
 * Usage: node scripts/apply-golden-guard.js <file...>
 */
const fs = require('fs');

const IMPORT_CLOSE = "} from './helpers/metaflowGuiHelpers';";
const SNAPSHOT = "        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');";
const GUARDED =
    "        restoreGoldenConfig(CONFIG_PATH);\n" +
    "        originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');";

let changed = 0;
let skipped = 0;

for (const file of process.argv.slice(2)) {
    let src = fs.readFileSync(file, 'utf-8');
    const original = src;

    if (!src.includes(SNAPSHOT)) {
        console.log(`skip (no snapshot line): ${file}`);
        skipped++;
        continue;
    }

    // 1. Add the import if missing.
    if (!/\brestoreGoldenConfig\b/.test(src)) {
        const idx = src.indexOf(IMPORT_CLOSE);
        if (idx === -1) {
            console.log(`WARN (no helper import close): ${file}`);
            skipped++;
            continue;
        }
        src = src.slice(0, idx) + '    restoreGoldenConfig,\n' + src.slice(idx);
    }

    // 2. Guard the snapshot (idempotent — only if not already guarded).
    if (!src.includes('restoreGoldenConfig(CONFIG_PATH);')) {
        src = src.replace(SNAPSHOT, GUARDED);
    }

    if (src !== original) {
        fs.writeFileSync(file, src, 'utf-8');
        console.log(`patched: ${file}`);
        changed++;
    } else {
        console.log(`unchanged: ${file}`);
        skipped++;
    }
}

console.log(`\nDone. patched=${changed} skipped=${skipped}`);
