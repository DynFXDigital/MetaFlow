import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

export interface ScaffoldMetaFlowAiMetadataResult {
    sourceRoot: string;
    writtenFiles: string[];
    skippedFiles: string[];
}

export async function scaffoldMetaFlowAiMetadata(options: {
    workspaceRoot: string;
    extensionPath: string;
    overwriteExisting?: boolean;
}): Promise<ScaffoldMetaFlowAiMetadataResult | undefined> {
    const sourceRoot = path.join(options.extensionPath, 'assets', 'metaflow-ai-metadata');
    if (!fs.existsSync(sourceRoot)) {
        return undefined;
    }

    const targets = await collectFiles(sourceRoot);
    const writtenFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const sourceFile of targets) {
        const relative = path.relative(sourceRoot, sourceFile);
        const destinationFile = path.join(options.workspaceRoot, relative);
        const destinationDir = path.dirname(destinationFile);
        await fsp.mkdir(destinationDir, { recursive: true });

        if (!options.overwriteExisting && fs.existsSync(destinationFile)) {
            skippedFiles.push(relative.replace(/\\/g, '/'));
            continue;
        }

        await fsp.copyFile(sourceFile, destinationFile);
        writtenFiles.push(relative.replace(/\\/g, '/'));
    }

    return {
        sourceRoot,
        writtenFiles,
        skippedFiles,
    };
}

async function collectFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectFiles(fullPath));
            continue;
        }

        if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}
