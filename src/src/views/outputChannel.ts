/**
 * MetaFlow structured output channel.
 *
 * Provides timestamped, severity-prefixed logging with configurable verbosity.
 */

import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let outputChannel: vscode.OutputChannel | undefined;
let currentLogLevel: LogLevel = 'info';

/**
 * Get (or create) the MetaFlow output channel.
 */
export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('MetaFlow');
    }
    return outputChannel;
}

/**
 * Set the minimum log level.
 */
export function setLogLevel(level: LogLevel): void {
    currentLogLevel = level;
}

/**
 * Get the current log level.
 */
export function getLogLevel(): LogLevel {
    return currentLogLevel;
}

/**
 * Log a message at the given severity level.
 */
export function log(level: LogLevel, message: string): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[currentLogLevel]) {
        return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const channel = getOutputChannel();
    channel.appendLine(`${prefix} ${message}`);

    if (level === 'error') {
        channel.show(true); // auto-show on error
    }
}

/**
 * Convenience log methods.
 */
export function logDebug(message: string): void { log('debug', message); }
export function logInfo(message: string): void { log('info', message); }
export function logWarn(message: string): void { log('warn', message); }
export function logError(message: string): void { log('error', message); }

/**
 * Bring the output channel into view.
 */
export function showOutputChannel(preserveFocus = true): void {
    getOutputChannel().show(preserveFocus);
}

/**
 * Dispose the output channel.
 */
export function disposeOutputChannel(): void {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }
}
