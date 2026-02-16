/**
 * Initialize a new MetaFlow configuration file.
 *
 * Supports initializing from:
 * - an existing metadata directory (auto-discover layers),
 * - a git URL (clone then auto-discover),
 * - a new empty directory scaffold.
 */

import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { logInfo } from '../views/outputChannel';

const execFileAsync = promisify(execFile);

type InitSourceMode = 'existing' | 'url' | 'empty';

interface SourceSelection {
  metadataRoot: vscode.Uri;
  metadataUrl?: string;
  layers: string[];
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function layerSort(a: string, b: string): number {
  const depthA = a === '.' ? 0 : a.split('/').length;
  const depthB = b === '.' ? 0 : b.split('/').length;
  if (depthA !== depthB) {
    return depthA - depthB;
  }
  return a.localeCompare(b);
}

function sanitizeRepoName(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  const base = trimmed.split('/').pop() ?? 'metadata';
  const noGit = base.replace(/\.git$/i, '');
  const slug = noGit
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'metadata';
}

function toConfigLocalPath(workspaceFolder: vscode.WorkspaceFolder, target: vscode.Uri): string {
  const relative = toPosixPath(path.relative(workspaceFolder.uri.fsPath, target.fsPath));
  if (relative && !relative.startsWith('../') && !path.isAbsolute(relative)) {
    return relative;
  }
  return target.fsPath;
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function discoverLayersFromGithubDirs(root: vscode.Uri): Promise<string[]> {
  const found = new Set<string>();

  async function walk(dir: vscode.Uri): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(dir);

    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.Directory) {
        continue;
      }

      if (name === '.github') {
        const rel = toPosixPath(path.relative(root.fsPath, dir.fsPath));
        found.add(rel === '' ? '.' : rel);
        continue;
      }

      if (name === '.git') {
        continue;
      }

      await walk(vscode.Uri.joinPath(dir, name));
    }
  }

  await walk(root);
  return Array.from(found).sort(layerSort);
}

function buildConfig(localPath: string, layers: string[], metadataUrl?: string): Record<string, unknown> {
  return {
    metadataRepo: {
      localPath,
      ...(metadataUrl ? { url: metadataUrl } : {}),
    },
    layers,
    filters: { include: [], exclude: [] },
    profiles: {
      default: {
        enable: ['**/*'],
        disable: [],
      },
    },
    activeProfile: 'default',
    injection: {
      instructions: 'settings',
      prompts: 'settings',
      skills: 'materialize',
      agents: 'materialize',
    },
  };
}

async function pickExistingDirectory(): Promise<vscode.Uri | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Use Metadata Directory',
  });
  return selected?.[0];
}

async function promptUrlSource(workspaceFolder: vscode.WorkspaceFolder): Promise<SourceSelection | undefined> {
  const metadataUrl = await vscode.window.showInputBox({
    prompt: 'Enter metadata repository URL',
    placeHolder: 'https://github.com/org/ai-metadata.git',
    ignoreFocusOut: true,
    validateInput: value => (value.trim() ? undefined : 'URL is required.'),
  });

  if (!metadataUrl) {
    return undefined;
  }

  const defaultClonePath = `.ai/${sanitizeRepoName(metadataUrl)}`;
  const clonePathInput = await vscode.window.showInputBox({
    prompt: 'Local clone path (relative to workspace or absolute path)',
    value: defaultClonePath,
    ignoreFocusOut: true,
    validateInput: value => (value.trim() ? undefined : 'Clone path is required.'),
  });

  if (!clonePathInput) {
    return undefined;
  }

  const cloneTarget = path.isAbsolute(clonePathInput)
    ? vscode.Uri.file(clonePathInput)
    : vscode.Uri.file(path.resolve(workspaceFolder.uri.fsPath, clonePathInput));

  if (await uriExists(cloneTarget)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Clone target already exists: ${cloneTarget.fsPath}. Re-clone into it?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return undefined;
    }
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(cloneTarget.fsPath)));

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'MetaFlow: Cloning metadata repository...',
      },
      async () => {
        await execFileAsync('git', ['clone', metadataUrl, cloneTarget.fsPath]);
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`MetaFlow: Failed to clone metadata repo. ${message}`);
    return undefined;
  }

  const layers = await discoverLayersFromGithubDirs(cloneTarget);
  if (layers.length === 0) {
    vscode.window.showErrorMessage('MetaFlow: No .github directories found in cloned repository.');
    return undefined;
  }

  return { metadataRoot: cloneTarget, metadataUrl, layers };
}

async function createEmptyScaffold(workspaceFolder: vscode.WorkspaceFolder): Promise<SourceSelection | undefined> {
  const targetPathInput = await vscode.window.showInputBox({
    prompt: 'Directory to create metadata scaffold (relative to workspace or absolute path)',
    value: '.ai/my-ai-metadata',
    ignoreFocusOut: true,
    validateInput: value => (value.trim() ? undefined : 'Directory path is required.'),
  });

  if (!targetPathInput) {
    return undefined;
  }

  const metadataRoot = path.isAbsolute(targetPathInput)
    ? vscode.Uri.file(targetPathInput)
    : vscode.Uri.file(path.resolve(workspaceFolder.uri.fsPath, targetPathInput));

  if (await uriExists(metadataRoot)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Directory already exists: ${metadataRoot.fsPath}. Add scaffold files anyway?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return undefined;
    }
  }

  const coreLayer = vscode.Uri.joinPath(metadataRoot, 'company', 'core', '.github');
  const teamLayer = vscode.Uri.joinPath(metadataRoot, 'team', 'default', '.github');

  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(coreLayer, 'instructions'));
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(teamLayer, 'prompts'));

  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(coreLayer, 'instructions', 'coding.instructions.md'),
    Buffer.from('# Coding Guidelines\n\nBase org-wide coding instructions.\n', 'utf-8')
  );
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(teamLayer, 'prompts', 'review.prompt.md'),
    Buffer.from('# Review Prompt\n\nTeam-specific review checklist.\n', 'utf-8')
  );

  const layers = await discoverLayersFromGithubDirs(metadataRoot);
  return { metadataRoot, layers };
}

async function resolveSourceSelection(
  mode: InitSourceMode,
  workspaceFolder: vscode.WorkspaceFolder
): Promise<SourceSelection | undefined> {
  if (mode === 'existing') {
    const existingDir = await pickExistingDirectory();
    if (!existingDir) {
      return undefined;
    }

    const layers = await discoverLayersFromGithubDirs(existingDir);
    if (layers.length === 0) {
      vscode.window.showErrorMessage('MetaFlow: No .github directories found in selected directory tree.');
      return undefined;
    }

    return { metadataRoot: existingDir, layers };
  }

  if (mode === 'url') {
    return promptUrlSource(workspaceFolder);
  }

  return createEmptyScaffold(workspaceFolder);
}

/**
 * Initialize a new `.ai-sync.json` configuration file in the workspace root.
 *
 * Uses the VS Code workspace file-system API so it works for local,
 * remote, and WSL workspaces.
 *
 * @param workspaceFolder The workspace folder to create the config in.
 */
export async function initConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
  if (workspaceFolder.uri.scheme !== 'file') {
    vscode.window.showErrorMessage('MetaFlow: Initialize Configuration currently supports local file workspaces only.');
    return;
  }

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

      const modePick = await vscode.window.showQuickPick(
        [
          {
            label: 'Use Existing Directory',
            description: 'Discover layers from existing .github directories',
            mode: 'existing' as InitSourceMode,
          },
          {
            label: 'Clone from Git URL',
            description: 'Clone metadata repo locally, then discover layers',
            mode: 'url' as InitSourceMode,
          },
          {
            label: 'Create New Empty Scaffold',
            description: 'Create example metadata structure with starter files',
            mode: 'empty' as InitSourceMode,
          },
        ],
        {
          title: 'MetaFlow: Initialize Configuration',
          placeHolder: 'Choose metadata source',
          ignoreFocusOut: true,
        }
      );

      if (!modePick) {
        logInfo('initConfig: user cancelled source mode selection.');
        return;
      }

      const selection = await resolveSourceSelection(modePick.mode, workspaceFolder);
      if (!selection) {
        logInfo('initConfig: source selection cancelled or failed.');
        return;
      }

      const localPath = toConfigLocalPath(workspaceFolder, selection.metadataRoot);
      const config = buildConfig(localPath, selection.layers, selection.metadataUrl);
      const content = Buffer.from(JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await vscode.workspace.fs.writeFile(configUri, content);
    logInfo('initConfig: file written.');

    const doc = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
    `MetaFlow: Configuration initialized with ${selection.layers.length} discovered layer(s).`
    );
}
