# Phase 3 - Tools and MCP Integration

## Objective

Provide explicit, safe onboarding for extension-native AI tools and MCP server configuration while maintaining VS Code trust and user control.

## Deliverables

1. Optional extension tool capability surface (feature-gated).
2. MCP onboarding commands to scaffold and validate `.vscode/mcp.json` (or profile target).
3. Diagnostics and status output for tool/MCP readiness.
4. User documentation for enablement, trust flow, and troubleshooting.

## Implementation Tasks

- [ ] Define extension tool capability scope and command UX (initially minimal/preview).
- [ ] Add compatibility checks for VS Code channel/version prerequisites.
- [ ] Implement MCP scaffold command with template presets and idempotent updates.
- [ ] Implement MCP validation command for malformed config, missing executables, and trust guidance.
- [ ] Add status indicators in output/view for configured tool/MCP state.
- [ ] Add opt-in controls and guardrails for all new capabilities.

## Testing and Validation

- [ ] Unit tests for MCP config patch/merge logic.
- [ ] Unit tests for tool capability gating and fallback behavior.
- [ ] Integration tests for command flows that create/update config files safely.
- [ ] Manual validation checklist for trust prompts and first-run ergonomics.

## Exit Criteria

1. Users can onboard MCP configurations from MetaFlow without hidden background behavior.
2. Tool features remain disabled unless explicitly enabled and supported.
3. Failure modes are actionable and non-destructive.

## Risks and Mitigations

- Risk: platform/runtime differences for MCP server command availability.
- Mitigation: executable checks and platform-specific guidance in command output.

- Risk: user confusion between extension tools and MCP tools.
- Mitigation: separate settings groups, command names, and help text aligned to lane model.
