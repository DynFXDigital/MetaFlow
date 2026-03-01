# Phase 2 - Config UI Indicator

## Objective

Surface repository sync status directly in Config view using a clear icon and tooltip model, including the requested upstream-change arrow affordance.

## Deliverables

1. Config tree item decoration based on sync status.
2. Tooltip enhancements with ahead/behind detail.
3. Inline/context actions for `Check Updates` and (optional) `Pull`.

## Implementation Tasks

- [x] Extend `RepoSourceItem` to accept optional sync status.
- [x] Map sync status to icon/description conventions:
  - behind -> arrow-down indicator + `updates` badge text
  - ahead -> arrow-up indicator
  - diverged -> warning indicator
  - unknown -> question/warning indicator
- [x] Add tooltip sections for:
  - remote URL
  - tracking branch
  - ahead/behind counts
  - last check timestamp
  - latest error (if any)
- [x] Add command contributions and context menu entries in `src/package.json`.
- [x] Ensure non-git repos remain clean and unchanged in UX.

## Testing

- [x] Update/extend tree view integration tests for git-backed item rendering.
- [x] Add tests for tooltip text in each status state.
- [x] Verify view/item context gating for new commands.

## Exit Criteria

1. Users can visually identify update availability from Config view at a glance.
2. Tooltip clearly explains why an item is flagged.
3. UI remains stable for local-only repo entries.
