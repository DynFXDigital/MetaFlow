const chrome = require('selenium-webdriver/chrome');
const { pathToFileURL } = require('node:url');

const workspacePath = process.env.METAFLOW_GUI_WORKSPACE;
if (workspacePath) {
    const workspaceArgument = `--folder-uri=${pathToFileURL(workspacePath).href}`;
    const addArguments = chrome.Options.prototype.addArguments;
    chrome.Options.prototype.addArguments = function (...args) {
        addArguments.apply(this, args);
        return addArguments.call(this, workspaceArgument);
    };
}
