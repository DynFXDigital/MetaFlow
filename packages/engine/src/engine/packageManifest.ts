/**
 * Canonical MetaFlow package manifest parser/loader.
 *
 * Package manifests describe agent-plugin style bundles and target catalog
 * intent. They do not publish marketplace entries or grant runtime authority.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CapabilityDiagnosticSeverity,
    CapabilityWarning,
    PackageMarketplaceEntryMetadata,
    PackageManifestMetadata,
    PackageRuntimeValidationMetadata,
    TargetCapabilityConcept,
} from './types';

const CANONICAL_METAFLOW_DIR_NAME = '.metaflow';
const PACKAGES_DIR_NAME = 'packages';
const PACKAGE_SCHEMA_VERSION = 'metaflow.package/v1';
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const KNOWN_FIELDS = new Set([
    'schemaVersion',
    'id',
    'name',
    'kind',
    'agents',
    'skills',
    'instructions',
    'prompts',
    'mcpServers',
    'tools',
    'hooks',
    'policyGrants',
    'targets',
    'marketplaceEntries',
    'validationEvidence',
    'runtimeValidation',
    'description',
]);

type PackageFields = {
    schemaVersion?: unknown;
    id?: unknown;
    name?: unknown;
    kind?: unknown;
    agents?: unknown;
    skills?: unknown;
    instructions?: unknown;
    prompts?: unknown;
    mcpServers?: unknown;
    tools?: unknown;
    hooks?: unknown;
    policyGrants?: unknown;
    targets?: unknown;
    marketplaceEntries?: unknown;
    validationEvidence?: unknown;
    runtimeValidation?: unknown;
    description?: unknown;
};

const RUNTIME_VALIDATION_STATUSES = new Set(['passed', 'partial', 'failed', 'not-run']);
const TARGET_CAPABILITY_CONCEPTS = new Set<TargetCapabilityConcept>([
    'instructions',
    'prompts',
    'skills',
    'agents',
    'projectConfig',
    'commandRules',
    'worktreeInclude',
    'mcpServers',
    'tools',
    'hooks',
    'packageManifests',
    'pluginRuntime',
    'agentRuntime',
    'automationRuntime',
    'authenticationRuntime',
    'permissionRuntime',
    'enterprisePolicyRuntime',
    'policyGrants',
    'executionSurfaces',
    'memoryScopes',
    'chronicleRuntime',
    'appshotsRuntime',
    'recordReplayRuntime',
    'importRuntime',
    'modelProviderRuntime',
    'windowsPlatformRuntime',
    'cloudEnvironmentRuntime',
    'appConnectorRuntime',
    'localCloudHandoff',
    'issuePrOperation',
    'reviewRuntime',
    'remoteConnectionRuntime',
    'remoteMcpRuntime',
    'oauthMcpRuntime',
    'sideEffectMcpRuntime',
    'memoryRuntime',
    'browserRuntime',
    'chromeRuntime',
    'computerUseRuntime',
    'sitesRuntime',
    'evaluationSupport',
    'evaluationRuntime',
]);

export interface PackageReferenceIndex {
    agents?: Set<string>;
    skills?: Set<string>;
    instructions?: Set<string>;
    prompts?: Set<string>;
    mcpServers?: Set<string>;
    tools?: Set<string>;
    hooks?: Set<string>;
}

function toWarning(
    code: string,
    message: string,
    filePath?: string,
    severity: CapabilityDiagnosticSeverity = 'warning',
): CapabilityWarning {
    return { code, message, filePath, severity };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseStringArray(
    value: unknown,
    fieldName: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                warningCode,
                `Package ${fieldName} must be an array of non-empty strings when present.`,
                manifestPath,
                'error',
            ),
        );
        return [];
    }

    const result: string[] = [];
    for (const entry of value) {
        const text = parseNonEmptyString(entry);
        if (!text) {
            warnings.push(
                toWarning(
                    warningCode,
                    `Package ${fieldName} must contain only non-empty strings.`,
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }
        result.push(text);
    }
    return result;
}

function parseTargets(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): Record<string, { pluginName?: string; enabled?: boolean }> {
    if (value === undefined) {
        return {};
    }
    if (!isObjectRecord(value)) {
        warnings.push(
            toWarning(
                'PACKAGE_TARGETS_INVALID',
                'Package targets must be an object whose values are target declaration objects.',
                manifestPath,
                'error',
            ),
        );
        return {};
    }

    const targets: Record<string, { pluginName?: string; enabled?: boolean }> = {};
    for (const [targetId, declaration] of Object.entries(value)) {
        const normalizedTargetId = targetId.trim();
        if (!normalizedTargetId || !isObjectRecord(declaration)) {
            warnings.push(
                toWarning(
                    'PACKAGE_TARGETS_INVALID',
                    'Package target declarations must be keyed by non-empty target id and use object values.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const pluginName = parseNonEmptyString(declaration.pluginName);
        if (declaration.pluginName !== undefined && !pluginName) {
            warnings.push(
                toWarning(
                    'PACKAGE_TARGET_PLUGIN_NAME_INVALID',
                    `Package target "${normalizedTargetId}" pluginName must be a non-empty string when present.`,
                    manifestPath,
                    'error',
                ),
            );
        }
        if (declaration.enabled !== undefined && typeof declaration.enabled !== 'boolean') {
            warnings.push(
                toWarning(
                    'PACKAGE_TARGET_ENABLED_INVALID',
                    `Package target "${normalizedTargetId}" enabled must be true or false when present.`,
                    manifestPath,
                    'error',
                ),
            );
        }

        targets[normalizedTargetId] = {
            ...(pluginName ? { pluginName } : {}),
            ...(typeof declaration.enabled === 'boolean' ? { enabled: declaration.enabled } : {}),
        };
    }
    return targets;
}

function parseRuntimeValidation(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): PackageRuntimeValidationMetadata[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                'PACKAGE_RUNTIME_VALIDATION_INVALID',
                'Package runtimeValidation must be an array of validation record objects when present.',
                manifestPath,
                'error',
            ),
        );
        return [];
    }

    const records: PackageRuntimeValidationMetadata[] = [];
    for (const entry of value) {
        if (!isObjectRecord(entry)) {
            warnings.push(
                toWarning(
                    'PACKAGE_RUNTIME_VALIDATION_INVALID',
                    'Package runtimeValidation entries must be objects.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const target = parseNonEmptyString(entry.target);
        const harness = parseNonEmptyString(entry.harness);
        const adapterVersion = parseNonEmptyString(entry.adapterVersion);
        const scenario = parseNonEmptyString(entry.scenario);
        const status = parseNonEmptyString(entry.status);
        if (
            !target ||
            !harness ||
            !adapterVersion ||
            !scenario ||
            !status ||
            !RUNTIME_VALIDATION_STATUSES.has(status)
        ) {
            warnings.push(
                toWarning(
                    'PACKAGE_RUNTIME_VALIDATION_INVALID',
                    'Package runtimeValidation entries require non-empty target, harness, adapterVersion, scenario, and status fields; status must be passed, partial, failed, or not-run.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const command = parseNonEmptyString(entry.command);
        if (entry.command !== undefined && !command) {
            warnings.push(
                toWarning(
                    'PACKAGE_RUNTIME_VALIDATION_INVALID',
                    'Package runtimeValidation command must be a non-empty string when present.',
                    manifestPath,
                    'error',
                ),
            );
        }
        const concepts = parseStringArray(
            entry.concepts,
            'runtimeValidation.concepts',
            'PACKAGE_RUNTIME_VALIDATION_CONCEPT_INVALID',
            manifestPath,
            warnings,
        ).filter((concept): concept is TargetCapabilityConcept => {
            if (TARGET_CAPABILITY_CONCEPTS.has(concept as TargetCapabilityConcept)) {
                return true;
            }
            warnings.push(
                toWarning(
                    'PACKAGE_RUNTIME_VALIDATION_CONCEPT_UNKNOWN',
                    `Package runtimeValidation concept "${concept}" is not a known target capability concept.`,
                    manifestPath,
                    'error',
                ),
            );
            return false;
        });

        records.push({
            target,
            ...(concepts.length > 0 ? { concepts } : {}),
            harness,
            adapterVersion,
            scenario,
            status: status as PackageRuntimeValidationMetadata['status'],
            ...(command ? { command } : {}),
            evidence: parseStringArray(
                entry.evidence,
                'runtimeValidation.evidence',
                'PACKAGE_RUNTIME_VALIDATION_INVALID',
                manifestPath,
                warnings,
            ),
            limitations: parseStringArray(
                entry.limitations,
                'runtimeValidation.limitations',
                'PACKAGE_RUNTIME_VALIDATION_INVALID',
                manifestPath,
                warnings,
            ),
        });
    }
    return records;
}

function parseMarketplaceEntries(
    value: unknown,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): PackageMarketplaceEntryMetadata[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        warnings.push(
            toWarning(
                'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                'Package marketplaceEntries must be an array of marketplace entry objects when present.',
                manifestPath,
                'error',
            ),
        );
        return [];
    }

    const entries: PackageMarketplaceEntryMetadata[] = [];
    for (const entry of value) {
        if (!isObjectRecord(entry)) {
            warnings.push(
                toWarning(
                    'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                    'Package marketplaceEntries entries must be objects.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const target = parseNonEmptyString(entry.target);
        if (!target) {
            warnings.push(
                toWarning(
                    'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                    'Package marketplaceEntries entries require a non-empty target.',
                    manifestPath,
                    'error',
                ),
            );
            continue;
        }

        const packageName = parseNonEmptyString(entry.packageName);
        const title = parseNonEmptyString(entry.title);
        const summary = parseNonEmptyString(entry.summary);
        const publisher = parseNonEmptyString(entry.publisher);
        const url = parseNonEmptyString(entry.url);
        for (const [fieldName, fieldValue, parsedValue] of [
            ['packageName', entry.packageName, packageName],
            ['title', entry.title, title],
            ['summary', entry.summary, summary],
            ['publisher', entry.publisher, publisher],
            ['url', entry.url, url],
        ] as const) {
            if (fieldValue !== undefined && !parsedValue) {
                warnings.push(
                    toWarning(
                        'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                        `Package marketplaceEntries ${fieldName} must be a non-empty string when present.`,
                        manifestPath,
                        'error',
                    ),
                );
            }
        }

        entries.push({
            target,
            ...(packageName ? { packageName } : {}),
            ...(title ? { title } : {}),
            ...(summary ? { summary } : {}),
            ...(publisher ? { publisher } : {}),
            categories: parseStringArray(
                entry.categories,
                'marketplaceEntries.categories',
                'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                manifestPath,
                warnings,
            ),
            keywords: parseStringArray(
                entry.keywords,
                'marketplaceEntries.keywords',
                'PACKAGE_MARKETPLACE_ENTRIES_INVALID',
                manifestPath,
                warnings,
            ),
            ...(url ? { url } : {}),
        });
    }
    return entries;
}

function warnOnUnknownReferences(
    values: string[],
    knownIds: Set<string> | undefined,
    componentKind: string,
    warningCode: string,
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): void {
    if (!knownIds) {
        return;
    }

    for (const value of values) {
        if (!knownIds.has(value)) {
            warnings.push(
                toWarning(
                    warningCode,
                    `Package references unknown ${componentKind} "${value}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }
}

function emptyPackage(
    manifestPath: string | undefined,
    warnings: CapabilityWarning[],
): PackageManifestMetadata {
    return {
        id: '',
        manifestPath: manifestPath ?? '',
        name: '',
        kind: '',
        agents: [],
        skills: [],
        instructions: [],
        prompts: [],
        mcpServers: [],
        tools: [],
        hooks: [],
        policyGrants: [],
        targets: {},
        marketplaceEntries: [],
        validationEvidence: [],
        runtimeValidation: [],
        warnings,
    };
}

export function parsePackageManifestContent(
    rawText: string,
    manifestPath?: string,
    knownPolicyGrantIds: Set<string> = new Set(),
    referenceIndex: PackageReferenceIndex = {},
): PackageManifestMetadata {
    let data: unknown;
    try {
        data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return emptyPackage(manifestPath, [
            toWarning(
                'PACKAGE_PARSE_ERROR',
                `Package manifest JSON could not be parsed: ${message}`,
                manifestPath,
                'error',
            ),
        ]);
    }

    if (!isObjectRecord(data)) {
        return emptyPackage(manifestPath, [
            toWarning(
                'PACKAGE_ROOT_INVALID',
                'Package manifest root must be a JSON object.',
                manifestPath,
                'error',
            ),
        ]);
    }

    const warnings: CapabilityWarning[] = [];
    const fields = data as PackageFields;
    for (const key of Object.keys(data)) {
        if (!KNOWN_FIELDS.has(key)) {
            warnings.push(
                toWarning(
                    'PACKAGE_UNKNOWN_FIELD',
                    `Unknown package field "${key}" is ignored for adapter compatibility.`,
                    manifestPath,
                ),
            );
        }
    }

    const schemaVersion = parseNonEmptyString(fields.schemaVersion);
    if (schemaVersion !== PACKAGE_SCHEMA_VERSION) {
        warnings.push(
            toWarning(
                'PACKAGE_SCHEMA_VERSION_INVALID',
                `Package schemaVersion must be "${PACKAGE_SCHEMA_VERSION}".`,
                manifestPath,
                'error',
            ),
        );
    }

    const id = parseNonEmptyString(fields.id);
    if (!id) {
        warnings.push(
            toWarning(
                'PACKAGE_ID_REQUIRED',
                'Package id is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    } else if (!PACKAGE_ID_PATTERN.test(id)) {
        warnings.push(
            toWarning(
                'PACKAGE_ID_INVALID',
                'Package id must start with a lowercase letter or number and contain only lowercase letters, numbers, dots, underscores, and hyphens.',
                manifestPath,
                'error',
            ),
        );
    }

    const name = parseNonEmptyString(fields.name);
    if (!name) {
        warnings.push(
            toWarning(
                'PACKAGE_NAME_REQUIRED',
                'Package name is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const kind = parseNonEmptyString(fields.kind);
    if (!kind) {
        warnings.push(
            toWarning(
                'PACKAGE_KIND_REQUIRED',
                'Package kind is required and must be a non-empty string.',
                manifestPath,
                'error',
            ),
        );
    }

    const agents = parseStringArray(fields.agents, 'agents', 'PACKAGE_AGENTS_INVALID', manifestPath, warnings);
    const skills = parseStringArray(fields.skills, 'skills', 'PACKAGE_SKILLS_INVALID', manifestPath, warnings);
    const instructions = parseStringArray(
        fields.instructions,
        'instructions',
        'PACKAGE_INSTRUCTIONS_INVALID',
        manifestPath,
        warnings,
    );
    const prompts = parseStringArray(fields.prompts, 'prompts', 'PACKAGE_PROMPTS_INVALID', manifestPath, warnings);
    const mcpServers = parseStringArray(
        fields.mcpServers,
        'mcpServers',
        'PACKAGE_MCP_SERVERS_INVALID',
        manifestPath,
        warnings,
    );
    const tools = parseStringArray(fields.tools, 'tools', 'PACKAGE_TOOLS_INVALID', manifestPath, warnings);
    const hooks = parseStringArray(fields.hooks, 'hooks', 'PACKAGE_HOOKS_INVALID', manifestPath, warnings);
    warnOnUnknownReferences(
        agents,
        referenceIndex.agents,
        'agent profile',
        'PACKAGE_AGENT_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        skills,
        referenceIndex.skills,
        'skill',
        'PACKAGE_SKILL_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        instructions,
        referenceIndex.instructions,
        'instruction',
        'PACKAGE_INSTRUCTION_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        prompts,
        referenceIndex.prompts,
        'prompt',
        'PACKAGE_PROMPT_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        mcpServers,
        referenceIndex.mcpServers,
        'MCP server',
        'PACKAGE_MCP_SERVER_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        tools,
        referenceIndex.tools,
        'tool',
        'PACKAGE_TOOL_UNKNOWN',
        manifestPath,
        warnings,
    );
    warnOnUnknownReferences(
        hooks,
        referenceIndex.hooks,
        'hook',
        'PACKAGE_HOOK_UNKNOWN',
        manifestPath,
        warnings,
    );
    const policyGrants = parseStringArray(
        fields.policyGrants,
        'policyGrants',
        'PACKAGE_POLICY_GRANTS_INVALID',
        manifestPath,
        warnings,
    );
    for (const grantId of policyGrants) {
        if (knownPolicyGrantIds.size > 0 && !knownPolicyGrantIds.has(grantId)) {
            warnings.push(
                toWarning(
                    'PACKAGE_POLICY_GRANT_UNKNOWN',
                    `Package references unknown policy grant "${grantId}".`,
                    manifestPath,
                    'error',
                ),
            );
        }
    }

    const validationEvidence = parseStringArray(
        fields.validationEvidence,
        'validationEvidence',
        'PACKAGE_VALIDATION_EVIDENCE_INVALID',
        manifestPath,
        warnings,
    );
    const marketplaceEntries = parseMarketplaceEntries(
        fields.marketplaceEntries,
        manifestPath,
        warnings,
    );
    const runtimeValidation = parseRuntimeValidation(
        fields.runtimeValidation,
        manifestPath,
        warnings,
    );
    const targets = parseTargets(fields.targets, manifestPath, warnings);
    const description = parseNonEmptyString(fields.description);
    if (fields.description !== undefined && !description) {
        warnings.push(
            toWarning(
                'PACKAGE_DESCRIPTION_INVALID',
                'Package description must be a non-empty string when present.',
                manifestPath,
                'error',
            ),
        );
    }

    return {
        id: id ?? '',
        manifestPath: manifestPath ?? '',
        name: name ?? '',
        kind: kind ?? '',
        agents,
        skills,
        instructions,
        prompts,
        mcpServers,
        tools,
        hooks,
        policyGrants,
        targets,
        marketplaceEntries,
        validationEvidence,
        runtimeValidation,
        description,
        warnings,
    };
}

export function loadPackageManifestsForLayer(
    layerPath: string,
    knownPolicyGrantIds: Set<string> = new Set(),
    referenceIndex: PackageReferenceIndex = {},
): PackageManifestMetadata[] {
    const packagesDir = path.join(layerPath, CANONICAL_METAFLOW_DIR_NAME, PACKAGES_DIR_NAME);
    if (!fs.existsSync(packagesDir) || !fs.statSync(packagesDir).isDirectory()) {
        return [];
    }

    return fs
        .readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => {
            const manifestPath = path.join(packagesDir, entry.name);
            return parsePackageManifestContent(
                fs.readFileSync(manifestPath, 'utf-8'),
                manifestPath,
                knownPolicyGrantIds,
                referenceIndex,
            );
        })
        .sort((left, right) => {
            const idCompare = left.id.localeCompare(right.id, undefined, {
                sensitivity: 'base',
            });
            if (idCompare !== 0) {
                return idCompare;
            }
            return left.manifestPath.localeCompare(right.manifestPath, undefined, {
                sensitivity: 'base',
            });
        });
}

export const packageManifestConstants = {
    CANONICAL_METAFLOW_DIR_NAME,
    PACKAGES_DIR_NAME,
    PACKAGE_SCHEMA_VERSION,
};
