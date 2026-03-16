import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export interface ScaffoldMetaFlowAiMetadataResult {
    sourceRoot: string;
    writtenFiles: string[];
    skippedFiles: string[];
}

export interface MetaFlowAiMetadataCacheResult extends ScaffoldMetaFlowAiMetadataResult {
    targetRoot: string;
}

const BUNDLED_METADATA_CACHE_DIR = 'bundled-metadata';
const BUNDLED_METADATA_ROOT_NAME = 'metaflow-ai-metadata';
const BUNDLED_METADATA_VERSION_MARKER = '.metaflow-bundle-version';
const CAPABILITY_MANIFEST_FILE_NAME = 'CAPABILITY.md';

interface BundledMetadataVersionMarker {
    version: string;
    fingerprint: string;
}

export async function scaffoldMetaFlowAiMetadata(options: {
    workspaceRoot: string;
    extensionPath: string;
    overwriteExisting?: boolean;
    copyFile?: (sourceFile: string, destinationFile: string) => Promise<void>;
}): Promise<ScaffoldMetaFlowAiMetadataResult | undefined> {
    const sourceRoot = resolveBundledMetaFlowAiMetadataSourceRoot(options.extensionPath);
    if (!fs.existsSync(sourceRoot)) {
        return undefined;
    }

    return copyBundledMetaFlowAiMetadata({
        sourceRoot,
        destinationRoot: options.workspaceRoot,
        includeRootCapabilityManifest: false,
        overwriteExisting: options.overwriteExisting,
        copyFile: options.copyFile,
    });
}

export async function ensureMetaFlowAiMetadataCache(options: {
    storageRoot: string;
    extensionPath: string;
    version: string;
    copyFile?: (sourceFile: string, destinationFile: string) => Promise<void>;
}): Promise<MetaFlowAiMetadataCacheResult | undefined> {
    const sourceRoot = resolveBundledMetaFlowAiMetadataSourceRoot(options.extensionPath);
    if (!fs.existsSync(sourceRoot)) {
        return undefined;
    }

    const targetRoot = path.join(
        options.storageRoot,
        BUNDLED_METADATA_CACHE_DIR,
        BUNDLED_METADATA_ROOT_NAME,
    );
    const versionMarkerPath = path.join(targetRoot, BUNDLED_METADATA_VERSION_MARKER);
    const sourceFingerprint = await computeBundledMetadataFingerprint(sourceRoot);
    const versionMarker = readBundledMetadataVersionMarker(versionMarkerPath);

    if (
        fs.existsSync(targetRoot) &&
        versionMarker?.version === options.version &&
        versionMarker.fingerprint === sourceFingerprint
    ) {
        return {
            sourceRoot,
            targetRoot,
            writtenFiles: [],
            skippedFiles: [],
        };
    }

    await fsp.rm(targetRoot, { recursive: true, force: true });

    const result = await copyBundledMetaFlowAiMetadata({
        sourceRoot,
        destinationRoot: targetRoot,
        overwriteExisting: true,
        copyFile: options.copyFile,
    });

    await fsp.mkdir(targetRoot, { recursive: true });
    await fsp.writeFile(
        versionMarkerPath,
        JSON.stringify(
            {
                version: options.version,
                fingerprint: sourceFingerprint,
            },
            null,
            2,
        ) + '\n',
        'utf-8',
    );

    return {
        ...result,
        targetRoot,
    };
}

function resolveBundledMetaFlowAiMetadataSourceRoot(extensionPath: string): string {
    return path.join(extensionPath, 'assets', BUNDLED_METADATA_ROOT_NAME);
}

async function copyBundledMetaFlowAiMetadata(options: {
    sourceRoot: string;
    destinationRoot: string;
    includeRootCapabilityManifest?: boolean;
    overwriteExisting?: boolean;
    copyFile?: (sourceFile: string, destinationFile: string) => Promise<void>;
}): Promise<ScaffoldMetaFlowAiMetadataResult> {
    const includeRootCapabilityManifest = options.includeRootCapabilityManifest !== false;
    const targets = (await collectFiles(options.sourceRoot)).filter(
        (sourceFile) =>
            includeRootCapabilityManifest ||
            !isRootCapabilityManifest(options.sourceRoot, sourceFile),
    );
    const writtenFiles: string[] = [];
    const skippedFiles: string[] = [];

    const copyFile = options.copyFile ?? fsp.copyFile;

    for (const sourceFile of targets) {
        const relative = path.relative(options.sourceRoot, sourceFile);
        const destinationFile = path.join(options.destinationRoot, relative);
        const destinationDir = path.dirname(destinationFile);
        try {
            await fsp.mkdir(destinationDir, { recursive: true });
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
                skippedFiles.push(relative.replace(/\\/g, '/'));
                continue;
            }
            throw err;
        }

        if (!options.overwriteExisting && fs.existsSync(destinationFile)) {
            skippedFiles.push(relative.replace(/\\/g, '/'));
            continue;
        }

        if (!fs.existsSync(sourceFile)) {
            skippedFiles.push(relative.replace(/\\/g, '/'));
            continue;
        }

        try {
            await copyFile(sourceFile, destinationFile);
            writtenFiles.push(relative.replace(/\\/g, '/'));
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
                skippedFiles.push(relative.replace(/\\/g, '/'));
                continue;
            }
            throw err;
        }
    }

    return {
        sourceRoot: options.sourceRoot,
        writtenFiles,
        skippedFiles,
    };
}

function isRootCapabilityManifest(sourceRoot: string, sourceFile: string): boolean {
    return (
        path.relative(sourceRoot, sourceFile).replace(/\\/g, '/') === CAPABILITY_MANIFEST_FILE_NAME
    );
}

function readBundledMetadataVersionMarker(
    versionMarkerPath: string,
): BundledMetadataVersionMarker | undefined {
    if (!fs.existsSync(versionMarkerPath)) {
        return undefined;
    }

    try {
        const raw = fs.readFileSync(versionMarkerPath, 'utf-8').trim();
        if (!raw) {
            return undefined;
        }

        const parsed = JSON.parse(raw) as Partial<BundledMetadataVersionMarker>;
        if (typeof parsed.version !== 'string' || typeof parsed.fingerprint !== 'string') {
            return undefined;
        }

        return {
            version: parsed.version,
            fingerprint: parsed.fingerprint,
        };
    } catch {
        return undefined;
    }
}

async function computeBundledMetadataFingerprint(sourceRoot: string): Promise<string> {
    const hash = createHash('sha256');
    const targets = (await collectFiles(sourceRoot))
        .map((sourceFile) => path.relative(sourceRoot, sourceFile).replace(/\\/g, '/'))
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    for (const relativePath of targets) {
        hash.update(relativePath);
        hash.update('\n');
        hash.update(await fsp.readFile(path.join(sourceRoot, relativePath)));
        hash.update('\n');
    }

    return hash.digest('hex');
}

async function collectFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)));
            continue;
        }

        if (entry.isFile()) {
            files.push(fullPath);
        }
    }

    return files;
}
