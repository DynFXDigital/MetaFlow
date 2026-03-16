import * as assert from 'assert';

class MockTreeItem {
    label: unknown;
    collapsibleState: number;
    contextValue?: string;
    iconPath?: unknown;
    description?: string | boolean;
    tooltip?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };

    constructor(label: unknown, collapsibleState: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

class MockThemeIcon {
    constructor(public id: string) {}
}

class MockMarkdownString {
    constructor(public value: string) {}

    toString(): string {
        return this.value;
    }
}

class MockEventEmitter<T> {
    private readonly listeners: Array<(value: T) => void> = [];

    event = (listener: (value: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(listener);
                if (index >= 0) {
                    this.listeners.splice(index, 1);
                }
            },
        };
    };

    fire(value: T): void {
        for (const listener of [...this.listeners]) {
            listener(value);
        }
    }
}

const mockVscode = {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: { None: 0 },
    EventEmitter: MockEventEmitter,
    ThemeIcon: MockThemeIcon,
    MarkdownString: MockMarkdownString,
};

type ProfilesTreeViewModule = typeof import('../../views/profilesTreeView');

function loadProfilesTreeView(): ProfilesTreeViewModule {
    const moduleInternals = require('module') as {
        _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
    };
    const originalLoad = moduleInternals._load;
    moduleInternals._load = function patchedLoad(
        request: string,
        parent: NodeModule | null,
        isMain: boolean,
    ): unknown {
        if (request === 'vscode') {
            return mockVscode;
        }
        if (
            request === '../commands/commandHelpers' ||
            request.endsWith('/commands/commandHelpers')
        ) {
            return {
                DEFAULT_PROFILE_ID: 'default',
                getProfileDisplayName: (profileId: string, profile?: { displayName?: string }) =>
                    profile?.displayName ?? profileId,
            };
        }
        if (request === '../treeSummary' || request.endsWith('/treeSummary')) {
            return {
                formatSummaryDescription: (
                    alias: string | undefined,
                    summary: { kind: string },
                    flags: string[],
                ) => `desc:${alias ?? '-'}:${summary.kind}:${flags.join('|')}`,
                getInstructionScopeTooltipLines: (scope: { kind: string }) => [
                    `scope:${scope.kind}`,
                ],
                getSummaryTooltipLines: (summary: { kind: string }) => [`summary:${summary.kind}`],
                summarizeProfile: (_cache: unknown, name: string) => ({ kind: `summary-${name}` }),
                summarizeProfileInstructionScope: (_cache: unknown, name: string) => ({
                    kind: `scope-${name}`,
                }),
            };
        }
        if (
            request === '../commands/commandHandlers' ||
            request.endsWith('/commands/commandHandlers')
        ) {
            return {};
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    const targetPath = require.resolve('../../views/profilesTreeView');
    delete require.cache[targetPath];

    try {
        return require(targetPath) as ProfilesTreeViewModule;
    } finally {
        moduleInternals._load = originalLoad;
    }
}

function createState(
    overrides?: Partial<{
        isLoading: boolean;
        config: {
            activeProfile?: string;
            profiles?: Record<string, { displayName?: string }>;
        };
        treeSummaryCache: unknown;
    }>,
): {
    isLoading: boolean;
    config?: {
        activeProfile?: string;
        profiles?: Record<string, { displayName?: string }>;
    };
    treeSummaryCache?: unknown;
    onDidChange: MockEventEmitter<void>;
} {
    return {
        isLoading: overrides?.isLoading ?? false,
        config: overrides?.config,
        treeSummaryCache: overrides?.treeSummaryCache,
        onDidChange: new MockEventEmitter<void>(),
    };
}

function tooltipText(value: unknown): string {
    if (value instanceof MockMarkdownString) {
        return value.value;
    }
    return String(value ?? '');
}

suite('ProfilesTreeViewProvider', () => {
    test('returns a loading item while config is loading', () => {
        const { ProfilesTreeViewProvider } = loadProfilesTreeView();
        const state = createState({ isLoading: true });
        const provider = new ProfilesTreeViewProvider(state as never);

        const children = provider.getChildren();

        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].label, 'Loading...');
        assert.strictEqual(children[0].contextValue, 'loading');
        assert.strictEqual((children[0].iconPath as MockThemeIcon).id, 'sync~spin');
        assert.strictEqual(children[0].description, 'MetaFlow');
        assert.deepStrictEqual(provider.getChildren(children[0]), []);
    });

    test('returns no items when config has no profiles', () => {
        const { ProfilesTreeViewProvider } = loadProfilesTreeView();
        const provider = new ProfilesTreeViewProvider(
            createState({ config: { activeProfile: 'default' } }) as never,
        );

        assert.deepStrictEqual(provider.getChildren(), []);
    });

    test('builds active and inactive profile items with icons, tooltips, and commands', () => {
        const { ProfilesTreeViewProvider } = loadProfilesTreeView();
        const provider = new ProfilesTreeViewProvider(
            createState({
                config: {
                    activeProfile: 'default',
                    profiles: {
                        default: {},
                        preview: { displayName: 'Preview Profile' },
                    },
                },
                treeSummaryCache: { cache: true },
            }) as never,
        );

        const children = provider.getChildren();
        const activeItem = children[0];
        const inactiveItem = children[1];

        assert.strictEqual(children.length, 2);
        assert.strictEqual(provider.getTreeItem(activeItem), activeItem);
        assert.strictEqual(activeItem.label, 'default');
        assert.strictEqual(activeItem.contextValue, 'profileDefault');
        assert.strictEqual((activeItem.iconPath as MockThemeIcon).id, 'check');
        assert.strictEqual(activeItem.description, 'desc:-:summary-default:active');
        assert.strictEqual(
            tooltipText(activeItem.tooltip),
            '**default**\n\nStatus: active profile  \nsummary:summary-default  \nscope:scope-default',
        );
        assert.deepStrictEqual(activeItem.command, {
            command: 'metaflow.switchProfile',
            title: 'Switch Profile',
            arguments: [{ profileId: 'default' }],
        });

        assert.strictEqual(inactiveItem.label, 'Preview Profile');
        assert.strictEqual(inactiveItem.contextValue, 'profile');
        assert.strictEqual((inactiveItem.iconPath as MockThemeIcon).id, 'circle-outline');
        assert.strictEqual(inactiveItem.description, 'desc:preview:summary-preview:');
        assert.strictEqual(
            tooltipText(inactiveItem.tooltip),
            '**Preview Profile**\n\nId: preview  \nStatus: inactive profile preview  \nsummary:summary-preview  \nscope:scope-preview',
        );
        assert.deepStrictEqual(inactiveItem.command, {
            command: 'metaflow.switchProfile',
            title: 'Switch Profile',
            arguments: [{ profileId: 'preview' }],
        });
        assert.deepStrictEqual(provider.getChildren(inactiveItem), []);
    });

    test('fires a tree refresh when extension state changes', () => {
        const { ProfilesTreeViewProvider } = loadProfilesTreeView();
        const state = createState({
            config: { activeProfile: 'default', profiles: { default: {} } },
        });
        const provider = new ProfilesTreeViewProvider(state as never);
        const seen: unknown[] = [];
        provider.onDidChangeTreeData((value) => {
            seen.push(value);
        });

        state.onDidChange.fire(undefined);

        assert.deepStrictEqual(seen, [undefined]);
    });
});
