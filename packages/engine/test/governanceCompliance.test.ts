import * as assert from 'assert';
import { evaluateGovernanceCompliance } from '../src';

describe('governanceCompliance', () => {
    it('returns not-applicable when no governance contract is configured', () => {
        const result = evaluateGovernanceCompliance(undefined, {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/ai-metadata',
                    capabilities: [{ path: 'standards/sdlc', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
            activeProfile: 'default',
        });

        assert.strictEqual(result.status, 'not-applicable');
        assert.strictEqual(result.activeProfile, 'default');
        assert.strictEqual(result.violations.length, 0);
        assert.strictEqual(result.activeProfileLocked, false);
    });

    it('emits deterministic multi-rule violations in stable id order', () => {
        const result = evaluateGovernanceCompliance(
            {
                severity: 'error',
                requiredCapabilities: [
                    { repoId: 'primary', path: 'standards/sdlc' },
                    { repoId: 'secondary', path: 'team/review' },
                ],
                defaultOnCapabilities: [
                    { repoId: 'primary', path: 'team/default' },
                    { repoId: 'secondary', path: 'team/review' },
                ],
                allowedProfiles: ['default'],
                lockedProfiles: ['default'],
            },
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/primary',
                        enabled: true,
                        capabilities: [
                            { path: 'standards/sdlc', enabled: false },
                            { path: 'team/default', enabled: false },
                        ],
                    },
                    {
                        id: 'secondary',
                        localPath: '.ai/secondary',
                        enabled: false,
                        capabilities: [{ path: 'team/review', enabled: true }],
                    },
                ],
                layerSources: [
                    { repoId: 'primary', path: 'standards/sdlc', enabled: false },
                    { repoId: 'primary', path: 'team/default', enabled: false },
                    { repoId: 'secondary', path: 'team/review', enabled: true },
                ],
                activeProfile: 'review',
            },
        );

        assert.strictEqual(result.status, 'non-compliant');
        assert.strictEqual(result.severity, 'error');
        assert.deepStrictEqual(result.allowedProfiles, ['default']);
        assert.deepStrictEqual(result.lockedProfiles, ['default']);
        assert.strictEqual(result.activeProfileLocked, false);
        assert.deepStrictEqual(
            result.violations.map((violation) => violation.id),
            [
                'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
                'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED::primary::team/default',
                'GOVERNANCE_DEFAULT_ON_CAPABILITY_DISABLED::secondary::team/review',
                'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::primary::standards/sdlc',
                'GOVERNANCE_REQUIRED_CAPABILITY_MISSING::secondary::team/review',
            ],
        );
        assert.deepStrictEqual(
            result.violations.map((violation) => violation.observedState),
            [
                undefined,
                'capability-disabled',
                'repo-disabled',
                'capability-disabled',
                'repo-disabled',
            ],
        );
    });

    it('marks active locked profiles without emitting a lock violation', () => {
        const result = evaluateGovernanceCompliance(
            {
                severity: 'warn',
                allowedProfiles: ['default', 'review'],
                lockedProfiles: ['review'],
            },
            {
                metadataRepos: [
                    {
                        id: 'primary',
                        localPath: '.ai/primary',
                        enabled: true,
                        capabilities: [{ path: 'standards/sdlc', enabled: true }],
                    },
                ],
                layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
                activeProfile: 'review',
            },
        );

        assert.strictEqual(result.status, 'compliant');
        assert.strictEqual(result.activeProfileLocked, true);
        assert.strictEqual(result.violations.length, 0);
    });

    it('updates allowed-profile violations when the active profile changes', () => {
        const baseConfig = {
            metadataRepos: [
                {
                    id: 'primary',
                    localPath: '.ai/primary',
                    enabled: true,
                    capabilities: [{ path: 'standards/sdlc', enabled: true }],
                },
            ],
            layerSources: [{ repoId: 'primary', path: 'standards/sdlc', enabled: true }],
        };

        const reviewResult = evaluateGovernanceCompliance(
            {
                severity: 'warn',
                allowedProfiles: ['default'],
            },
            {
                ...baseConfig,
                activeProfile: 'review',
            },
        );
        const defaultResult = evaluateGovernanceCompliance(
            {
                severity: 'warn',
                allowedProfiles: ['default'],
            },
            {
                ...baseConfig,
                activeProfile: 'default',
            },
        );

        assert.strictEqual(reviewResult.status, 'non-compliant');
        assert.deepStrictEqual(reviewResult.violations.map((violation) => violation.id), [
            'GOVERNANCE_ACTIVE_PROFILE_NOT_ALLOWED::review',
        ]);
        assert.strictEqual(defaultResult.status, 'compliant');
        assert.deepStrictEqual(defaultResult.violations, []);
    });
});