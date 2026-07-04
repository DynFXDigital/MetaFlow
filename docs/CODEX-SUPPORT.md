# Codex Support Boundaries

MetaFlow treats Codex as a first-class target adapter. It projects canonical
MetaFlow metadata into Codex-native repository files when the Codex surface is
file-backed, and it reports runtime-only Codex surfaces when repository
metadata cannot create or prove the runtime behavior. The generated support
boundary report also includes a concept-keyed runtime evidence checklist so
each runtime-only matrix row has an explicit review expectation. When a
workspace supplies `.metaflow/runtime-evidence/*.json` records, the checklist
lists the matching evidence records for the covered concepts and summarizes
coverage by `passed`, `partial`, `failed`, `not-run`, `waived`, and `missing`
concept status. The coverage summary also reports records and concepts with
runtime evidence diagnostics by severity so warning-bearing or error-bearing
proof does not appear as clean coverage. It also separates concepts that have
evidence without diagnostics from concepts that have evidence with diagnostics,
so runtime support can be reviewed without treating all recorded proof as
equally ready. A `waived` concept is reviewed evidence that the native Codex
surface is unavailable, unauthorized, or intentionally out of scope for the
current release posture; it is not a runtime pass. Markdown and JSON reports
also include a runtime evidence waiver summary with waived concept counts,
waived record counts, concept IDs, record IDs, limitations, authority
implications, and the repository-projection boundary that makes the surface
impossible to prove from metadata alone. The Markdown report includes
runtime evidence review queues for missing evidence, clean evidence,
diagnostic-bearing evidence, error-diagnostic evidence, expired evidence,
partial evidence, stale adapter version evidence, and waived evidence so operators can triage
runtime validation posture without scanning every checklist row. The report includes structured
generator metadata: the emitting MetaFlow command or extension surface, the
generation timestamp, and the Codex target adapter version used to classify
file-backed and runtime-only support.
The VS Code command `MetaFlow: Open Codex Support Boundaries` uses the same
support-boundary builder and includes workspace runtime evidence records when
a MetaFlow config is loaded in the extension.
`MetaFlow: Open Codex Runtime Evidence Review Queue` opens focused Markdown
triage documents from the same report data for all runtime-only concepts,
release-ready blockers, missing evidence, diagnostic-bearing evidence,
error-diagnostic evidence, partial evidence, expired evidence, stale adapter
version evidence, failed evidence, not-run evidence, or waived evidence.

The CLI report can also act as a release or CI gate. Use
`metaflow codex-support-boundaries --fail-on missing-evidence,diagnostics` to
emit the report and exit nonzero when runtime-only concepts have no evidence or
when retained runtime evidence carries diagnostics. Supported gate checks are
`missing-evidence`, `diagnostics`, `error-diagnostics`, `failed`, `not-run`,
and `partial`. Supported presets are `release-ready`, `runtime-complete`, and
`all`; `release-ready` expands to missing evidence, diagnostics, failed
evidence, and not-run evidence, while `runtime-complete` also fails when
concepts still have partial evidence.
The Markdown and JSON reports include a runtime evidence gate summary with the
same triggered state, counts, concept lists, and messages used by `--fail-on`,
so release jobs and reviewers can inspect one persisted artifact.
They also include a runtime evidence readiness summary that applies the
`release-ready` preset, reports whether the current evidence is ready or
blocked, and lists the blocking gate conditions and messages. A technical
impossibility summary counts repository-projection-impossible items and
classifies whether they require external authority, hosted or network surfaces,
app or platform surfaces, or harness-native runtime proof. A runtime evidence
completeness summary then makes the release-ready and runtime-complete states
explicit, including partial, waived, diagnostic, expired, stale-adapter,
remaining completion-action, and repository-projection-impossible counts. A
runtime evidence completion blocker summary then preserves the partial concepts,
matching record IDs, limitations, native surfaces, authority implications, and
expected proof that keep runtime-complete from passing. A runtime evidence
completion readiness summary groups those partial concepts by
current-environment, external-authority, hosted/network, and app/platform proof
needs. The report then
renders a release-ready runtime evidence action plan that turns blocking gate
results into operator actions such as collecting missing runtime evidence,
reviewing diagnostics, rerunning failed evidence, or running evidence marked
not-run. It also renders a runtime-complete completion action plan for partial
runtime-only concepts that need stronger harness-native proof before
`--fail-on runtime-complete` can pass.
Release-ready means the configured gates have no blockers; it can still include
partial or waived evidence and therefore does not mean every native Codex
runtime surface has been fully proven.
Each action item includes concept-level details for coverage status, native
surfaces, expected runtime proof, authority implications, matching runtime
evidence record IDs, and current runtime evidence limitations so operators can
work from the persisted report artifact.
`metaflow codex-support-boundaries --runtime-evidence-review-queue <queue>`
emits a focused Markdown queue document, or JSON when `--json` is supplied,
for `all`, `release-ready`, `runtime-complete`, `completion-readiness`,
`completion-readiness-current-environment`,
`completion-readiness-external-authority`,
`completion-readiness-hosted-network`,
`completion-readiness-app-platform`, `missing-evidence`, `diagnostics`,
`error-diagnostics`, `partial`, `expired-evidence`, `stale-adapter-version`,
`failed`, `not-run`, or `waived` triage. The
`runtime-complete` queue combines release-ready blockers with partial evidence
completion actions. The `completion-readiness` queue focuses partial
runtime-complete blockers and their current-environment, external-authority,
hosted/network, and app/platform proof categories. The category-specific
completion-readiness queues filter those completion actions to the selected
category. Partial, waived, expired, and stale-adapter queue documents include
advisory review items for matching concepts but do not add release gate blockers.
`metaflow codex-support-boundaries --projection-boundary-review` emits a
focused Markdown projection-boundary document, or JSON when `--json` is
supplied, for retaining Codex file-backed, runtime-only, unsupported,
not-achievable, technical-impossibility category counts, and expected-evidence
boundaries without collecting runtime proof.
In VS Code, `MetaFlow: Open Codex Projection Boundary Review` opens the same
projection-boundary review as a focused Markdown document.
`metaflow codex-support-boundaries --runtime-evidence-guide
--runtime-evidence-concept <concepts>` emits a Markdown guide, or a JSON guide
when `--json` is supplied, for collecting reviewable proof for selected
runtime-only Codex concepts. The guide names native surfaces, authority
implications, repository projection boundaries, existing evidence records,
suggested scaffold paths, and collection checklist items; it does not create
runtime proof or write canonical evidence records automatically.
In VS Code, `MetaFlow: Open Codex Runtime Evidence Guide` opens the same
collection guidance for a selected runtime-only Codex concept as a reviewable
Markdown document and includes matching workspace runtime evidence record IDs
when a MetaFlow config is loaded in the extension.
`metaflow codex-support-boundaries --runtime-evidence-template` emits a
review-only JSON bundle of suggested `.metaflow/runtime-evidence/*.json`
records derived from that action plan. When `--runtime-evidence-concept` is
supplied, the template bundle is derived from the concept-keyed runtime
evidence checklist instead, so operators can refresh or replace records for
concepts that already have partial or waived evidence. The bundle contains
suggested paths and fill-in record payloads; it does not create runtime proof
or write canonical evidence records automatically.
In VS Code, `MetaFlow: Open Codex Runtime Evidence Template` opens the same
review-only JSON bundle for selected runtime-only Codex concepts as an unsaved
document and does not create runtime proof or write canonical evidence records.
`MetaFlow: Save Codex Runtime Evidence Template Records` writes selected
scaffold files under `.metaflow/runtime-evidence` after explicit confirmation
and requires overwrite confirmation for existing records.
`--runtime-evidence-template-dir <path>` writes those fill-in records as
individual JSON scaffold files under an explicit workspace-relative directory,
with overwrite protection unless `--force` is supplied. Add
`--runtime-evidence-concept <concepts>` to limit the template bundle or
scaffold-file output to one or more comma-separated runtime-only Codex
concepts, such as `issuePrOperation` or `reviewRuntime`, while collecting
evidence incrementally.

Runtime evidence records may declare optional `validatedAt` and `expiresAt`
ISO-8601 timestamps so reviewers can distinguish current proof from evidence
that requires refresh. Expired records remain visible, but report diagnostics
before support claims rely on them. The `expired-evidence` review queue lists
those records directly for refresh review without adding a separate release
gate. Records may also attach structured
`evidenceArtifacts`. Local artifact refs for `log`, `report`, `screenshot`,
`trace`, `recording`, and `artifact` kinds are resolved relative to the
metadata layer and produce diagnostics when the referenced file is missing.
These local artifact refs must remain inside the metadata layer; escaped local
paths produce diagnostics because they are not portable with the capability.
Local artifacts may declare an optional lowercase `sha256` digest; MetaFlow
reports a mismatch when the current file content differs from the reviewed
digest. `url`, `run`, `other`, and explicit URI refs remain external review
references. Runtime evidence records also declare the adapter version used
when the evidence was reviewed; records whose adapter version differs from the
current target capability matrix remain visible but produce diagnostics in
support-boundary reports. The `stale-adapter-version` review queue lists those
records directly for adapter refresh review without adding a separate release
gate.

This document records the public support boundary for MetaFlow's Codex adapter.
The source baseline is the OpenAI Codex manual fetched on 2026-07-03.

## Supported File Projections

MetaFlow supports repository metadata projection for Codex surfaces that Codex
loads from files in the workspace.

| MetaFlow concept | Codex surface | MetaFlow behavior |
| --- | --- | --- |
| Skills | `.agents/skills/<skill-id>/SKILL.md` | Canonical `.metaflow/skills/**` entries project to Codex repository skills. |
| Project instructions | `AGENTS.md`, `AGENTS.override.md` | Root and scoped instructions are guarded because unmanaged project guidance has high collision risk. |
| Prompts | `.metaflow/prompts/*.md`, `.metaflow/prompts/*.json` | Canonical prompt metadata is reviewable for Codex, but Codex custom prompts are deprecated local-only slash-command files under the user's Codex home directory. Shared Codex workflows use skills instead of repository prompt projection. |
| Project configuration | `.codex/config.toml` | Managed project configuration is candidate or gated output unless the target adapter explicitly owns the file. |
| Command rules | `.codex/rules/*.rules` | Project-local command rules are guarded policy files with a distinct `commandRules` target-adapter concept. Codex loads them only from trusted project config layers and after startup; rule syntax, shell-wrapper splitting, and admin-enforced requirements require Codex runtime validation. |
| Worktree include | `.worktreeinclude` | Codex worktree include files are guarded copy-policy files for local Codex app managed worktrees. MetaFlow can materialize and report the file as the `worktreeInclude` target-adapter concept, but managed-worktree creation, ignored-file copying, skip/overwrite behavior, symlink handling, automatic `AGENTS.override.md` copying, and copied-file proof require Codex runtime validation. |
| Agents | `.codex/agents/*.toml` | Canonical agent profiles project to Codex custom-agent configuration when the target adapter enables agent materialization. Codex loads these files as subagent configuration layers, but installed Codex CLI 0.142.3 does not expose a non-interactive custom-agent activation flag or debug prompt-input proof for repo-local agent TOML. |
| Hooks | `.codex/hooks.json` | Supported command lifecycle hook metadata projects to Codex hook JSON when the target adapter enables hook materialization. |
| Plugins | `.codex-plugin/plugin.json` | Codex plugin manifests stay separate from GitHub Copilot `plugin.json` manifests. |
| Local plugin marketplace | `.agents/plugins/marketplace.json` | Canonical package marketplace entries can export Codex-shaped candidate payloads for operator review through the CLI or VS Code package marketplace report. |

## Runtime-Only Codex Surfaces

The following Codex capabilities are runtime integrations. MetaFlow can model
intent, policy grants, review notes, validation evidence, and target capability
matrix rows for these surfaces, but repository projection alone does not create
the service connection or prove the behavior.

| Codex surface | Why static projection is insufficient | MetaFlow handling |
| --- | --- | --- |
| Codex Cloud environments | Cloud environments are hosted runtime configuration and execution state. They include repository checkout, setup scripts, dependency/cache state, environment variables, secrets available to setup, sandbox policy, and agent internet-access settings. | Represent execution intent and expected evidence in `.metaflow/execution/*.json`, `.metaflow/evaluation/*.json`, or `.metaflow/runtime-evidence/*.json`; require harness-native environment evidence before treating hosted execution as operational. |
| Agent runtime | Subagent workflows, custom-agent selection, `/agent` thread state, inherited sandbox and approval posture, live overrides, tool activity, token usage, and consolidated results are Codex runtime behavior. | Project and review custom-agent configuration, but require a Codex app or CLI subagent run before treating a custom agent as operational. |
| Automations | Scheduled standalone, project, and thread automations are Codex app runtime state. They depend on the local app or host runtime, target project availability, schedule, local versus worktree execution mode, sandbox defaults, approval policy, skills, plugins, and Triage run state. | Record automation intent, policy grants, reusable skills, and evidence expectations; do not create, update, archive, or prove scheduled automation runs from repository metadata. |
| Authentication runtime | Codex authentication depends on ChatGPT sign-in, API key sign-in, access-token automation, credential storage, workspace policy, MFA, SSO, RBAC, Codex Local permission, access-token permission, and connected GitHub account state. | Record authentication intent, policy grants, and required evidence; do not sign in users, create or store credentials, connect accounts, satisfy organization policy, or prove authenticated runtime behavior from repository metadata. |
| Permission runtime | Codex permissions depend on sandbox mode, approval policy, permission profiles, managed requirements, network controls, protected paths, app and MCP tool annotations, and optional auto-review. | Record desired permission posture, policy grants, command rules, and evidence requirements; do not grant runtime permissions, approve boundary-crossing actions, enforce OS sandboxing, run auto-review decisions, or prove permission behavior from repository metadata. |
| Enterprise policy runtime | Codex managed configuration depends on Codex Admin roles, cloud-managed `requirements.toml` policy assignment, group membership, device-level policy, system requirements files, policy precedence, fleet-version compatibility, feature pins, plugin marketplace controls, MCP allowlists, command-rule constraints, and audit posture. | Record governance posture, policy grants, and required evidence; do not assign admin roles, apply cloud-managed requirements, write device-level policy, select the effective policy layer, enforce feature pins, approve marketplace sources, or prove enterprise policy behavior from repository metadata. |
| App connectors | Slack, Linear, GitHub, ChatGPT workspace, and other app connectors depend on workspace or organization approval, connector installation, account linking, connected repositories or channels, posting policy, and data-sharing controls. | Record connector intent, policy grants, and required evidence; do not generate or claim installed connector state. |
| Codex Cloud tasks | Cloud tasks depend on ChatGPT/Codex environments, GitHub connection, branch or SHA checkout, setup scripts, cloud secrets, and agent internet-access settings. | Represent execution intent in `.metaflow/execution/*.json`; require harness-native runtime evidence for support claims. |
| Slack delegation | Slack tasks depend on the Codex Slack app, workspace install or admin approval, channel membership, connected GitHub account, and a Codex environment. | Record as runtime-only issue/task operation; do not generate Slack app state. |
| Linear delegation | Linear tasks depend on the Codex Linear integration, account linking, workspace settings, GitHub connection, and environment selection. | Record as runtime-only issue/task operation; do not generate Linear connector state. |
| Review runtime | The Codex review pane, `/review`, inline comments, PR feedback in the app, GitHub-triggered `@codex review`, automatic reviews, and follow-up fix tasks depend on Git repository state, GitHub access, Codex Cloud setup, code-review settings, GitHub CLI or connector authentication, and repository permissions. | Record review guidance and required evidence; do not open review panes, enable code-review settings, trigger reviews, post GitHub reviews, read PR feedback, or prove feedback handling from repository metadata. |
| Remote connections | Codex remote control from ChatGPT mobile or another Codex App device, connected Mac or Windows hosts, SSH host projects, and secure relay behavior depend on paired devices, account or workspace authorization, host availability, SSH configuration, host tools, host plugins, MCP servers, browser setup, Computer Use, sandbox settings, and approvals. | Record remote-connection intent and required evidence; do not pair devices, keep hosts awake or online, configure SSH hosts, expose host tools or plugins, approve remote actions, or prove remote task behavior from repository metadata. |
| GitHub-triggered Codex review | GitHub review operation depends on Codex GitHub access and repository/PR context outside the metadata repository. | Record review intent and required policy grants; require GitHub/Codex runtime evidence. |
| PR feedback handling in the Codex app | App PR context depends on the current branch, Git repository state, GitHub access, and authenticated `gh` behavior. | Document as an operator workflow; do not treat projection as proof that PR feedback appears in Codex. |
| Codex GitHub Action | GitHub Action execution depends on workflow triggers, GitHub secrets, runner operating system, job permissions, sandbox inputs, and Codex action version. | Classify the execution intent in `.metaflow/execution/*.json`; do not generate workflows or claim CI execution without a harness-native run. |
| Codex app-server integrations | App-server execution depends on a live `codex app-server` process, selected stdio, WebSocket, Unix socket, or disabled transport, JSON-RPC initialize/initialized handshake, thread and turn lifecycle, event stream handling, schema version, overload behavior, and listener authentication for WebSocket use. | Record app-server integration intent, schema expectations, policy expectations, and required evidence; do not start app-server processes, select live transports, authenticate WebSocket listeners, initialize JSON-RPC clients, create or resume threads, start or steer turns, manage event streams, handle overload retries, generate version-matched schemas, or prove app-server behavior from repository metadata. |
| Codex IDE extension runtime | IDE extension behavior depends on the installed Codex extension, VS Code-compatible editor host, signed-in session or API key state, active workspace and trust posture, shared Codex CLI configuration, selected model, sandbox and approval settings, open files, selected text range, Command Palette entry point, Add to Codex Thread or file tagging behavior, WSL or native execution setting where applicable, and optional cloud preview or continue-local workflow. | Record IDE-extension intent, context expectations, policy expectations, and required evidence; do not install or launch the extension, open or focus sidebars, select active workspaces or editors, choose open files or selected text, invoke IDE commands, tag files, select IDE models, reload extensions, authenticate editor sessions, preview cloud changes, continue local threads, or prove IDE behavior from repository metadata. |
| Codex SDK integrations | SDK-embedded execution depends on application code, SDK package version, Node.js or Python runtime, local Codex CLI or app-server runtime, API credentials or access tokens, thread lifecycle, sandbox presets, trace handling, and deployed environment policy. | Record SDK integration intent and required evidence; do not install SDK packages, provision runtimes, start app-server processes, initialize SDK clients, select credentials, create or resume SDK threads, choose live sandbox presets, deploy embedding applications, capture traces, or prove SDK behavior from repository metadata. |
| Plugin installation and activation | Plugin use depends on a configured marketplace source, installed plugin bundle, enabled state, workspace sharing policy, restart/discovery behavior, app authentication, MCP setup, and task-time invocation. | Export reviewable package and marketplace candidates; require installed plugin identity, enabled state, authentication/setup evidence, representative invocation, and known limitations before treating plugin runtime behavior as operational. |
| Codex Memories | Memories are opt-in runtime state controlled by Codex settings or per-thread controls and stored under the user's Codex home directory. | Record intended boundaries in `.metaflow/memory/*.json`; require enabled memory settings, thread-level control evidence, generated memory artifact review, and recall proof before treating memory behavior as operational. |
| Chronicle | Chronicle is opt-in Codex app runtime state on macOS that augments Memories with recent screen context. It depends on ChatGPT plan eligibility, Memories enablement, user consent, macOS Screen Recording and Accessibility permissions, pause or resume state, temporary screen-capture storage, local generated memory files, and prompt-injection risk controls. | Record Chronicle intent and required evidence; do not enable Memories, turn on Chronicle, grant macOS permissions, capture screen context, process screenshot frames or OCR text, create Chronicle memories, pause or resume Chronicle, or prove Chronicle recall behavior from repository metadata. |
| Appshots | Appshots are Codex app runtime attachments on macOS. They capture the frontmost window image and available text, depend on Screen & System Audio Recording and Accessibility permissions, attach to the current or recent Codex thread, and are stored locally in the session file. | Record Appshots intent and required evidence; do not create appshots, select or capture the frontmost window, grant macOS permissions, attach appshots to a thread, or prove appshot-thread behavior from repository metadata. |
| Record & Replay | Record & Replay is Codex app runtime state on macOS. It depends on Computer Use availability, user demonstration, observed app and window content, generated skill artifacts, replay environment, browser or Computer Use authority, and operator review. | Record workflow intent, reusable skill expectations, policy grants, and evidence requirements; do not start recordings, capture UI actions or window content, generate or refine skills, enable Computer Use, or prove replay behavior from repository metadata. |
| Import to Codex | Import to Codex is Codex app runtime state. It detects supported user and project setup, imports selected instructions, settings, skills, plugins, MCP, hooks, subagents, projects, and recent sessions, leaves existing setup unchanged, and flags plugins or connections needing follow-up setup. | Record import review expectations and target compatibility notes; do not launch the import flow, select external agent sources or items, migrate local user settings or sessions, authorize plugins or connectors, or prove imported setup behavior from repository metadata. |
| Model providers | Codex model-provider selection, including Amazon Bedrock, is user or environment runtime configuration. It depends on `~/.codex/config.toml`, local app or extension environment inheritance, AWS IAM or Bedrock API key authentication, AWS Region and model availability, provider permissions, and provider-specific feature limits. | Record provider intent and required evidence; do not select active providers, write user-global provider config or credential files, configure AWS authentication, grant model access, restart apps or extensions, or prove provider routing from repository metadata. |
| Non-interactive execution | `codex exec` runs Codex from scripts, CI, scheduled jobs, or other CLI pipelines. It depends on the active Codex CLI version, working Git repository, authentication method, sandbox and approval settings, stdin/output handling, JSON or output-schema settings, session resume state, and downstream artifact handling. | Record automation intent, policy expectations, structured output requirements, and required evidence; do not invoke `codex exec`, select live credentials, choose sandbox or approval posture, emit JSONL or schema-constrained output, resume sessions, satisfy repository trust checks, or prove scripted execution from repository metadata. |
| SDK runtime | The Codex TypeScript and Python SDKs control Codex from embedding applications, with Python using the local app-server runtime. SDK runs depend on SDK package version, language runtime, embedding application identity, credentials, thread start or resume behavior, sandbox presets or turn overrides, command/tool activity, traces or logs, and deployment environment. | Record SDK integration intent and required evidence; do not install SDK packages, provision Node.js or Python runtimes, start app-server processes, initialize SDK clients, select credentials, create or resume SDK threads, choose live sandbox presets, deploy embedding applications, capture traces, or prove SDK behavior from repository metadata. |
| Windows platform | Codex on Windows depends on the selected surface, native elevated or unelevated sandbox implementation, private desktop setting, administrator-approved setup, enterprise requirements, Windows version, ConPTY and `winget` availability, session sandbox read grants, WSL2 versus native execution, and repository location. | Record Windows platform intent and required evidence; do not select the effective sandbox, perform administrator setup, change enterprise requirements, grant session read directories, move repositories into WSL2, verify prerequisites, or prove sandbox enforcement from repository metadata. |
| Linux platform | Codex on Linux and WSL2 depends on the selected surface, Linux distribution, `bubblewrap` availability, user namespace support, AppArmor posture on affected Ubuntu versions, writable root policy, package-manager setup, repository location, and sandbox behavior. | Record Linux platform intent and required evidence; do not install `bubblewrap`, load AppArmor profiles, enable user namespaces, choose WSL distributions, grant runtime writable roots, move repositories into Linux-native paths, configure package repositories, or prove sandbox enforcement from repository metadata. |
| macOS platform | Codex on macOS depends on the selected surface, built-in Seatbelt sandbox, Codex app availability, macOS Privacy & Security permissions, local environment actions, platform-specific setup scripts, managed preferences, writable root policy, and sandbox behavior. | Record macOS platform intent and required evidence; do not grant Screen Recording or Accessibility permissions, install the Codex app, open app workspaces, configure MDM managed preferences, run local environment actions, change active privacy settings, or prove Seatbelt sandbox enforcement from repository metadata. |
| Local environments | Codex app local environments define project worktree setup scripts and top-bar actions, including platform-specific scripts for macOS, Windows, and Linux. | Record local setup/action intent and required evidence; do not open Codex app settings, select the active project directory, create or update app-local environment state, run setup scripts in new worktrees, start integrated-terminal actions, install dependencies, satisfy platform prerequisites, or prove local action behavior from repository metadata. |
| Browser Use and in-app browser | Browser Use depends on the Browser plugin, site approvals, browser state, optional Developer Mode, and the rendered page state available in the running Codex app. | Record browser task intent, target URL, approval scope, and visual validation evidence; do not treat repository metadata as proof of page interaction. |
| Chrome extension browser use | Chrome use depends on the Chrome plugin, extension installation, active Chrome profile, website allowlists, browser history permission, and signed-in account state. | Record Chrome task intent and required authority; require harness-native evidence before treating signed-in browser operation as supported. |
| Computer Use | Computer Use depends on plugin installation, operating system permissions, visible app/window state, app allow decisions, and user approval prompts. | Record desktop automation intent and policy grants; do not treat repository metadata as proof of GUI control, screen access, or app permission. |
| Sites hosting and deployment | Sites depends on the Sites plugin, hosted project provisioning, build compatibility, saved versions, audience settings, hosted secrets, and deployment approval. | Record hosting intent and validation evidence; do not create hosted project state or claim production deployment from repository metadata alone. |
| Remote MCP reachability | Codex supports Streamable HTTP MCP configuration, but reachable endpoints, TLS behavior, hosted-agent network policy, and remote executor behavior are runtime concerns. | Project supported config fields where managed, and keep reachability and tool-call proof as validation evidence. |
| OAuth MCP login | Codex supports OAuth metadata for MCP servers, but login, callback URLs, token handling, and account authorization are runtime concerns. | Project supported OAuth fields where managed, and keep login and callback proof as validation evidence. |
| Side-effecting MCP tools | MCP tools can read or change external systems, and approval behavior depends on runtime tool authority. Static metadata cannot grant authority safely. | Require policy grants, approval posture, bounded tool-call proof, and audit evidence before package or adapter claims are treated as operational. |
| Harness-native evaluation execution | Evaluation runs depend on the selected Codex runtime, repository checkout, model or agent identity, credentials, sandbox and tool policy, network access, scoring harness, and artifact retention. | Record evaluation intent and expected evidence in `.metaflow/evaluation/*.json`; require harness-native benchmark, reviewer-agent, smoke, CI, or hosted task evidence before treating runtime scoring as operational. |

## Not Technically Achievable By Repository Projection Alone

MetaFlow does not claim the following outcomes from generated repository files:

- Creating or approving ChatGPT workspace connectors.
- Installing Slack, Linear, GitHub, or other Codex-connected apps in a workspace.
- Installing, approving, connecting, or proving Slack, Linear, GitHub, ChatGPT
  workspace, GitHub Copilot, or Agent HQ app connectors from repository metadata
  alone.
- Spawning subagents, selecting custom agents at runtime, managing active agent
  threads, satisfying interactive approvals, or proving custom-agent execution
  from repository metadata alone.
- Creating or updating scheduled automations, keeping the Codex app or host
  runtime available, selecting automation worktrees, managing automation inbox
  or archive state, or proving scheduled background execution from repository
  metadata alone.
- Signing in users, creating or storing API keys or access tokens, connecting
  GitHub or workspace accounts, satisfying organization SSO or admin policy, or
  proving authenticated runtime behavior from repository metadata alone.
- Granting runtime permissions, approving boundary-crossing actions, selecting
  effective managed requirements, running auto-review decisions, enforcing OS
  sandboxing, or proving permission behavior from repository metadata alone.
- Assigning enterprise roles, applying cloud-managed requirements, writing
  device-level policy, selecting effective governance layers, changing
  organization policy, approving marketplace sources, enforcing feature pins,
  or proving enterprise policy behavior from repository metadata alone.
- Creating Codex-managed worktrees, copying ignored files into them, copying
  source symlinks, overwriting existing files, or proving `.worktreeinclude`
  copy behavior from repository metadata alone.
- Opening Codex review panes, running `/review`, enabling GitHub code review
  settings, triggering `@codex review`, posting pull request reviews, reading
  pull request feedback, or proving review-feedback handling from repository
  metadata alone.
- Creating Codex Cloud environments or setting cloud task secrets.
- Creating, selecting, configuring, or proving Codex Cloud or GitHub-hosted
  agent environments from repository metadata alone.
- Enabling Codex Memories, generating memory files, authorizing per-thread
  memory use, or proving memory recall behavior.
- Enabling Chronicle, granting macOS Screen Recording or Accessibility
  permissions, capturing screen context, processing Chronicle screenshot frames
  or OCR text, creating Chronicle memories, pausing or resuming Chronicle, or
  proving Chronicle recall behavior from repository metadata alone.
- Creating Appshots, selecting or capturing the frontmost window, granting
  macOS Screen & System Audio Recording or Accessibility permissions, attaching
  appshots to the intended Codex thread, or proving appshot-thread behavior
  from repository metadata alone.
- Recording UI actions or window content, generating or refining Record &
  Replay skills, enabling Computer Use, or proving replay behavior from
  repository metadata alone.
- Launching the Codex import flow, selecting external agent sources or items,
  importing user settings, projects, or sessions, authorizing imported plugins
  or connections, or proving imported setup behavior from repository metadata
  alone.
- Selecting active Codex model providers, writing user-global provider config or
  credential files, configuring AWS IAM or Bedrock API keys, choosing AWS
  Regions, granting model access, restarting apps or extensions, or proving
  provider routing from repository metadata alone.
- Invoking `codex exec`, selecting live non-interactive credentials, choosing
  sandbox or approval posture, streaming JSONL, writing schema-constrained
  output, resuming sessions, satisfying repository trust checks, or proving
  scripted Codex execution from repository metadata alone.
- Installing Codex SDK packages, provisioning Node.js or Python runtimes,
  starting app-server processes, initializing SDK clients, selecting
  credentials, creating or resuming SDK threads, choosing live sandbox presets,
  deploying embedding applications, capturing traces, or proving SDK behavior
  from repository metadata alone.
- Starting Codex app-server processes, selecting stdio, WebSocket, Unix socket,
  or disabled transports, authenticating WebSocket listeners, initializing
  JSON-RPC clients, creating or resuming threads, starting or steering turns,
  handling event streams, managing overload retries, generating version-matched
  schemas, or proving app-server behavior from repository metadata alone.
- Installing or launching the Codex IDE extension, opening or focusing
  sidebars, selecting active workspaces or editors, choosing open files or
  selected text, invoking IDE commands, adding editor selections to threads,
  tagging files in prompts, selecting IDE models, reloading extensions,
  configuring WSL execution in VS Code settings, authenticating editor
  sessions, previewing cloud changes, continuing local threads, or proving IDE
  extension behavior from repository metadata alone.
- Selecting native Windows sandbox implementation, performing
  administrator-approved sandbox setup, changing enterprise requirements,
  granting session sandbox read directories, moving repositories into WSL2,
  verifying Windows version prerequisites, or proving Windows sandbox
  enforcement from repository metadata alone.
- Installing `bubblewrap`, loading AppArmor profiles, enabling Linux user
  namespaces, choosing active WSL distributions, granting runtime writable
  roots, moving repositories into Linux-native paths, configuring package
  repositories, or proving Linux sandbox enforcement from repository metadata
  alone.
- Granting macOS Screen Recording or Accessibility permissions, installing the
  Codex app, opening workspaces in the app, configuring MDM managed preferences,
  running local environment actions, changing active macOS privacy settings, or
  proving Seatbelt sandbox enforcement from repository metadata alone.
- Opening the Codex app settings pane, selecting project local environments,
  creating or updating app-local environment state, running setup scripts in new
  worktrees, starting integrated-terminal actions, installing dependencies,
  satisfying platform prerequisites, or proving local action behavior from
  repository metadata alone.
- Authenticating a user's GitHub CLI, Codex account, Slack account, Linear
  account, MCP OAuth session, or marketplace plugin install.
- Granting shell, browser, network, credential, memory, or external-service
  authority merely because a package manifest references those capabilities.
- Installing, enabling, sharing, authenticating, or invoking Codex or GitHub
  Copilot plugins from repository metadata alone.
- Installing or enabling Browser, Chrome, Computer Use, or Sites plugins and
  their app, website, OS, hosting, or workspace permissions.
- Executing harness-native evaluations, benchmark tasks, reviewer-agent
  scoring, hosted traces, or runtime scoring workflows.
- Pairing remote devices, keeping hosts awake or online, configuring SSH hosts,
  installing or authenticating remote Codex, exposing host tools or plugins,
  approving remote actions, or proving remote task behavior from repository
  metadata alone.
- Proving hosted Codex Cloud, Slack, Linear, GitHub review, remote connection, remote MCP
  reachability, OAuth MCP login, side-effecting MCP behavior, browser
  interaction, Chrome profile operation, desktop automation, Sites deployment,
  or harness-native evaluation execution without a harness-native run.

These are operator-owned or harness-owned runtime states. MetaFlow records the
intent and validation requirements, then leaves the authority transition to the
target harness and the responsible user or administrator.

## Validation Expectations

Static projection support and runtime support use different evidence.

| Claim type | Evidence |
| --- | --- |
| File projection works | Engine, CLI, extension, and synchronizer tests showing the generated files, managed state, drift behavior, and conflict protection. |
| Codex can discover the generated file | Local Codex CLI, IDE extension, or app smoke evidence against the generated workspace. |
| Codex custom-agent activation works | A Codex app or CLI subagent run that explicitly spawns the named agent and shows the generated `.codex/agents/*.toml` instructions in effect. Static TOML projection and `codex debug prompt-input` inspection are not sufficient by themselves. |
| Agent runtime works | Selected subagent or custom agent, spawned thread identity, inherited sandbox and approval posture, runtime overrides, tool activity, result, token or cost posture, and known limitations. |
| Automation runtime works | Automation identity, schedule, target project or thread, local versus worktree execution mode, sandbox and approval posture, plugins or skills used, run status, findings or archive result, token or cost posture, and known limitations. |
| Authentication runtime works | Authenticated user or service identity, workspace or organization context, auth method, token or credential storage posture, connected account state, entitlement or policy posture, representative authenticated operation, audit or billing posture, and known limitations. |
| Permission runtime works | Active permission profile or sandbox mode, approval policy, reviewer mode, managed requirements source, effective writable roots, network posture, command or tool approval result, side-effecting app or MCP approval behavior, protected path behavior, and known limitations. |
| Enterprise policy runtime works | Effective managed configuration or organization policy source, assigned role or group, policy precedence layer, managed requirements or host policy identifier, constrained approval and sandbox posture, web search and network posture, MCP allowlist, plugin marketplace policy, feature pins, command-rule restrictions, audit posture, fleet-version compatibility, representative policy enforcement result, and known limitations. |
| Worktree include behavior works | Codex app version, project Git state, selected branch, `.gitignore` and `.worktreeinclude` content, created managed worktree path, copied ignored file inventory, skipped symlink or overwrite behavior, automatic `AGENTS.override.md` copy posture, and known limitations. |
| Review runtime works | Selected review surface, Git repository state, diff scope, PR branch and base, GitHub CLI or connector authentication, code-review setting state, review trigger, inline or PR comments loaded, posted findings or fixes, and known limitations. |
| Remote connection runtime works | Connected host identity, controlling device identity, pairing and workspace authorization, host availability, SSH host configuration where applicable, remote project path, host-provided files, tools, plugins, MCP, browser, Computer Use posture, approval behavior, representative remote task, result, and known limitations. |
| Chronicle runtime works | Codex app and macOS host identity, ChatGPT plan eligibility, Memories setting state, Chronicle opt-in and consent state, Screen Recording and Accessibility permission posture, pause or resume state, temporary screen-capture storage posture, Chronicle memory artifact review, representative recall behavior, prompt-injection risk controls, and known limitations. |
| Appshots runtime works | Codex app and macOS host identity, Appshots hotkey or trigger path, frontmost app and window scope, Screen & System Audio Recording and Accessibility permission posture, captured image and available text review, thread destination behavior, sensitive-content review, and known limitations. |
| Record & Replay runtime works | Codex app version, macOS and region eligibility, Computer Use availability and policy, recorded workflow scope, generated skill artifact, replay environment, representative replay result, sensitive-data review, and known limitations. |
| Import runtime works | Codex app version, imported source agents and items, project and user setup inventory, generated Codex destinations, plugin or connector follow-up setup, reviewed permissions, tool restrictions, hooks, MCP auth, prompts, subagents, representative imported project or thread behavior, and known limitations. |
| Model provider runtime works | Active provider from Codex status, provider config source, selected model, AWS Region or provider endpoint, credential source, identity and permission posture, local app or extension environment inheritance, representative request behavior, unavailable hosted features, and known limitations. |
| Non-interactive runtime works | Codex CLI version, command invocation, working directory and Git repository state, authentication method and credential scope, sandbox and approval settings, JSON or output-schema configuration, stdin and output handling, session resume posture, representative command or tool activity, produced artifacts, exit status, audit or billing posture, and known limitations. |
| SDK runtime works | SDK package and version, language runtime, embedding application identity, Codex CLI or app-server runtime source, authentication method and credential scope, thread start or resume behavior, sandbox preset or turn override, representative SDK call, command or tool activity, trace or log posture, deployment environment, exit or error handling, and known limitations. |
| App-server runtime works | Codex CLI version, app-server command invocation, selected transport, listener binding and authentication posture, client identity, initialize/initialized handshake, thread start or resume behavior, turn start or steering behavior, event-stream handling, schema version, overload or retry handling, sandbox and approval posture, representative command or tool activity, exit or error handling, and known limitations. |
| IDE extension runtime works | Editor host and version, Codex extension version, active workspace and project trust, sign-in method and credential scope, shared config source, selected model, sandbox and approval posture, open file list, selected text range, command entry point, Add to Codex Thread or file tagging behavior, MCP, plugin, and skill discovery posture, cloud preview or continue-local behavior, WSL or native execution setting where applicable, representative IDE task, result, and known limitations. |
| Windows platform runtime works | Codex surface, Windows version, native or WSL2 execution mode, selected sandbox implementation, private desktop setting, administrator setup posture, enterprise requirement constraints, session read-directory grants, repository location, representative sandboxed command behavior, and known limitations. |
| Linux platform runtime works | Codex surface, Linux distribution or WSL2 identity, `bubblewrap` availability, user namespace and AppArmor posture, writable root policy, repository location, package-manager prerequisite state, representative sandboxed command behavior, and known limitations. |
| macOS platform runtime works | Codex surface, Codex app availability, Seatbelt sandbox behavior, macOS Privacy & Security permission posture, writable root policy, local environment action behavior, managed preference state, representative sandboxed command behavior, and known limitations. |
| Local environment runtime works | Codex app version, selected project directory, checked-in `.codex` environment file posture, setup script content, platform-specific script selection, created worktree path, dependency and cache state, action identity, integrated-terminal execution result, host credential exposure posture, representative setup/action behavior, and known limitations. |
| Codex Cloud environment works | A Codex-hosted task showing the selected hosted environment, repository checkout, setup script result, dependency/cache state, secret and environment-variable posture, internet-access setting, sandbox policy, task result, cost or audit limits, and known limitations. |
| App connector works | Installed connector or app identity, workspace or organization approval, linked user account, connected repository or channel, posting and data-sharing policy, representative connector task, result, and known limitations. |
| Codex Cloud or channel delegation works | A Codex-hosted task or connector run showing the selected environment, repository, task result, and known limitations. |
| MCP runtime works | Codex MCP startup, remote endpoint reachability, login where applicable, tool listing, tool approval behavior, and at least one target tool call in the intended environment. |
| Package marketplace readiness | Reviewable marketplace candidate output from `metaflow export-package-marketplace` or `MetaFlow: Open Package Marketplace Report`, plus package policy grants, runtime validation records, and operator acceptance. |
| Plugin runtime works | Installed plugin identity and version, enabled state, marketplace source, app or MCP authentication state, restart/discovery evidence, representative invocation, result, and known limitations. |
| Tool runtime works | Tool manifest review, policy grant approval, target runtime configuration, approval behavior, and at least one bounded tool call in the intended environment. |
| Codex memory runtime works | Enabled Codex memory settings, thread-level memory controls, generated memory artifact review, recall evidence, and known retention or sharing limits. |
| Browser, Chrome, Computer Use, or Sites runtime works | Installed plugin or app state, approval scope, target site, app, or hosted project identity, representative operation, result, and known limitations. |
| Evaluation runtime works | Selected Codex surface, repository checkout, model or agent identity, sandbox and tool policy, validation command, benchmark or scoring result, artifacts, traces where available, cost or data limits, and known limitations. |

For the package maintainer workflow, see
[Codex Package Maintainer Guide](CODEX-PACKAGE-MAINTAINER-GUIDE.md).
For command, MCP, HTTP, and manual tool authority, see
[Codex Tool Authority Guide](CODEX-TOOL-AUTHORITY-GUIDE.md).

## Source Map

- Codex skills: <https://developers.openai.com/codex/skills>
- Codex project instructions: <https://developers.openai.com/codex/guides/agents-md>
- Codex authentication: <https://developers.openai.com/codex/auth>
- Codex access tokens: <https://developers.openai.com/codex/enterprise/access-tokens>
- Codex approvals and sandboxing: <https://developers.openai.com/codex/agent-approvals-security>
- Codex permissions: <https://developers.openai.com/codex/permissions>
- Codex MCP: <https://developers.openai.com/codex/mcp>
- Codex cloud environments: <https://developers.openai.com/codex/cloud/environments>
- Codex GitHub review: <https://developers.openai.com/codex/integrations/github>
- Codex Slack integration: <https://developers.openai.com/codex/integrations/slack>
- Codex Linear integration: <https://developers.openai.com/codex/integrations/linear>
- Codex plugins: <https://developers.openai.com/codex/plugins>
- Codex subagents: <https://developers.openai.com/codex/subagents>
- Codex automations: <https://developers.openai.com/codex/app/automations>
- Codex GitHub Action: <https://developers.openai.com/codex/github-action>
- Codex app-server: <https://developers.openai.com/codex/app-server>
- Codex SDK: <https://developers.openai.com/codex/sdk>
- Codex in-app browser: <https://developers.openai.com/codex/app/browser>
- Codex Chrome extension: <https://developers.openai.com/codex/app/chrome-extension>
- Codex Computer Use: <https://developers.openai.com/codex/app/computer-use>
- Codex Appshots: <https://developers.openai.com/codex/appshots>
- Codex Amazon Bedrock provider: <https://developers.openai.com/codex/amazon-bedrock>
- Codex Windows platform: <https://developers.openai.com/codex/windows>
- Codex sandboxing: <https://developers.openai.com/codex/concepts/sandboxing>
- Codex Sites: <https://developers.openai.com/codex/sites>
