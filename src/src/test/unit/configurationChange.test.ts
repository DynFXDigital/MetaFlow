import * as assert from 'assert';
import { affectsWorkspaceConfiguration } from '../../configurationChange';

suite('Configuration Change', () => {
    test('accepts a workspace-wide change that does not match the active resource', () => {
        const resource = { path: '/workspace/.metaflow/config.jsonc' };
        const calls: Array<{ section: string; resource?: unknown }> = [];
        const event = {
            affectsConfiguration: (section: string, requestedResource?: unknown): boolean => {
                calls.push({ section, resource: requestedResource });
                return requestedResource === undefined;
            },
        };

        assert.strictEqual(
            affectsWorkspaceConfiguration(event, 'metaflow.synchronization', resource),
            true,
        );
        assert.deepStrictEqual(calls, [
            { section: 'metaflow.synchronization', resource: undefined },
        ]);
    });

    test('accepts a resource-scoped change when the workspace-wide check does not match', () => {
        const resource = { path: '/workspace/.metaflow/config.jsonc' };
        const event = {
            affectsConfiguration: (_section: string, requestedResource?: unknown): boolean =>
                requestedResource === resource,
        };

        assert.strictEqual(
            affectsWorkspaceConfiguration(event, 'metaflow.synchronization', resource),
            true,
        );
    });

    test('rejects an unrelated change', () => {
        const event = {
            affectsConfiguration: (): boolean => false,
        };

        assert.strictEqual(
            affectsWorkspaceConfiguration(event, 'metaflow.synchronization', undefined),
            false,
        );
    });
});
