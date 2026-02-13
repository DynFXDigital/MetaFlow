#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');

const reportPath = '.eslint-report.json';
const topN = Number(process.env.LINT_SUMMARY_TOP || 5);

function safeExit(message) {
    console.log(message);
    process.exit(0);
}

try {
    if (!fs.existsSync(reportPath)) {
        safeExit('[lint-summary] report missing; run npm run lint:monitor');
    }

    const rows = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (!Array.isArray(rows)) {
        safeExit('[lint-summary] invalid report format; expected array');
    }

    const totals = {
        files: rows.length,
        errors: 0,
        warnings: 0,
    };

    const warningRules = new Map();

    for (const row of rows) {
        totals.errors += Number(row.errorCount || 0) + Number(row.fatalErrorCount || 0);
        totals.warnings += Number(row.warningCount || 0);

        const messages = Array.isArray(row.messages) ? row.messages : [];
        for (const message of messages) {
            if (Number(message.severity) !== 1) {
                continue;
            }

            const ruleId = message.ruleId || 'unknown-rule';
            warningRules.set(ruleId, (warningRules.get(ruleId) || 0) + 1);
        }
    }

    console.log(`[lint-summary] files=${totals.files} errors=${totals.errors} warnings=${totals.warnings}`);

    const topRules = [...warningRules.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, topN)
        .map(([rule, count]) => `${rule}:${count}`);

    if (topRules.length === 0) {
        console.log('[lint-summary] top-warning-rules=none');
    } else {
        console.log(`[lint-summary] top-warning-rules=${topRules.join(', ')}`);
    }
} catch (error) {
    const message = error && error.message ? error.message : String(error);
    safeExit(`[lint-summary] unable to parse report: ${message}`);
}