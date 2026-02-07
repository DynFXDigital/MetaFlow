---
applyTo: "**"
---

# User Memory

## User Preferences

## Project Context

## Coding Patterns

## Context7 Research History

## Conversation History

## Notes

---

# User Memory

## User Preferences

- Programming languages: Python
- Code style preferences: Follow existing project conventions, high coverage focus
- Development environment: VS Code on Windows (PowerShell), virtualenv
- Communication style: Concise, action-oriented, expects autonomous progress

## Project Context

- Current project type: Novel editing & analysis tool (CLI + GUI)
- Tech stack: Python 3.10, pytest, python-docx, requests, langchain (optional), LLM abstractions
- Architecture patterns: Modular plugins (character_analysis, content_moderation, copy_editing, import_export, scene_analysis), reporter classes, processor/analyzer separation
- Key requirements: Deterministic smokes without network; implicit scene detection (no '---' markers); focus on stable, resilient assertions

## Coding Patterns

- Preferred patterns and practices: Deterministic tests with stubbed LLMs and high-level reporter stubs; avoid brittle punctuation assertions
- Code organization preferences: tests/smoke for smokes; tests/fixtures/fake_novel for sample data
- Testing approaches: Use venv Python to avoid pytest warnings; assert file existence and contain key content
- Documentation style: Fixture README clarifies implicit scene detection

## Context7 Research History

- Libraries researched on Context7: python-docx; pytest-cov (prior work)
- Best practices discovered: Stub high-level DocxReporter.generate in smokes to avoid python-docx internals
- Implementation patterns used: Scenes write reports to Chapters dir in tests; moderation writes to Analysis/Moderation
- Version-specific findings: N/A

## Conversation History

- Important decisions made: Create fake novel fixture; remove '---' scene markers; add all-plugins smokes; adjust tests to actual output paths; use venv interpreter
- Recurring questions or topics: Ensure smokes are deterministic and fast
- Solutions that worked well: Stubbing DocxReporter.generate; correcting ModerationResult fields; using chapters dir for scenes and Analysis/Moderation for moderation outputs
- Things to avoid or that didn't work: Constructing ModerationResult with invalid fields; stubbing low-level python-docx APIs

### Unified Smoke Consolidation and Heading Style

- Redundant smokes physically deleted; `tests/smoke/test_unified_smoke.py` is canonical.
- Fake novel headings use "<character-name> -- <chapter name>"; copy-edit rules convert to em-dash.
- combine_chapters takes first-line heading verbatim; no dash spacing normalization.
- Test assertions relaxed via regex to accept em-dash or hyphens with optional spaces for stability across rules.

## Notes

- Next coverage targets: Markdown reporter placeholder & quote limit branches, processor whole-chapter error branch, confirm whole-chapter success path.

## Conversation History

- Important decisions made: Incremental targeted tests for markdown profiles (quote limit, sections), markdown basic summary placeholders & boundary LLM summary cases, processor whole-chapter success & forced error, docx parallel per-task fallback.
- Recurring topics: Systematic branch coverage, differentiating quote handling between profile vs basic summary.
- Solutions effective: Exception injection per character to validate fallback, deterministic fake data for summaries, direct function invocation to bypass heavy I/O.
- Adjusted assumptions: Basic summary does not truncate quotes (only profiles limit to 3) – test corrected.

## Notes

- Completed recent targets: Markdown placeholder & quote limit, processor whole-chapter success + error, docx per-task fallback.
- Remaining high-yield targets: Processor chunked partial failure aggregation logic; markdown reporter deep formatting sections (lines ~359-500); docx reporter combined profiles with characters missing optional sections; character_reference managers (suggestion & relationship) duplicate/rejection paths.
- Strategy: Add focused tests simulating mixed chunk errors, characters with sparse data, and reference manager duplicate handling to raise coverage without large integration tests.

### Recent Progress (Markdown & Processor Augmentation)

- Added tests for chunked failure aggregation (mixed + all-fail) confirming exception path.
- Implemented deterministic fixed-size chunk splitting (refactored processor) to stabilize multi-chunk test expectations and eliminate dependency variability.
- Added markdown arc 'is marked by' branch test and trimmed leading space bug fixed in arc generation.
- Added docx strengths/weaknesses + quote limit test; added update_from_analysis rejection path test.
- Expanded markdown coverage: strengths, weaknesses, leftover trait bucket, speech pattern examples, LLM summary ordering & empty summary handling.
- Added basic vs detailed report tests exercising placeholder bio path, raw detailed inclusion, relationships grouping, quotes sections.
- Markdown reporter coverage improved substantially (to >80%).

### Updated Remaining Targets

- Minor unhit markdown lines (early multi-entry bio validation nuances, specific arc construction branches with 'is marked by').
- Docx reporter remains very low coverage; potential next slice: strengths/weaknesses sections and quote limiting inside docx profiles.
- Character models deeper update paths (update_from_analysis validation rejections) still largely uncovered.

## Notes

- Smokes added: copy_edit_and_stats, import/export combine, scene analysis, character analysis, content moderation
- Pending optional: CLI-level e2e smoke chaining multiple plugins; conditional skips if future smokes require local LLMs

### Latest Session Updates (Import/Export Headings)

- Updated fixtures to character-prefixed headings.
- Adjusted unified smoke to capture and assert headings using regex tolerant to spacing.
- Verified unified smoke passes in isolated run; coverage warnings reference deleted legacy smoke files (benign).

### Latest Session Updates

- Fixed IndentationError in tests/smoke/test_fake_novel_smoke.py by normalizing spaces-only indentation.
- Refactored copy-edit smoke to use shared helper tests/utils/fixtures.copy_fake_novel_to_tmp.
- Verified entire smoke suite is green (5 passed) with deterministic behavior and no external dependencies.

### Agent Bootstrap Optimization

- Added cross-platform setup scripts: `scripts/dev_setup.ps1` and `scripts/dev_setup.sh`.
- Introduced optional no-venv mode (`-NoVenv` / `--no-venv`) to reduce overhead in ephemeral Linux agents.
- Documented canonical bootstrap order in `AGENTS.md` and `.github/copilot-instructions.md` (run setup script, ruff check, pytest quick run, then task-specific work).
- Rationale: Prior agent logs showed redundant dependency discovery, environment recreation, and file over-reading.
