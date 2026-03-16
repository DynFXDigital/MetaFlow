import MarkdownIt, { type RenderRule } from 'markdown-it';
import { CapabilityDetailModel } from '../commands/capabilityDetails';
import { getInstructionScopeStatusLabel, type InstructionScopeRecord } from '../treeSummary';

export interface CapabilityDetailsHtmlOptions {
    cspSource: string;
    nonce: string;
}

const markdownRenderer = createMarkdownRenderer();

interface DirectoryTreeNode {
    directories: Map<string, DirectoryTreeNode>;
    files: string[];
}

function createMarkdownRenderer(): MarkdownIt {
    const renderer = new MarkdownIt({
        html: false,
        linkify: true,
        typographer: false,
    });

    renderer.disable(['image']);
    renderer.validateLink = (url: string) => sanitizeExternalUrl(url) !== undefined;

    const defaultLinkOpen: RenderRule =
        renderer.renderer.rules.link_open ??
        ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

    renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index];
        const safeUrl = sanitizeExternalUrl(token.attrGet('href'));
        if (safeUrl) {
            token.attrSet('href', safeUrl);
            token.attrSet('target', '_blank');
            token.attrSet('rel', 'noopener noreferrer nofollow');
        } else {
            token.attrSet('href', '#');
            token.attrSet('data-invalid-link', 'true');
            token.attrSet('aria-disabled', 'true');
            token.attrSet('tabindex', '-1');
        }

        return defaultLinkOpen(tokens, index, options, env, self);
    };

    return renderer;
}

function sanitizeExternalUrl(url: string | null): string | undefined {
    if (!url) {
        return undefined;
    }

    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
        return trimmed;
    }

    return undefined;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildCommandUri(command: string, args: unknown[]): string {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

function createDirectoryTreeNode(): DirectoryTreeNode {
    return {
        directories: new Map<string, DirectoryTreeNode>(),
        files: [],
    };
}

function buildDirectoryTree(paths: string[]): DirectoryTreeNode {
    const root = createDirectoryTreeNode();

    for (const relativePath of paths) {
        const segments = relativePath.split('/').filter(Boolean);
        if (segments.length === 0) {
            continue;
        }

        let current = root;
        for (let index = 0; index < segments.length; index += 1) {
            const segment = segments[index];
            if (index === segments.length - 1) {
                current.files.push(segment);
                continue;
            }

            let next = current.directories.get(segment);
            if (!next) {
                next = createDirectoryTreeNode();
                current.directories.set(segment, next);
            }
            current = next;
        }
    }

    return root;
}

function renderDirectoryTreeNode(node: DirectoryTreeNode, isRoot = false): string {
    const directoryMarkup = Array.from(node.directories.entries())
        .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .map(
            ([name, child]) => `
                        <li class="directory-tree-node directory-tree-node-folder">
                            <span class="directory-tree-entry directory-tree-entry-folder">${escapeHtml(name)}</span>
                            ${renderDirectoryTreeNode(child)}
                        </li>`,
        )
        .join('');

    const fileMarkup = [...node.files]
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .map(
            (name) => `
                        <li class="directory-tree-node directory-tree-node-file">
                            <span class="directory-tree-entry directory-tree-entry-file">${escapeHtml(name)}</span>
                        </li>`,
        )
        .join('');

    return `
                    <ul class="directory-tree-list${isRoot ? ' directory-tree-root' : ''}">
                        ${directoryMarkup}${fileMarkup}
                    </ul>`;
}

function renderGitHubTree(model: CapabilityDetailModel): string {
    const githubFiles = model.layerFiles
        .filter((relativePath) => relativePath.startsWith('.github/'))
        .map((relativePath) => relativePath.slice('.github/'.length))
        .filter(Boolean);

    if (githubFiles.length === 0) {
        return '<p class="empty-state">No <code>.github</code> content was found under this capability.</p>';
    }

    return `
                <details class="content-tree" open>
                    <summary class="content-tree-summary">
                        <span class="content-tree-title">.github</span>
                        <span class="count">${githubFiles.length}</span>
                    </summary>
                    <div class="content-tree-body">
                        ${renderDirectoryTreeNode(buildDirectoryTree(githubFiles), true)}
                    </div>
                </details>`;
}

function renderSupplementalFiles(model: CapabilityDetailModel): string {
    const supplementalFiles = model.layerFiles.filter(
        (relativePath) => !relativePath.startsWith('.github/'),
    );
    if (supplementalFiles.length === 0) {
        return '';
    }

    return `
                <section class="supporting-files">
                    <h3>Other Files</h3>
                    <ul class="file-list supporting-file-list">
                        ${supplementalFiles.map((relativePath) => `<li>${escapeHtml(relativePath)}</li>`).join('')}
                    </ul>
                </section>`;
}

function renderToggleAction(model: CapabilityDetailModel): string {
    if (model.builtIn || typeof model.layerIndex !== 'number') {
        return '';
    }

    const href = buildCommandUri('metaflow.toggleLayer', [
        {
            layerIndex: model.layerIndex,
            repoId: model.repoId,
            checked: !model.enabled,
        },
    ]);

    const buttonClass = model.enabled
        ? 'action-button action-button-secondary'
        : 'action-button action-button-primary';

    return `<a class="${buttonClass}" href="${href}">${model.enabled ? 'Disable' : 'Enable'}</a>`;
}

function formatLicenseLabel(license: string | undefined): string {
    return license?.trim() || 'Unknown';
}

function buildPrimaryMetadata(model: CapabilityDetailModel): Array<[string, string]> {
    return [
        ['Repository', model.repoLabel],
        ['Layer', model.layerPath],
        ['License', formatLicenseLabel(model.license)],
        ['Manifest', model.manifestPath ? 'Present' : 'Missing'],
    ];
}

function buildTechnicalMetadata(model: CapabilityDetailModel): Array<[string, string]> {
    const items: Array<[string, string]> = [
        ['Capability ID', model.capabilityId],
        ['Layer ID', model.layerId],
        ['Source Root', model.layerRoot],
    ];

    if (model.repoId) {
        items.push(['Repository ID', model.repoId]);
    }

    if (model.manifestPath) {
        items.push(['Manifest Path', model.manifestPath]);
    }
    if (model.builtIn) {
        items.push(['Source Type', 'Built-in MetaFlow capability']);
    }

    return items;
}

function renderMetadataRows(items: Array<[string, string]>): string {
    return items
        .map(
            ([label, value]) => `
                        <div class="metadata-row">
                            <dt class="metadata-label">${escapeHtml(label)}</dt>
                            <dd class="metadata-value">${escapeHtml(value)}</dd>
                        </div>`,
        )
        .join('');
}

function renderWarningList(model: CapabilityDetailModel): string {
    if (model.warnings.length === 0) {
        return '<p class="empty-state">No warnings were reported for this capability.</p>';
    }

    return `
                    <ul class="warning-list">
                        ${model.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}
                    </ul>`;
}

function renderScopeExample(record: InstructionScopeRecord): string {
    const patternLabel =
        record.patterns.length > 0 ? record.patterns.join(', ') : 'no applyTo declared';

    return `<li><strong>${escapeHtml(record.name)}</strong>: <code>${escapeHtml(patternLabel)}</code><br /><span class="scope-risk-reason">${escapeHtml(record.riskReason)}</span></li>`;
}

function renderScopeRiskCard(model: CapabilityDetailModel): string {
    const summary = model.instructionScopeSummary;
    if (summary.inspectedCount === 0) {
        return '';
    }

    const statusLabel = getInstructionScopeStatusLabel(summary);
    const summaryRows: Array<[string, string]> = [
        ['Status', statusLabel],
        ['Instructions inspected', String(summary.inspectedCount)],
        ['Active now', String(summary.activeCount)],
        ['High risk', String(summary.highRiskCount)],
        ['Broad patterns', String(summary.mediumRiskCount)],
        ['Missing applyTo', String(summary.missingApplyToCount)],
        ['Unreadable', String(summary.unknownCount)],
    ];
    const lead =
        summary.status === 'low'
            ? 'No elevated instruction scope risk was detected in this capability.'
            : 'One or more instructions in this capability look broader than they likely need to be.';
    const examples =
        summary.topRisks.length > 0
            ? `
                    <div class="scope-risk-examples">
                        <h3>Examples</h3>
                        <ul class="warning-list">
                            ${summary.topRisks.map(renderScopeExample).join('')}
                        </ul>
                    </div>`
            : '';

    return `
                <section class="sidebar-card">
                    <h2>Scope Risk</h2>
                    <p class="scope-risk-intro">${escapeHtml(lead)}</p>
                    <dl class="metadata-list">
                        ${renderMetadataRows(summaryRows)}
                    </dl>
                    ${examples}
                </section>`;
}

function renderContentSections(model: CapabilityDetailModel): string {
    if (model.layerFiles.length === 0) {
        return '<p class="empty-state">No source artifacts were found under this layer.</p>';
    }

    return `
                <div class="content-groups">
                    ${renderGitHubTree(model)}
                    ${renderSupplementalFiles(model)}
                </div>`;
}

function getCapabilityMonogram(title: string): string {
    const tokens = title.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (tokens.length === 0) {
        return 'MF';
    }
    if (tokens.length === 1) {
        return tokens[0].slice(0, 2).toUpperCase();
    }

    return `${tokens[0].charAt(0)}${tokens[1].charAt(0)}`.toUpperCase();
}

function getStatusText(model: CapabilityDetailModel): string {
    return model.enabled ? 'Enabled' : 'Disabled';
}

function getStatusDescription(model: CapabilityDetailModel): string {
    return model.enabled
        ? 'Included in the active MetaFlow capability set.'
        : 'Excluded from the active MetaFlow capability set.';
}

function renderStat(label: string, value: string): string {
    return `
                        <div class="stat-chip">
                            <span class="stat-chip-label">${escapeHtml(label)}</span>
                            <span class="stat-chip-value">${escapeHtml(value)}</span>
                        </div>`;
}

function renderHeroStats(model: CapabilityDetailModel): string {
    return `
                    <div class="hero-stats">
                        <span class="status-pill status-pill-${model.enabled ? 'enabled' : 'disabled'}">${escapeHtml(getStatusText(model))}</span>
                        ${renderStat('Files', String(model.artifactCount))}
                        ${renderStat('Warnings', String(model.warnings.length))}
                        ${renderStat('Scope Risk', getInstructionScopeStatusLabel(model.instructionScopeSummary))}
                    </div>`;
}

function renderHeroActions(model: CapabilityDetailModel): string {
    const toggleAction = renderToggleAction(model);
    const note = `<span class="action-note">${escapeHtml(getStatusDescription(model))}</span>`;

    if (!toggleAction) {
        return `
                    <div class="hero-actions hero-actions-static">
                        ${note}
                    </div>`;
    }

    return `
                    <div class="hero-actions">
                        ${toggleAction}
                        ${note}
                    </div>`;
}

function renderHeaderSubline(model: CapabilityDetailModel): string {
    const sourceKind = model.builtIn ? 'Built-in capability' : 'Metadata repository layer';
    const repository = model.repoLabel;

    return `
                    <p class="publisher-line">
                        <span class="publisher-name">${escapeHtml(repository)}</span>
                        <span class="meta-separator" aria-hidden="true"></span>
                        <span>${escapeHtml(model.layerPath)}</span>
                        <span class="meta-separator" aria-hidden="true"></span>
                        <span>${escapeHtml(sourceKind)}</span>
                    </p>`;
}

function renderCapabilityBody(model: CapabilityDetailModel): string {
    if (model.body && model.body.length > 0) {
        const normalizedBody = model.body.replace(
            /^(#{1,6})\s+Capability:\s*(.*)$/im,
            (_match, hashes: string, headingText: string) =>
                `${hashes} ${(headingText.trim() || model.title).trim()}`,
        );

        return markdownRenderer.render(normalizedBody);
    }

    if (model.manifestPath) {
        return '<p class="empty-state">The manifest does not contain markdown body content yet.</p>';
    }

    return '<p class="empty-state">No <code>CAPABILITY.md</code> file exists for this layer yet.</p>';
}

export function renderCapabilityDetailsHtml(
    model: CapabilityDetailModel,
    options: CapabilityDetailsHtmlOptions,
): string {
    const title = escapeHtml(model.title);
    const monogram = escapeHtml(getCapabilityMonogram(model.title));
    const description = model.description
        ? `<p class="description">${escapeHtml(model.description)}</p>`
        : '<p class="description description-empty">No description was provided in this capability manifest yet.</p>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource} https: data:; style-src ${options.cspSource} 'nonce-${options.nonce}'; script-src 'none'; connect-src 'none'; frame-src 'none'; font-src ${options.cspSource}; base-uri 'none'; form-action 'none';" />
    <title>Capability Details: ${title}</title>
    <style nonce="${options.nonce}">
        :root {
            color-scheme: light dark;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 24px 28px 32px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            line-height: 1.5;
        }

        main {
            max-width: 1180px;
            margin: 0 auto;
        }

        h1,
        h2,
        h3,
        p {
            margin: 0;
        }

        h1 {
            font-size: 26px;
            line-height: 1.2;
            font-weight: 600;
            letter-spacing: -0.01em;
        }

        h2 {
            font-size: 11px;
            font-weight: 700;
            color: var(--vscode-descriptionForeground);
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        h3 {
            font-size: 13px;
            font-weight: 600;
        }

        code {
            padding: 0.1em 0.3em;
            border-radius: 4px;
            background: var(--vscode-textCodeBlock-background);
            font-family: var(--vscode-editor-font-family);
        }

        .page-header {
            display: grid;
            grid-template-columns: 80px minmax(0, 1fr);
            gap: 18px;
            padding: 6px 0 18px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .identity-badge {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 80px;
            height: 80px;
            border-radius: 14px;
            background: linear-gradient(180deg, var(--vscode-textLink-foreground), var(--vscode-button-background));
            color: var(--vscode-button-foreground);
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }

        .identity-copy {
            min-width: 0;
            display: grid;
            gap: 8px;
            align-content: start;
        }

        .publisher-line,
        .description,
        .section-caption,
        .empty-state,
        .action-note {
            color: var(--vscode-descriptionForeground);
        }

        .publisher-line {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
        }

        .publisher-name {
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }

        .meta-separator {
            width: 4px;
            height: 4px;
            border-radius: 999px;
            background: var(--vscode-descriptionForeground);
        }

        .description {
            max-width: 74ch;
            font-size: 13px;
        }

        .description-empty,
        .empty-state {
            font-style: italic;
        }

        .hero-actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px 10px;
            margin-top: 0;
        }

        .hero-actions-static {
            margin-top: 0;
        }

        .action-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 28px;
            padding: 0 12px;
            border: 1px solid transparent;
            border-radius: 4px;
            text-decoration: none;
            font-size: 12px;
            font-weight: 600;
        }

        .action-button-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .action-button-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .action-button-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-color: var(--vscode-button-border, transparent);
        }

        .action-button-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .action-button:focus-visible,
        .content-tree-summary:focus-visible,
        .sidebar-disclosure summary:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        .action-note {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
        }

        .hero-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 0;
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            padding: 0 9px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background: var(--vscode-sideBar-background);
            font-size: 11px;
            font-weight: 600;
        }

        .status-pill-enabled {
            color: var(--vscode-terminal-ansiGreen);
        }

        .status-pill-disabled {
            color: var(--vscode-descriptionForeground);
        }

        .stat-chip {
            display: inline-grid;
            grid-template-columns: auto auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .stat-chip-label,
        .stat-chip-value {
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            padding: 0 9px;
            white-space: nowrap;
        }

        .stat-chip-label {
            background: var(--vscode-sideBar-background);
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .stat-chip-value {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 11px;
            font-weight: 700;
        }

        .tab-state {
            position: absolute;
            inline-size: 1px;
            block-size: 1px;
            margin: -1px;
            padding: 0;
            border: 0;
            overflow: hidden;
            clip: rect(0 0 0 0);
            clip-path: inset(50%);
            white-space: nowrap;
        }

        .content-layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 312px;
            gap: 24px;
            align-items: start;
            padding-top: 16px;
        }

        .main-column,
        .sidebar {
            min-width: 0;
        }

        .main-column {
            display: grid;
            gap: 14px;
        }

        .tab-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 18px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tab-label {
            display: inline-flex;
            align-items: center;
            padding: 0 0 9px;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            cursor: pointer;
        }

        .tab-panel {
            display: none;
        }

        #capability-tab-details:checked ~ .content-layout .tab-label[for='capability-tab-details'],
        #capability-tab-contents:checked ~ .content-layout .tab-label[for='capability-tab-contents'] {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }

        #capability-tab-details:checked ~ .content-layout .tab-panel-details,
        #capability-tab-contents:checked ~ .content-layout .tab-panel-contents {
            display: block;
        }

        .panel-surface,
        .sidebar-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background: var(--vscode-editorWidget-background);
        }

        .panel-surface {
            padding: 16px 18px 18px;
        }

        .sidebar {
            position: sticky;
            top: 12px;
            display: grid;
            gap: 12px;
        }

        .sidebar-card {
            padding: 14px 14px 13px;
        }

        .metadata-list {
            margin: 0;
            display: grid;
            gap: 0;
        }

        .metadata-row {
            display: grid;
            gap: 4px;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .metadata-row:first-child {
            padding-top: 0;
        }

        .metadata-row:last-child {
            padding-bottom: 0;
            border-bottom: 0;
        }

        .metadata-label {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .metadata-value {
            margin: 0;
            word-break: break-word;
        }

        .content-groups {
            display: grid;
            gap: 14px;
        }

        .content-tree,
        .supporting-files {
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .content-tree:first-child,
        .supporting-files:first-child {
            padding-top: 0;
            border-top: 0;
        }

        .content-tree-summary {
            position: relative;
            display: inline-grid;
            grid-template-columns: minmax(0, auto) auto;
            align-items: center;
            gap: 10px;
            padding-left: 16px;
            cursor: pointer;
            list-style: none;
            font-weight: 600;
        }

        .content-tree-summary::-webkit-details-marker,
        .sidebar-disclosure summary::-webkit-details-marker {
            display: none;
        }

        .content-tree-summary::before {
            content: '▾';
            position: absolute;
            left: 0;
            color: var(--vscode-descriptionForeground);
        }

        .content-tree:not([open]) > .content-tree-summary::before {
            content: '▸';
        }

        .content-tree-title {
            font-size: 14px;
        }

        .content-tree-body {
            margin-top: 12px;
        }

        .count {
            display: inline-flex;
            min-width: 22px;
            justify-content: center;
            padding: 1px 6px;
            border-radius: 999px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 11px;
            font-weight: 700;
        }

        .directory-tree-list {
            margin: 0;
            padding-left: 18px;
            list-style: none;
        }

        .directory-tree-root {
            padding-left: 0;
        }

        .directory-tree-node + .directory-tree-node {
            margin-top: 6px;
        }

        .directory-tree-entry {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            word-break: break-word;
        }

        .directory-tree-entry-folder {
            font-weight: 600;
        }

        .directory-tree-entry-folder::before,
        .directory-tree-entry-file::before {
            color: var(--vscode-descriptionForeground);
        }

        .directory-tree-entry-folder::before {
            content: '▸';
        }

        .directory-tree-entry-file::before {
            content: '•';
        }

        .file-list,
        .warning-list {
            margin: 0;
            padding-left: 18px;
        }

        .scope-risk-intro {
            margin: 10px 0 12px;
            color: var(--vscode-descriptionForeground);
        }

        .scope-risk-examples {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .scope-risk-examples h3 {
            margin-bottom: 10px;
        }

        .scope-risk-reason {
            color: var(--vscode-descriptionForeground);
        }

        .file-list li + li,
        .warning-list li + li {
            margin-top: 6px;
        }

        .supporting-files h3 {
            margin-bottom: 10px;
        }

        .sidebar-disclosure {
            padding: 14px 14px 13px;
        }

        .sidebar-disclosure summary {
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .sidebar-disclosure[open] summary {
            margin-bottom: 14px;
            color: var(--vscode-foreground);
        }

        .markdown-body {
            color: var(--vscode-foreground);
            font-size: 12px;
        }

        .markdown-body > :first-child {
            margin-top: 0;
        }

        .markdown-body > :last-child {
            margin-bottom: 0;
        }

        .markdown-body h1,
        .markdown-body h2,
        .markdown-body h3,
        .markdown-body h4,
        .markdown-body h5,
        .markdown-body h6 {
            margin: 1.1em 0 0.45em;
            color: var(--vscode-foreground);
            font-weight: 600;
            letter-spacing: 0;
            text-transform: none;
        }

        .markdown-body h1 {
            font-size: 24px;
        }

        .markdown-body h2 {
            font-size: 18px;
        }

        .markdown-body h3 {
            font-size: 15px;
        }

        .markdown-body p,
        .markdown-body ul,
        .markdown-body ol,
        .markdown-body blockquote,
        .markdown-body pre,
        .markdown-body table {
            margin: 0 0 0.95em;
        }

        .markdown-body a {
            color: var(--vscode-textLink-foreground);
        }

        .markdown-body a[data-invalid-link='true'] {
            color: var(--vscode-descriptionForeground);
            text-decoration-style: dotted;
            pointer-events: none;
            cursor: default;
        }

        .markdown-body pre {
            overflow-x: auto;
            padding: 12px 14px;
            border-radius: 8px;
            background: var(--vscode-textCodeBlock-background);
        }

        .markdown-body pre code {
            padding: 0;
            background: transparent;
        }

        .markdown-body blockquote {
            margin-left: 0;
            padding-left: 12px;
            border-left: 3px solid var(--vscode-textLink-foreground);
            color: var(--vscode-descriptionForeground);
        }

        .markdown-body table {
            width: 100%;
            border-collapse: collapse;
        }

        .markdown-body th,
        .markdown-body td {
            padding: 8px 10px;
            border: 1px solid var(--vscode-panel-border);
            text-align: left;
        }

        @media (max-width: 980px) {
            .content-layout {
                grid-template-columns: 1fr;
            }

            .sidebar {
                position: static;
            }
        }

        @media (max-width: 720px) {
            body {
                padding: 16px;
            }

            h1 {
                font-size: 22px;
            }

            .page-header {
                grid-template-columns: 60px minmax(0, 1fr);
                gap: 14px;
            }

            .identity-badge {
                width: 60px;
                height: 60px;
                border-radius: 12px;
                font-size: 24px;
            }

            .hero-stats {
                gap: 8px;
            }

            .stat-chip {
                width: 100%;
                grid-template-columns: minmax(0, 1fr) auto;
            }

            .panel-surface,
            .sidebar-card,
            .sidebar-disclosure {
                padding-left: 16px;
                padding-right: 16px;
            }
        }
    </style>
</head>
<body>
    <main>
        <header class="page-header">
            <div class="identity-badge" aria-hidden="true">${monogram}</div>
            <div class="identity-copy">
                <h1>${title}</h1>
                ${renderHeaderSubline(model)}
                ${description}
                ${renderHeroActions(model)}
                ${renderHeroStats(model)}
            </div>
        </header>

        <input class="tab-state" type="radio" name="capability-tab" id="capability-tab-details" checked />
        <input class="tab-state" type="radio" name="capability-tab" id="capability-tab-contents" />

        <div class="content-layout">
            <section class="main-column">
                <nav class="tab-strip" aria-label="Capability detail sections">
                    <label class="tab-label" for="capability-tab-details">Details</label>
                    <label class="tab-label" for="capability-tab-contents">Contents</label>
                </nav>

                <section class="tab-panel tab-panel-details">
                    <section class="panel-surface">
                        <article class="markdown-body">
                            ${renderCapabilityBody(model)}
                        </article>
                    </section>
                </section>

                <section class="tab-panel tab-panel-contents">
                    <section class="panel-surface">
                        <p class="section-caption">Source files found under this capability layer, with <code>.github</code> grouped as a directory tree and the manifest excluded.</p>
                        ${renderContentSections(model)}
                    </section>
                </section>
            </section>

            <aside class="sidebar">
                <section class="sidebar-card">
                    <h2>Metadata</h2>
                    <dl class="metadata-list">
                        ${renderMetadataRows(buildPrimaryMetadata(model))}
                    </dl>
                </section>

                ${
                    model.warnings.length > 0
                        ? `
                <section class="sidebar-card">
                    <h2>Warnings</h2>
                    ${renderWarningList(model)}
                </section>`
                        : ''
                }

                ${renderScopeRiskCard(model)}

                <details class="sidebar-card sidebar-disclosure">
                    <summary>Paths &amp; IDs</summary>
                    <dl class="metadata-list">
                        ${renderMetadataRows(buildTechnicalMetadata(model))}
                    </dl>
                </details>
            </aside>
        </div>
    </main>
</body>
</html>`;
}
