/**
 * Managed lifecycle for project-local Pi Agent Plugins packages.
 *
 * MetaFlow owns only plugin roots recorded in its dedicated target ledger.
 * Reconciliation preflights the complete managed set, stages every changed
 * package, and journals a multi-root swap plus state publication so interrupted
 * work can be rolled back or finalized without touching unrelated Pi plugins.
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isValidAgentPluginName } from './agentPluginCompatibility';
import { PI_PROJECT_PLUGINS_RELATIVE_ROOT, projectPiAgentPluginSkills } from './piSkillsProjection';
import type {
    PiAgentPluginManifest,
    PiSkillsProjectionDiagnostic,
    PiSkillsProjectionPackage,
    PiSkillsProjectionResult,
    PiSkillsProjectionSource,
} from './piSkillsProjection';

export const PI_TARGET_STATE_RELATIVE_PATH = '.metaflow/pi-target-state.json';
export const PI_TARGET_STATE_SCHEMA_VERSION = 2;

const LEGACY_PI_PROJECT_PLUGIN_RELATIVE_ROOT = '.pi/plugins/metaflow.project';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PI_TARGET_LOCK_RELATIVE_PATH = '.metaflow/pi-target.lock';
const PI_TARGET_LOCK_SCHEMA_VERSION = 1;
const PI_TARGET_JOURNAL_RELATIVE_PATH = '.metaflow/pi-target-transaction.json';
const PI_TARGET_TRANSACTION_SCHEMA_VERSION = 2;
const TRANSACTION_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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

export interface PiTargetManagedPluginState {
    readonly outputRoot: string;
    readonly projection: {
        readonly contentSha: string;
    };
    readonly files: Readonly<Record<string, PiTargetManagedFileState>>;
}

export interface PiTargetState {
    readonly schemaVersion: typeof PI_TARGET_STATE_SCHEMA_VERSION;
    readonly plugins: Readonly<Record<string, PiTargetManagedPluginState>>;
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
    /** Workspace-relative path, including `.pi/plugins/<plugin-name>`. */
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

interface ObservedPluginRoot {
    readonly exists: boolean;
    readonly files: ReadonlyMap<string, string>;
    readonly directories: ReadonlySet<string>;
}

interface PiTargetLock {
    readonly lockPath: string;
    readonly identity: PiTargetPathIdentity;
}

interface PiTargetLockOwner {
    readonly schemaVersion: typeof PI_TARGET_LOCK_SCHEMA_VERSION;
    readonly pid: number;
    readonly token: string;
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

interface PiTargetRootTransaction {
    readonly pluginName: string;
    readonly action: 'replace' | 'remove';
    readonly previousRoot?: PiTargetRootSnapshot;
    readonly nextRoot?: PiTargetRootSnapshot;
}

interface PiTargetTransactionJournal {
    readonly schemaVersion: typeof PI_TARGET_TRANSACTION_SCHEMA_VERSION;
    readonly transactionId: string;
    readonly committed: boolean;
    readonly rootActions: readonly PiTargetRootTransaction[];
    readonly stateAction: PiTargetStateAction;
    readonly transactionRootIdentity: PiTargetPathIdentity;
    readonly previousState?: PiTargetFileSnapshot;
    readonly nextState?: PiTargetFileSnapshot;
}

interface LoadedJournal {
    readonly exists: boolean;
    readonly journal?: PiTargetTransactionJournal;
    readonly diagnostic?: PiTargetDiagnostic;
}

function compareCodeUnits(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, '/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pathEntryExists(candidatePath: string): boolean {
    try {
        fs.lstatSync(candidatePath);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}

function isInside(rootPath: string, candidatePath: string): boolean {
    const relative = path.relative(rootPath, candidatePath);
    return (
        relative === '' ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    );
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

function pluginRelativeRoot(pluginName: string): string {
    return `${PI_PROJECT_PLUGINS_RELATIVE_ROOT}/${pluginName}`;
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

function sourceKey(source: PiSkillsProjectionSource): string {
    return [
        source.repoId ?? '',
        source.layerId,
        source.capabilityId,
        source.capabilityName ?? '',
        source.sourcePath,
    ].join('\u0000');
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

function canonicalSources(
    sources: readonly PiSkillsProjectionSource[],
): readonly PiSkillsProjectionSource[] {
    return sources
        .map(cloneSource)
        .sort((left, right) => compareCodeUnits(sourceKey(left), sourceKey(right)));
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

function parseManagedFiles(
    value: unknown,
): Readonly<Record<string, PiTargetManagedFileState>> | undefined {
    if (!isRecord(value)) {
        return undefined;
    }
    const files: Record<string, PiTargetManagedFileState> = {};
    for (const relativePath of Object.keys(value).sort(compareCodeUnits)) {
        const entry = value[relativePath];
        if (
            !isSafePackagePath(relativePath) ||
            !isRecord(entry) ||
            !hasOnlyKeys(entry, ['contentHash', 'sources']) ||
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
    return Object.prototype.hasOwnProperty.call(files, 'plugin.json') ? files : undefined;
}

function canonicalState(state: PiTargetState): PiTargetState {
    const plugins: Record<string, PiTargetManagedPluginState> = {};
    for (const pluginName of Object.keys(state.plugins).sort(compareCodeUnits)) {
        const plugin = state.plugins[pluginName];
        const files: Record<string, PiTargetManagedFileState> = {};
        for (const relativePath of Object.keys(plugin.files).sort(compareCodeUnits)) {
            files[relativePath] = {
                contentHash: plugin.files[relativePath].contentHash,
                sources: canonicalSources(plugin.files[relativePath].sources),
            };
        }
        plugins[pluginName] = {
            outputRoot: pluginRelativeRoot(pluginName),
            projection: { contentSha: plugin.projection.contentSha },
            files,
        };
    }
    return { schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION, plugins };
}

function serializeState(state: PiTargetState): string {
    return `${JSON.stringify(canonicalState(state), null, 2)}\n`;
}

function parseStateV2(value: unknown): PiTargetState | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ['schemaVersion', 'plugins']) ||
        value.schemaVersion !== PI_TARGET_STATE_SCHEMA_VERSION ||
        !isRecord(value.plugins)
    ) {
        return undefined;
    }
    const plugins: Record<string, PiTargetManagedPluginState> = {};
    for (const pluginName of Object.keys(value.plugins).sort(compareCodeUnits)) {
        const entry = value.plugins[pluginName];
        if (
            !isValidAgentPluginName(pluginName) ||
            !isRecord(entry) ||
            !hasOnlyKeys(entry, ['outputRoot', 'projection', 'files']) ||
            entry.outputRoot !== pluginRelativeRoot(pluginName) ||
            !isRecord(entry.projection) ||
            !hasOnlyKeys(entry.projection, ['contentSha']) ||
            typeof entry.projection.contentSha !== 'string' ||
            !HASH_PATTERN.test(entry.projection.contentSha)
        ) {
            return undefined;
        }
        const files = parseManagedFiles(entry.files);
        if (!files) {
            return undefined;
        }
        plugins[pluginName] = {
            outputRoot: pluginRelativeRoot(pluginName),
            projection: { contentSha: entry.projection.contentSha },
            files,
        };
    }
    return canonicalState({ schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION, plugins });
}

function parseLegacyStateV1(value: unknown): PiTargetState | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, ['schemaVersion', 'outputRoot', 'projection', 'files']) ||
        value.schemaVersion !== 1 ||
        value.outputRoot !== LEGACY_PI_PROJECT_PLUGIN_RELATIVE_ROOT ||
        !isRecord(value.projection) ||
        !hasOnlyKeys(value.projection, ['contentSha', 'version']) ||
        typeof value.projection.contentSha !== 'string' ||
        !HASH_PATTERN.test(value.projection.contentSha) ||
        typeof value.projection.version !== 'string'
    ) {
        return undefined;
    }
    const files = parseManagedFiles(value.files);
    if (!files) {
        return undefined;
    }
    return canonicalState({
        schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION,
        plugins: {
            'metaflow.project': {
                outputRoot: LEGACY_PI_PROJECT_PLUGIN_RELATIVE_ROOT,
                projection: { contentSha: value.projection.contentSha },
                files,
            },
        },
    });
}

function statePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_TARGET_STATE_RELATIVE_PATH.split('/'));
}

function lockPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_TARGET_LOCK_RELATIVE_PATH.split('/'));
}

function journalPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, ...PI_TARGET_JOURNAL_RELATIVE_PATH.split('/'));
}

function transactionRootPath(workspaceRoot: string, transactionId: string): string {
    return path.join(workspaceRoot, '.metaflow', `.pi-target-transaction-${transactionId}`);
}

function pluginRootPath(workspaceRoot: string, pluginName: string): string {
    return path.join(workspaceRoot, ...pluginRelativeRoot(pluginName).split('/'));
}

function transactionPluginPath(
    transactionRoot: string,
    kind: 'next' | 'previous',
    pluginName: string,
): string {
    return path.join(transactionRoot, kind, pluginName);
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

function assertSafeDirectoryChain(workspaceRoot: string, relativeDirectory: string): void {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    let current = workspaceRoot;
    for (const segment of normalizeRelativePath(relativeDirectory).split('/').filter(Boolean)) {
        current = path.join(current, segment);
        if (!pathEntryExists(current)) {
            break;
        }
        assertSafeExistingPath(workspaceRealPath, current, 'directory');
    }
}

function controlPathDiagnostics(workspaceRoot: string): readonly PiTargetDiagnostic[] {
    try {
        safeRealWorkspace(workspaceRoot);
        assertSafeDirectoryChain(workspaceRoot, '.metaflow');
        assertSafeDirectoryChain(workspaceRoot, PI_PROJECT_PLUGINS_RELATIVE_ROOT);
        for (const relativePath of [
            PI_TARGET_STATE_RELATIVE_PATH,
            PI_TARGET_LOCK_RELATIVE_PATH,
            PI_TARGET_JOURNAL_RELATIVE_PATH,
        ]) {
            const absolutePath = path.join(workspaceRoot, ...relativePath.split('/'));
            if (pathEntryExists(absolutePath)) {
                assertSafeExistingPath(safeRealWorkspace(workspaceRoot), absolutePath, 'file');
            }
        }
        return [];
    } catch {
        return [
            targetDiagnostic(
                'PI_TARGET_PATH_UNSAFE',
                'Pi target control or output paths include an unsupported link, alias, or filesystem kind.',
                'error',
                PI_PROJECT_PLUGINS_RELATIVE_ROOT,
            ),
        ];
    }
}

/** Load the dedicated per-plugin target ledger without mutating the workspace. */
export function loadPiTargetState(workspaceRoot: string): PiTargetStateLoadResult {
    const targetStatePath = statePath(workspaceRoot);
    if (!pathEntryExists(targetStatePath)) {
        return { exists: false, diagnostics: [] };
    }
    try {
        assertSafeExistingPath(safeRealWorkspace(workspaceRoot), targetStatePath, 'file');
        const parsed = JSON.parse(fs.readFileSync(targetStatePath, 'utf8')) as unknown;
        const state = parseStateV2(parsed);
        if (state) {
            return { exists: true, state, diagnostics: [] };
        }
        const legacy = parseLegacyStateV1(parsed);
        if (legacy) {
            return {
                exists: true,
                state: legacy,
                diagnostics: [
                    targetDiagnostic(
                        'PI_TARGET_STATE_LEGACY_MIGRATION_PENDING',
                        'The aggregate Pi target ledger will be migrated to per-plugin ownership on the next successful apply.',
                        'info',
                        PI_TARGET_STATE_RELATIVE_PATH,
                    ),
                ],
            };
        }
        if (isRecord(parsed) && parsed.schemaVersion !== PI_TARGET_STATE_SCHEMA_VERSION) {
            return {
                exists: true,
                diagnostics: [
                    targetDiagnostic(
                        'PI_TARGET_STATE_VERSION_UNSUPPORTED',
                        `Pi target state schema version "${String(parsed.schemaVersion)}" is unsupported.`,
                        'error',
                        PI_TARGET_STATE_RELATIVE_PATH,
                    ),
                ],
            };
        }
        return {
            exists: true,
            diagnostics: [
                targetDiagnostic(
                    'PI_TARGET_STATE_INVALID',
                    'Pi target state is malformed or does not describe safe per-plugin roots.',
                    'error',
                    PI_TARGET_STATE_RELATIVE_PATH,
                ),
            ],
        };
    } catch {
        return {
            exists: true,
            diagnostics: [
                targetDiagnostic(
                    'PI_TARGET_STATE_INVALID',
                    'Pi target state could not be safely read and parsed.',
                    'error',
                    PI_TARGET_STATE_RELATIVE_PATH,
                ),
            ],
        };
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
    assertSafeExistingPath(safeRealWorkspace(workspaceRoot), absolutePath, 'file');
    return {
        identity: pathIdentity(fs.lstatSync(absolutePath)),
        contentHash: sha256(fs.readFileSync(absolutePath)),
    };
}

function captureRootSnapshot(workspaceRoot: string, absoluteRoot: string): PiTargetRootSnapshot {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, absoluteRoot, 'directory');
    const files: Record<string, PiTargetFileSnapshot> = {};
    const directories: Record<string, PiTargetPathIdentity> = {};
    const visit = (directory: string, relativeDirectory: string): void => {
        for (const entry of fs
            .readdirSync(directory, { withFileTypes: true })
            .sort((left, right) => compareCodeUnits(left.name, right.name))) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            const stats = fs.lstatSync(absolutePath);
            if (stats.isSymbolicLink()) {
                throw new Error('linked entries are not supported in managed roots');
            }
            if (entry.isDirectory()) {
                assertSafeExistingPath(workspaceRealPath, absolutePath, 'directory');
                directories[relativePath] = pathIdentity(stats);
                visit(absolutePath, relativePath);
            } else if (entry.isFile()) {
                files[relativePath] = captureFileSnapshot(workspaceRoot, absolutePath);
            } else {
                throw new Error('unsupported filesystem entry in managed root');
            }
        }
    };
    visit(absoluteRoot, '');
    return { identity: pathIdentity(fs.lstatSync(absoluteRoot)), files, directories };
}

function sameFileSnapshot(left: PiTargetFileSnapshot, right: PiTargetFileSnapshot): boolean {
    return sameIdentity(left.identity, right.identity) && left.contentHash === right.contentHash;
}

function sameRootSnapshot(left: PiTargetRootSnapshot, right: PiTargetRootSnapshot): boolean {
    if (!sameIdentity(left.identity, right.identity)) {
        return false;
    }
    const leftFiles = Object.keys(left.files).sort(compareCodeUnits);
    const rightFiles = Object.keys(right.files).sort(compareCodeUnits);
    const leftDirectories = Object.keys(left.directories).sort(compareCodeUnits);
    const rightDirectories = Object.keys(right.directories).sort(compareCodeUnits);
    return (
        JSON.stringify(leftFiles) === JSON.stringify(rightFiles) &&
        JSON.stringify(leftDirectories) === JSON.stringify(rightDirectories) &&
        leftFiles.every((name) => sameFileSnapshot(left.files[name], right.files[name])) &&
        leftDirectories.every((name) =>
            sameIdentity(left.directories[name], right.directories[name]),
        )
    );
}

function matchesFileSnapshot(
    workspaceRoot: string,
    absolutePath: string,
    expected: PiTargetFileSnapshot,
): boolean {
    try {
        return sameFileSnapshot(captureFileSnapshot(workspaceRoot, absolutePath), expected);
    } catch {
        return false;
    }
}

function matchesRootSnapshot(
    workspaceRoot: string,
    absoluteRoot: string,
    expected: PiTargetRootSnapshot,
): boolean {
    try {
        return sameRootSnapshot(captureRootSnapshot(workspaceRoot, absoluteRoot), expected);
    } catch {
        return false;
    }
}

function parseIdentity(value: unknown): PiTargetPathIdentity | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ['dev', 'ino', 'size', 'birthtimeMs', 'mtimeMs'])) {
        return undefined;
    }
    const keys = ['dev', 'ino', 'size', 'birthtimeMs', 'mtimeMs'] as const;
    if (keys.some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
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
        const identityValue = parseIdentity(value.directories[relativePath]);
        if (!isSafePackagePath(relativePath) || !identityValue) {
            return undefined;
        }
        directories[relativePath] = identityValue;
    }
    return { identity, files, directories };
}

function parseJournal(value: unknown): PiTargetTransactionJournal | undefined {
    if (
        !isRecord(value) ||
        !hasOnlyKeys(value, [
            'schemaVersion',
            'transactionId',
            'committed',
            'rootActions',
            'stateAction',
            'transactionRootIdentity',
            'previousState',
            'nextState',
        ]) ||
        value.schemaVersion !== PI_TARGET_TRANSACTION_SCHEMA_VERSION ||
        typeof value.transactionId !== 'string' ||
        !TRANSACTION_ID_PATTERN.test(value.transactionId) ||
        typeof value.committed !== 'boolean' ||
        !Array.isArray(value.rootActions) ||
        !['none', 'write', 'remove'].includes(String(value.stateAction))
    ) {
        return undefined;
    }
    const transactionRootIdentity = parseIdentity(value.transactionRootIdentity);
    if (!transactionRootIdentity) {
        return undefined;
    }
    const rootActions: PiTargetRootTransaction[] = [];
    const seen = new Set<string>();
    for (const rawAction of value.rootActions) {
        if (
            !isRecord(rawAction) ||
            !hasOnlyKeys(rawAction, ['pluginName', 'action', 'previousRoot', 'nextRoot']) ||
            typeof rawAction.pluginName !== 'string' ||
            !isValidAgentPluginName(rawAction.pluginName) ||
            seen.has(rawAction.pluginName) ||
            (rawAction.action !== 'replace' && rawAction.action !== 'remove')
        ) {
            return undefined;
        }
        seen.add(rawAction.pluginName);
        const previousRoot =
            rawAction.previousRoot === undefined
                ? undefined
                : parseRootSnapshot(rawAction.previousRoot);
        const nextRoot =
            rawAction.nextRoot === undefined ? undefined : parseRootSnapshot(rawAction.nextRoot);
        if (
            (rawAction.previousRoot !== undefined && !previousRoot) ||
            (rawAction.nextRoot !== undefined && !nextRoot) ||
            (rawAction.action === 'replace') !== (nextRoot !== undefined)
        ) {
            return undefined;
        }
        rootActions.push({
            pluginName: rawAction.pluginName,
            action: rawAction.action,
            ...(previousRoot ? { previousRoot } : {}),
            ...(nextRoot ? { nextRoot } : {}),
        });
    }
    rootActions.sort((left, right) => compareCodeUnits(left.pluginName, right.pluginName));
    const previousState =
        value.previousState === undefined ? undefined : parseFileSnapshot(value.previousState);
    const nextState =
        value.nextState === undefined ? undefined : parseFileSnapshot(value.nextState);
    if (
        (value.previousState !== undefined && !previousState) ||
        (value.nextState !== undefined && !nextState) ||
        (value.stateAction === 'write') !== (nextState !== undefined) ||
        (value.stateAction !== 'write' && nextState !== undefined)
    ) {
        return undefined;
    }
    return {
        schemaVersion: PI_TARGET_TRANSACTION_SCHEMA_VERSION,
        transactionId: value.transactionId,
        committed: value.committed,
        rootActions,
        stateAction: value.stateAction as PiTargetStateAction,
        transactionRootIdentity,
        ...(previousState ? { previousState } : {}),
        ...(nextState ? { nextState } : {}),
    };
}

function serializeJournal(journal: PiTargetTransactionJournal): string {
    return `${JSON.stringify(journal, null, 2)}\n`;
}

function loadJournal(workspaceRoot: string): LoadedJournal {
    const target = journalPath(workspaceRoot);
    if (!pathEntryExists(target)) {
        return { exists: false };
    }
    try {
        assertSafeExistingPath(safeRealWorkspace(workspaceRoot), target, 'file');
        const parsed = parseJournal(JSON.parse(fs.readFileSync(target, 'utf8')) as unknown);
        if (!parsed) {
            throw new Error('invalid journal');
        }
        return { exists: true, journal: parsed };
    } catch {
        return {
            exists: true,
            diagnostic: targetDiagnostic(
                'PI_TARGET_RECOVERY_JOURNAL_INVALID',
                'Pending Pi target transaction metadata is invalid; recovery artifacts were preserved.',
                'error',
                PI_TARGET_JOURNAL_RELATIVE_PATH,
            ),
        };
    }
}

function collectRootInventory(workspaceRoot: string, pluginName: string): ObservedPluginRoot {
    const root = pluginRootPath(workspaceRoot, pluginName);
    if (!pathEntryExists(root)) {
        return { exists: false, files: new Map(), directories: new Set() };
    }
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, root, 'directory');
    const files = new Map<string, string>();
    const directories = new Set<string>();
    const visit = (directory: string, relativeDirectory: string): void => {
        for (const entry of fs
            .readdirSync(directory, { withFileTypes: true })
            .sort((left, right) => compareCodeUnits(left.name, right.name))) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = relativeDirectory
                ? `${relativeDirectory}/${entry.name}`
                : entry.name;
            const stats = fs.lstatSync(absolutePath);
            if (stats.isSymbolicLink()) {
                throw new Error('managed roots cannot contain links');
            }
            if (entry.isDirectory()) {
                assertSafeExistingPath(workspaceRealPath, absolutePath, 'directory');
                directories.add(relativePath);
                visit(absolutePath, relativePath);
            } else if (entry.isFile()) {
                assertSafeExistingPath(workspaceRealPath, absolutePath, 'file');
                files.set(relativePath, sha256(fs.readFileSync(absolutePath)));
            } else {
                throw new Error('managed roots cannot contain special files');
            }
        }
    };
    visit(root, '');
    return { exists: true, files, directories };
}

function expectedDirectories(relativePaths: readonly string[]): ReadonlySet<string> {
    const result = new Set<string>();
    for (const relativePath of relativePaths) {
        const segments = relativePath.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            result.add(segments.slice(0, index).join('/'));
        }
    }
    return result;
}

function stateForPackage(projectedPackage: PiSkillsProjectionPackage): PiTargetManagedPluginState {
    const files: Record<string, PiTargetManagedFileState> = {};
    for (const file of projectedPackage.files) {
        files[file.relativePath] = {
            contentHash: file.contentHash,
            sources: canonicalSources(file.sources),
        };
    }
    return {
        outputRoot: pluginRelativeRoot(projectedPackage.name),
        projection: { contentSha: projectedPackage.contentSha },
        files,
    };
}

function comparableManifest(manifest: PiAgentPluginManifest): PiAgentPluginManifest {
    return JSON.parse(JSON.stringify(manifest)) as PiAgentPluginManifest;
}

function verifyProjectedPackage(projectedPackage: PiSkillsProjectionPackage): void {
    if (
        !isValidAgentPluginName(projectedPackage.name) ||
        projectedPackage.relativeRoot !== pluginRelativeRoot(projectedPackage.name) ||
        projectedPackage.manifest.name !== projectedPackage.name ||
        !HASH_PATTERN.test(projectedPackage.contentSha)
    ) {
        throw new Error('Projected package identity is invalid');
    }
    const manifestFile = projectedPackage.files.find((file) => file.relativePath === 'plugin.json');
    if (!manifestFile || manifestFile.sources.length !== 1) {
        throw new Error('Projected package requires one sourced plugin.json');
    }
    const seen = new Set<string>();
    const skills = [];
    for (const file of projectedPackage.files) {
        if (
            seen.has(file.relativePath) ||
            !isSafePackagePath(file.relativePath) ||
            !HASH_PATTERN.test(file.contentHash) ||
            sha256(file.content) !== file.contentHash
        ) {
            throw new Error('Projected package file inventory is invalid');
        }
        seen.add(file.relativePath);
        if (file.relativePath === 'plugin.json') {
            continue;
        }
        const match = /^skills\/([^/]+)\/SKILL\.md$/.exec(file.relativePath);
        if (!match || file.sources.length !== 1) {
            throw new Error('Projected package contains unsupported output');
        }
        skills.push({ name: match[1], content: file.content, source: file.sources[0] });
    }
    const { $schema: _schema, ...manifest } = projectedPackage.manifest;
    const regenerated = projectPiAgentPluginSkills({
        plugins: [
            {
                manifest,
                source: manifestFile.sources[0],
                skills,
            },
        ],
    });
    if (regenerated.blocked || regenerated.packages.length !== 1) {
        throw new Error('Projected package does not reproduce from its exact files');
    }
    const expected = regenerated.packages[0];
    if (
        expected.contentSha !== projectedPackage.contentSha ||
        JSON.stringify(comparableManifest(expected.manifest)) !==
            JSON.stringify(comparableManifest(projectedPackage.manifest)) ||
        expected.files.length !== projectedPackage.files.length
    ) {
        throw new Error('Projected package content identity is forged');
    }
    for (let index = 0; index < expected.files.length; index += 1) {
        const left = expected.files[index];
        const right = projectedPackage.files[index];
        if (
            left.relativePath !== right.relativePath ||
            left.contentHash !== right.contentHash ||
            !Buffer.from(left.content).equals(Buffer.from(right.content)) ||
            JSON.stringify(canonicalSources(left.sources)) !==
                JSON.stringify(canonicalSources(right.sources))
        ) {
            throw new Error('Projected package files do not match deterministic output');
        }
    }
}

function desiredStateFor(
    projectedPackages: readonly PiSkillsProjectionPackage[],
): PiTargetState | undefined {
    if (projectedPackages.length === 0) {
        return undefined;
    }
    const plugins: Record<string, PiTargetManagedPluginState> = {};
    for (const projectedPackage of projectedPackages) {
        verifyProjectedPackage(projectedPackage);
        if (plugins[projectedPackage.name]) {
            throw new Error('Projected plugin name is duplicated');
        }
        plugins[projectedPackage.name] = stateForPackage(projectedPackage);
    }
    return canonicalState({ schemaVersion: PI_TARGET_STATE_SCHEMA_VERSION, plugins });
}

function ownershipDiagnostics(
    currentState: PiTargetState | undefined,
    observed: ReadonlyMap<string, ObservedPluginRoot>,
): readonly PiTargetDiagnostic[] {
    if (!currentState) {
        return [];
    }
    const diagnostics: PiTargetDiagnostic[] = [];
    for (const pluginName of Object.keys(currentState.plugins).sort(compareCodeUnits)) {
        const tracked = currentState.plugins[pluginName];
        const root = observed.get(pluginName)!;
        if (!root.exists) {
            continue;
        }
        for (const [relativePath, contentHash] of root.files) {
            const trackedFile = tracked.files[relativePath];
            if (!trackedFile) {
                diagnostics.push(
                    targetDiagnostic(
                        'PI_TARGET_UNMANAGED_CONTENT',
                        `Managed Pi plugin "${pluginName}" contains untracked content.`,
                        'error',
                        `${tracked.outputRoot}/${relativePath}`,
                    ),
                );
            } else if (trackedFile.contentHash !== contentHash) {
                diagnostics.push(
                    targetDiagnostic(
                        'PI_TARGET_DRIFT',
                        `Managed Pi plugin "${pluginName}" contains changed tracked content.`,
                        'error',
                        `${tracked.outputRoot}/${relativePath}`,
                    ),
                );
            }
        }
        const expected = expectedDirectories(Object.keys(tracked.files));
        for (const directory of root.directories) {
            if (!expected.has(directory)) {
                diagnostics.push(
                    targetDiagnostic(
                        'PI_TARGET_UNMANAGED_CONTENT',
                        `Managed Pi plugin "${pluginName}" contains an untracked directory.`,
                        'error',
                        `${tracked.outputRoot}/${directory}`,
                    ),
                );
            }
        }
    }
    return diagnostics;
}

function hasErrors(diagnostics: readonly PiTargetDiagnostic[]): boolean {
    return diagnostics.some((entry) => entry.severity === 'error');
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

/** Plan the complete per-plugin reconciliation without writing the workspace. */
export function planPiProjectPluginSynchronization(
    options: PiProjectPluginPlanOptions,
): PiProjectPluginSynchronizationPlan {
    const pathDiagnostics = controlPathDiagnostics(options.workspaceRoot);
    if (hasErrors(pathDiagnostics)) {
        return emptyPlan(options, pathDiagnostics, true);
    }
    const loaded = loadPiTargetState(options.workspaceRoot);
    if (hasErrors(loaded.diagnostics)) {
        return emptyPlan(options, loaded.diagnostics, true);
    }
    const currentState = loaded.state;
    const projectionDiagnostics = options.projection?.diagnostics ?? [];
    if (options.enabled && !options.projection) {
        return emptyPlan(
            options,
            [
                ...loaded.diagnostics,
                targetDiagnostic(
                    'PI_TARGET_PROJECTION_REQUIRED',
                    'The enabled Pi target requires a resolved projection.',
                ),
            ],
            true,
            currentState,
        );
    }
    if (options.enabled && options.projection?.blocked) {
        return emptyPlan(
            options,
            [
                ...loaded.diagnostics,
                ...projectionDiagnostics,
                targetDiagnostic(
                    'PI_TARGET_PROJECTION_BLOCKED',
                    'The active plugin set cannot be projected safely; existing managed output was preserved.',
                ),
            ],
            true,
            currentState,
        );
    }

    let desiredState: PiTargetState | undefined;
    try {
        desiredState =
            options.enabled && options.projection && !options.projection.blocked
                ? desiredStateFor(options.projection.packages)
                : undefined;
    } catch {
        return emptyPlan(
            options,
            [
                ...loaded.diagnostics,
                ...projectionDiagnostics,
                targetDiagnostic(
                    'PI_TARGET_PROJECTION_INVALID',
                    'The supplied Pi projection failed deterministic package verification.',
                ),
            ],
            true,
            currentState,
        );
    }

    const pluginNames = new Set<string>([
        ...Object.keys(currentState?.plugins ?? {}),
        ...Object.keys(desiredState?.plugins ?? {}),
    ]);
    const observed = new Map<string, ObservedPluginRoot>();
    const diagnostics: PiTargetDiagnostic[] = [...loaded.diagnostics, ...projectionDiagnostics];
    for (const pluginName of [...pluginNames].sort(compareCodeUnits)) {
        try {
            observed.set(pluginName, collectRootInventory(options.workspaceRoot, pluginName));
        } catch {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_ROOT_INVALID',
                    `Pi plugin root "${pluginRelativeRoot(pluginName)}" could not be safely inventoried.`,
                    'error',
                    pluginRelativeRoot(pluginName),
                ),
            );
        }
    }
    if (hasErrors(diagnostics)) {
        return emptyPlan(options, diagnostics, true, currentState);
    }
    diagnostics.push(...ownershipDiagnostics(currentState, observed));
    for (const pluginName of Object.keys(desiredState?.plugins ?? {}).sort(compareCodeUnits)) {
        if (!currentState?.plugins[pluginName] && observed.get(pluginName)?.exists) {
            diagnostics.push(
                targetDiagnostic(
                    'PI_TARGET_ROOT_UNTRACKED',
                    `Pi plugin root "${pluginRelativeRoot(pluginName)}" already exists without MetaFlow ownership.`,
                    'error',
                    pluginRelativeRoot(pluginName),
                ),
            );
        }
    }
    if (hasErrors(diagnostics)) {
        return emptyPlan(options, diagnostics, true, currentState);
    }

    const changes: PiTargetChange[] = [];
    for (const pluginName of [...pluginNames].sort(compareCodeUnits)) {
        const desired = desiredState?.plugins[pluginName];
        const root = observed.get(pluginName)!;
        if (desired) {
            for (const relativePath of Object.keys(desired.files).sort(compareCodeUnits)) {
                const actual = root.files.get(relativePath);
                if (actual === undefined) {
                    changes.push({
                        relativePath: `${desired.outputRoot}/${relativePath}`,
                        action: 'add',
                    });
                } else if (actual !== desired.files[relativePath].contentHash) {
                    changes.push({
                        relativePath: `${desired.outputRoot}/${relativePath}`,
                        action: 'update',
                    });
                }
            }
            for (const relativePath of [...root.files.keys()].sort(compareCodeUnits)) {
                if (!desired.files[relativePath]) {
                    changes.push({
                        relativePath: `${desired.outputRoot}/${relativePath}`,
                        action: 'remove',
                    });
                }
            }
        } else if (root.exists) {
            const currentRoot = currentState!.plugins[pluginName].outputRoot;
            if (root.files.size === 0) {
                changes.push({ relativePath: currentRoot, action: 'remove' });
            } else {
                for (const relativePath of [...root.files.keys()].sort(compareCodeUnits)) {
                    changes.push({
                        relativePath: `${currentRoot}/${relativePath}`,
                        action: 'remove',
                    });
                }
            }
        }
    }
    changes.sort(
        (left, right) =>
            compareCodeUnits(left.relativePath, right.relativePath) ||
            compareCodeUnits(left.action, right.action),
    );

    const desiredSerialized = desiredState ? serializeState(desiredState) : undefined;
    const currentSerialized = currentState ? serializeState(currentState) : undefined;
    const stateAction: PiTargetStateAction = desiredState
        ? desiredSerialized === currentSerialized
            ? 'none'
            : 'write'
        : currentState
          ? 'remove'
          : 'none';
    return {
        enabled: options.enabled,
        blocked: false,
        changes,
        stateAction,
        diagnostics: canonicalDiagnostics(diagnostics),
        ...(currentState ? { currentState } : {}),
        ...(desiredState ? { desiredState } : {}),
        ...(options.projection ? { projection: options.projection } : {}),
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

function ensureDirectory(workspaceRoot: string, relativeDirectory: string): string {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    let current = workspaceRoot;
    for (const segment of relativeDirectory.split('/').filter(Boolean)) {
        current = path.join(current, segment);
        if (pathEntryExists(current)) {
            assertSafeExistingPath(workspaceRealPath, current, 'directory');
        } else {
            fs.mkdirSync(current);
            assertSafeExistingPath(workspaceRealPath, current, 'directory');
        }
    }
    return current;
}

function fsyncDirectoryBestEffort(directoryPath: string): void {
    try {
        const descriptor = fs.openSync(directoryPath, 'r');
        try {
            fs.fsyncSync(descriptor);
        } finally {
            fs.closeSync(descriptor);
        }
    } catch {
        // Some platforms do not permit opening directories for fsync.
    }
}

function writeFileExclusiveDurably(target: string, content: string | Uint8Array): void {
    const descriptor = fs.openSync(target, 'wx');
    try {
        fs.writeFileSync(descriptor, content);
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    fsyncDirectoryBestEffort(path.dirname(target));
}

function serializeLockOwner(owner: PiTargetLockOwner): string {
    return `${JSON.stringify(owner)}\n`;
}

function parseLockOwner(content: string): PiTargetLockOwner | undefined {
    try {
        const value = JSON.parse(content) as unknown;
        if (
            !isRecord(value) ||
            !hasOnlyKeys(value, ['schemaVersion', 'pid', 'token']) ||
            value.schemaVersion !== PI_TARGET_LOCK_SCHEMA_VERSION ||
            !Number.isSafeInteger(value.pid) ||
            (value.pid as number) <= 0 ||
            typeof value.token !== 'string' ||
            !TRANSACTION_ID_PATTERN.test(value.token)
        ) {
            return undefined;
        }
        return {
            schemaVersion: PI_TARGET_LOCK_SCHEMA_VERSION,
            pid: value.pid as number,
            token: value.token,
        };
    } catch {
        return undefined;
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
}

function reclaimStaleTargetLock(workspaceRoot: string, target: string): boolean {
    const workspaceRealPath = safeRealWorkspace(workspaceRoot);
    assertSafeExistingPath(workspaceRealPath, target, 'file');
    const snapshot = captureFileSnapshot(workspaceRoot, target);
    const owner = parseLockOwner(fs.readFileSync(target, 'utf8'));
    if (!owner || isProcessAlive(owner.pid)) {
        return false;
    }

    const quarantine = `${target}.${owner.token}.stale`;
    if (pathEntryExists(quarantine)) {
        return false;
    }
    fs.renameSync(target, quarantine);
    if (!matchesFileSnapshot(workspaceRoot, quarantine, snapshot)) {
        try {
            if (!pathEntryExists(target)) {
                fs.renameSync(quarantine, target);
            }
        } catch {
            // Preserve both paths for a fail-closed follow-up when ownership changed mid-reclaim.
        }
        return false;
    }
    removeVerifiedFile(workspaceRoot, quarantine, snapshot);
    fsyncDirectoryBestEffort(path.dirname(target));
    return true;
}

function acquireTargetLock(
    workspaceRoot: string,
): { lock: PiTargetLock } | { diagnostic: PiTargetDiagnostic } {
    ensureDirectory(workspaceRoot, '.metaflow');
    const target = lockPath(workspaceRoot);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const owner: PiTargetLockOwner = {
                schemaVersion: PI_TARGET_LOCK_SCHEMA_VERSION,
                pid: process.pid,
                token: randomUUID(),
            };
            writeFileExclusiveDurably(target, serializeLockOwner(owner));
            return { lock: { lockPath: target, identity: pathIdentity(fs.lstatSync(target)) } };
        } catch (error) {
            if (attempt === 0 && (error as NodeJS.ErrnoException).code === 'EEXIST') {
                try {
                    if (reclaimStaleTargetLock(workspaceRoot, target)) {
                        continue;
                    }
                } catch {
                    // Unsafe or changed lock paths remain a fail-closed busy result.
                }
            }
            break;
        }
    }
    return {
        diagnostic: targetDiagnostic(
            'PI_TARGET_RECONCILIATION_BUSY',
            'Another Pi target reconciliation is active or the lock path is unsafe.',
            'error',
            PI_TARGET_LOCK_RELATIVE_PATH,
        ),
    };
}

function releaseTargetLock(workspaceRoot: string, lock: PiTargetLock): void {
    try {
        if (
            pathEntryExists(lock.lockPath) &&
            sameIdentity(pathIdentity(fs.lstatSync(lock.lockPath)), lock.identity)
        ) {
            assertSafeExistingPath(safeRealWorkspace(workspaceRoot), lock.lockPath, 'file');
            fs.unlinkSync(lock.lockPath);
        }
    } catch {
        // A changed lock is deliberately preserved for the next fail-closed attempt.
    }
}

function createTransactionRoot(workspaceRoot: string, transactionId: string): string {
    ensureDirectory(workspaceRoot, '.metaflow');
    const target = transactionRootPath(workspaceRoot, transactionId);
    fs.mkdirSync(target);
    assertSafeExistingPath(safeRealWorkspace(workspaceRoot), target, 'directory');
    return target;
}

function stagePackage(
    workspaceRoot: string,
    transactionRoot: string,
    projectedPackage: PiSkillsProjectionPackage,
): string {
    verifyProjectedPackage(projectedPackage);
    const nextParent = path.join(transactionRoot, 'next');
    if (!pathEntryExists(nextParent)) {
        fs.mkdirSync(nextParent);
    }
    const root = path.join(nextParent, projectedPackage.name);
    fs.mkdirSync(root);
    for (const file of projectedPackage.files) {
        const destination = path.join(root, ...file.relativePath.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        writeFileExclusiveDurably(destination, file.content);
    }
    const snapshot = captureRootSnapshot(workspaceRoot, root);
    const expected = stateForPackage(projectedPackage);
    if (
        Object.keys(snapshot.files).some(
            (relativePath) =>
                snapshot.files[relativePath].contentHash !==
                expected.files[relativePath]?.contentHash,
        ) ||
        Object.keys(snapshot.files).length !== Object.keys(expected.files).length
    ) {
        throw new Error('Staged Pi plugin does not match projection');
    }
    return root;
}

function stageState(workspaceRoot: string, transactionRoot: string, state: PiTargetState): string {
    const target = path.join(transactionRoot, 'next-state.json');
    writeFileExclusiveDurably(target, serializeState(state));
    const parsed = parseStateV2(JSON.parse(fs.readFileSync(target, 'utf8')) as unknown);
    if (!parsed || serializeState(parsed) !== serializeState(state)) {
        throw new Error('Staged Pi target state failed canonical verification');
    }
    captureFileSnapshot(workspaceRoot, target);
    return target;
}

function writeJournal(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    const target = journalPath(workspaceRoot);
    writeFileExclusiveDurably(target, serializeJournal(journal));
}

function markJournalCommitted(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): PiTargetTransactionJournal {
    const target = journalPath(workspaceRoot);
    const current = fs.readFileSync(target, 'utf8');
    if (current !== serializeJournal(journal)) {
        throw new Error('Pi target journal changed before commit marking');
    }
    const committed = { ...journal, committed: true };
    const temporary = `${target}.${journal.transactionId}.committed`;
    writeFileExclusiveDurably(temporary, serializeJournal(committed));
    fs.renameSync(temporary, target);
    fsyncDirectoryBestEffort(path.dirname(target));
    return committed;
}

function removeVerifiedRoot(
    workspaceRoot: string,
    target: string,
    snapshot: PiTargetRootSnapshot,
): void {
    if (!matchesRootSnapshot(workspaceRoot, target, snapshot)) {
        throw new Error('Refusing to remove a changed Pi target root');
    }
    fs.rmSync(target, { recursive: true });
}

function removeVerifiedFile(
    workspaceRoot: string,
    target: string,
    snapshot: PiTargetFileSnapshot,
): void {
    if (!matchesFileSnapshot(workspaceRoot, target, snapshot)) {
        throw new Error('Refusing to remove a changed Pi target file');
    }
    fs.unlinkSync(target);
}

function removeEmptyDirectory(workspaceRoot: string, target: string): void {
    if (!pathEntryExists(target)) {
        return;
    }
    assertSafeExistingPath(safeRealWorkspace(workspaceRoot), target, 'directory');
    if (fs.readdirSync(target).length !== 0) {
        throw new Error('Transaction directory contains unrecognized content');
    }
    fs.rmdirSync(target);
}

function cleanupTransactionDirectories(workspaceRoot: string, transactionRoot: string): void {
    removeEmptyDirectory(workspaceRoot, path.join(transactionRoot, 'next'));
    removeEmptyDirectory(workspaceRoot, path.join(transactionRoot, 'previous'));
    removeEmptyDirectory(workspaceRoot, transactionRoot);
}

function removeJournal(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    const target = journalPath(workspaceRoot);
    if (fs.readFileSync(target, 'utf8') !== serializeJournal(journal)) {
        throw new Error('Pi target journal changed during recovery');
    }
    fs.unlinkSync(target);
}

function rollbackUncommitted(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    const targetState = statePath(workspaceRoot);
    const previousStatePath = path.join(transactionRoot, 'previous-state.json');
    const nextStatePath = path.join(transactionRoot, 'next-state.json');

    if (journal.stateAction !== 'none') {
        if (journal.previousState) {
            if (pathEntryExists(previousStatePath)) {
                if (pathEntryExists(targetState)) {
                    if (
                        !journal.nextState ||
                        !matchesFileSnapshot(workspaceRoot, targetState, journal.nextState)
                    ) {
                        throw new Error('Changed Pi target state blocks rollback');
                    }
                    removeVerifiedFile(workspaceRoot, targetState, journal.nextState);
                }
                fs.renameSync(previousStatePath, targetState);
                if (!matchesFileSnapshot(workspaceRoot, targetState, journal.previousState)) {
                    throw new Error('Previous Pi target state failed restoration');
                }
            } else if (
                !pathEntryExists(targetState) ||
                !matchesFileSnapshot(workspaceRoot, targetState, journal.previousState)
            ) {
                throw new Error('Previous Pi target state cannot be located');
            }
        } else if (pathEntryExists(targetState)) {
            if (
                !journal.nextState ||
                !matchesFileSnapshot(workspaceRoot, targetState, journal.nextState)
            ) {
                throw new Error('Untracked Pi target state blocks rollback');
            }
            removeVerifiedFile(workspaceRoot, targetState, journal.nextState);
        }
        if (pathEntryExists(nextStatePath)) {
            if (!journal.nextState) {
                throw new Error('Unexpected staged state exists');
            }
            removeVerifiedFile(workspaceRoot, nextStatePath, journal.nextState);
        }
    }

    for (const action of [...journal.rootActions].reverse()) {
        const output = pluginRootPath(workspaceRoot, action.pluginName);
        const previous = transactionPluginPath(transactionRoot, 'previous', action.pluginName);
        const next = transactionPluginPath(transactionRoot, 'next', action.pluginName);
        if (action.previousRoot) {
            if (pathEntryExists(previous)) {
                if (pathEntryExists(output)) {
                    if (
                        !action.nextRoot ||
                        !matchesRootSnapshot(workspaceRoot, output, action.nextRoot)
                    ) {
                        throw new Error('Changed Pi plugin blocks rollback');
                    }
                    removeVerifiedRoot(workspaceRoot, output, action.nextRoot);
                }
                ensureDirectory(workspaceRoot, PI_PROJECT_PLUGINS_RELATIVE_ROOT);
                fs.renameSync(previous, output);
                if (!matchesRootSnapshot(workspaceRoot, output, action.previousRoot)) {
                    throw new Error('Previous Pi plugin failed restoration');
                }
            } else if (
                !pathEntryExists(output) ||
                !matchesRootSnapshot(workspaceRoot, output, action.previousRoot)
            ) {
                throw new Error('Previous Pi plugin cannot be located');
            }
        } else if (pathEntryExists(output)) {
            if (!action.nextRoot || !matchesRootSnapshot(workspaceRoot, output, action.nextRoot)) {
                throw new Error('Untracked Pi plugin blocks rollback');
            }
            removeVerifiedRoot(workspaceRoot, output, action.nextRoot);
        }
        if (pathEntryExists(next)) {
            if (!action.nextRoot) {
                throw new Error('Unexpected staged Pi plugin exists');
            }
            removeVerifiedRoot(workspaceRoot, next, action.nextRoot);
        }
    }
    cleanupTransactionDirectories(workspaceRoot, transactionRoot);
    removeJournal(workspaceRoot, journal);
}

function finalizeCommitted(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    const targetState = statePath(workspaceRoot);
    if (journal.stateAction === 'write') {
        if (
            !journal.nextState ||
            !matchesFileSnapshot(workspaceRoot, targetState, journal.nextState)
        ) {
            throw new Error('Committed Pi target state is missing or changed');
        }
    } else if (journal.stateAction === 'remove' && pathEntryExists(targetState)) {
        throw new Error('Committed Pi target state removal is incomplete');
    }
    for (const action of journal.rootActions) {
        const output = pluginRootPath(workspaceRoot, action.pluginName);
        if (action.action === 'replace') {
            if (!action.nextRoot || !matchesRootSnapshot(workspaceRoot, output, action.nextRoot)) {
                throw new Error('Committed Pi plugin is missing or changed');
            }
        } else if (pathEntryExists(output)) {
            throw new Error('Committed Pi plugin removal is incomplete');
        }
    }
    for (const action of journal.rootActions) {
        const previous = transactionPluginPath(transactionRoot, 'previous', action.pluginName);
        const next = transactionPluginPath(transactionRoot, 'next', action.pluginName);
        if (pathEntryExists(previous)) {
            if (!action.previousRoot) {
                throw new Error('Unexpected previous Pi plugin exists');
            }
            removeVerifiedRoot(workspaceRoot, previous, action.previousRoot);
        }
        if (pathEntryExists(next)) {
            if (!action.nextRoot) {
                throw new Error('Unexpected staged Pi plugin exists');
            }
            removeVerifiedRoot(workspaceRoot, next, action.nextRoot);
        }
    }
    const previousStatePath = path.join(transactionRoot, 'previous-state.json');
    const nextStatePath = path.join(transactionRoot, 'next-state.json');
    if (pathEntryExists(previousStatePath)) {
        if (!journal.previousState) {
            throw new Error('Unexpected previous Pi target state exists');
        }
        removeVerifiedFile(workspaceRoot, previousStatePath, journal.previousState);
    }
    if (pathEntryExists(nextStatePath)) {
        if (!journal.nextState) {
            throw new Error('Unexpected staged Pi target state exists');
        }
        removeVerifiedFile(workspaceRoot, nextStatePath, journal.nextState);
    }
    cleanupTransactionDirectories(workspaceRoot, transactionRoot);
    removeJournal(workspaceRoot, journal);
}

function coherentWithoutTransactionRoot(
    workspaceRoot: string,
    journal: PiTargetTransactionJournal,
): boolean {
    const targetState = statePath(workspaceRoot);
    const stateCoherent = journal.committed
        ? journal.stateAction === 'none' ||
          (journal.stateAction === 'remove'
              ? !pathEntryExists(targetState)
              : journal.nextState !== undefined &&
                matchesFileSnapshot(workspaceRoot, targetState, journal.nextState))
        : journal.stateAction === 'none' ||
          (journal.previousState
              ? matchesFileSnapshot(workspaceRoot, targetState, journal.previousState)
              : !pathEntryExists(targetState));
    return (
        stateCoherent &&
        journal.rootActions.every((action) => {
            const output = pluginRootPath(workspaceRoot, action.pluginName);
            if (journal.committed) {
                return action.action === 'remove'
                    ? !pathEntryExists(output)
                    : action.nextRoot !== undefined &&
                          matchesRootSnapshot(workspaceRoot, output, action.nextRoot);
            }
            return action.previousRoot
                ? matchesRootSnapshot(workspaceRoot, output, action.previousRoot)
                : !pathEntryExists(output);
        })
    );
}

function recoverPendingTransaction(workspaceRoot: string): readonly PiTargetDiagnostic[] {
    const loaded = loadJournal(workspaceRoot);
    if (!loaded.exists) {
        return [];
    }
    if (!loaded.journal) {
        return [loaded.diagnostic!];
    }
    const journal = loaded.journal;
    try {
        const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
        if (!pathEntryExists(transactionRoot)) {
            if (!coherentWithoutTransactionRoot(workspaceRoot, journal)) {
                throw new Error('Transaction artifacts disappeared before a coherent outcome');
            }
            removeJournal(workspaceRoot, journal);
            return [];
        }
        assertSafeExistingPath(safeRealWorkspace(workspaceRoot), transactionRoot, 'directory');
        if (
            !sameIdentity(
                pathIdentity(fs.lstatSync(transactionRoot)),
                journal.transactionRootIdentity,
            )
        ) {
            throw new Error('Transaction root identity changed');
        }
        if (journal.committed) {
            finalizeCommitted(workspaceRoot, journal);
        } else {
            rollbackUncommitted(workspaceRoot, journal);
        }
        return [];
    } catch {
        return [
            targetDiagnostic(
                'PI_TARGET_RECOVERY_CONFLICT',
                'Pending Pi target recovery encountered changed or unrecognized content; all recovery artifacts were preserved.',
                'error',
                PI_TARGET_JOURNAL_RELATIVE_PATH,
            ),
        ];
    }
}

function changedPluginNames(plan: PiProjectPluginSynchronizationPlan): readonly string[] {
    const names = new Set<string>();
    for (const change of plan.changes) {
        const segments = change.relativePath.split('/');
        if (segments[0] === '.pi' && segments[1] === 'plugins' && segments[2]) {
            names.add(segments[2]);
        }
    }
    return [...names].sort(compareCodeUnits);
}

function commitTransaction(workspaceRoot: string, journal: PiTargetTransactionJournal): void {
    const transactionRoot = transactionRootPath(workspaceRoot, journal.transactionId);
    ensureDirectory(workspaceRoot, PI_PROJECT_PLUGINS_RELATIVE_ROOT);
    const previousParent = path.join(transactionRoot, 'previous');
    if (
        journal.rootActions.some((action) => action.previousRoot) &&
        !pathEntryExists(previousParent)
    ) {
        fs.mkdirSync(previousParent);
    }
    try {
        for (const action of journal.rootActions) {
            const output = pluginRootPath(workspaceRoot, action.pluginName);
            const previous = transactionPluginPath(transactionRoot, 'previous', action.pluginName);
            const next = transactionPluginPath(transactionRoot, 'next', action.pluginName);
            if (action.previousRoot) {
                if (!matchesRootSnapshot(workspaceRoot, output, action.previousRoot)) {
                    throw new Error('Pi plugin changed after final preflight');
                }
                fs.renameSync(output, previous);
                if (!matchesRootSnapshot(workspaceRoot, previous, action.previousRoot)) {
                    throw new Error('Moved Pi plugin changed during transaction');
                }
            } else if (pathEntryExists(output)) {
                throw new Error('Untracked Pi plugin appeared after final preflight');
            }
            if (action.action === 'replace') {
                if (
                    !action.nextRoot ||
                    !matchesRootSnapshot(workspaceRoot, next, action.nextRoot)
                ) {
                    throw new Error('Staged Pi plugin changed before installation');
                }
                fs.renameSync(next, output);
                if (!matchesRootSnapshot(workspaceRoot, output, action.nextRoot)) {
                    throw new Error('Installed Pi plugin changed during installation');
                }
            }
        }
        if (journal.stateAction !== 'none') {
            const targetState = statePath(workspaceRoot);
            const previousState = path.join(transactionRoot, 'previous-state.json');
            const nextState = path.join(transactionRoot, 'next-state.json');
            if (journal.previousState) {
                if (!matchesFileSnapshot(workspaceRoot, targetState, journal.previousState)) {
                    throw new Error('Pi target state changed after final preflight');
                }
                fs.renameSync(targetState, previousState);
            } else if (pathEntryExists(targetState)) {
                throw new Error('Untracked Pi target state appeared after final preflight');
            }
            if (journal.stateAction === 'write') {
                if (
                    !journal.nextState ||
                    !matchesFileSnapshot(workspaceRoot, nextState, journal.nextState)
                ) {
                    throw new Error('Staged Pi target state changed before installation');
                }
                fs.renameSync(nextState, targetState);
                if (!matchesFileSnapshot(workspaceRoot, targetState, journal.nextState)) {
                    throw new Error('Installed Pi target state changed during installation');
                }
            }
        }
    } catch (error) {
        const recovery = recoverPendingTransaction(workspaceRoot);
        if (recovery.length > 0) {
            throw new Error(recovery[0].message, { cause: error });
        }
        throw error;
    }
    const committed = markJournalCommitted(workspaceRoot, journal);
    finalizeCommitted(workspaceRoot, committed);
}

/** Apply the planned per-plugin set after repeated fail-closed preflight checks. */
export function applyPiProjectPluginSynchronization(
    options: PiProjectPluginPlanOptions,
): PiProjectPluginApplyResult {
    let firstPlan = planPiProjectPluginSynchronization(options);
    const pendingJournal = loadJournal(options.workspaceRoot).exists;
    if (
        (!pendingJournal && firstPlan.blocked) ||
        (!pendingJournal && firstPlan.changes.length === 0 && firstPlan.stateAction === 'none')
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
    let transactionRootSnapshot: PiTargetRootSnapshot | undefined;
    let journalWritten = false;
    try {
        const recoveryDiagnostics = recoverPendingTransaction(options.workspaceRoot);
        if (recoveryDiagnostics.length > 0) {
            return {
                plan: {
                    ...firstPlan,
                    blocked: true,
                    changes: [],
                    stateAction: 'none',
                    diagnostics: canonicalDiagnostics([
                        ...firstPlan.diagnostics,
                        ...recoveryDiagnostics,
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
        const changedNames = changedPluginNames(firstPlan);
        const packageByName = new Map(
            options.projection && !options.projection.blocked
                ? options.projection.packages.map((entry) => [entry.name, entry] as const)
                : [],
        );
        const stagedRoots = new Map<string, PiTargetRootSnapshot>();
        for (const pluginName of changedNames) {
            const projectedPackage = packageByName.get(pluginName);
            if (projectedPackage) {
                const staged = stagePackage(
                    options.workspaceRoot,
                    transactionRoot,
                    projectedPackage,
                );
                stagedRoots.set(pluginName, captureRootSnapshot(options.workspaceRoot, staged));
            }
        }
        let stagedStatePath: string | undefined;
        if (firstPlan.stateAction === 'write' && firstPlan.desiredState) {
            stagedStatePath = stageState(
                options.workspaceRoot,
                transactionRoot,
                firstPlan.desiredState,
            );
        }
        transactionRootSnapshot = captureRootSnapshot(options.workspaceRoot, transactionRoot);

        const secondPlan = planPiProjectPluginSynchronization(options);
        if (secondPlan.blocked || planIdentity(secondPlan) !== planIdentity(firstPlan)) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, transactionRootSnapshot);
            transactionRoot = undefined;
            transactionRootSnapshot = undefined;
            return {
                plan: {
                    ...secondPlan,
                    blocked: true,
                    changes: [],
                    diagnostics: canonicalDiagnostics([
                        ...secondPlan.diagnostics,
                        targetDiagnostic(
                            'PI_TARGET_PREFLIGHT_CHANGED',
                            'Pi target state changed while packages were staged; no output was modified.',
                        ),
                    ]),
                },
                written: [],
                removed: [],
                stateChanged: false,
            };
        }

        const rootActions: PiTargetRootTransaction[] = [];
        for (const pluginName of changedNames) {
            const output = pluginRootPath(options.workspaceRoot, pluginName);
            const previousRoot = pathEntryExists(output)
                ? captureRootSnapshot(options.workspaceRoot, output)
                : undefined;
            const nextRoot = stagedRoots.get(pluginName);
            rootActions.push({
                pluginName,
                action: nextRoot ? 'replace' : 'remove',
                ...(previousRoot ? { previousRoot } : {}),
                ...(nextRoot ? { nextRoot } : {}),
            });
        }
        const targetState = statePath(options.workspaceRoot);
        const previousState =
            firstPlan.stateAction !== 'none' && pathEntryExists(targetState)
                ? captureFileSnapshot(options.workspaceRoot, targetState)
                : undefined;
        const nextState = stagedStatePath
            ? captureFileSnapshot(options.workspaceRoot, stagedStatePath)
            : undefined;
        const finalPlan = planPiProjectPluginSynchronization(options);
        if (finalPlan.blocked || planIdentity(finalPlan) !== planIdentity(firstPlan)) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, transactionRootSnapshot);
            transactionRoot = undefined;
            transactionRootSnapshot = undefined;
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
            rootActions,
            stateAction: firstPlan.stateAction,
            transactionRootIdentity: pathIdentity(fs.lstatSync(transactionRoot)),
            ...(previousState ? { previousState } : {}),
            ...(nextState ? { nextState } : {}),
        };
        writeJournal(options.workspaceRoot, journal);
        journalWritten = true;
        commitTransaction(options.workspaceRoot, journal);
        journalWritten = false;
        transactionRoot = undefined;
        transactionRootSnapshot = undefined;
        return {
            plan: firstPlan,
            written: firstPlan.changes
                .filter((change) => change.action !== 'remove')
                .map((change) => change.relativePath),
            removed: firstPlan.changes
                .filter((change) => change.action === 'remove')
                .map((change) => change.relativePath),
            stateChanged: firstPlan.stateAction !== 'none',
        };
    } finally {
        if (transactionRoot && transactionRootSnapshot && !journalWritten) {
            removeVerifiedRoot(options.workspaceRoot, transactionRoot, transactionRootSnapshot);
        }
        releaseTargetLock(options.workspaceRoot, lockResult.lock);
    }
}
