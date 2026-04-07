---
description: Guidance for interpreting AGENTS.md scope and precedence in container environments.
applyTo: "**/AGENTS.md"
---

# AGENTS.md spec
- Containers often contain AGENTS.md files. These files can appear anywhere in the container's filesystem. Typical locations include `/`, `~`, and in various places inside of Git repos.
- These files are a way for humans to give you (the agent) instructions or tips for working within the container.
- Some examples might be: coding conventions, info about how code is organized, or instructions about how to run or test code.
- AGENTS.md files may provide instructions about PR messages. These instructions should be respected.
- Instructions in AGENTS.md files:
  - The scope of an AGENTS.md file is the entire directory tree rooted at the folder that contains it.
  - For every file you touch in the final patch, you must obey instructions in any AGENTS.md file whose scope includes that file.
  - Instructions about code style, structure, naming, etc. apply only to code within the AGENTS.md file's scope, unless the file states otherwise.
  - More-deeply-nested AGENTS.md files take precedence in the case of conflicting instructions.
  - Direct system/developer/user instructions take precedence over AGENTS.md instructions.
- AGENTS.md files need not live only in Git repos. You may find one in a parent workspace or home directory.
- If the AGENTS.md includes programmatic checks to verify your work, you must run all of them and make a best effort to validate that the checks pass after all code changes have been made.