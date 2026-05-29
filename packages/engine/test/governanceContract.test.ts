import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    loadGovernanceContract,
    loadGovernanceContractFromPath,
    parseAndValidateGovernanceContract,
} from '../src';

describe('governanceContract', () => {
    it('loads a valid governance contract with normalized defaults', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-governance-valid-'));
        try {
            const contractDir = path.join(workspaceRoot, '.metaflow');
            fs.mkdirSync(contractDir, { recursive: true });
            const contractPath = path.join(contractDir, 'governance.jsonc');
            fs.writeFileSync(
                contractPath,
                JSON.stringify(
                    {
                        requiredCapabilities: [{ repoId: 'primary', path: 'standards/sdlc' }],
                        defaultOnCapabilities: [{ repoId: 'primary', path: 'team/default' }],
                        lockedProfiles: ['default'],
                        allowedProfiles: ['default', 'review'],
                    },
                    null,
                    2,
                ),
                'utf-8',
            );

            const result = loadGovernanceContract(workspaceRoot);
            assert.strictEqual(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.strictEqual(result.contractPath, contractPath);
            assert.strictEqual(result.contract?.severity, 'warn');
            assert.deepStrictEqual(result.contract?.lockedProfiles, ['default']);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    it('returns ok with no contract when governance.jsonc is absent', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-governance-missing-'));
        try {
            const result = loadGovernanceContract(workspaceRoot);
            assert.strictEqual(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.strictEqual(result.contract, undefined);
            assert.strictEqual(result.contractPath, undefined);
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    it('reports malformed contract structure with stable identifiers', () => {
        const result = parseAndValidateGovernanceContract(
            JSON.stringify({ requiredCapabilities: [{ repoId: 'primary' }], severity: 'fatal' }),
            '/workspace/.metaflow/governance.jsonc',
        );

        assert.strictEqual(result.ok, false);
        if (result.ok) {
            return;
        }

        assert.deepStrictEqual(
            result.errors.map((error) => error.code),
            ['GOVERNANCE_INVALID_REQUIRED_CAPABILITIES', 'GOVERNANCE_INVALID_SEVERITY'],
        );
    });

    it('reports semantic conflicts for locked profiles outside allowedProfiles', () => {
        const result = parseAndValidateGovernanceContract(
            JSON.stringify({
                lockedProfiles: ['default'],
                allowedProfiles: ['review'],
            }),
            '/workspace/.metaflow/governance.jsonc',
        );

        assert.strictEqual(result.ok, false);
        if (result.ok) {
            return;
        }

        assert.deepStrictEqual(
            result.errors.map((error) => error.code),
            ['GOVERNANCE_LOCKED_PROFILE_NOT_ALLOWED'],
        );
        assert.ok(result.errors[0].message.includes('default'));
    });

    it('reports JSONC parse failures with positions', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-governance-parse-'));
        try {
            const contractDir = path.join(workspaceRoot, '.metaflow');
            fs.mkdirSync(contractDir, { recursive: true });
            const contractPath = path.join(contractDir, 'governance.jsonc');
            fs.writeFileSync(contractPath, '{ invalid jsonc', 'utf-8');

            const result = loadGovernanceContractFromPath(contractPath);
            assert.strictEqual(result.ok, false);
            if (result.ok) {
                return;
            }
            assert.strictEqual(result.errors[0].code, 'GOVERNANCE_JSON_PARSE_ERROR');
            assert.strictEqual(typeof result.errors[0].line, 'number');
            assert.strictEqual(typeof result.errors[0].column, 'number');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    function codesFor(raw: object): Array<string | undefined> {
        const result = parseAndValidateGovernanceContract(
            JSON.stringify(raw),
            '/workspace/.metaflow/governance.jsonc',
        );
        assert.strictEqual(result.ok, false);
        return result.ok ? [] : result.errors.map((e) => e.code);
    }

    it('rejects a non-array requiredCapabilities', () => {
        assert.ok(codesFor({ requiredCapabilities: 'nope' }).includes('GOVERNANCE_INVALID_REQUIRED_CAPABILITIES'));
    });

    it('rejects a non-array defaultOnCapabilities', () => {
        assert.ok(codesFor({ defaultOnCapabilities: 'nope' }).includes('GOVERNANCE_INVALID_DEFAULT_ON_CAPABILITIES'));
    });

    it('rejects defaultOnCapabilities entries missing fields', () => {
        assert.ok(
            codesFor({ defaultOnCapabilities: [{ repoId: 'primary' }] }).includes(
                'GOVERNANCE_INVALID_DEFAULT_ON_CAPABILITIES',
            ),
        );
    });

    it('flags duplicate required capabilities', () => {
        assert.ok(
            codesFor({
                requiredCapabilities: [
                    { repoId: 'primary', path: 'cap/a' },
                    { repoId: 'primary', path: 'cap/a' },
                ],
            }).includes('GOVERNANCE_DUPLICATE_REQUIRED_CAPABILITY'),
        );
    });

    it('flags duplicate default-on capabilities', () => {
        assert.ok(
            codesFor({
                defaultOnCapabilities: [
                    { repoId: 'primary', path: 'cap/b' },
                    { repoId: 'primary', path: 'cap/b' },
                ],
            }).includes('GOVERNANCE_DUPLICATE_DEFAULT_ON_CAPABILITY'),
        );
    });

    it('rejects a non-array lockedProfiles', () => {
        assert.ok(codesFor({ lockedProfiles: 'default' }).includes('GOVERNANCE_INVALID_LOCKED_PROFILES'));
    });

    it('rejects allowedProfiles containing empty strings', () => {
        assert.ok(codesFor({ allowedProfiles: ['review', '  '] }).includes('GOVERNANCE_INVALID_ALLOWED_PROFILES'));
    });

    it('reports a read failure when the contract path is a directory', () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metaflow-governance-read-'));
        try {
            const contractPath = path.join(workspaceRoot, '.metaflow', 'governance.jsonc');
            fs.mkdirSync(contractPath, { recursive: true });

            const result = loadGovernanceContractFromPath(contractPath);
            assert.strictEqual(result.ok, false);
            if (result.ok) {
                return;
            }
            assert.strictEqual(result.errors[0].code, 'GOVERNANCE_READ_FAILED');
        } finally {
            fs.rmSync(workspaceRoot, { recursive: true, force: true });
        }
    });

    it('rejects a contract whose top-level JSON is not an object', () => {
        const result = parseAndValidateGovernanceContract(
            JSON.stringify(['not', 'an', 'object']),
            '/workspace/.metaflow/governance.jsonc',
        );
        assert.strictEqual(result.ok, false);
        if (result.ok) {
            return;
        }
        assert.strictEqual(result.errors[0].code, 'GOVERNANCE_CONTRACT_NOT_OBJECT');
    });

    it('normalizes and dedupes a valid contract with default severity', () => {
        const result = parseAndValidateGovernanceContract(
            JSON.stringify({
                requiredCapabilities: [{ repoId: 'primary', path: 'cap/a' }],
                lockedProfiles: ['default', 'default'],
                allowedProfiles: ['default', 'review'],
            }),
            '/workspace/.metaflow/governance.jsonc',
        );
        assert.strictEqual(result.ok, true);
        if (!result.ok) {
            return;
        }
        assert.strictEqual(result.contract?.severity, 'warn');
        assert.deepStrictEqual(result.contract?.lockedProfiles, ['default']);
    });
});