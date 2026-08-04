/**
 * Deterministic prompt-injection scanner for agent-facing metadata.
 *
 * This module stays data-driven on purpose so future hardening mostly adds or
 * tunes rule definitions instead of branching control flow.
 */

export type PromptInjectionSeverity = 'warn' | 'deny';

export type PromptInjectionRuleId =
    | 'override-hierarchy'
    | 'authority-confusion'
    | 'prompt-exfiltration'
    | 'secret-exfiltration'
    | 'approval-bypass'
    | 'destructive-tool-bypass';

export interface PromptInjectionRuleDefinition {
    id: PromptInjectionRuleId;
    severity: PromptInjectionSeverity;
    message: string;
    regexes: RegExp[];
    fuzzyKeywordGroups?: string[][];
}

export interface PromptInjectionFinding {
    ruleId: PromptInjectionRuleId;
    severity: PromptInjectionSeverity;
    message: string;
}

export interface PromptInjectionScanOptions {
    filePath?: string;
    content: string;
}

const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const BASE64_TOKEN_PATTERN = /(?:^|[^A-Za-z0-9+/=])([A-Za-z0-9+/]{16,}={0,2})(?=$|[^A-Za-z0-9+/=])/g;
const TARGETABLE_PATH_SEGMENTS = [
    '.github/instructions/',
    '.github/prompts/',
    '.github/commands/',
    '.claude/commands/',
    '.codex/commands/',
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
const TARGETABLE_FILE_NAMES = new Set([
    'agents.md',
    'agents.override.md',
    'claude.md',
    'gemini.md',
    'copilot-instructions.md',
    'capability.md',
]);

const PROMPT_INJECTION_RULES: PromptInjectionRuleDefinition[] = [
    {
        id: 'override-hierarchy',
        severity: 'deny',
        message:
            'Content attempts to override higher-priority instructions or established guardrails.',
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
    {
        id: 'destructive-tool-bypass',
        severity: 'warn',
        message:
            'Content combines destructive-action language with weakened approval expectations.',
        regexes: [
            /\b(?:rm\s+-rf|git\s+reset\s+--hard|delete\s+all\s+user\s+data)\b/i,
            /\b(?:run|execute|call)\s+(?:destructive|dangerous)\s+commands?\b/i,
        ],
    },
];

export function getPromptInjectionRulePack(): readonly PromptInjectionRuleDefinition[] {
    return PROMPT_INJECTION_RULES;
}

export function isPromptInjectionTargetPath(filePath: string | undefined): boolean {
    const normalized = normalizeForPath(filePath);
    if (!normalized) {
        return false;
    }

    if (TARGETABLE_FILE_NAMES.has(normalized.split('/').pop() ?? '')) {
        return true;
    }

    return TARGETABLE_PATH_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function scanPromptInjectionContent(
    options: PromptInjectionScanOptions,
): PromptInjectionFinding[] {
    if (options.filePath && !isPromptInjectionTargetPath(options.filePath)) {
        return [];
    }

    const contentToScan = maskLabeledExampleBlocks(options.content);
    const normalized = normalizeForScanning(contentToScan);
    const fuzzyTokens = tokenizeForFuzzyMatching(normalized);
    const decodedPayloads = extractDecodedBase64Payloads(contentToScan);

    const findings = new Map<PromptInjectionRuleId, PromptInjectionFinding>();

    for (const rule of PROMPT_INJECTION_RULES) {
        const matchedByRegex = rule.regexes.some(
            (regex) =>
                regex.test(normalized) || decodedPayloads.some((payload) => regex.test(payload)),
        );
        const matchedByFuzzy = matchesFuzzyKeywordGroups(rule.fuzzyKeywordGroups, fuzzyTokens);

        if (!matchedByRegex && !matchedByFuzzy) {
            continue;
        }

        findings.set(rule.id, {
            ruleId: rule.id,
            severity: rule.severity,
            message: rule.message,
        });
    }

    return Array.from(findings.values());
}

function normalizeForPath(value: string | undefined): string {
    return (value ?? '').replace(/\\/g, '/').trim().toLowerCase();
}

function normalizeForScanning(content: string): string {
    return content
        .replace(ZERO_WIDTH_PATTERN, '')
        .replace(/(.)\1{3,}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function maskLabeledExampleBlocks(content: string): string {
    const lines = content.split(/\r?\n/);
    const masked: string[] = [];
    let insideMaskableFence = false;
    let priorLabelWasMaskable = false;

    for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        const isFence = trimmed.startsWith('```');

        if (isFence && priorLabelWasMaskable && !insideMaskableFence) {
            insideMaskableFence = true;
            masked.push('```');
            continue;
        }

        if (isFence && insideMaskableFence) {
            insideMaskableFence = false;
            priorLabelWasMaskable = false;
            masked.push('```');
            continue;
        }

        if (!insideMaskableFence) {
            priorLabelWasMaskable =
                /(example|untrusted input|adversarial example|test attack)/i.test(line);
        }

        masked.push(insideMaskableFence ? '[masked example content]' : line);

        if (!trimmed) {
            priorLabelWasMaskable = false;
        }
    }

    return masked.join('\n');
}

function tokenizeForFuzzyMatching(content: string): string[] {
    return content.match(/[a-z0-9_-]+/g) ?? [];
}

function matchesFuzzyKeywordGroups(groups: string[][] | undefined, tokens: string[]): boolean {
    if (!groups || groups.length === 0) {
        return false;
    }

    return groups.every((group) =>
        group.some((candidate) =>
            tokens.some(
                (token) => token === candidate || isSimpleTypoglycemiaVariant(token, candidate),
            ),
        ),
    );
}

function isSimpleTypoglycemiaVariant(token: string, target: string): boolean {
    if (token.length !== target.length || token.length < 3) {
        return false;
    }

    return (
        token[0] === target[0] &&
        token[token.length - 1] === target[target.length - 1] &&
        sortMiddle(token) === sortMiddle(target)
    );
}

function sortMiddle(value: string): string {
    return value.slice(1, -1).split('').sort().join('');
}

function extractDecodedBase64Payloads(content: string): string[] {
    const matches = Array.from(content.matchAll(BASE64_TOKEN_PATTERN), (match) => match[1]);
    const decoded: string[] = [];

    for (const candidate of matches) {
        if (candidate.length % 4 !== 0) {
            continue;
        }

        try {
            const text = Buffer.from(candidate, 'base64').toString('utf-8').trim();
            if (!text || !looksMostlyPrintable(text)) {
                continue;
            }
            decoded.push(normalizeForScanning(text));
        } catch {
            continue;
        }
    }

    return decoded;
}

function looksMostlyPrintable(value: string): boolean {
    const printableCharacters = value.match(/[\x20-\x7E\r\n\t]/g)?.length ?? 0;
    return printableCharacters / value.length >= 0.85;
}
