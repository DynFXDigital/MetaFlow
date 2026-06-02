/**
 * Mocha Root Hook Plugin for the ExTester GUI suite.
 *
 * Runs after every test to clear transient UI (stray modal dialogs,
 * notification toasts, the welcome overlay) that otherwise accumulates over a
 * long run and blocks element interactions in later suites. Without this, a
 * single un-dismissed modal (e.g. a "command not found" error box) cascades
 * into dozens of "element not visible" timeouts across all subsequent suites.
 *
 * Wired in via `require` in .mocharc-gui.js.
 */

import { dismissBlockingUi } from './helpers/metaflowGuiHelpers';

export const mochaHooks = {
    async afterEach(): Promise<void> {
        await dismissBlockingUi();
    },
};
