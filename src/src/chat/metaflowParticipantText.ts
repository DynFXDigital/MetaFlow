type MetaFlowChatCommand = 'review' | 'author' | 'diagnose';

function normalizePrompt(prompt: string): string {
    return prompt.replace(/`/g, "'").replace(/\s+/g, ' ').trim();
}

function commandHeading(command: string | undefined): string {
    switch (command as MetaFlowChatCommand | undefined) {
        case 'review':
            return 'Capability review';
        case 'author':
            return 'Capability authoring';
        case 'diagnose':
            return 'MetaFlow diagnostics';
        default:
            return 'MetaFlow capability assistance';
    }
}

function commandGuidance(command: string | undefined): string {
    switch (command as MetaFlowChatCommand | undefined) {
        case 'review':
            return 'Use the `metaflow-capability-review` skill or the `metaflow-review-layer` prompt for a structured review.';
        case 'author':
            return 'Use the `ai-metadata` skill and the relevant authoring instructions to make the smallest safe metadata change.';
        case 'diagnose':
            return 'Use `#metaflowDiagnostics` or the MetaFlow Diagnostics command to inspect active warnings, governance, and registration state.';
        default:
            return 'Use `/review`, `/author`, or `/diagnose` for a focused workflow, or invoke one of the contributed MetaFlow skills and prompts directly.';
    }
}

export function buildMetaFlowChatResponse(command: string | undefined, prompt: string): string {
    const normalizedPrompt = normalizePrompt(prompt);
    const requestContext = normalizedPrompt
        ? `\n\nRequest context: \`${normalizedPrompt}\``
        : '';

    return [
        `## ${commandHeading(command)}`,
        '',
        'MetaFlow keeps the capability repository and capability model as the source of truth while exposing native VS Code Chat registrations for interactive use.',
        '',
        commandGuidance(command),
        requestContext,
    ].join('\n');
}
