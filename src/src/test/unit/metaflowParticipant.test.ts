import * as assert from 'assert';
import { buildMetaFlowChatResponse } from '../../chat/metaflowParticipantText';

suite('MetaFlow chat participant', () => {
    test('builds focused review guidance with request context', () => {
        const response = buildMetaFlowChatResponse('review', 'capability: metadata-authoring');

        assert.ok(response.includes('## Capability review'));
        assert.ok(response.includes('metaflow-capability-review'));
        assert.ok(response.includes('capability: metadata-authoring'));
    });

    test('provides general guidance when no participant command is selected', () => {
        const response = buildMetaFlowChatResponse(undefined, '');

        assert.ok(response.includes('## MetaFlow capability assistance'));
        assert.ok(response.includes('/review'));
        assert.ok(!response.includes('Request context:'));
    });

    test('sanitizes inline code delimiters in reflected request context', () => {
        const response = buildMetaFlowChatResponse('diagnose', '`unsafe` context');

        assert.ok(response.includes("Request context: `'unsafe' context`"));
        assert.ok(!response.includes('`unsafe` context'));
    });
});
