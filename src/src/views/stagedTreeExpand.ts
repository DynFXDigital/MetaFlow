import * as vscode from 'vscode';

export type ExpandAllStrategy = 'recursive' | 'staged';

export interface StagedExpandPlan<T extends vscode.TreeItem> {
    stageOne: T[];
    stageTwo: T[];
    stages?: T[][];
}

export interface StagedExpandProvider<T extends vscode.TreeItem> {
    readonly onDidChangeTreeData?: vscode.Event<T | undefined>;
    getExpandAllStrategy(): ExpandAllStrategy;
    getStagedExpandPlan(): StagedExpandPlan<T>;
}

export class StagedTreeExpandController<T extends vscode.TreeItem> implements vscode.Disposable {
    private readonly expandedIds = new Set<string>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly treeView: Pick<
            vscode.TreeView<T>,
            'reveal' | 'onDidExpandElement' | 'onDidCollapseElement'
        >,
        private readonly provider: StagedExpandProvider<T>,
    ) {
        this.disposables.push(
            this.treeView.onDidExpandElement((event) => {
                this.trackExpanded(event.element);
            }),
            this.treeView.onDidCollapseElement((event) => {
                this.trackCollapsed(event.element);
            }),
        );

        if (this.provider.onDidChangeTreeData) {
            this.disposables.push(
                this.provider.onDidChangeTreeData(() => {
                    this.reset();
                }),
            );
        }
    }

    async expandAll(): Promise<void> {
        if (this.provider.getExpandAllStrategy() !== 'staged') {
            return;
        }

        const plan = this.provider.getStagedExpandPlan();
        const stages =
            plan.stages && plan.stages.length > 0 ? plan.stages : [plan.stageOne, plan.stageTwo];

        for (const stage of stages) {
            const targets = stage.filter((node) => !this.isExpanded(node));
            if (targets.length > 0) {
                await this.revealTargets(targets);
                return;
            }
        }
    }

    reset(): void {
        this.expandedIds.clear();
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }

    private async revealTargets(nodes: readonly T[]): Promise<void> {
        for (const node of nodes) {
            if (node.collapsibleState === vscode.TreeItemCollapsibleState.None) {
                continue;
            }

            await this.treeView.reveal(node, { expand: 1, select: false, focus: false });
        }
    }

    private trackExpanded(node: T): void {
        const nodeId = this.getNodeId(node);
        if (nodeId) {
            this.expandedIds.add(nodeId);
        }
    }

    private trackCollapsed(node: T): void {
        const nodeId = this.getNodeId(node);
        if (nodeId) {
            this.expandedIds.delete(nodeId);
        }
    }

    private isExpanded(node: T): boolean {
        const nodeId = this.getNodeId(node);
        return !!nodeId && this.expandedIds.has(nodeId);
    }

    private getNodeId(node: T): string | undefined {
        return typeof node.id === 'string' && node.id.trim().length > 0 ? node.id : undefined;
    }
}
