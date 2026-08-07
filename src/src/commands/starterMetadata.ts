import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';

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
const BUNDLED_METADATA_CACHE_LOCK = '.metaflow-ai-metadata.lock';
const CACHE_LOCK_TIMEOUT_MS = 10000;
const CACHE_LOCK_STALE_MS = 30000;
const DESCRIPTOR_FILE_NAMES = new Set(['README.md', 'CAPABILITY.md']);

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
        rootOnlyWorkspaceProjection: true,
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

    const sourceFingerprint = await computeBundledMetadataFingerprint(sourceRoot);
    const cacheRootName = `${BUNDLED_METADATA_ROOT_NAME}-${sanitizeCacheSegment(options.version)}-${sourceFingerprint.slice(0, 16)}`;
    const targetRoot = path.join(options.storageRoot, BUNDLED_METADATA_CACHE_DIR, cacheRootName);
    const cacheParent = path.dirname(targetRoot);
    const releaseLock = await acquireBundledMetadataCacheLock(cacheParent);
    const stagingRoot = path.join(
        cacheParent,
        `.${BUNDLED_METADATA_ROOT_NAME}.${randomUUID()}.tmp`,
    );

    try {
        const versionMarkerPath = path.join(targetRoot, BUNDLED_METADATA_VERSION_MARKER);
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

        const result = await copyBundledMetaFlowAiMetadata({
            sourceRoot,
            destinationRoot: stagingRoot,
            overwriteExisting: true,
            copyFile: options.copyFile,
        });
        await fsp.writeFile(
            path.join(stagingRoot, BUNDLED_METADATA_VERSION_MARKER),
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

        await fsp.rename(stagingRoot, targetRoot);
        await removeObsoleteBundledMetadataCaches(cacheParent, targetRoot);

        return {
            ...result,
            targetRoot,
        };
    } finally {
        await fsp.rm(stagingRoot, { recursive: true, force: true });
        await releaseLock();
    }
}

function sanitizeCacheSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

async function removeObsoleteBundledMetadataCaches(
    cacheParent: string,
    retainedRoot: string,
): Promise<void> {
    const entries = await fsp.readdir(cacheParent, { withFileTypes: true });
    for (const entry of entries) {
        if (
            !entry.isDirectory() ||
            entry.name === path.basename(retainedRoot) ||
            (entry.name !== BUNDLED_METADATA_ROOT_NAME &&
                !entry.name.startsWith(`${BUNDLED_METADATA_ROOT_NAME}-`))
        ) {
            continue;
        }

        try {
            await fsp.rm(path.join(cacheParent, entry.name), { recursive: true, force: true });
        } catch (error) {
            if (
                !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(
                    (error as NodeJS.ErrnoException).code ?? '',
                )
            ) {
                throw error;
            }
        }
    }
}

async function acquireBundledMetadataCacheLock(cacheParent: string): Promise<() => Promise<void>> {
    await fsp.mkdir(cacheParent, { recursive: true });
    const lockRoot = path.join(cacheParent, BUNDLED_METADATA_CACHE_LOCK);
    const ownerPath = path.join(lockRoot, 'owner');
    const owner = randomUUID();
    const deadline = Date.now() + CACHE_LOCK_TIMEOUT_MS;

    while (true) {
        try {
            await fsp.mkdir(lockRoot);
            await fsp.writeFile(ownerPath, owner, 'utf-8');
            return async () => {
                try {
                    if ((await fsp.readFile(ownerPath, 'utf-8')) === owner) {
                        await fsp.rm(lockRoot, { recursive: true, force: true });
                    }
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw error;
                    }
                }
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                throw error;
            }

            try {
                const lockStat = await fsp.stat(lockRoot);
                if (Date.now() - lockStat.mtimeMs > CACHE_LOCK_STALE_MS) {
                    await fsp.rm(lockRoot, { recursive: true, force: true });
                    continue;
                }
            } catch (statError) {
                if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
                    continue;
                }
                throw statError;
            }

            if (Date.now() >= deadline) {
                throw new Error(`Timed out waiting for bundled metadata cache lock: ${lockRoot}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
}

function resolveBundledMetaFlowAiMetadataSourceRoot(extensionPath: string): string {
    return path.join(extensionPath, 'assets', BUNDLED_METADATA_ROOT_NAME);
}

async function copyBundledMetaFlowAiMetadata(options: {
    sourceRoot: string;
    destinationRoot: string;
    includeRootCapabilityManifest?: boolean;
    rootOnlyWorkspaceProjection?: boolean;
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
        const relative = path.relative(options.sourceRoot, sourceFile).replace(/\\/g, '/');
        const destinationRelative = resolveDestinationRelativePath(
            relative,
            options.rootOnlyWorkspaceProjection === true,
        );
        if (!destinationRelative) {
            continue;
        }

        const destinationFile = path.join(options.destinationRoot, destinationRelative);
        const destinationDir = path.dirname(destinationFile);
        try {
            await fsp.mkdir(destinationDir, { recursive: true });
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
                skippedFiles.push(destinationRelative);
                continue;
            }
            throw err;
        }

        if (!options.overwriteExisting && fs.existsSync(destinationFile)) {
            skippedFiles.push(destinationRelative);
            continue;
        }

        if (!fs.existsSync(sourceFile)) {
            skippedFiles.push(destinationRelative);
            continue;
        }

        try {
            await copyFile(sourceFile, destinationFile);
            writtenFiles.push(destinationRelative);
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
                skippedFiles.push(destinationRelative);
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
    const relativePath = path.relative(sourceRoot, sourceFile).replace(/\\/g, '/');
    return DESCRIPTOR_FILE_NAMES.has(relativePath);
}

function resolveDestinationRelativePath(
    sourceRelativePath: string,
    rootOnlyWorkspaceProjection: boolean,
): string | undefined {
    if (!rootOnlyWorkspaceProjection) {
        return sourceRelativePath;
    }

    if (/^capabilities\//i.test(sourceRelativePath)) {
        return undefined;
    }

    return sourceRelativePath;
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
