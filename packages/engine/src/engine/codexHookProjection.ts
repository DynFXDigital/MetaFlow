/**
 * Codex hook projection helpers.
 *
 * Canonical MetaFlow hooks describe lifecycle automation and policy
 * requirements. Codex hook projection emits only the command-hook subset that
 * maps directly to Codex project hook JSON.
 */

import { HookMetadata, HookTriggerPhase } from './types';

const CODEX_HOOKS_DESTINATION = '.codex/hooks.json';

type CodexHookEvent = 'PreToolUse' | 'PostToolUse';

interface CodexCommandHook {
    type: 'command';
    command: string;
}

interface CodexHookMatcherBlock {
    matcher: string;
    hooks: CodexCommandHook[];
}

interface CodexHooksFile {
    hooks: Partial<Record<CodexHookEvent, CodexHookMatcherBlock[]>>;
}

const CODEX_EVENT_BY_TRIGGER_PHASE: Partial<Record<HookTriggerPhase, CodexHookEvent>> = {
    preToolUse: 'PreToolUse',
    postToolUse: 'PostToolUse',
};

function hasBlockingWarnings(hook: HookMetadata): boolean {
    return hook.warnings.some((warning) => warning.severity === 'error');
}

function targetsCodex(hook: HookMetadata): boolean {
    return hook.targets.length === 0 || hook.targets.includes('codex');
}

function quoteShellToken(token: string): string {
    if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(token)) {
        return token;
    }
    return `'${token.replace(/'/g, "'\\''")}'`;
}

function renderCommandLine(hook: HookMetadata): string {
    const parts = [hook.command ?? '', ...hook.args].filter((part) => part.length > 0);
    return parts.map(quoteShellToken).join(' ');
}

function compareHooks(left: HookMetadata, right: HookMetadata): number {
    return (
        left.triggerPhase.localeCompare(right.triggerPhase) ||
        left.id.localeCompare(right.id) ||
        left.manifestPath.localeCompare(right.manifestPath)
    );
}

export function codexHookProjectionDestination(hooks: HookMetadata[]): string | undefined {
    return hooks.some(isCodexHookProjectable) ? CODEX_HOOKS_DESTINATION : undefined;
}

export function isCodexHookProjectable(hook: HookMetadata): boolean {
    return (
        !hasBlockingWarnings(hook) &&
        targetsCodex(hook) &&
        hook.invocationType === 'command' &&
        Boolean(hook.command) &&
        CODEX_EVENT_BY_TRIGGER_PHASE[hook.triggerPhase] !== undefined
    );
}

export function renderCodexHooksJson(hooks: HookMetadata[]): string {
    const projected: CodexHooksFile = { hooks: {} };

    for (const hook of hooks.filter(isCodexHookProjectable).sort(compareHooks)) {
        const event = CODEX_EVENT_BY_TRIGGER_PHASE[hook.triggerPhase];
        if (!event) {
            continue;
        }
        const blocks = projected.hooks[event] ?? [];
        blocks.push({
            matcher: '*',
            hooks: [
                {
                    type: 'command',
                    command: renderCommandLine(hook),
                },
            ],
        });
        projected.hooks[event] = blocks;
    }

    return `${JSON.stringify(projected, null, 2)}\n`;
}

export const codexHookProjectionConstants = {
    CODEX_HOOKS_DESTINATION,
};
