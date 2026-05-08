import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import { ConfigError } from './configSchema';
import { discoverGovernanceContractPath, normalizeInputPath } from './configPathUtils';

export type GovernanceSeverity = 'warn' | 'error';

export interface GovernanceCapabilityRef {
    repoId: string;
    path: string;
}

export interface GovernanceContract {
    requiredCapabilities?: GovernanceCapabilityRef[];
    defaultOnCapabilities?: GovernanceCapabilityRef[];
    lockedProfiles?: string[];
    allowedProfiles?: string[];
    severity?: GovernanceSeverity;
}

export type GovernanceContractLoadResult =
    | {
          ok: true;
          contract?: GovernanceContract;
          contractPath?: string;
      }
    | {
          ok: false;
          errors: ConfigError[];
          contractPath: string;
      };

export function loadGovernanceContract(workspaceRoot: string): GovernanceContractLoadResult {
    const contractPath = discoverGovernanceContractPath(workspaceRoot);
    if (!contractPath) {
        return { ok: true };
    }
    return loadGovernanceContractFromPath(contractPath);
}

export function loadGovernanceContractFromPath(contractPath: string): GovernanceContractLoadResult {
    let rawText: string;
    try {
        rawText = fs.readFileSync(contractPath, 'utf-8');
    } catch (err) {
        return {
            ok: false,
            contractPath,
            errors: [
                {
                    code: 'GOVERNANCE_READ_FAILED',
                    severity: 'error',
                    message: `Failed to read governance contract: ${(err as Error).message}`,
                },
            ],
        };
    }

    return parseAndValidateGovernanceContract(rawText, contractPath);
}

export function parseAndValidateGovernanceContract(
    rawText: string,
    contractPath: string,
): GovernanceContractLoadResult {
    const parseErrors: jsonc.ParseError[] = [];
    const parsed = jsonc.parse(rawText, parseErrors, {
        allowTrailingComma: true,
        disallowComments: false,
    });

    if (parseErrors.length > 0) {
        return {
            ok: false,
            contractPath,
            errors: parseErrors.map((pe) => {
                const pos = getLineColumn(rawText, pe.offset);
                return {
                    code: 'GOVERNANCE_JSON_PARSE_ERROR',
                    severity: 'error',
                    message: `Governance contract parse error: ${jsonc.printParseErrorCode(pe.error)} at offset ${pe.offset}`,
                    line: pos.line,
                    column: pos.column,
                };
            }),
        };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
            ok: false,
            contractPath,
            errors: [
                {
                    code: 'GOVERNANCE_CONTRACT_NOT_OBJECT',
                    severity: 'error',
                    message: 'Governance contract must be a JSON object.',
                },
            ],
        };
    }

    const errors = validateGovernanceContract(parsed as GovernanceContract);
    if (errors.length > 0) {
        return { ok: false, contractPath, errors };
    }

    return {
        ok: true,
        contractPath,
        contract: normalizeGovernanceContract(parsed as GovernanceContract),
    };
}

export function validateGovernanceContract(contract: GovernanceContract): ConfigError[] {
    const errors: ConfigError[] = [];

    validateCapabilityRefList(contract.requiredCapabilities, 'requiredCapabilities', errors);
    validateCapabilityRefList(contract.defaultOnCapabilities, 'defaultOnCapabilities', errors);
    validateStringList(contract.lockedProfiles, 'lockedProfiles', errors);
    validateStringList(contract.allowedProfiles, 'allowedProfiles', errors);

    if (
        contract.severity !== undefined &&
        contract.severity !== 'warn' &&
        contract.severity !== 'error'
    ) {
        errors.push({
            code: 'GOVERNANCE_INVALID_SEVERITY',
            severity: 'error',
            message: 'Governance contract "severity" must be either "warn" or "error".',
        });
    }

    const requiredKeys = new Set<string>();
    for (const capability of contract.requiredCapabilities ?? []) {
        if (!isValidCapabilityRef(capability)) {
            continue;
        }

        const key = buildCapabilityRefKey(capability);
        if (requiredKeys.has(key)) {
            errors.push({
                code: 'GOVERNANCE_DUPLICATE_REQUIRED_CAPABILITY',
                severity: 'error',
                message: `Governance contract duplicates required capability "${capability.repoId}/${normalizeCapabilityPath(capability.path)}" after path normalization. Remove the duplicate entry.`,
            });
        } else {
            requiredKeys.add(key);
        }
    }

    const defaultOnKeys = new Set<string>();
    for (const capability of contract.defaultOnCapabilities ?? []) {
        if (!isValidCapabilityRef(capability)) {
            continue;
        }

        const key = buildCapabilityRefKey(capability);
        if (defaultOnKeys.has(key)) {
            errors.push({
                code: 'GOVERNANCE_DUPLICATE_DEFAULT_ON_CAPABILITY',
                severity: 'error',
                message: `Governance contract duplicates default-on capability "${capability.repoId}/${normalizeCapabilityPath(capability.path)}" after path normalization. Remove the duplicate entry.`,
            });
        } else {
            defaultOnKeys.add(key);
        }
    }

    if (contract.allowedProfiles && contract.lockedProfiles) {
        const allowed = new Set(contract.allowedProfiles);
        for (const profileId of contract.lockedProfiles) {
            if (!allowed.has(profileId)) {
                errors.push({
                    code: 'GOVERNANCE_LOCKED_PROFILE_NOT_ALLOWED',
                    severity: 'error',
                    message: `Governance contract locks profile "${profileId}" but does not include it in "allowedProfiles". Add it to allowedProfiles or remove the lock.`,
                });
            }
        }
    }

    return errors;
}

function normalizeCapabilityPath(pathValue: string): string {
    const normalized = normalizeInputPath(pathValue).replace(/\/\.github$/, '');
    return normalized === '' || normalized === '.github' ? '.' : normalized;
}

function buildCapabilityRefKey(value: GovernanceCapabilityRef): string {
    return `${value.repoId}::${normalizeCapabilityPath(value.path)}`;
}

function isValidCapabilityRef(value: GovernanceCapabilityRef): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value.repoId === 'string' &&
        value.repoId.trim().length > 0 &&
        typeof value.path === 'string' &&
        value.path.trim().length > 0
    );
}

function normalizeGovernanceContract(contract: GovernanceContract): GovernanceContract {
    return {
        severity: contract.severity ?? 'warn',
        ...(contract.requiredCapabilities
            ? {
                  requiredCapabilities: dedupeCapabilityRefs(contract.requiredCapabilities),
              }
            : {}),
        ...(contract.defaultOnCapabilities
            ? {
                  defaultOnCapabilities: dedupeCapabilityRefs(contract.defaultOnCapabilities),
              }
            : {}),
        ...(contract.lockedProfiles
            ? { lockedProfiles: Array.from(new Set(contract.lockedProfiles)) }
            : {}),
        ...(contract.allowedProfiles
            ? { allowedProfiles: Array.from(new Set(contract.allowedProfiles)) }
            : {}),
    };
}

function dedupeCapabilityRefs(values: GovernanceCapabilityRef[]): GovernanceCapabilityRef[] {
    const seen = new Set<string>();
    const output: GovernanceCapabilityRef[] = [];
    for (const value of values) {
        const key = buildCapabilityRefKey(value);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        output.push({ repoId: value.repoId, path: value.path });
    }
    return output;
}

function validateCapabilityRefList(
    value: GovernanceCapabilityRef[] | undefined,
    fieldName: 'requiredCapabilities' | 'defaultOnCapabilities',
    errors: ConfigError[],
): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        errors.push({
            code: `GOVERNANCE_INVALID_${fieldName === 'requiredCapabilities' ? 'REQUIRED_CAPABILITIES' : 'DEFAULT_ON_CAPABILITIES'}`,
            severity: 'error',
            message: `Governance contract "${fieldName}" must be an array of { repoId, path } objects.`,
        });
        return;
    }

    for (const entry of value) {
        if (
            typeof entry !== 'object' ||
            entry === null ||
            Array.isArray(entry) ||
            typeof entry.repoId !== 'string' ||
            entry.repoId.trim().length === 0 ||
            typeof entry.path !== 'string' ||
            entry.path.trim().length === 0
        ) {
            errors.push({
                code: `GOVERNANCE_INVALID_${fieldName === 'requiredCapabilities' ? 'REQUIRED_CAPABILITIES' : 'DEFAULT_ON_CAPABILITIES'}`,
                severity: 'error',
                message: `Governance contract "${fieldName}" entries must each provide non-empty string "repoId" and "path" fields.`,
            });
            return;
        }
    }
}

function validateStringList(
    value: string[] | undefined,
    fieldName: 'lockedProfiles' | 'allowedProfiles',
    errors: ConfigError[],
): void {
    if (value === undefined) {
        return;
    }

    if (
        !Array.isArray(value) ||
        value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
    ) {
        errors.push({
            code: `GOVERNANCE_INVALID_${fieldName === 'lockedProfiles' ? 'LOCKED_PROFILES' : 'ALLOWED_PROFILES'}`,
            severity: 'error',
            message: `Governance contract "${fieldName}" must be an array of non-empty profile IDs.`,
        });
    }
}

function getLineColumn(text: string, offset: number): { line: number; column: number } {
    const lines = text.slice(0, offset).split(/\r?\n/);
    return {
        line: lines.length - 1,
        column: lines[lines.length - 1].length,
    };
}
