````prompt
# Execute Plan to Completion

Work on a plan in `.plan/<plan-name>/` until 100% complete or user input is required.

## Input

Plan directory path (e.g., `.plan/plugin-test-coverage`) or plan name.

## Initialization

1. Read `Context.md` to understand current state and focus
2. Read `README.md` for scope and success criteria
3. Read the current phase document (from Context.md references)
4. Identify the first uncompleted task

## Execution Loop

Repeat until plan is complete or blocked:

### 1. Execute Current Task

- Implement the task per the phase document specifications
- Write tests first when adding new functionality
- Run tests to verify correctness
- Commit logical units of work with clear messages

### 2. Update Progress

After completing each task:
- Mark task complete in the phase document: `- [x] Task description`
- Update `Context.md`:
  - Move completed items from "Next Steps" to "Decision Log" with date
  - Add new focus items
  - Update "Current Focus" to reflect actual state

### 3. Verify & Continue

- Run full test suite to ensure no regressions
- If all phase tasks complete, update Context.md status and move to next phase
- If blocked, STOP and report (see Blocking Conditions)

## Blocking Conditions

STOP execution and report to user when:

- **Ambiguity**: Requirements unclear or conflicting
- **Missing Information**: Need user decisions (architecture, naming, behavior)
- **External Dependency**: Requires action outside codebase (API keys, services)
- **Scope Question**: Task seems larger than documented or requires design decisions
- **Test Failure**: Cannot resolve failing test without clarification
- **Risk**: Change could break production or affect data

When blocked, provide:
```
## Blocked: [Brief Reason]

**Context**: What I was attempting
**Blocker**: Specific question or missing information
**Options**: Possible approaches (if any)
**Recommendation**: Suggested path forward (if applicable)
```

## Completion Criteria

Plan is complete when:
- All phase documents have all tasks marked `[x]`
- All tests pass
- Coverage targets met (if specified)
- Context.md updated with "Outcome" section

## Progress Reporting

After significant progress or when stopping, summarize:

```
## Progress Update

**Phase**: [current phase]
**Completed**: [list of completed tasks]
**Status**: [Complete / In Progress / Blocked]
**Next**: [immediate next step or blocker]
```

## Rules

- Follow existing code patterns and project conventions
- Run tests after each logical change
- Keep commits atomic and well-documented
- Update plan documents as you work (don't leave stale status)
- Never skip tests or leave broken builds
- If a task is significantly more complex than documented, STOP and clarify scope
- Prefer small, incremental progress over large, risky changes

## Context Maintenance

Update `Context.md` continuously:
- **Current Focus**: Always reflects actual work in progress
- **Next Steps**: Ordered by priority, first item is immediate
- **Decision Log**: Append choices with `(YYYY-MM-DD)` prefix
- **Open Questions**: Add new risks discovered during implementation

## Example Workflow

```
1. Read .plan/plugin-test-coverage/Context.md
   → Current focus: Phase 1 - Synopsis plugin

2. Read Phase1-Synopsis.md
   → First uncompleted task: Add error path tests for synopsis_llm.py

3. Examine synopsis_llm.py, identify untested error paths

4. Write tests for each error path

5. Run tests: npm run test:unit

6. Update Phase1-Synopsis.md: - [x] Add error path tests

7. Update Context.md with progress

8. Commit: "test(synopsis): add error path coverage for synopsis_llm"

9. Continue to next task...
```

## Start

Begin by reading the plan's `Context.md`:
1. Identify current focus and next steps
2. Read the referenced phase document
3. Execute the first uncompleted task
4. Continue until complete or blocked

````
