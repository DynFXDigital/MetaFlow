/**
 * Managed lifecycle for MetaFlow's project-local Pi Agent Plugin package.
 *
 * The pure projector and resolved-layer collector remain separate. This module
 * owns only the fixed generated package root and its dedicated target ledger.
 * It preflights the complete root before mutation and publishes a complete
 * staged package through same-volume renames.
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { projectPiAgentPluginSkills } from './piSkillsProjection';
import type {
    PiSkillsProjectionDiagnostic,
    PiSkillsProjectionPackage,
    PiSkillsProjectionResult,
    PiSkillsProjectionSource,
} from './piSkillsProjection';

export const PI_PROJECT_PLUGIN_RELATIVE_ROOT = '.pi/plugins/metaflow.project';
export const PI_TARGET_STATE_RELATIVE_PATH = '.metaflow/pi-target-state.json';
export const PI_TARGET_STATE_SCHEMA_VERSION = 1;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PI_TARGET_LOCK_RELATIVE_PATH = '.metaflow/pi-target.lock';
const PI_TARGET_JOURNAL_RELATIVE_PATH = '.metaflow/pi-target-transaction.json';
const PI_TARGET_TRANSACTION_SCHEMA_VERSION = 1;
const TRANSACTION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STATE_TOP_LEVEL_KEYS = ['schemaVersion', 'outputRoot', 'projection', 'files'] as const;
const STATE_PROJECTION_KEYS = ['contentSha', 'version'] as const;
const STATE_FILE_KEYS = ['contentHash', 'sources'] as const;
const STATE_SOURCE_KEYS = [
    'layerId',
    'repoId',
    'capabilityId',
    'capabilityName',
    'sourcePath',
] as const;

export interface PiTargetManagedFileState {
    readonly contentHash: string;
    readonly sources: readonly PiSkillsProjectionSource[];
}

export interface PiTargetState {
    readonly schemaVersion: typeof PI_TARGET_STATE_SCHEMA_VERSION;
    readonly outputRoot: typeof PI_PROJECT_PLUGIN_RELATIVE_ROOT;
    readonly projection: {
        readonly contentSha: string;
        readonly version: string;
    };
    readonly files: Readonly<Record<string, PiTargetManagedFileState>>;
}

export interface PiTargetStateLoadResult {
    readonly exists: boolean;
    readonly state?: PiTargetState;
    readonly diagnostics: readonly PiTargetDiagnostic[];
}

export type PiTargetDiagnostic = PiSkillsProjectionDiagnostic;
export type PiTargetChangeAction = 'add' | 'update' | 'remove';
export type PiTargetStateAction = 'none' | 'write' | 'remove';

export interface PiTargetChange {
    readonly relativePath: string;
    readonly action: PiTargetChangeAction;
}

export interface PiProjectPluginPlanOptions {
    readonly workspaceRoot: string;
    readonly enabled: boolean;
    readonly projection?: PiSkillsProjectionResult;
}

export interface PiProjectPluginSynchronizationPlan {
    readonly enabled: boolean;
    readonly blocked: boolean;
    readonly changes: readonly PiTargetChange[];
    readonly stateAction: PiTargetStateAction;
    readonly diagnostics: readonly PiTargetDiagnostic[];
    readonly currentState?: PiTargetState;
    readonly desiredState?: PiTargetState;
    readonly projection?: PiSkillsProjectionResult;
}

export interface PiProjectPluginApplyResult {
    readonly plan: PiProjectPluginSynchronizationPlan;
    readonly written: readonly string[];
    readonly removed: readonly string[];
    readonly stateChanged: boolean;
}

interface ObservedTargetRoot {
    readonly exists: boolean;
    readonly files: ReadonlyMap<string, string>;
    readonly directories: ReadonlySet<string>;
    readonly diagnostics: readonly PiTargetDiagnostic[];
}

interface PiTargetLock {
    readonly descriptor: number;
    readonly lockPath: string;
    readonly workspaceRoot: string;
    readonly identity: PiTargetPathIdentity;
}

interface PiTargetPathIdentity {
    readonly dev: number;
    readonly ino: number;
    readonly size: number;
    readonly birthtimeMs: number;
    readonly mtimeMs: number;
}

interface PiTargetFileSnapshot {
    readonly identity: PiTargetPathIdentity;
    readonly contentHash: string;
}

interface PiTargetRootSnapshot {
    readonly identity: PiTargetPathIdentity;
    readonly files: Readonly<Record<string, PiTargetFileSnapshot>>;
    readonly directories: Readonly<Record<string, PiTargetPathIdentity>>;
}

interface PiTargetTransactionJournal {
    readonly schemaVersion: typeof PI_TARGET_TRANSACTION_SCHEMA_VERSION;
    readonly transactionId: string;
    readonly committed: boolean;
    readonly rootAction: 'none' | 'replace' | 'remove';
    readonly stateAction: 'write' | 'remove';
    readonly transactionRootIdentity: PiTargetPathIdentity;
    readonly previousRoot?: PiTargetRootSnapshot;
    readonly previousState?: PiTargetFileSnapshot;
    readonly nextRoot?: PiTargetRootSnapshot;
    readonly nextState?: PiTargetFileSnapshot;
}

interface PiTargetRecoveryResult {
    readonly recovered: boolean;
    readonly diagnostics: readonly PiTargetDiagnostic[];
}

function compareCodeUnits(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function canonicalPath(value: string): string {
    const normalized = path.normalize(value);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isInside(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}

function isSafePackagePath(value: string): boolean {
    if (!value || value.includes('\\') || path.posix.isAbsolute(value)) {
        return false;
    }
    const normalized = path.posix.normalize(value);
    return (
        normalized === value &&
        normalized !== '.' &&
        normalized !== '..' &&
        !normalized.startsWith('../') &&
        normalized.split('/').every((segment) => segment.length > 0 && segment !== '..')
    );
}

function targetDiagnostic(
    code: string,
    message: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    filePath?: string,
): PiTargetDiagnostic {
    return {
        code,
        message,
        severity,
        ...(filePath !== undefined ? { filePath } : {}),
    };
}

function canonicalDiagnostics(
    diagnostics: readonly PiTargetDiagnostic[],
): readonly PiTargetDiagnostic[] {
    return [...diagnostics].sort(
        (left, right) =>
            compareCodeUnits(left.code, right.code) ||
            compareCodeUnits(left.outputPath ?? '', right.outputPath ?? '') ||
            compareCodeUnits(
                left.source ? sourceKey(left.source) : '',
                right.source ? sourceKey(right.source) : '',
            ) ||
            compareCodeUnits(left.filePath ?? '', right.filePath ?? '') ||
            compareCodeUnits(left.message, right.message),
    );
}

function sha256(content: Uint8Array): string {
    return createHash('sha256').update(content).digest('hex');
}

function cloneSource(source: PiSkillsProjectionSource): PiSkillsProjectionSource {
    return {
        layerId: source.layerId,
        ...(source.repoId !== undefined ? { repoId: source.repoId } : {}),
        capabilityId: source.capabilityId,
        ...(source.capabilityName !== undefined ? { capabilityName: source.capabilityName } : {}),
        sourcePath: source.sourcePath,
    };
}

function sourceKey(source: PiSkillsProjectionSource): string {
    return [
        source.repoId ?? '',
        source.layerId,
        source.capabilityId,
        source.capabilityName ?? '',
        source.sourcePath,
    ].join('\u0000');
}

function canonicalSources(
    sources: readonly PiSkillsProjectionSource[],
): readonly PiSkillsProjectionSource[] {
    return sources
        .map(cloneSource)
        .sort((left, right) => compareCodeUnits(sourceKey(left), sourceKey(right)));
}

function canonicalState(state: PiTargetState): PiTargetState {
    const files: Record<string, PiTargetManagedFileState> = {};
    for (const relativePath of Object.keys(state.files).sort(compareCodeUnits)) {
        const entry = state.files[relativePath];
        files[relativePath] = {
            contentHash: entry.contentHash,
            sources: canonicalSources(entry.sources),
        };
    }
    return {
        schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION,
        outputRoot: PI_PROJECT_PLUGIN_RELATIVE_ROOT,
        projection: {
            contentSha: state.projection.contentSha,
            version: state.projection.version,
        },
        files,
    };
}

function serializeState(state: PiTargetState): string {
    return `${JSON.stringify(canonicalState(state), null, 2)}\n`;
}

function parseSource(value: unknown): PiSkillsProjectionSource | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, STATE_SOURCE_KEYS)) {
        return undefined;
    }
    if (
        typeof value.layerId !== 'string' ||
        value.layerId.length === 0 ||
        typeof value.capabilityId !== 'string' ||
        value.capabilityId.length === 0 ||
        typeof value.sourcePath !== 'string' ||
        value.sourcePath.length === 0 ||
        (value.repoId !== undefined && typeof value.repoId !== 'string') ||
        (value.capabilityName !== undefined && typeof value.capabilityName !== 'string')
    ) {
        return undefined;
    }
    return {
        layerId: value.layerId,
        ...(value.repoId !== undefined ? { repoId: value.repoId } : {}),
        capabilityId: value.capabilityId,
        ...(value.capabilityName !== undefined ? { capabilityName: value.capabilityName } : {}),
        sourcePath: value.sourcePath,
    };
}

function parseState(value: unknown): PiTargetState | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, STATE_TOP_LEVEL_KEYS)) {
        return undefined;
    }
    if (
        value.schemaVersion !== PI_TARGET_STATE_SCHEMA_VERSION ||
        value.outputRoot !== PI_PROJECT_PLUGIN_RELATIVE_ROOT ||
        !isRecord(value.projection) ||
        !hasOnlyKeys(value.projection, STATE_PROJECTION_KEYS) ||
        typeof value.projection.contentSha !== 'string' ||
        !HASH_PATTERN.test(value.projection.contentSha) ||
        typeof value.projection.version !== 'string' ||
        value.projection.version.length === 0 ||
        !isRecord(value.files)
    ) {
        return undefined;
    }
    const files: Record<string, PiTargetManagedFileState> = {};
    for (const relativePath of Object.keys(value.files)) {
        const entry = value.files[relativePath];
        if (
            !isSafePackagePath(relativePath) ||
            !isRecord(entry) ||
            !hasOnlyKeys(entry, STATE_FILE_KEYS) ||
            typeof entry.contentHash !== 'string' ||
            !HASH_PATTERN.test(entry.contentHash) ||
            !Array.isArray(entry.sources)
        ) {
            return undefined;
        }
        const sources = entry.sources.map(parseSource);
        if (sources.some((source) => source === undefined)) {
            return undefined;
        }
        files[relativePath] = {
            contentHash: entry.contentHash,
            sources: canonicalSources(sources as PiSkillsProjectionSource[]),
        };
    }
    if (!Object.prototype.hasOwnProperty.call(files, 'plugin.json')) {
        return undefined;
    }
    return canonicalState({
        schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION,
        outputRoot: PI_PROJECT_PLUGIN_RELATIVE_ROOT,
        projection: {
            contentSha: value.projection.contentSha,
            version: value.projection.version,
        },
        files,
    });
}

function parseIdentity(value: unknown): PiTargetPathIdentity | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ['dev', 'ino', 'size', 'birthtimeMs', 'mtimeMs'])) {
        return undefined;
    }
    const fields = ['dev', 'ino', 'size', 'birthtimeMs', 'mtimeMs'] as const;
    if (
        fields.some((field) => typeof value[field] !== 'number' || !Number.isFinite(value[field]))
    ) {
        return undefined;
    }
    return {
        dev: value.dev as number,
        ino: value.ino as number,
        size: value.size as number,
        birthtimeMs: value.birthtimeMs as number,
        mtimeMs: value.mtimeMs as number,
    };
}

function parseFileSnapshot(value: unknown): PiTargetFileSnapshot | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ['identity', 'contentHash']) ||
        typeof value.contentHash !== 'string' ||
        !HASH_PATTERN.test(value.contentHash)
    ) {
        return undefined;
    }
    const identity = parseIdentity(value.identity);
    return identity ? { identity, contentHash: value.contentHash } : undefined;
}

function parseRootSnapshot(value: unknown): PiTargetRootSnapshot | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ['identity', 'files', 'directories']) ||
        !isRecord(value.files) ||
        !isRecord(value.directories)
    ) {
        return undefined;
    }
    const identity = parseIdentity(value.identity);
    if (!identity) {
        return undefined;
    }
    const files: Record<string, PiTargetFileSnapshot> = {};
    for (const relativePath of Object.keys(value.files).sort(compareCodeUnits)) {
        const snapshot = parseFileSnapshot(value.files[relativePath]);
        if (!isSafePackagePath(relativePath) || !snapshot) {
            return undefined;
        }
        files[relativePath] = snapshot;
    }
    const directories: Record<string, PiTargetPathIdentity> = {};
    for (const relativePath of Object.keys(value.directories).sort(compareCodeUnits)) {
        const directoryIdentity = parseIdentity(value.directories[relativePath]);
        if (!isSafePackagePath(relativePath) || !directoryIdentity) {
            return undefined;
        }
        directories[relativePath] = directoryIdentity;
    }
    return { identity, files, directories };
}

function parseTransactionJournal(value: unknown): PiTargetTransactionJournal | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, [
            'schemaVersion',
            'transactionId',
            'committed',
            'rootAction',
            'stateAction',
            'transactionRootIdentity',
            'previousRoot',
            'previousState',
            'nextRoot',
            'nextState',
        ]) ||
        value.schemaVersion !== PI_TARGET_TRANSACTION_SCHEMA_VERSION ||
        typeof value.transactionId !== 'string' ||
        !TRANSACTION_ID_PATTERN.test(value.transactionId) ||
        (typeof value.committed !== 'boolean' && value.committed !== 0 && value.committed !== 1) ||
        (value.rootAction !== 'none' &&
            value.rootAction !== 'replace' &&
            value.rootAction !== 'remove') ||
        (value.stateAction !== 'write' && value.stateAction !== 'remove')
    ) {
        return undefined;
    }
    const previousRoot =
        value.previousRoot === undefined ? undefined : parseRootSnapshot(value.previousRoot);
    const previousState =
        value.previousState === undefined ? undefined : parseFileSnapshot(value.previousState);
    const nextRoot = value.nextRoot === undefined ? undefined : parseRootSnapshot(value.nextRoot);
    const nextState =
        value.nextState === undefined ? undefined : parseFileSnapshot(value.nextState);
    const transactionRootIdentity = parseIdentity(value.transactionRootIdentity);
    if (
        !transactionRootIdentity ||
        (value.previousRoot !== undefined && !previousRoot) ||
        (value.previousState !== undefined && !previousState) ||
        (value.nextRoot !== undefined && !nextRoot) ||
        (value.nextState !== undefined && !nextState) ||
        (value.rootAction === 'replace') !== (nextRoot !== undefined) ||
        (value.rootAction !== 'replace' && nextRoot !== undefined) ||
        (value.stateAction === 'write') !== (nextState !== undefined) ||
        (value.stateAction === 'remove' && nextState !== undefined)
    ) {
        return undefined;
    }
    return {
        schemaVersion: PI_TARGET_TRANSACTION_SCHEMA_VERSION,
        transactionId: value.transactionId,
        committed: value.committed === true || value.committed === 1,
        rootAction: value.rootAction,
        stateAction: value.stateAction,
        transactionRootIdentity,
        ...(previousRoot ? { previousRoot } : {}),
        ...(previousState ? { previousState } : {}),
        ...(nextRoot ? { nextRoot } : {}),
        ...(nextState ? { nextState } : {}),
    };
}

function statePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_TARGET_STATE_RELATIVE_PATH.split('/'));
}

function journalPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_TARGET_JOURNAL_RELATIVE_PATH.split('/'));
}

function transactionRootPath(workspaceRoot: string, transactionId: string): string {
    return path.join(workspaceRoot, '.metaflow', `.pi-target-transaction-${transactionId}`);
}

function outputRootPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_PROJECT_PLUGIN_RELATIVE_ROOT.split('/'));
}

function safeRealWorkspace(workspaceRoot: string): string {
    const resolved = fs.realpathSync(workspaceRoot);
    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error('workspace root is not a directory');
    }
    return resolved;
}

function assertSafeExistingPath(
    workspaceRealPath: string,
    candidatePath: string,
    expectedKind: 'file' | 'directory',
): void {
    const stats = fs.lstatSync(candidatePath);
    if (stats.isSymbolicLink()) {
        throw new Error('symbolic links, junctions, and reparse-point aliases are not supported');
    }
    if (expectedKind === 'file' ? !stats.isFile() : !stats.isDirectory()) {
        throw new Error(`expected a regular ${expectedKind}`);
    }
    const realCandidate = fs.realpathSync(candidatePath);
    if (!isInside(workspaceRealPath, realCandidate)) {
        throw new Error('filesystem-resolved path escapes the workspace');
    }
}

function pathIdentity(stats: fs.Stats): PiTargetPathIdentity {
    return {
        dev: stats.dev,
        ino: stats.ino,
        size: stats.size,
        birthtimeMs: stats.birthtimeMs,
        mtimeMs: stats.mtimeMs,
    };
}

function sameIdentity(left: PiTargetPathIdentity, right: PiTargetPathIdentity): boolean {
    if (left.dev !== right.dev || left.ino !== right.ino) {
        return false;
    }
    if (left.ino !== 0 || right.ino !== 0) {
        return true;
    }
    return (
        left.size === right.size &&
        left.birthtimeMs === right.birthtimeMs &&
        left.mtimeMs === right.mtimeMs
    );
}

function captureFileSnapshot(workspaceRoot: string, absolutePath: string): PiTargetFileSnapshot {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, absolutePath, 'file');
    const stats = fs.lstatSync(absolutePath);
    return {
        identity: pathIdentity(stats),
        contentHash: sha256(fs.readFileSync(absolutePath)),
    };
}

function captureRootSnapshot(workspaceRoot: string, absoluteRoot: string): PiTargetRootSnapshot {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, absoluteRoot, 'directory');
    const realRootPath = fs.realpathSync(absoluteRoot);
    const files: Record<string, PiTargetFileSnapshot> = {};
    const directories: Record<string, PiTargetPathIdentity> = {};
    const visit = (absoluteDirectory: string, relativeDirectory: string): void => {
        const entries = fs
            .readdirSync(absoluteDirectory, { withFileTypes: true })
            .sort((left, right) => compareCodeUnits(left.name, right.name));
        for (const entry of entries) {
            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            if (!isSafePackagePath(relativePath)) {
                throw new Error('snapshot contains an unsupported path');
            }
            const absolutePath = path.join(absoluteDirectory, entry.name);
            const stats = fs.lstatSync(absolutePath);
            if (stats.isSymbolicLink()) {
                throw new Error('snapshot contains a symbolic link or junction');
            }
            const realPath = fs.realpathSync(absolutePath);
            if (!isInside(workspaceRealPath, realPath) || !isInside(realRootPath, realPath)) {
                throw new Error('snapshot contains a filesystem-resolved escape');
            }
            if (stats.isDirectory()) {
                directories[relativePath] = pathIdentity(stats);
                visit(absolutePath, relativePath);
            } else if (stats.isFile()) {
                files[relativePath] = {
                    identity: pathIdentity(stats),
                    contentHash: sha256(fs.readFileSync(absolutePath)),
                };
            } else {
                throw new Error('snapshot contains a non-regular filesystem entry');
            }
        }
    };
    visit(absoluteRoot, '');
    return {
        identity: pathIdentity(fs.lstatSync(absoluteRoot)),
        files,
        directories,
    };
}

function matchesFileSnapshot(
    workspaceRoot: string,
    absolutePath: string,
    expected: PiTargetFileSnapshot,
): boolean {
    try {
        const current = captureFileSnapshot(workspaceRoot, absolutePath);
        return sameFileSnapshot(current, expected);
    } catch {
        return false;
    }
}

function sameFileSnapshot(current: PiTargetFileSnapshot, expected: PiTargetFileSnapshot): boolean {
    return (
        current.contentHash === expected.contentHash &&
        sameIdentity(current.identity, expected.identity)
    );
}

function sameRootSnapshot(current: PiTargetRootSnapshot, expected: PiTargetRootSnapshot): boolean {
    if (!sameIdentity(current.identity, expected.identity)) {
        return false;
    }
    const currentFilePaths = Object.keys(current.files).sort(compareCodeUnits);
    const expectedFilePaths = Object.keys(expected.files).sort(compareCodeUnits);
    const currentDirectoryPaths = Object.keys(current.directories).sort(compareCodeUnits);
    const expectedDirectoryPaths = Object.keys(expected.directories).sort(compareCodeUnits);
    if (
        JSON.stringify(currentFilePaths) !== JSON.stringify(expectedFilePaths) ||
        JSON.stringify(currentDirectoryPaths) !== JSON.stringify(expectedDirectoryPaths)
    ) {
        return false;
    }
    return (
        currentFilePaths.every((relativePath) =>
            sameFileSnapshot(current.files[relativePath], expected.files[relativePath]),
        ) &&
        currentDirectoryPaths.every((relativePath) =>
            sameIdentity(current.directories[relativePath], expected.directories[relativePath]),
        )
    );
}

function matchesRootSnapshot(
    workspaceRoot: string,
    absoluteRoot: string,
    expected: PiTargetRootSnapshot,
): boolean {
    try {
        const current = captureRootSnapshot(workspaceRoot, absoluteRoot);
        return sameRootSnapshot(current, expected);
    } catch {
        return false;
    }
}

function assertSafeDirectoryChain(workspaceRoot: string, relativeDirectory: string): void {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    let current = workspaceRoot;
    for (const segment of normalizeRelativePath(relativeDirectory).split('/')) {
        current = path.join(current, segment);
        if (!fs.existsSync(current)) {
            break;
        }
        assertSafeExistingPath(workspaceRealPath, current, 'directory');
    }
}

function inspectControlPaths(workspaceRoot: string): readonly PiTargetDiagnostic[] {
    try {
        safeRealWorkspace(workspaceRoot);
        assertSafeDirectoryChain(workspaceRoot, '.metaflow');
        assertSafeDirectoryChain(
            workspaceRoot,
            path.posix.dirname(PI_PROJECT_PLUGIN_RELATIVE_ROOT),
        );
        return [];
    } catch {
        return [
            targetDiagnostic(
                'PI_TARGET_PATH_CONTAINMENT',
                'The Pi target state or generated package path uses an unsafe, escaping, or unsupported ancestor.',
            ),
        ];
    }
}

/** Load and strictly validate the separate Pi target ledger. */
export function loadPiTargetState(workspaceRoot: string): PiTargetStateLoadResult {
    const targetStatePath = statePath(workspaceRoot);
    if (!fs.existsSync(targetStatePath)) {
        return { exists: false, diagnostics: [] };
    }
    try {
        const workspaceRealPath = safeRealWorkspace(workspaceRoot);
        assertSafeExistingPath(workspaceRealPath, targetStatePath, 'file');
        const raw = fs.readFileSync(targetStatePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (isRecord(parsed) && parsed.schemaVersion !== PI_TARGET_STATE_SCHEMA_VERSION) {
            return {
                exists: true,
                diagnostics: [
                    targetDiagnostic(
                        'PI_TARGET_STATE_VERSION_UNSUPPORTED',
                        `Pi target state schema version "${String(parsed.schemaVersion)}" is unsupported. Remove or migrate the state before reconciliation.`,
                        'error',
                        PI_TARGET_STATE_RELATIVE_PATH,
                    ),
                ],
            };
        }
        const state = parseState(parsed);
        if (!state) {
            return {
                exists: true,
                diagnostics: [
                    targetDiagnostic(
                        'PI_TARGET_STATE_INVALID',
                        'Pi target state is malformed or does not describe the fixed managed package root.',
                        'error',
                        PI_TARGET_STATE_RELATIVE_PATH,
                    ),
                ],
            };
        }
        return { exists: true, state, diagnostics: [] };
    } catch {
        return {
            exists: true,
            diagnostics: [
                targetDiagnostic(
                    'PI_TARGET_STATE_INVALID',
                    'Pi target state could not be safely read or parsed.',
                    'error',
                    PI_TARGET_STATE_RELATIVE_PATH,
                ),
            ],
        };
    }
}

function loadTransactionJournal(workspaceRoot: string):
    | { readonly exists: false }
    | {
          readonly exists: true;
          readonly journal?: PiTargetTransactionJournal;
          readonly diagnostic: PiTargetDiagnostic;
      } {
    const targetJournalPath = journalPath(workspaceRoot);
    if (!fs.existsSync(targetJournalPath)) {
        return { exists: false };
    }
    try {
        const workspaceRealPath = safeRealWorkspace(workspaceRoot);
        assertSafeExistingPath(workspaceRealPath, targetJournalPath, 'file');
        const parsed = parseTransactionJournal(
            JSON.parse(fs.readFileSync(targetJournalPath, 'utf8')) as unknown,
        );
        if (!parsed) {
            return {
                exists: true,
                diagnostic: targetDiagnostic(
                    'PI_TARGET_TRANSACTION_INVALID',
                    'The pending Pi target transaction journal is invalid; no target mutation is allowed.',
                    'error',
                    PI_TARGET_JOURNAL_RELATIVE_PATH,
                ),
            };
        }
        return {
            exists: true,
            journal: parsed,
            diagnostic: targetDiagnostic(
                'PI_TARGET_RECOVERY_REQUIRED',
                'A pending Pi target transaction must be recovered before normal reconciliation.',
                'error',
                PI_TARGET_JOURNAL_RELATIVE_PATH,
            ),
        };
    } catch {
        return {
            exists: true,
            diagnostic: targetDiagnostic(
                'PI_TARGET_TRANSACTION_INVALID',
                'The pending Pi target transaction journal could not be safely read or parsed.',
                'error',
                PI_TARGET_JOURNAL_RELATIVE_PATH,
            ),
        };
    }
}

function fsyncDirectoryBestEffort(directoryPath: string): void {
    let descriptor: number | undefined;
    try {
        descriptor = fs.openSync(directoryPath, 'r');
        fs.fsyncSync(descriptor);
    } catch {
        // Windows may reject directory fsync even though file fsync and rename
        // remain available. Recovery still relies on the durable journal file.
    } finally {
        if (descriptor !== undefined) {
            fs.closeSync(descriptor);
        }
    }
}

function serializeTransactionJournal(journal: PiTargetTransactionJournal): string {
    return `${JSON.stringify({ ...journal, committed: journal.committed ? 1 : 0 }, null, 2)}\n`;
}

function writeTransactionJournal(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    if (journal.committed) {
        throw new Error('A Pi target transaction journal must be published uncommitted');
    }
    const targetJournalPath = journalPath(workspaceRoot);
    const temporaryPath = `${targetJournalPath}.tmp-${randomUUID()}`;
    let descriptor: number | undefined;
    let temporaryIdentity: PiTargetPathIdentity | undefined;
    try {
        descriptor = fs.openSync(temporaryPath, 'wx');
        temporaryIdentity = pathIdentity(fs.fstatSync(descriptor));
        fs.writeFileSync(descriptor, serializeTransactionJournal(journal), 'utf8');
        fs.fsyncSync(descriptor);
        temporaryIdentity = pathIdentity(fs.fstatSync(descriptor));
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.linkSync(temporaryPath, targetJournalPath);
        fsyncDirectoryBestEffort(path.dirname(targetJournalPath));
    } finally {
        if (descriptor !== undefined) {
            try {
                temporaryIdentity = pathIdentity(fs.fstatSync(descriptor));
            } catch {
                // Preserve the last identity captured for fail-closed cleanup.
            }
            fs.closeSync(descriptor);
        }
        if (temporaryIdentity && fs.existsSync(temporaryPath)) {
            try {
                removeVerifiedIdentityFile(workspaceRoot, temporaryPath, temporaryIdentity);
            } catch {
                // A changed or inaccessible temporary journal is preserved.
            }
        }
    }
}

function markTransactionJournalCommitted(
    workspaceRoot: string,
    expected: PiTargetTransactionJournal,
): PiTargetTransactionJournal {
    if (expected.committed) {
        throw new Error('Pi target transaction journal is already committed');
    }
    const targetJournalPath = journalPath(workspaceRoot);
    const expectedContent = serializeTransactionJournal(expected);
    const marker = '"committed": 0';
    const markerIndex = expectedContent.indexOf(marker);
    if (markerIndex < 0) {
        throw new Error('Pi target transaction journal commit marker is missing');
    }
    const markerOffset = Buffer.byteLength(expectedContent.slice(0, markerIndex));
    const descriptor = fs.openSync(targetJournalPath, 'r+');
    let openedIdentity: PiTargetPathIdentity;
    try {
        openedIdentity = pathIdentity(fs.fstatSync(descriptor));
        const currentContent = fs.readFileSync(descriptor, 'utf8');
        if (currentContent !== expectedContent) {
            throw new Error('Pi target transaction journal changed before commit');
        }
        fs.writeSync(
            descriptor,
            Buffer.from('1', 'utf8'),
            0,
            1,
            markerOffset + Buffer.byteLength('"committed": '),
        );
        fs.fsyncSync(descriptor);
        if (!sameIdentity(pathIdentity(fs.fstatSync(descriptor)), openedIdentity)) {
            throw new Error('Pi target transaction journal identity changed during commit');
        }
    } finally {
        fs.closeSync(descriptor);
    }
    const committed = loadTransactionJournal(workspaceRoot);
    const expectedCommitted = { ...expected, committed: true };
    if (
        !committed.exists ||
        !committed.journal ||
        JSON.stringify(committed.journal) !== JSON.stringify(expectedCommitted)
    ) {
        throw new Error('Pi target transaction journal path changed during commit');
    }
    return expectedCommitted;
}

function collectRootInventory(workspaceRoot: string): ObservedTargetRoot {
    const rootPath = outputRootPath(workspaceRoot);
    if (!fs.existsSync(rootPath)) {
        return { exists: false, files: new Map(), directories: new Set(), diagnostics: [] };
    }
    const files = new Map<string, string>();
    const directories = new Set<string>();
    try {
        const workspaceRealPath = safeRealWorkspace(workspaceRoot);
        assertSafeDirectoryChain(
            workspaceRoot,
            path.posix.dirname(PI_PROJECT_PLUGIN_RELATIVE_ROOT),
        );
        assertSafeExistingPath(workspaceRealPath, rootPath, 'directory');
        const realRootPath = fs.realpathSync(rootPath);

        const visit = (absoluteDirectory: string, relativeDirectory: string): void => {
            const entries = fs
                .readdirSync(absoluteDirectory, { withFileTypes: true })
                .sort((left, right) => compareCodeUnits(left.name, right.name));
            for (const entry of entries) {
                const relativePath = relativeDirectory
                    ? `${relativeDirectory}/${entry.name}`
                    : entry.name;
                if (!isSafePackagePath(relativePath)) {
                    throw new Error('generated root contains an unsupported path');
                }
                const absolutePath = path.join(absoluteDirectory, entry.name);
                const stats = fs.lstatSync(absolutePath);
                if (stats.isSymbolicLink()) {
                    throw new Error('generated root contains a symbolic link or junction');
                }
                const realPath = fs.realpathSync(absolutePath);
                if (!isInside(workspaceRealPath, realPath) || !isInside(realRootPath, realPath)) {
                    throw new Error('generated root contains a filesystem-resolved escape');
                }
                if (stats.isDirectory()) {
                    directories.add(relativePath);
                    visit(absolutePath, relativePath);
                } else if (stats.isFile()) {
                    files.set(relativePath, sha256(fs.readFileSync(absolutePath)));
                } else {
                    throw new Error('generated root contains a non-regular filesystem entry');
                }
            }
        };
        visit(rootPath, '');
        return { exists: true, files, directories, diagnostics: [] };
    } catch {
        return {
            exists: true,
            files,
            directories,
            diagnostics: [
                targetDiagnostic(
                    'PI_TARGET_PATH_CONTAINMENT',
                    'The generated Pi package root contains an unsafe, escaping, or unsupported filesystem entry.',
                    'error',
                    PI_PROJECT_PLUGIN_RELATIVE_ROOT,
                ),
            ],
        };
    }
}

function expectedDirectories(relativePaths: readonly string[]): ReadonlySet<string> {
    const directories = new Set<string>();
    for (const relativePath of relativePaths) {
        const segments = relativePath.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            directories.add(segments.slice(0, index).join('/'));
        }
    }
    return directories;
}

function desiredStateFor(projectedPackage: PiSkillsProjectionPackage): PiTargetState {
    verifyProjectedPackage(projectedPackage);
    const files: Record<string, PiTargetManagedFileState> = {};
    for (const file of projectedPackage.files) {
        if (!isSafePackagePath(file.relativePath) || !HASH_PATTERN.test(file.contentHash)) {
            throw new Error(`Projected file path or hash is invalid: ${file.relativePath}`);
        }
        if (files[file.relativePath]) {
            throw new Error(`Projected file path is duplicated: ${file.relativePath}`);
        }
        files[file.relativePath] = {
            contentHash: file.contentHash,
            sources: canonicalSources(file.sources),
        };
    }
    if (!files['plugin.json']) {
        throw new Error('Projected package does not contain plugin.json');
    }
    return canonicalState({
        schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION,
        outputRoot: PI_PROJECT_PLUGIN_RELATIVE_ROOT,
        projection: {
            contentSha: projectedPackage.contentSha,
            version: projectedPackage.version,
        },
        files,
    });
}

function verifyProjectedPackage(projectedPackage: PiSkillsProjectionPackage): void {
    const skillInputs = projectedPackage.files
        .filter((file) => file.relativePath !== 'plugin.json')
        .map((file) => {
            const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.relativePath);
            if (!match || file.sources.length !== 1) {
                throw new Error(`Unsupported projected Pi package path: ${file.relativePath}`);
            }
            return {
                name: match[1],
                content: Buffer.from(file.content),
                source: cloneSource(file.sources[0]),
            };
        });
    if (projectedPackage.files.filter((file) => file.relativePath === 'plugin.json').length !== 1) {
        throw new Error('Projected Pi package must contain exactly one plugin.json');
    }
    const verified = projectPiAgentPluginSkills({ skills: skillInputs });
    if (verified.blocked) {
        throw new Error('Projected Pi package does not re-project successfully');
    }
    if (
        projectedPackage.contentSha !== verified.package.contentSha ||
        projectedPackage.version !== verified.package.version ||
        JSON.stringify(projectedPackage.manifest) !== JSON.stringify(verified.package.manifest) ||
        projectedPackage.files.length !== verified.package.files.length
    ) {
        throw new Error('Projected Pi package identity does not match its verified skill bytes');
    }
    const actualFiles = [...projectedPackage.files].sort((left, right) =>
        compareCodeUnits(left.relativePath, right.relativePath),
    );
    for (let index = 0; index < verified.package.files.length; index += 1) {
        const actual = actualFiles[index];
        const expected = verified.package.files[index];
        if (
            actual.relativePath !== expected.relativePath ||
            actual.contentHash !== expected.contentHash ||
            sha256(actual.content) !== actual.contentHash ||
            !Buffer.from(actual.content).equals(Buffer.from(expected.content)) ||
            JSON.stringify(canonicalSources(actual.sources)) !==
                JSON.stringify(canonicalSources(expected.sources))
        ) {
            throw new Error(
                `Projected Pi package file failed verification: ${actual.relativePath}`,
            );
        }
    }
}

function validateObservedOwnership(
    observed: ObservedTargetRoot,
    state: PiTargetState,
): readonly PiTargetDiagnostic[] {
    const diagnostics: PiTargetDiagnostic[] = [...observed.diagnostics];
    if (!observed.exists || diagnostics.length > 0) {
        return diagnostics;
    }
    const trackedPaths = Object.keys(state.files);
    const allowedDirectories = expectedDirectories(trackedPaths);
    for (const relativePath of observed.directories) {
        if (!allowedDirectories.has(relativePath)) {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_UNMANAGED_CONTENT',
                    `Generated Pi package directory "${relativePath}" is not recorded in target state.`,
                    'error',
                    `${PI_PROJECT_PLUGIN_RELATIVE_ROOT}/${relativePath}`,
                ),
            );
        }
    }
    for (const [relativePath, currentHash] of observed.files) {
        const expected = state.files[relativePath];
        if (!expected) {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_UNMANAGED_CONTENT',
                    `Generated Pi package file "${relativePath}" is not recorded in target state.`,
                    'error',
                    `${PI_PROJECT_PLUGIN_RELATIVE_ROOT}/${relativePath}`,
                ),
            );
        } else if (currentHash !== expected.contentHash) {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_DRIFT',
                    `Generated Pi package file "${relativePath}" differs from its recorded managed hash.`,
                    'error',
                    `${PI_PROJECT_PLUGIN_RELATIVE_ROOT}/${relativePath}`,
                ),
            );
        }
    }
    return diagnostics.sort((left, right) =>
        compareCodeUnits(
            `${left.code}:${left.filePath ?? ''}`,
            `${right.code}:${right.filePath ?? ''}`,
        ),
    );
}

function emptyPlan(
    options: PiProjectPluginPlanOptions,
    diagnostics: readonly PiTargetDiagnostic[],
    blocked: boolean,
    currentState?: PiTargetState,
): PiProjectPluginSynchronizationPlan {
    return {
        enabled: options.enabled,
        blocked,
        changes: [],
        stateAction: 'none',
        diagnostics: canonicalDiagnostics(diagnostics),
        ...(currentState ? { currentState } : {}),
        ...(options.projection ? { projection: options.projection } : {}),
    };
}

/** Build a read-only, complete preflight plan for the fixed Pi package root. */
export function planPiProjectPluginSynchronization(
    options: PiProjectPluginPlanOptions,
): PiProjectPluginSynchronizationPlan {
    const controlPathDiagnostics = inspectControlPaths(options.workspaceRoot);
    const transactionLoad = loadTransactionJournal(options.workspaceRoot);
    const stateLoad = loadPiTargetState(options.workspaceRoot);
    const observed = collectRootInventory(options.workspaceRoot);
    const diagnostics: PiTargetDiagnostic[] = [
        ...controlPathDiagnostics,
        ...(transactionLoad.exists ? [transactionLoad.diagnostic] : []),
        ...stateLoad.diagnostics,
        ...observed.diagnostics,
        ...(options.projection?.diagnostics ?? []),
    ];
    if (
        controlPathDiagnostics.length > 0 ||
        transactionLoad.exists ||
        stateLoad.diagnostics.length > 0 ||
        observed.diagnostics.length > 0
    ) {
        return emptyPlan(options, diagnostics, true, stateLoad.state);
    }

    const currentState = stateLoad.state;
    if (!currentState) {
        if (!options.enabled) {
            if (observed.exists) {
                diagnostics.push(
                    targetDiagnostic(
                        'PI_TARGET_ROOT_UNTRACKED',
                        'An unmanaged Pi package root exists and is preserved while the target is disabled.',
                        'info',
                        PI_PROJECT_PLUGIN_RELATIVE_ROOT,
                    ),
                );
            }
            return emptyPlan(options, diagnostics, false);
        }
        if (observed.exists) {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_ROOT_UNTRACKED',
                    'The fixed Pi package root already exists without MetaFlow target state.',
                    'error',
                    PI_PROJECT_PLUGIN_RELATIVE_ROOT,
                ),
            );
            return emptyPlan(options, diagnostics, true);
        }
    } else {
        const ownershipDiagnostics = validateObservedOwnership(observed, currentState);
        diagnostics.push(...ownershipDiagnostics);
        if (ownershipDiagnostics.length > 0) {
            return emptyPlan(options, diagnostics, true, currentState);
        }
    }

    if (!options.enabled) {
        if (!currentState) {
            return emptyPlan(options, diagnostics, false);
        }
        const changes = [...observed.files.keys()]
            .sort(compareCodeUnits)
            .map((relativePath) => ({ relativePath, action: 'remove' as const }));
        return {
            enabled: false,
            blocked: false,
            changes,
            stateAction: 'remove',
            diagnostics: canonicalDiagnostics(diagnostics),
            currentState,
            ...(options.projection ? { projection: options.projection } : {}),
        };
    }

    if (!options.projection) {
        diagnostics.push(
            targetDiagnostic(
                'PI_TARGET_PROJECTION_REQUIRED',
                'An enabled Pi target requires a resolved skills projection before reconciliation.',
            ),
        );
        return emptyPlan(options, diagnostics, true, currentState);
    }
    if (options.projection.blocked) {
        diagnostics.push(
            targetDiagnostic(
                'PI_TARGET_PROJECTION_BLOCKED',
                'The Pi package projection is blocked; existing managed output is preserved.',
            ),
        );
        return emptyPlan(options, diagnostics, true, currentState);
    }

    let desiredState: PiTargetState;
    try {
        desiredState = desiredStateFor(options.projection.package);
    } catch {
        diagnostics.push(
            targetDiagnostic(
                'PI_TARGET_PROJECTION_INVALID',
                'The projected Pi package contains an invalid or duplicate managed path.',
            ),
        );
        return emptyPlan(options, diagnostics, true, currentState);
    }

    const changes: PiTargetChange[] = [];
    for (const relativePath of Object.keys(desiredState.files).sort(compareCodeUnits)) {
        const currentHash = observed.files.get(relativePath);
        if (currentHash === undefined) {
            changes.push({ relativePath, action: 'add' });
        } else if (currentHash !== desiredState.files[relativePath].contentHash) {
            changes.push({ relativePath, action: 'update' });
        }
    }
    if (currentState) {
        for (const relativePath of Object.keys(currentState.files).sort(compareCodeUnits)) {
            if (!desiredState.files[relativePath] && observed.files.has(relativePath)) {
                changes.push({ relativePath, action: 'remove' });
            }
        }
    }
    changes.sort(
        (left, right) =>
            compareCodeUnits(left.relativePath, right.relativePath) ||
            compareCodeUnits(left.action, right.action),
    );
    const stateAction: PiTargetStateAction =
        !currentState || serializeState(currentState) !== serializeState(desiredState)
            ? 'write'
            : 'none';

    return {
        enabled: true,
        blocked: false,
        changes,
        stateAction,
        diagnostics: canonicalDiagnostics(diagnostics),
        ...(currentState ? { currentState } : {}),
        desiredState,
        projection: options.projection,
    };
}

function planIdentity(plan: PiProjectPluginSynchronizationPlan): string {
    return JSON.stringify({
        blocked: plan.blocked,
        changes: plan.changes,
        stateAction: plan.stateAction,
        currentState: plan.currentState,
        desiredState: plan.desiredState,
    });
}

function quarantinePath(targetPath: string): string {
    return path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.metaflow-delete-${randomUUID()}`,
    );
}

function restoreQuarantinedPath(originalPath: string, quarantinedPath: string): void {
    if (!fs.existsSync(quarantinedPath)) {
        return;
    }
    if (fs.existsSync(originalPath)) {
        throw new Error('A replacement appeared while a Pi target artifact was quarantined');
    }
    const stats = fs.lstatSync(quarantinedPath);
    if (stats.isFile() && !stats.isSymbolicLink()) {
        fs.linkSync(quarantinedPath, originalPath);
        return;
    }
    fs.renameSync(quarantinedPath, originalPath);
}

function removeVerifiedIdentityFile(
    workspaceRoot: string,
    absolutePath: string,
    expectedIdentity: PiTargetPathIdentity,
): void {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, absolutePath, 'file');
    if (!sameIdentity(pathIdentity(fs.lstatSync(absolutePath)), expectedIdentity)) {
        throw new Error('Refusing to remove a Pi target file whose identity changed');
    }
    const quarantinedPath = quarantinePath(absolutePath);
    fs.renameSync(absolutePath, quarantinedPath);
    try {
        assertSafeExistingPath(workspaceRealPath, quarantinedPath, 'file');
        if (!sameIdentity(pathIdentity(fs.lstatSync(quarantinedPath)), expectedIdentity)) {
            throw new Error('Quarantined Pi target file identity changed');
        }
    } catch (error) {
        restoreQuarantinedPath(absolutePath, quarantinedPath);
        throw error;
    }
    fs.rmSync(quarantinedPath, { force: false });
}

function createTransactionRoot(workspaceRoot: string, transactionId: string): string {
    assertSafeDirectoryChain(workspaceRoot, '.metaflow');
    const metaflowDirectory = path.join(workspaceRoot, '.metaflow');
    fs.mkdirSync(metaflowDirectory, { recursive: true });
    assertSafeDirectoryChain(workspaceRoot, '.metaflow');
    const transactionRoot = transactionRootPath(workspaceRoot, transactionId);
    fs.mkdirSync(transactionRoot, { recursive: false });
    return transactionRoot;
}

function acquireTargetLock(
    workspaceRoot: string,
): { readonly lock: PiTargetLock } | { readonly diagnostic: PiTargetDiagnostic } {
    let descriptor: number | undefined;
    let lockPath: string | undefined;
    let lockIdentity: PiTargetPathIdentity | undefined;
    try {
        assertSafeDirectoryChain(workspaceRoot, '.metaflow');
        const metaflowDirectory = path.join(workspaceRoot, '.metaflow');
        fs.mkdirSync(metaflowDirectory, { recursive: true });
        assertSafeDirectoryChain(workspaceRoot, '.metaflow');
        lockPath = path.join(workspaceRoot, ...PI_TARGET_LOCK_RELATIVE_PATH.split('/'));
        descriptor = fs.openSync(lockPath, 'wx');
        lockIdentity = pathIdentity(fs.fstatSync(descriptor));
        fs.writeFileSync(descriptor, 'MetaFlow Pi target reconciliation lock\n', 'utf8');
        fs.fsyncSync(descriptor);
        lockIdentity = pathIdentity(fs.fstatSync(descriptor));
        return { lock: { descriptor, lockPath, workspaceRoot, identity: lockIdentity } };
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (descriptor !== undefined) {
            try {
                fs.closeSync(descriptor);
            } catch {
                // Preserve the original acquisition failure below.
            }
        }
        if (lockPath && lockIdentity && fs.existsSync(lockPath)) {
            try {
                removeVerifiedIdentityFile(workspaceRoot, lockPath, lockIdentity);
            } catch {
                // A residual or replaced lock remains fail-closed.
            }
        }
        return {
            diagnostic: targetDiagnostic(
                code === 'EEXIST' ? 'PI_TARGET_RECONCILIATION_BUSY' : 'PI_TARGET_LOCK_FAILED',
                code === 'EEXIST'
                    ? 'Another Pi target reconciliation may be active. If no MetaFlow process is running, remove the stale .metaflow/pi-target.lock file and retry.'
                    : 'MetaFlow could not acquire the project-local Pi target reconciliation lock.',
                'error',
                PI_TARGET_LOCK_RELATIVE_PATH,
            ),
        };
    }
}

function releaseTargetLock(lock: PiTargetLock): void {
    try {
        fs.closeSync(lock.descriptor);
    } finally {
        try {
            removeVerifiedIdentityFile(lock.workspaceRoot, lock.lockPath, lock.identity);
        } catch {
            // A replaced or stale lock fails closed on the next operation.
        }
    }
}

function stagePackage(
    transactionRoot: string,
    projectedPackage: PiSkillsProjectionPackage,
): string {
    verifyProjectedPackage(projectedPackage);
    const stagedRoot = path.join(transactionRoot, 'next-package');
    fs.mkdirSync(stagedRoot, { recursive: false });
    for (const file of projectedPackage.files) {
        if (!isSafePackagePath(file.relativePath)) {
            throw new Error(`Invalid projected path: ${file.relativePath}`);
        }
        const destination = path.join(stagedRoot, ...file.relativePath.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const descriptor = fs.openSync(destination, 'wx');
        try {
            fs.writeFileSync(descriptor, file.content);
            fs.fsyncSync(descriptor);
        } finally {
            fs.closeSync(descriptor);
        }
        if (sha256(fs.readFileSync(destination)) !== file.contentHash) {
            throw new Error(`Staged file hash mismatch: ${file.relativePath}`);
        }
    }
    return stagedRoot;
}

function stageState(transactionRoot: string, state: PiTargetState): string {
    const stagedState = path.join(transactionRoot, 'next-state.json');
    const descriptor = fs.openSync(stagedState, 'wx');
    try {
        fs.writeFileSync(descriptor, serializeState(state), 'utf8');
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    return stagedState;
}

function ensureOutputParent(workspaceRoot: string): void {
    const parentRelative = path.posix.dirname(PI_PROJECT_PLUGIN_RELATIVE_ROOT);
    assertSafeDirectoryChain(workspaceRoot, parentRelative);
    fs.mkdirSync(path.join(workspaceRoot, ...parentRelative.split('/')), { recursive: true });
    assertSafeDirectoryChain(workspaceRoot, parentRelative);
}

function assertKnownTransactionEntries(transactionRoot: string): void {
    const allowed = new Set([
        'next-package',
        'next-state.json',
        'previous-package',
        'previous-state.json',
    ]);
    for (const entry of fs.readdirSync(transactionRoot)) {
        if (!allowed.has(entry)) {
            throw new Error(`Unexpected Pi target transaction entry: ${entry}`);
        }
    }
}

function expectedPreparedTransactionSnapshot(
    transactionRootIdentity: PiTargetPathIdentity,
    nextRoot?: PiTargetRootSnapshot,
    nextState?: PiTargetFileSnapshot,
): PiTargetRootSnapshot {
    const files: Record<string, PiTargetFileSnapshot> = {};
    const directories: Record<string, PiTargetPathIdentity> = {};
    if (nextRoot) {
        directories['next-package'] = nextRoot.identity;
        for (const [relativePath, identity] of Object.entries(nextRoot.directories)) {
            directories[`next-package/${relativePath}`] = identity;
        }
        for (const [relativePath, snapshot] of Object.entries(nextRoot.files)) {
            files[`next-package/${relativePath}`] = snapshot;
        }
    }
    if (nextState) {
        files['next-state.json'] = nextState;
    }
    return { identity: transactionRootIdentity, files, directories };
}

function removeVerifiedRoot(
    workspaceRoot: string,
    absoluteRoot: string,
    snapshot: PiTargetRootSnapshot,
): void {
    if (!matchesRootSnapshot(workspaceRoot, absoluteRoot, snapshot)) {
        throw new Error(
            'Refusing to remove a Pi target directory whose identity or inventory changed',
        );
    }
    const quarantinedRoot = quarantinePath(absoluteRoot);
    fs.renameSync(absoluteRoot, quarantinedRoot);
    if (!matchesRootSnapshot(workspaceRoot, quarantinedRoot, snapshot)) {
        restoreQuarantinedPath(absoluteRoot, quarantinedRoot);
        throw new Error(
            'Refusing to remove a quarantined Pi target directory whose identity or inventory changed',
        );
    }
    fs.rmSync(quarantinedRoot, { recursive: true, force: false });
}

function removeVerifiedFile(
    workspaceRoot: string,
    absolutePath: string,
    snapshot: PiTargetFileSnapshot,
): void {
    if (!matchesFileSnapshot(workspaceRoot, absolutePath, snapshot)) {
        throw new Error('Refusing to remove a Pi target file whose identity or bytes changed');
    }
    const quarantinedPath = quarantinePath(absolutePath);
    fs.renameSync(absolutePath, quarantinedPath);
    if (!matchesFileSnapshot(workspaceRoot, quarantinedPath, snapshot)) {
        restoreQuarantinedPath(absolutePath, quarantinedPath);
        throw new Error(
            'Refusing to remove a quarantined Pi target file whose identity or bytes changed',
        );
    }
    fs.rmSync(quarantinedPath, { force: false });
}

function linkVerifiedFileNoReplace(
    workspaceRoot: string,
    sourcePath: string,
    destinationPath: string,
    snapshot: PiTargetFileSnapshot,
): void {
    if (!matchesFileSnapshot(workspaceRoot, sourcePath, snapshot)) {
        throw new Error('Source Pi target file changed before no-replace publication');
    }
    fs.linkSync(sourcePath, destinationPath);
    if (!matchesFileSnapshot(workspaceRoot, destinationPath, snapshot)) {
        throw new Error('Published Pi target file identity or bytes changed');
    }
}

function removeJournal(workspaceRoot: string, expected: PiTargetTransactionJournal): void {
    const loaded = loadTransactionJournal(workspaceRoot);
    if (
        !loaded.exists ||
        !loaded.journal ||
        JSON.stringify(loaded.journal) !== JSON.stringify(expected)
    ) {
        throw new Error('Pi target transaction journal changed during recovery');
    }
    const targetJournalPath = journalPath(workspaceRoot);
    const snapshot = captureFileSnapshot(workspaceRoot, targetJournalPath);
    removeVerifiedFile(workspaceRoot, targetJournalPath, snapshot);
    fsyncDirectoryBestEffort(path.dirname(journalPath(workspaceRoot)));
}

function removeTransactionDirectoryIfEmpty(
    workspaceRoot: string,
    transactionRoot: string,
    expectedIdentity: PiTargetPathIdentity,
): void {
    const snapshot = captureRootSnapshot(workspaceRoot, transactionRoot);
    if (
        !sameIdentity(snapshot.identity, expectedIdentity) ||
        Object.keys(snapshot.files).length !== 0 ||
        Object.keys(snapshot.directories).length !== 0
    ) {
        throw new Error('Pi target transaction directory still contains recovery artifacts');
    }
    removeVerifiedRoot(workspaceRoot, transactionRoot, snapshot);
}

function rollbackUncommittedTransaction(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    const rootPath = outputRootPath(workspaceRoot);
    const targetStatePath = statePath(workspaceRoot);
    const previousRootPath = path.join(transactionRoot, 'previous-package');
    const previousStatePath = path.join(transactionRoot, 'previous-state.json');
    const stagedRootPath = path.join(transactionRoot, 'next-package');
    const stagedStatePath = path.join(transactionRoot, 'next-state.json');
    assertSafeExistingPath(safeRealWorkspace(workspaceRoot), transactionRoot, 'directory');
    assertKnownTransactionEntries(transactionRoot);

    if (journal.rootAction !== 'none') {
        if (journal.previousRoot) {
            if (fs.existsSync(previousRootPath)) {
                if (fs.existsSync(rootPath)) {
                    if (
                        !journal.nextRoot ||
                        !matchesRootSnapshot(workspaceRoot, rootPath, journal.nextRoot)
                    ) {
                        throw new Error(
                            'Current Pi target root is not the staged package during rollback',
                        );
                    }
                    removeVerifiedRoot(workspaceRoot, rootPath, journal.nextRoot);
                }
                fs.renameSync(previousRootPath, rootPath);
            } else if (
                !fs.existsSync(rootPath) ||
                !matchesRootSnapshot(workspaceRoot, rootPath, journal.previousRoot)
            ) {
                throw new Error('Previous Pi target root cannot be located for rollback');
            }
        } else {
            if (fs.existsSync(previousRootPath)) {
                throw new Error('Unexpected previous Pi target root exists during rollback');
            }
            if (fs.existsSync(rootPath)) {
                if (
                    !journal.nextRoot ||
                    !matchesRootSnapshot(workspaceRoot, rootPath, journal.nextRoot)
                ) {
                    throw new Error('Untracked Pi target root appeared during rollback');
                }
                removeVerifiedRoot(workspaceRoot, rootPath, journal.nextRoot);
            }
        }
    }

    if (journal.previousState) {
        if (fs.existsSync(previousStatePath)) {
            let previousStateAlreadyLive = false;
            if (fs.existsSync(targetStatePath)) {
                if (matchesFileSnapshot(workspaceRoot, targetStatePath, journal.previousState)) {
                    removeVerifiedFile(workspaceRoot, previousStatePath, journal.previousState);
                    previousStateAlreadyLive = true;
                } else if (
                    journal.nextState &&
                    matchesFileSnapshot(workspaceRoot, targetStatePath, journal.nextState)
                ) {
                    removeVerifiedFile(workspaceRoot, targetStatePath, journal.nextState);
                } else {
                    throw new Error(
                        'Current Pi target state is neither the previous nor staged state during rollback',
                    );
                }
            }
            if (!previousStateAlreadyLive) {
                linkVerifiedFileNoReplace(
                    workspaceRoot,
                    previousStatePath,
                    targetStatePath,
                    journal.previousState,
                );
                removeVerifiedFile(workspaceRoot, previousStatePath, journal.previousState);
            }
        } else if (
            !fs.existsSync(targetStatePath) ||
            !matchesFileSnapshot(workspaceRoot, targetStatePath, journal.previousState)
        ) {
            throw new Error('Previous Pi target state cannot be located for rollback');
        }
    } else {
        if (fs.existsSync(previousStatePath)) {
            throw new Error('Unexpected previous Pi target state exists during rollback');
        }
        if (fs.existsSync(targetStatePath)) {
            if (
                !journal.nextState ||
                !matchesFileSnapshot(workspaceRoot, targetStatePath, journal.nextState)
            ) {
                throw new Error('Untracked Pi target state appeared during rollback');
            }
            removeVerifiedFile(workspaceRoot, targetStatePath, journal.nextState);
        }
    }

    if (fs.existsSync(stagedRootPath)) {
        if (!journal.nextRoot) {
            throw new Error('Unexpected staged Pi target package exists during rollback');
        }
        removeVerifiedRoot(workspaceRoot, stagedRootPath, journal.nextRoot);
    }
    if (fs.existsSync(stagedStatePath)) {
        if (!journal.nextState) {
            throw new Error('Unexpected staged Pi target state exists during rollback');
        }
        removeVerifiedFile(workspaceRoot, stagedStatePath, journal.nextState);
    }
    assertKnownTransactionEntries(transactionRoot);
    removeTransactionDirectoryIfEmpty(
        workspaceRoot,
        transactionRoot,
        journal.transactionRootIdentity,
    );
    removeJournal(workspaceRoot, journal);
}

function finalizeCommittedTransaction(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    const rootPath = outputRootPath(workspaceRoot);
    const targetStatePath = statePath(workspaceRoot);
    const previousRootPath = path.join(transactionRoot, 'previous-package');
    const previousStatePath = path.join(transactionRoot, 'previous-state.json');
    const stagedRootPath = path.join(transactionRoot, 'next-package');
    const stagedStatePath = path.join(transactionRoot, 'next-state.json');
    assertSafeExistingPath(safeRealWorkspace(workspaceRoot), transactionRoot, 'directory');
    assertKnownTransactionEntries(transactionRoot);

    if (journal.rootAction === 'replace') {
        if (!journal.nextRoot || !matchesRootSnapshot(workspaceRoot, rootPath, journal.nextRoot)) {
            throw new Error('Committed Pi target package is missing or changed');
        }
    } else if (journal.rootAction === 'remove' && fs.existsSync(rootPath)) {
        throw new Error('Committed Pi target cleanup still has a target root');
    }
    if (journal.stateAction === 'write') {
        if (
            !journal.nextState ||
            !matchesFileSnapshot(workspaceRoot, targetStatePath, journal.nextState)
        ) {
            throw new Error('Committed Pi target state is missing or changed');
        }
    } else if (fs.existsSync(targetStatePath)) {
        throw new Error('Committed Pi target cleanup still has target state');
    }

    if (fs.existsSync(previousRootPath)) {
        if (!journal.previousRoot) {
            throw new Error('Unexpected previous Pi target package exists after commit');
        }
        removeVerifiedRoot(workspaceRoot, previousRootPath, journal.previousRoot);
    } else if (journal.previousRoot && journal.rootAction !== 'none') {
        throw new Error('Previous Pi target package disappeared before committed cleanup');
    }
    if (fs.existsSync(previousStatePath)) {
        if (!journal.previousState) {
            throw new Error('Unexpected previous Pi target state exists after commit');
        }
        removeVerifiedFile(workspaceRoot, previousStatePath, journal.previousState);
    } else if (journal.previousState) {
        throw new Error('Previous Pi target state disappeared before committed cleanup');
    }
    if (fs.existsSync(stagedRootPath)) {
        if (!journal.nextRoot) {
            throw new Error('Unexpected staged Pi target package exists after commit');
        }
        removeVerifiedRoot(workspaceRoot, stagedRootPath, journal.nextRoot);
    }
    if (fs.existsSync(stagedStatePath)) {
        if (!journal.nextState) {
            throw new Error('Unexpected staged Pi target state exists after commit');
        }
        removeVerifiedFile(workspaceRoot, stagedStatePath, journal.nextState);
    }
    removeTransactionDirectoryIfEmpty(
        workspaceRoot,
        transactionRoot,
        journal.transactionRootIdentity,
    );
    removeJournal(workspaceRoot, journal);
}

function transactionOutcomeIsCoherentWithoutArtifacts(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): boolean {
    const rootPath = outputRootPath(workspaceRoot);
    const targetStatePath = statePath(workspaceRoot);
    if (journal.committed) {
        const rootCoherent =
            journal.rootAction === 'none' ||
            (journal.rootAction === 'remove'
                ? !fs.existsSync(rootPath)
                : journal.nextRoot !== undefined &&
                  matchesRootSnapshot(workspaceRoot, rootPath, journal.nextRoot));
        const stateCoherent =
            journal.stateAction === 'remove'
                ? !fs.existsSync(targetStatePath)
                : journal.nextState !== undefined &&
                  matchesFileSnapshot(workspaceRoot, targetStatePath, journal.nextState);
        return rootCoherent && stateCoherent;
    }
    const rootCoherent =
        journal.rootAction === 'none' ||
        (journal.previousRoot
            ? matchesRootSnapshot(workspaceRoot, rootPath, journal.previousRoot)
            : !fs.existsSync(rootPath));
    const stateCoherent = journal.previousState
        ? matchesFileSnapshot(workspaceRoot, targetStatePath, journal.previousState)
        : !fs.existsSync(targetStatePath);
    return rootCoherent && stateCoherent;
}

function recoverPendingTransaction(workspaceRoot: string): PiTargetRecoveryResult {
    const loaded = loadTransactionJournal(workspaceRoot);
    if (!loaded.exists) {
        return { recovered: false, diagnostics: [] };
    }
    if (!loaded.journal) {
        return { recovered: false, diagnostics: [loaded.diagnostic] };
    }
    try {
        const transactionRoot = transactionRootPath(workspaceRoot, loaded.journal.transactionId);
        if (!fs.existsSync(transactionRoot)) {
            if (!transactionOutcomeIsCoherentWithoutArtifacts(workspaceRoot, loaded.journal)) {
                throw new Error('Transaction artifacts disappeared before a coherent outcome');
            }
            removeJournal(workspaceRoot, loaded.journal);
            return { recovered: true, diagnostics: [] };
        }
        if (loaded.journal.committed) {
            finalizeCommittedTransaction(workspaceRoot, loaded.journal);
        } else {
            rollbackUncommittedTransaction(workspaceRoot, loaded.journal);
        }
        return { recovered: true, diagnostics: [] };
    } catch {
        return {
            recovered: false,
            diagnostics: [
                targetDiagnostic(
                    'PI_TARGET_RECOVERY_CONFLICT',
                    'Pending Pi target recovery encountered changed or unrecognized content; all recovery artifacts were preserved.',
                    'error',
                    PI_TARGET_JOURNAL_RELATIVE_PATH,
                ),
            ],
        };
    }
}

function commitJournaledTransaction(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    const rootPath = outputRootPath(workspaceRoot);
    const targetStatePath = statePath(workspaceRoot);
    const previousRootPath = path.join(transactionRoot, 'previous-package');
    const previousStatePath = path.join(transactionRoot, 'previous-state.json');
    const stagedRootPath = path.join(transactionRoot, 'next-package');
    const stagedStatePath = path.join(transactionRoot, 'next-state.json');
    try {
        if (journal.rootAction !== 'none') {
            ensureOutputParent(workspaceRoot);
            if (journal.previousRoot) {
                fs.renameSync(rootPath, previousRootPath);
                if (!matchesRootSnapshot(workspaceRoot, previousRootPath, journal.previousRoot)) {
                    throw new Error(
                        'Moved Pi target root no longer matches its preflight identity',
                    );
                }
            } else if (fs.existsSync(rootPath)) {
                throw new Error('An untracked Pi target root appeared after preflight');
            }
            if (journal.rootAction === 'replace') {
                if (
                    !journal.nextRoot ||
                    !matchesRootSnapshot(workspaceRoot, stagedRootPath, journal.nextRoot)
                ) {
                    throw new Error('Staged Pi target package changed before installation');
                }
                fs.renameSync(stagedRootPath, rootPath);
                if (!matchesRootSnapshot(workspaceRoot, rootPath, journal.nextRoot)) {
                    throw new Error('Installed Pi target package changed during installation');
                }
            }
        }
        if (journal.previousState) {
            linkVerifiedFileNoReplace(
                workspaceRoot,
                targetStatePath,
                previousStatePath,
                journal.previousState,
            );
            removeVerifiedFile(workspaceRoot, targetStatePath, journal.previousState);
        } else if (fs.existsSync(targetStatePath)) {
            throw new Error('Untracked Pi target state appeared after preflight');
        }
        if (journal.stateAction === 'write') {
            if (
                !journal.nextState ||
                !matchesFileSnapshot(workspaceRoot, stagedStatePath, journal.nextState)
            ) {
                throw new Error('Staged Pi target state changed before installation');
            }
            linkVerifiedFileNoReplace(
                workspaceRoot,
                stagedStatePath,
                targetStatePath,
                journal.nextState,
            );
        }
    } catch (error) {
        const recovery = recoverPendingTransaction(workspaceRoot);
        if (recovery.diagnostics.length > 0) {
            throw new Error(
                `Pi target transaction failed and automatic rollback was blocked: ${recovery.diagnostics[0].message}`,
                { cause: error },
            );
        }
        throw error;
    }

    markTransactionJournalCommitted(workspaceRoot, journal);
    const recovery = recoverPendingTransaction(workspaceRoot);
    if (recovery.diagnostics.length > 0) {
        throw new Error(recovery.diagnostics[0].message);
    }
}

/**
 * Apply an enabled projection or disabled cleanup after a complete preflight.
 * A second plan is taken after staging so ordinary concurrent drift fails closed.
 */
export function applyPiProjectPluginSynchronization(
    options: PiProjectPluginPlanOptions,
): PiProjectPluginApplyResult {
    let firstPlan = planPiProjectPluginSynchronization(options);
    const pendingTransaction = loadTransactionJournal(options.workspaceRoot).exists;
    if (
        (!pendingTransaction && firstPlan.blocked) ||
        (!pendingTransaction && firstPlan.changes.length === 0 && firstPlan.stateAction === 'none')
    ) {
        return { plan: firstPlan, written: [], removed: [], stateChanged: false };
    }

    const lockResult = acquireTargetLock(options.workspaceRoot);
    if ('diagnostic' in lockResult) {
        return {
            plan: {
                ...firstPlan,
                blocked: true,
                changes: [],
                stateAction: 'none',
                diagnostics: canonicalDiagnostics([
                    ...firstPlan.diagnostics,
                    lockResult.diagnostic,
                ]),
            },
            written: [],
            removed: [],
            stateChanged: false,
        };
    }

    let transactionRoot: string | undefined;
    let preparedTransactionSnapshot: PiTargetRootSnapshot | undefined;
    let journalWritten = false;
    try {
        const recovery = recoverPendingTransaction(options.workspaceRoot);
        if (recovery.diagnostics.length > 0) {
            return {
                plan: {
                    ...firstPlan,
                    blocked: true,
                    changes: [],
                    stateAction: 'none',
                    diagnostics: canonicalDiagnostics([
                        ...firstPlan.diagnostics,
                        ...recovery.diagnostics,
                    ]),
                },
                written: [],
                removed: [],
                stateChanged: false,
            };
        }
        firstPlan = planPiProjectPluginSynchronization(options);
        if (
            firstPlan.blocked ||
            (firstPlan.changes.length === 0 && firstPlan.stateAction === 'none')
        ) {
            return { plan: firstPlan, written: [], removed: [], stateChanged: false };
        }
        const transactionId = randomUUID();
        transactionRoot = createTransactionRoot(options.workspaceRoot, transactionId);
        const transactionRootIdentity = pathIdentity(fs.lstatSync(transactionRoot));
        preparedTransactionSnapshot = captureRootSnapshot(options.workspaceRoot, transactionRoot);
        let stagedRoot: string | undefined;
        let stagedState: string | undefined;
        const rootAction: PiTargetTransactionJournal['rootAction'] = options.enabled
            ? firstPlan.changes.length > 0
                ? 'replace'
                : 'none'
            : fs.existsSync(outputRootPath(options.workspaceRoot))
              ? 'remove'
              : 'none';
        if (options.enabled) {
            if (!options.projection || options.projection.blocked || !firstPlan.desiredState) {
                return { plan: firstPlan, written: [], removed: [], stateChanged: false };
            }
            if (rootAction === 'replace') {
                stagedRoot = stagePackage(transactionRoot, options.projection.package);
            }
            stagedState = stageState(transactionRoot, firstPlan.desiredState);
        }

        const nextRoot = stagedRoot
            ? captureRootSnapshot(options.workspaceRoot, stagedRoot)
            : undefined;
        const nextState = stagedState
            ? captureFileSnapshot(options.workspaceRoot, stagedState)
            : undefined;
        preparedTransactionSnapshot = captureRootSnapshot(options.workspaceRoot, transactionRoot);
        if (
            !sameRootSnapshot(
                preparedTransactionSnapshot,
                expectedPreparedTransactionSnapshot(transactionRootIdentity, nextRoot, nextState),
            )
        ) {
            throw new Error(
                'Prepared Pi target transaction contains changed or unrecognized content',
            );
        }

        const secondPlan = planPiProjectPluginSynchronization(options);
        if (secondPlan.blocked || planIdentity(secondPlan) !== planIdentity(firstPlan)) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, preparedTransactionSnapshot);
            transactionRoot = undefined;
            preparedTransactionSnapshot = undefined;
            const diagnostics = secondPlan.blocked
                ? secondPlan.diagnostics
                : [
                      ...secondPlan.diagnostics,
                      targetDiagnostic(
                          'PI_TARGET_PREFLIGHT_CHANGED',
                          'Pi target state changed while the next package was staged; no output was modified.',
                      ),
                  ];
            return {
                plan: { ...secondPlan, blocked: true, changes: [], diagnostics },
                written: [],
                removed: [],
                stateChanged: false,
            };
        }

        const rootPath = outputRootPath(options.workspaceRoot);
        const targetStatePath = statePath(options.workspaceRoot);
        const previousRoot =
            rootAction !== 'none' && fs.existsSync(rootPath)
                ? captureRootSnapshot(options.workspaceRoot, rootPath)
                : undefined;
        const previousState = fs.existsSync(targetStatePath)
            ? captureFileSnapshot(options.workspaceRoot, targetStatePath)
            : undefined;
        const finalPlan = planPiProjectPluginSynchronization(options);
        if (finalPlan.blocked || planIdentity(finalPlan) !== planIdentity(firstPlan)) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, preparedTransactionSnapshot);
            transactionRoot = undefined;
            preparedTransactionSnapshot = undefined;
            return {
                plan: {
                    ...finalPlan,
                    blocked: true,
                    changes: [],
                    diagnostics: canonicalDiagnostics([
                        ...finalPlan.diagnostics,
                        targetDiagnostic(
                            'PI_TARGET_PREFLIGHT_CHANGED',
                            'Pi target state changed during transaction preparation; no output was modified.',
                        ),
                    ]),
                },
                written: [],
                removed: [],
                stateChanged: false,
            };
        }

        const journal: PiTargetTransactionJournal = {
            schemaVersion: PI_TARGET_TRANSACTION_SCHEMA_VERSION,
            transactionId,
            committed: false,
            rootAction,
            stateAction: options.enabled ? 'write' : 'remove',
            transactionRootIdentity,
            ...(previousRoot ? { previousRoot } : {}),
            ...(previousState ? { previousState } : {}),
            ...(nextRoot ? { nextRoot } : {}),
            ...(nextState ? { nextState } : {}),
        };
        writeTransactionJournal(options.workspaceRoot, journal);
        journalWritten = true;
        commitJournaledTransaction(options.workspaceRoot, journal);
        journalWritten = false;
        transactionRoot = undefined;
        return {
            plan: firstPlan,
            written: options.enabled
                ? firstPlan.changes
                      .filter((change) => change.action !== 'remove')
                      .map((change) => change.relativePath)
                : [],
            removed: firstPlan.changes
                .filter((change) => change.action === 'remove')
                .map((change) => change.relativePath),
            stateChanged: firstPlan.stateAction !== 'none',
        };
    } finally {
        if (transactionRoot && preparedTransactionSnapshot && !journalWritten) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, preparedTransactionSnapshot);
        }
        releaseTargetLock(lockResult.lock);
    }
}
