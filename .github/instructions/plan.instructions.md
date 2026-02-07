---
description: Documentation for the .plan directory containing planning documents for refactoring and enhancement efforts.
applyTo: '**/*'
---

# .plan Directory - Planning Documents

The `.plan` directory contains detailed planning documents for various refactoring and enhancement efforts within the Solaroids project. These plans provide comprehensive roadmaps for addressing specific architectural challenges.

## Purpose

Planning documents serve as:
- **Strategic vision** for major refactoring efforts
- **Roadmaps** explaining architectural decisions and future directions
- **Progress tracking** for complex, multi-phase initiatives
- **Context** for understanding the "why" behind code changes

## Structure

Plans typically follow a phased approach with clear markdown documentation. Every active plan directory must also contain a lightweight `Context.md` file that captures the day-to-day execution state (see "Context Documents" below).

### Typical Plan Layout

- **README.md** – overview, scope, and success criteria for the effort
- **Phase<N>-<Name>.md** – ordered phases or milestones with detailed tasks
- **Specialized references** – focused documents (e.g., dependency audits, architecture notes, migration checklists) that support the phases
- **Context.md** – living status document (required; see below)

Refer to the currently active subdirectories under `.plan/` for concrete examples of how these pieces stay organized.

## Context Documents

Each plan subdirectory must include a `Context.md` file that serves as the living "current focus" document for that effort. Treat it as the single source of truth for what is happening right now.

**Purpose**
- Provide a quick status snapshot without rereading the entire plan
- Call out the immediate next steps, owners, and dependencies
- Point to deeper documents (plans, design notes, test instructions)

**Location & Naming**
- File lives beside the plan assets: `.plan/<PlanName>/Context.md`
- Use ASCII markdown; keep the document to roughly 1–2 screens to encourage frequent updates

**Required Sections**
1. `Feature Overview` – one-paragraph problem/goal statement
2. `Current Focus` – 1–3 bullets describing what is actively being worked
3. `Next Steps` – ordered checklist of the next actionable items
4. `References` – links to relevant plans, specs, issues, PRs, or instructions
5. `Decision Log` – dated bullets for important choices/assumptions
6. `Open Questions & Risks` – unresolved items or known hazards
- Optional metadata (last updated date, owner, status) can be added above the sections for clarity

**Maintenance Expectations**
- Create `Context.md` when kicking off a plan or major feature effort
- Update the `Current Focus` and `Next Steps` sections at the start/end of a work session or when ownership changes
- Append to the `Decision Log` as choices are made; retire items once they move into the main plan
- When the effort completes, add a brief "Outcome" note and leave the final state for historical reference

**Example**
- `.github/instructions/resources/PlanContext.Sample.md` provides the canonical template to follow when creating or refreshing a `Context.md`

## How to Use Plans

1. **Reference when working on related code** - When working with code covered by a plan, refer to the plan to understand the intended architecture and migration path
2. **Update progress** - Track progress directly in the relevant plan file
3. **Understand context** - Use plans to understand why certain architectural decisions were made

## Sample Resources

- `.github/instructions/resources/PlanContext.Sample.md` – copy/paste-ready example of a compliant `Context.md`

## Integration with Other Documentation

Plans work alongside other project documentation:

1. **Start with Planning Documents** - The `.plan` directory provides the strategic vision and roadmaps for specific areas of the codebase. These documents explain the "why" behind architectural decisions and future directions.

2. **Reference Type Definitions** - The `.types/` directory offers detailed structural information about the current implementation. These files answer the "what" and "how" questions about classes and their relationships.

3. **Review Implementation Code** - Armed with both the architectural plans and structural understanding, you'll be better equipped to navigate and modify the actual implementation code.

This combination of forward-looking plans and current structure documentation provides a complete picture of both where the code is today and where it's headed in the future.
