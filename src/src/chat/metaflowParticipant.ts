import * as vscode from 'vscode';
import { buildMetaFlowChatResponse } from './metaflowParticipantText';

export const METAFLOW_CHAT_PARTICIPANT_ID = 'dynfxdigital.metaflow-ai.metaflow';

export function createMetaFlowChatParticipant(
    isEnabled: () => boolean = () => true,
): vscode.ChatParticipant {
    const participant = vscode.chat.createChatParticipant(
        METAFLOW_CHAT_PARTICIPANT_ID,
        (request, _context, response) => {
            if (!isEnabled()) {
                response.markdown(
                    'The built-in MetaFlow capability is disabled. Enable the built-in MetaFlow repo in the MetaFlow view to use this assistant.',
                );
                return;
            }

            response.markdown(buildMetaFlowChatResponse(request.command, request.prompt));
            response.button({
                command: 'metaflow.openLayersFilter',
                title: 'Open MetaFlow Capabilities',
            });
            response.button({
                command: 'metaflow.getDiagnosticsSnapshot',
                title: 'Inspect Diagnostics',
            });
        },
    );
    participant.iconPath = new vscode.ThemeIcon('layers');
    return participant;
}
