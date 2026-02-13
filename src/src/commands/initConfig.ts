/**
 * Initialize a new MetaFlow configuration file.
 *
 * Scaffolds a `.ai-sync.json` with sensible defaults.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
 * @param workspaceFolder The workspace folder to create the config in.
 */
export async function initConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  const configPath = path.join(workspaceFolder.uri.fsPath, '.ai-sync.json');

    if (fs.existsSync(configPath)) {
        const overwrite = await vscode.window.showWarningMessage(
            '.ai-sync.json already exists. Overwrite?',
            'Yes',
            'No'
        );
        if (overwrite !== 'Yes') {
            return;
        }
    }

    fs.writeFileSync(configPath, TEMPLATE, 'utf-8');

    const doc = await vscode.workspace.openTextDocument(configPath);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage('MetaFlow: Configuration initialized.');
}
