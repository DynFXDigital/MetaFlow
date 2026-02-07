---
description: 'Ensures Mermaid diagrams render legibly in both light and dark themes.'
applyTo: '**/*.md'
---

# Mermaid Diagram Guidelines

- **Always use the shared palette snippet** below (or copy it from `Documents/Design/Input/MermaidThemePlayground.md`) so every Markdown diagram inherits the same accessible colors.
- **Do not rely on default Mermaid colors**; they invert poorly in dark mode and produce unreadable text against VS Code/VSCodium backgrounds.
- **Keep diagrams minimal** (single purpose per block) so the palette’s limited accents remain meaningful; annotate details in Markdown instead of dense notes.
- **Validate contrast** by rendering the diagram in both light and dark themes (View → Appearance) and comparing against the playground reference file before committing.

## Required Theme Snippet

Embed this at the top of every Mermaid block:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '14px', 'primaryColor': 'var(--mmd-surface-alt)', 'primaryTextColor': 'var(--mmd-text)', 'primaryBorderColor': 'var(--mmd-line)', 'secondaryColor': 'var(--mmd-surface)', 'secondaryTextColor': 'var(--mmd-text)', 'lineColor': 'var(--mmd-line)', 'tertiaryColor': 'var(--mmd-accent)', 'noteBkgColor': 'var(--mmd-surface-alt)', 'noteTextColor': 'var(--mmd-text)' }, 'themeCSS': '.mermaid{--mmd-surface:#f8fafc;--mmd-surface-alt:#e2e8f0;--mmd-line:#475569;--mmd-text:#0f172a;--mmd-accent:#0ea5e9;--mmd-warn:#f97316;--mmd-positive:#16a34a;background-color:var(--mmd-surface);color:var(--mmd-text);} @media (prefers-color-scheme: dark){.mermaid{--mmd-surface:#0f172a;--mmd-surface-alt:#1f2937;--mmd-line:#94a3b8;--mmd-text:#f8fafc;--mmd-accent:#38bdf8;--mmd-warn:#fb923c;--mmd-positive:#22c55e;background-color:var(--mmd-surface);color:var(--mmd-text);}} .mermaid svg{background-color:var(--mmd-surface);} .mermaid .node rect,.mermaid .actor,.mermaid .cluster rect{fill:var(--mmd-surface);stroke:var(--mmd-line);} .mermaid .node text,.mermaid .actor text,.mermaid text.actor,.mermaid .label text{fill:var(--mmd-text);} .mermaid .edgePath .path,.mermaid line,.mermaid path{stroke:var(--mmd-line);} .mermaid .note{fill:var(--mmd-surface-alt);stroke:var(--mmd-line);color:var(--mmd-text);}'}%%
```

### Notes

- You may extend the snippet with diagram-specific colors (e.g., `pie1`, `quadrant1Fill`), but keep the base variables unchanged to preserve contrast parity.
- The `themeCSS` block defines the only palette we support; if you change it, update `MermaidThemePlayground.md` in the same commit and re-validate every diagram type.
