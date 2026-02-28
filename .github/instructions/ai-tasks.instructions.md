---
description: Define conventions for creating and maintaining AI task checklists.
applyTo: ".ai/tasks/**/*.md"
---

# Instructions: Creating AI Task Checklists

When documenting recommended changes or improvements as tasks for this project, follow these steps:

1. **Directory Structure:**
   - Place all task checklists in `.ai/tasks/`.
   - Use descriptive filenames (e.g., `doc-structure-improvements.md`).

2. **Checklist Format:**
   - Use Markdown checkboxes (`- [ ]`) for each actionable item.
   - Each task should be clear, concise, and actionable.
   - Group related tasks under headings if needed.

3. **Context:**
   - Start each checklist with a brief description of the purpose and scope of the tasks.

4. **Tracking Progress:**
   - As tasks are completed, check them off (`- [x]`).
   - Optionally, add notes or links to relevant PRs/issues.

5. **Templates:**
   - If a new type of recurring task is identified, create a template in `.ai/tasks/` for future use.

6. **Review:**
   - Review checklists regularly and update as needed.

---

**Example:**

```
# Project Documentation Structure Improvements

This checklist tracks recommended changes to improve the organization of requirements, design, project plans, and issues documentation.

- [ ] Create a `requirements/` directory under `doc/` for requirements documentation.
- [ ] ...
```
