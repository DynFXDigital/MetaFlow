import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { CapabilityDetailCommandArg, CapabilityDetailModel } from '../commands/capabilityDetails';
import { renderCapabilityDetailsHtml } from './capabilityDetailsHtml';

export const CAPABILITY_DETAILS_WEBVIEW_TYPE = 'metaflow.capabilityDetails';

export interface CapabilityDetailsPanelSnapshot {
    panelId: string;
    viewType: string;
    title: string;
    html: string;
    viewColumn: vscode.ViewColumn | undefined;
}

export class CapabilityDetailsPanelManager implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private panelId: string | undefined;
    private currentRequest: CapabilityDetailCommandArg | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    show(
        model: CapabilityDetailModel,
        request: CapabilityDetailCommandArg,
    ): CapabilityDetailsPanelSnapshot {
        const targetColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
        this.currentRequest = request;

        if (!this.panel) {
            this.panelId = createPanelId();
            this.panel = vscode.window.createWebviewPanel(
                CAPABILITY_DETAILS_WEBVIEW_TYPE,
                buildPanelTitle(model),
                { viewColumn: targetColumn, preserveFocus: false },
                {
                    enableFindWidget: true,
                    enableScripts: false,
                    enableCommandUris: ['metaflow.toggleLayer'],
                    localResourceRoots: [],
                },
            );

            this.disposables.push(
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                    this.panelId = undefined;
                    this.currentRequest = undefined;
                }),
            );
        } else {
            this.panel.reveal(targetColumn, false);
        }

        this.update(model);
        return this.getSnapshot()!;
    }

    update(model: CapabilityDetailModel): void {
        if (!this.panel) {
            return;
        }

        this.panel.title = buildPanelTitle(model);
        this.panel.webview.html = renderCapabilityDetailsHtml(model, {
            cspSource: this.panel.webview.cspSource,
            nonce: createNonce(),
        });
    }

    getCurrentRequest(): CapabilityDetailCommandArg | undefined {
        return this.currentRequest;
    }

    getSnapshot(): CapabilityDetailsPanelSnapshot | undefined {
        if (!this.panel || !this.panelId) {
            return undefined;
        }

        return {
            panelId: this.panelId,
            viewType: this.panel.viewType,
            title: this.panel.title,
            html: this.panel.webview.html,
            viewColumn: this.panel.viewColumn,
        };
    }

    dispose(): void {
        this.panel?.dispose();
        this.panel = undefined;
        this.panelId = undefined;
        this.currentRequest = undefined;

        while (this.disposables.length > 0) {
            this.disposables.pop()?.dispose();
        }
    }
}

function buildPanelTitle(model: CapabilityDetailModel): string {
    return `Capability Details: ${model.title}`;
}

function createNonce(): string {
    return randomBytes(16).toString('hex');
}

function createPanelId(): string {
    return randomBytes(8).toString('hex');
}
