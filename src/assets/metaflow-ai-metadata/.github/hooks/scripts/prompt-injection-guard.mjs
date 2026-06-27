#!/usr/bin/env node

const TARGET_PATH_SEGMENTS = [
    '.github/instructions/',
    '.github/prompts/',
    '.github/agents/',
    '.github/skills/',
    '.github/hooks/',
    '.claude/agents/',
    '.claude/rules/',
    '.claude/skills/',
    '.codex/agents/',
    '.codex/rules/',
    '.agents/skills/',
];
const TARGET_FILE_NAMES = new Set([
    'agents.md',
    'agents.override.md',
    'claude.md',
    'gemini.md',
    'copilot-instructions.md',
    'capability.md',
]);
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const BASE64_TOKEN_PATTERN = /\b(?:[A-Za-z0-9+/]{16,}={0,2})\b/g;

const RULES = [
    {
        id: 'override-hierarchy',
        severity: 'deny',
        message: 'Content attempts to override higher-priority instructions or guardrails.',
        regexes: [
            /\bignore\s+(?:all\s+)?previous\s+(?:system\s+)?instructions?\b/i,
            /\b(?:system|prompt)\s+override\b/i,
            /\byou\s+are\s+now\s+(?:in\s+)?developer\s+mode\b/i,
            /\bact\s+as\s+if\s+you(?:'re|\s+are)\s+not\s+bound\s+by\b/i,
        ],
        fuzzyKeywordGroups: [['ignore'], ['instructions', 'instruction']],
    },
    {
        id: 'authority-confusion',
        severity: 'deny',
        message:
            'Content attempts to elevate repository or external text into trusted instructions.',
        regexes: [
            /\bfollow\s+(?:the\s+)?(?:issue|ticket|repository|repo|workspace|log|web(?:\s+page)?|external\s+content)\s+(?:text|content)\s+exactly\b/i,
            /\btreat\s+(?:the\s+)?(?:issue|ticket|repository|repo|workspace|log|web(?:\s+page)?|external\s+content)\s+(?:text|content)\s+as\s+(?:instructions?|commands?|policy)\b/i,
            /\bignore\s+previous\s+rules?\s+if\s+(?:the\s+)?workspace\s+says\s+otherwise\b/i,
        ],
    },
    {
        id: 'prompt-exfiltration',
        severity: 'deny',
        message: 'Content attempts to reveal hidden prompts or internal instructions.',
        regexes: [
            /\b(?:reveal|show|print|dump|repeat)\s+(?:your\s+)?(?:system\s+prompt|hidden\s+prompt|exact\s+instructions?)\b/i,
            /\bwhat\s+were\s+the\s+exact\s+instructions\s+you\s+were\s+given\b/i,
            /\brepeat\s+the\s+text\s+above\s+starting\s+with\b/i,
        ],
        fuzzyKeywordGroups: [
            ['reveal', 'show', 'dump', 'repeat'],
            ['prompt', 'instructions', 'instruction'],
        ],
    },
    {
        id: 'secret-exfiltration',
        severity: 'deny',
        message: 'Content attempts to exfiltrate secrets or sensitive credentials.',
        regexes: [
            /\b(?:print|show|dump|reveal|exfiltrat\w*)\s+(?:the\s+)?(?:api[_\s-]?key|token|password|secret|credential)s?\b/i,
            /\b(?:api[_\s-]?key|token|password|secret|credential)s?\s*[:=]/i,
        ],
    },
    {
        id: 'approval-bypass',
        severity: 'deny',
        message: 'Content attempts to bypass approval, confirmation, or safety checks.',
        regexes: [
            /\b(?:bypass|disable|ignore)\s+(?:approval|approvals|confirmation|confirmations|safety|guardrails?|security\s+checks?)\b/i,
            /\bwithout\s+(?:approval|confirmation)\b/i,
        ],
        fuzzyKeywordGroups: [
            ['bypass', 'disable', 'ignore'],
            ['approval', 'safety', 'guardrails'],
        ],
    },
];

const stdin = await readStdin();
const event = parseJson(stdin) ?? {};
const toolArgs = parseToolArgs(event.toolArgs);
const filePath = extractFirstString([
    toolArgs.filePath,
    toolArgs.path,
    toolArgs.uri,
    toolArgs.targetFile,
    toolArgs.targetPath,
    toolArgs.destination,
    toolArgs.file,
]);

if (!isTargetPath(filePath)) {
    process.exit(0);
}

const candidateContent = extractCandidateContent(toolArgs);
if (!candidateContent) {
    process.exit(0);
}

const findings = scan(candidateContent);
const denyFindings = findings.filter((finding) => finding.severity === 'deny');
if (denyFindings.length === 0) {
    process.exit(0);
}

process.stdout.write(
    JSON.stringify({
        permissionDecision: 'deny',
        permissionDecisionReason: denyFindings.map((finding) => finding.message).join('; '),
    }),
);

function isTargetPath(filePath) {
    const normalized = String(filePath ?? '')
        .replace(/\\/g, '/')
        .trim()
        .toLowerCase();
    if (!normalized) {
        return false;
    }

    const fileName = normalized.split('/').pop() ?? '';
    if (TARGET_FILE_NAMES.has(fileName)) {
        return true;
    }

    return TARGET_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

function extractCandidateContent(toolArgs) {
    const direct = extractFirstString([
        toolArgs.content,
        toolArgs.text,
        toolArgs.body,
        toolArgs.new_str,
        toolArgs.newText,
        toolArgs.replacement,
        toolArgs.insert_text,
        toolArgs.file_text,
    ]);
    if (direct) {
        return direct;
    }

    if (Array.isArray(toolArgs.edits)) {
        return toolArgs.edits
            .map((edit) =>
                extractFirstString([edit?.newText, edit?.text, edit?.content, edit?.replacement]),
            )
            .filter(Boolean)
            .join('\n');
    }

    return '';
}

function scan(content) {
    const normalized = normalize(content);
    const decodedPayloads = extractDecodedBase64Payloads(normalized);
    const tokens = normalized.match(/[a-z0-9_-]+/g) ?? [];
    const findings = [];

    for (const rule of RULES) {
        const matchedByRegex = rule.regexes.some(
            (regex) =>
                regex.test(normalized) || decodedPayloads.some((payload) => regex.test(payload)),
        );
        const matchedByFuzzy =
            (rule.fuzzyKeywordGroups ?? []).length > 0 &&
            rule.fuzzyKeywordGroups.every((group) =>
                group.some((candidate) =>
                    tokens.some(
                        (token) =>
                            token === candidate || isSimpleTypoglycemiaVariant(token, candidate),
                    ),
                ),
            );

        if (matchedByRegex || matchedByFuzzy) {
            findings.push({ id: rule.id, severity: rule.severity, message: rule.message });
        }
    }

    return findings;
}

function normalize(value) {
    return String(value)
        .replace(ZERO_WIDTH_PATTERN, '')
        .replace(/(.)\1{3,}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function extractDecodedBase64Payloads(content) {
    const matches = content.match(BASE64_TOKEN_PATTERN) ?? [];
    const decoded = [];
    for (const candidate of matches) {
        if (candidate.length % 4 !== 0) {
            continue;
        }
        try {
            const text = Buffer.from(candidate, 'base64').toString('utf-8').trim();
            if (!text || !looksMostlyPrintable(text)) {
                continue;
            }
            decoded.push(normalize(text));
        } catch {
            continue;
        }
    }
    return decoded;
}

function looksMostlyPrintable(value) {
    const printable = value.match(/[\x20-\x7E\r\n\t]/g)?.length ?? 0;
    return printable / value.length >= 0.85;
}

function isSimpleTypoglycemiaVariant(token, target) {
    if (token.length !== target.length || token.length < 3) {
        return false;
    }

    return (
        token[0] === target[0] &&
        token[token.length - 1] === target[target.length - 1] &&
        sortMiddle(token) === sortMiddle(target)
    );
}

function sortMiddle(value) {
    return value.slice(1, -1).split('').sort().join('');
}

function extractFirstString(values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }
    return '';
}

function parseToolArgs(value) {
    if (!value) {
        return {};
    }
    if (typeof value === 'string') {
        return parseJson(value) ?? {};
    }
    if (typeof value === 'object') {
        return value;
    }
    return {};
}

function parseJson(value) {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
    });
}
