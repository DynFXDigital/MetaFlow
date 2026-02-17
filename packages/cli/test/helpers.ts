/**
 * Test helpers for CLI integration tests.
 *
 * Provides utilities to create temporary workspaces with metadata repos
 * and capture CLI output for assertions.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { createProgram } from '../src/cli';

// ── Temp workspace builder ─────────────────────────────────────────

export interface TestWorkspace {
    /** Absolute path to the temp workspace root. */
    root: string;
    /** Absolute path to the metadata repo directory. */
    metadataRepo: string;
    /** Clean up the temp workspace. */
    cleanup(): void;
}

export interface RepoFile {
    /** Relative path within the layer (e.g., `instructions/coding.md`). */
    relativePath: string;
    /** File content. */
    content: string;
}

export interface WorkspaceOptions {
    /** Config object to write as .metaflow.json. If undefined, no config is created. */
    config?: Record<string, unknown>;
    /** Layer files to populate in the metadata repo. Key is layer path. */
    layers?: Record<string, RepoFile[]>;
    /** If true, skip creating the metadata repo. */
    noRepo?: boolean;
}

/**
 * Create a temporary workspace for testing.
 */
export function createTestWorkspace(options: WorkspaceOptions = {}): TestWorkspace {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-cli-test-'));
    const metadataRepo = path.join(root, '.ai', 'ai-metadata');

    // Create metadata repo with layers
    if (!options.noRepo && options.layers) {
        for (const [layerPath, files] of Object.entries(options.layers)) {
            for (const file of files) {
                const fullPath = path.join(metadataRepo, layerPath, file.relativePath);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, file.content, 'utf-8');
            }
        }
    }

    // Write config
    if (options.config) {
        const configPath = path.join(root, '.metaflow.json');
        fs.writeFileSync(configPath, JSON.stringify(options.config, null, 2), 'utf-8');
    }

    return {
        root,
        metadataRepo,
        cleanup() {
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}

// ── CLI runner ─────────────────────────────────────────────────────

export interface CliResult {
    /** Captured stdout lines. */
    stdout: string;
    /** Captured stderr lines. */
    stderr: string;
    /** Process exit code (0 if unset). */
    exitCode: number;
}

/**
 * Run the CLI program with given arguments and capture output.
 * Does not call process.exit.
 */
export async function runCli(args: string[]): Promise<CliResult> {
    const program = createProgram();

    // Prevent Commander from calling process.exit
    program.exitOverride();

    // Capture stdout/stderr
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const origStdoutWrite = process.stdout.write;
    const origStderrWrite = process.stderr.write;
    const origConsoleLog = console.log;
    const origConsoleError = console.error;
    const origConsoleWarn = console.warn;

    // Store original exitCode
    const origExitCode = process.exitCode;
    process.exitCode = undefined;

    // Override console methods to capture output
    console.log = (...logArgs: unknown[]) => {
        stdoutChunks.push(logArgs.map(String).join(' '));
    };
    console.error = (...logArgs: unknown[]) => {
        stderrChunks.push(logArgs.map(String).join(' '));
    };
    console.warn = (...logArgs: unknown[]) => {
        stderrChunks.push(logArgs.map(String).join(' '));
    };

    // Also capture process.stdout.write for Commander output
    process.stdout.write = ((chunk: string | Uint8Array) => {
        stdoutChunks.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string | Uint8Array) => {
        stderrChunks.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;

    let exitCode = 0;

    try {
        await program.parseAsync(['node', 'metaflow', ...args]);
        exitCode = (process.exitCode as number | undefined) ?? 0;
    } catch (err: unknown) {
        // Commander throws on exitOverride — extract code
        if (err && typeof err === 'object' && 'exitCode' in err) {
            exitCode = (err as { exitCode: number }).exitCode;
        } else {
            exitCode = 1;
        }
        // If process.exitCode was set by our commands, use it
        if (process.exitCode !== undefined) {
            exitCode = process.exitCode as number;
        }
    } finally {
        // Restore originals
        process.stdout.write = origStdoutWrite;
        process.stderr.write = origStderrWrite;
        console.log = origConsoleLog;
        console.error = origConsoleError;
        console.warn = origConsoleWarn;
        process.exitCode = origExitCode;
    }

    return {
        stdout: stdoutChunks.join('\n'),
        stderr: stderrChunks.join('\n'),
        exitCode,
    };
}

// ── Standard test config ───────────────────────────────────────────

/**
 * Create a standard single-repo config object.
 */
export function standardConfig(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
    return {
        metadataRepo: {
            localPath: '.ai/ai-metadata',
        },
        layers: ['company/core'],
        filters: {
            include: ['**'],
            exclude: [],
        },
        profiles: {
            default: { enable: ['**'] },
            lean: { disable: ['agents/**'] },
        },
        activeProfile: 'default',
        injection: {
            instructions: 'settings',
            prompts: 'settings',
            skills: 'materialize',
            agents: 'materialize',
        },
        ...overrides,
    };
}
