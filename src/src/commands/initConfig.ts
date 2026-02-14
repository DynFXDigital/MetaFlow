/**
 * Initialize a new MetaFlow configuration file.
 *
 * Scaffolds a `.ai-sync.json` with sensible defaults.
 */

import * as vscode from 'vscode';
import { logInfo } from '../views/outputChannel';

const TEMPLATE = `{
  "metadataRepo": {
    "localPath": "../my-ai-metadata"
  },
  "layers": [
    "company/core"
  ],
  "filters": {
    "include": [],
    "exclude": []
  },
  "profiles": {
    "default": {
      "enable": ["**/*"],
      "disable": []
    }
  },
  "activeProfile": "default",
  "injection": {
    "instructions": "settings",
    "prompts": "settings",
    "skills": "materialize",
    "agents": "materialize"
  }
}
`;

/**
 * Initialize a new `.ai-sync.json` configuration file in the workspace root.
 *
 * Uses the VS Code workspace file-system API so it works for local,
 * remote, and WSL workspaces.
 *
 * @param workspaceFolder The workspace folder to create the config in.
 */
export async function initConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const configUri = vscode.Uri.joinPath(workspaceFolder.uri, '.ai-sync.json');
    logInfo(`initConfig: target → ${configUri.fsPath}`);

    // Check whether the file already exists
    let exists = false;
    try {
        await vscode.workspace.fs.stat(configUri);
        exists = true;
    } catch {
        // stat throws FileNotFound when the file is absent — expected path
    }

    if (exists) {
        const overwrite = await vscode.window.showWarningMessage(
            '.ai-sync.json already exists. Overwrite?',
            'Yes',
            'No'
        );
        if (overwrite !== 'Yes') {
            logInfo('initConfig: user declined overwrite.');
            return;
        }
    }

    // Write the template — errors propagate to the caller
    const content = Buffer.from(TEMPLATE, 'utf-8');
    await vscode.workspace.fs.writeFile(configUri, content);
    logInfo('initConfig: file written.');

    const doc = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        `MetaFlow: Configuration initialized at ${workspaceFolder.name}/.ai-sync.json.`
    );
}
