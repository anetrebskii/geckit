# Feature Specification: Manager and Telegram

**Feature Branch**: `feature/011-manager-telegram`, local working tree.

**Created**: 2026-10-17

**Status**: First version implemented and locally verified on 2026-10-17, including the enabled-provider and Telegram-only corrections. Telegram native approvals, message normalization and guided personal-bot setup implemented and locally verified on 2026-10-19. Desktop Manager inspection implemented and locally verified following Alex's 2026-10-19 request. Live integration and full long-term scope remain unverified; not released.

**Input**: "Set up manager and use Telegram bot. Prepare spec, UX and UI." Earlier constraints: one main session, delegation of deep execution to workers, and one place for Alex's conversation. Revisions: select assistant and model; automatically manage all projects and files/projects through GeckIt CLI; use any enabled provider. Manager is Telegram-only; Desktop retains setup/status/recovery, with no Desktop or phone Manager conversation. Latest requests: approve supported native worker/Manager requests through Telegram, remove empty message spacing, improve personal-bot setup, and deliberately open the current Manager session from the desktop bottom bar for inspection.

## User Scenarios & Testing *(mandatory)*

### First-version implementation boundary

Alex requested a first version on 2026-10-17, then clarified that Manager is a special GeckIt session and must support every enabled provider. V1 uses the selected builtin or library provider's normal runtime, authentication, tools and permissions, with Manager instructions and dedicated UX. Application coordination uses validated GeckIt CLI requests executed by the host; instructions do not constitute a universal tool sandbox. V1 defaults to Automatic delegation and also supports an approval policy for each new worker. Unsupported advanced CLI domains are reported explicitly by capability discovery instead of being simulated. Real assistant/bot acceptance is distinct from offline tests and renderer fixtures. [Implementation plan](plan.md) and [tasks](tasks.md) track this boundary.

### User Story 1 - Set up one manager (Priority: P1)

Alex chooses an assistant and its model in Desktop Settings, then talks to one persistent Manager through Telegram. It automatically manages all current and future GeckIt projects through the GeckIt CLI. The manager may perform requested application, project and file management; workers do deep research and implementation.

**Why this priority**: Configures the session that will coordinate through Telegram.

**Independent Test**: Choose an assistant and nondefault model in Desktop Settings, enable Manager and pair Telegram. Manage work across two projects through the bot; no Manager chat appears in ordinary Desktop/phone navigation; the deliberate Desktop bottom-bar entry opens current-session inspection without starting work.

**Acceptance Scenarios**:

1. **Given** no manager, **When** Alex opens Settings > Manager, selects an available assistant and model, and presses Enable manager, **Then** one internal Manager session is configured with those settings and All projects scope, including future additions; Settings stays open with Telegram setup/status.
2. **Given** a configured manager, **When** Alex asks for deep implementation or investigation, **Then** it delegates a self-contained assignment and completion condition. Requested GeckIt administration and file/project management may be performed directly through the CLI.
3. **Given** a manager turn, **When** it invokes a supported GeckIt CLI operation for session, project, file or app management, **Then** the operation runs under existing permissions and its outcome is recorded. The structured CLI gateway rejects arbitrary commands; normal provider permissions remain authoritative.
4. **Given** an enabled assistant, **When** Alex configures Manager, **Then** its normal session runtime and model discovery are used with Manager instructions. Disabled or unavailable selections show recovery without silent substitution.
5. **Given** an existing manager, **When** Alex reopens Settings or changes the current board profile, **Then** the same logical manager, selected model and All projects access remain; board filters never restrict discovery. Settings shows operational status and recovery, without opening the backing conversation.

### User Story 2 - Coordinate workers from one conversation (Priority: P1)

Alex gives outcomes, changes priorities and answers questions through the Telegram Manager. The manager starts or follows up with the appropriate worker and brings back concise results with evidence.

**Why this priority**: Removes the need to visit each task conversation.

**Independent Test**: Run two independent tasks, interrupt one with a correction, answer its clarification in Manager and receive the two results there.

**Acceptance Scenarios**:

1. **Given** Manager is enabled with automatic delegation, **When** Alex requests work in any GeckIt project, **Then** the manager starts or queues a worker without another start confirmation and reports what it delegated.
2. **Given** Approve new sessions, **When** the manager needs a new worker, **Then** a proposed assignment waits for Alex's Start or Refuse decision; no worker starts first.
3. **Given** a managed task already exists, **When** Alex corrects or stops that work, **Then** the manager delivers the correction or stop to that worker once and reports acceptance, queueing or failure accurately.
4. **Given** an unrelated existing session, **When** the manager proposes reusing it, **Then** Alex confirms attaching it before it receives manager instructions. Repeated work already managed here reuses its worker when appropriate.
5. **Given** two workers need answers, **When** Alex replies to one question, **Then** only its originating question receives the answer. An ambiguous unthreaded reply asks which task Alex means.
6. **Given** a worker says its work is finished, **When** evidence or the completion condition is missing, **Then** the manager requests evidence or delegates verification; it does not invent success. Verified delivery goes to In review until Alex accepts it.

### User Story 3 - Connect a personal Telegram bot (Priority: P1)

Alex connects a dedicated bot to this computer and confirms the one private Telegram account allowed to use it. Telegram is the sole user conversation with Manager; Desktop provides trusted setup and recovery.

**Why this priority**: Makes the manager reachable away from GeckIt without another task UI.

**Independent Test**: Connect a test bot, confirm the account on desktop, send a text request in Telegram and receive its reply there; Desktop Settings shows current status, with no Manager chat.

**Acceptance Scenarios**:

1. **Given** a configured manager, **When** Alex supplies a valid bot token, **Then** GeckIt shows the verified bot identity and a pairing action; the token is not displayed again or exposed to the manager or workers.
2. **Given** pairing is open, **When** a Telegram account follows the pairing link and presses Start, **Then** GeckIt shows the candidate's display name and account identifier for desktop confirmation; no task may run before confirmation.
3. **Given** pairing is expired or cancelled, **When** the old link is used, **Then** it grants no access and Alex can create a new link.
4. **Given** a confirmed account, **When** another account or a group sends a message or presses an action, **Then** no task content is disclosed and no task action runs.
5. **Given** the token is invalid, revoked or already used by another receiver, **When** connection fails, **Then** the failure is visible with a recovery action; another service's bot configuration is not changed silently.

### User Story 4 - Delegate and decide through Telegram (Priority: P1)

Alex sends a text task or progress question and receives compact updates, task links and actionable questions in the private bot chat.

**Why this priority**: Completes the promised remote management workflow.

**Independent Test**: Submit a task, approve a proposed worker, answer a worker question, read a completion result and stop work through the paired bot.

**Acceptance Scenarios**:

1. **Given** the computer is online and the manager is enabled, **When** Alex sends a text message, **Then** it is recorded once in Manager with Telegram as its origin; an acknowledgement distinguishes receipt from completion.
2. **Given** a simple question or proposed worker start, **When** Alex answers using a bound button or Telegram Reply, **Then** the durable Manager decision resolves once. A duplicate or stale answer cannot act again.
3. **Given** a supported native permission on a managed worker or current Manager session, **When** it arrives, **Then** Telegram shows its identity, full relevant detail and native-equivalent actions. Only the paired user can answer the exact current request; the model cannot approve it. Unsupported typed/URL forms direct Alex to the ordinary GeckIt form.
4. **Given** an explicit status request, **When** the manager answers, **Then** the summary distinguishes working, queued, waiting for Alex, blocked and In review, and links to the evidence available for each result.
5. **Given** a voice note, image or other unsupported attachment, **When** it arrives, **Then** the bot explains that this version accepts text; it does not execute a guess from the attachment.
6. **Given** a result has no public link, **When** it is summarized in Telegram, **Then** the text identifies the task and where to open it in GeckIt. Local file paths are not presented as working remote links and private files are not uploaded automatically.

### User Story 5 - Recover without losing task ownership (Priority: P1)

The manager retains goals, ownership, decisions, pending questions and summaries across conversation compaction and computer restarts. Alex can pause coordination without stopping workers.

**Why this priority**: A single point of contact must not depend on one transcript fitting forever.

**Independent Test**: Restart with a queued request, running worker and pending question, then deliver repeated events and verify no duplicate work or answer.

**Acceptance Scenarios**:

1. **Given** managed work exists, **When** Manager is resumed after restart or context compaction, **Then** it restores current ownership, goals, decisions, pending questions and result references without loading every worker transcript.
2. **Given** duplicate messages, worker events or action presses, **When** they are processed again, **Then** they do not create a duplicate worker, follow-up or decision. Uncertain delivery is shown and reconciled before resend.
3. **Given** Pause manager, **When** a worker finishes, **Then** the result is retained but no new manager action is issued; existing workers continue. Resume reconciles current state before acting.
4. **Given** local work was interrupted by shutdown, **When** GeckIt restarts, **Then** existing interruption/recovery rules apply; the manager cannot claim the worker ran while the computer was offline.
5. **Given** received messages are old after an outage, **When** GeckIt reconnects, **Then** old work instructions await Alex's confirmation; old status questions can be answered with current state.

### User Story 6 - Change or revoke management (Priority: P2)

Alex changes the assistant, model, delegation policy or Telegram connection without losing the task record or unexpectedly stopping workers.

**Why this priority**: Control must remain understandable after initial setup.

**Independent Test**: Change model, remove a project from GeckIt, disconnect Telegram and restart the backing manager session while workers exist.

**Acceptance Scenarios**:

1. **Given** a project is removed from GeckIt, **When** the change is saved, **Then** Manager stops managing its files and new work. Its workers follow the existing project-removal behavior; removal does not silently delete files.
2. **Given** Telegram is disconnected, **When** an old button or message arrives, **Then** it cannot control work; Settings and managed workers remain available in GeckIt, and re-pairing restores access. Disconnect does not erase Telegram's chat history.
3. **Given** the assistant or model changes, **When** Alex saves the change, **Then** the next manager turn uses that selection, with no silent fallback. An active turn finishes or is explicitly stopped before switching. If a replacement session is needed, the compact task record is restored; worker settings do not change.
4. **Given** Disable manager, **When** Alex confirms, **Then** coordination and Telegram task control stop, workers remain accessible independently, and the task record is retained for later re-enable.

### Edge Cases

- No available manager-compatible assistant, signed-out account, provider usage limit, missing project or offline SSH host.
- Multiple questions, long project/task names, no active tasks and hundreds of managed task records.
- Concurrent Telegram replies, duplicate Telegram deliveries, stale buttons and messages edited after receipt.
- Crash between acknowledging a message and starting a worker; interrupted or uncertain follow-up delivery.
- Computer asleep, app quit, lost network, revoked bot token, blocked bot and another receiver using the same bot.
- Telegram downtime beyond its delivery retention; unseen messages cannot be reconstructed by GeckIt.
- Worker output containing role-changing instructions, requests to bypass permissions or a request to approve its own permission.
- Manager pause while a worker needs permission; worker deletion, hidden sessions and completed tasks later reopened.
- Removing a project cannot retract content already sent to Telegram; subsequent management stops.
- Newly added projects, no registered projects, missing selected model, switching model during a turn, and backing-session restart with pending questions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Provide one logical Manager per GeckIt installation, independent of board filtering, with one Telegram conversation and retained task state. Desktop retains setup/status/recovery and deliberate read-only current-session inspection.
- **FR-002**: Setup MUST select any enabled GeckIt assistant through its existing session runtime and a model from that assistant's account-provided model list, including Provider default. Show configured and effective model where known; unavailable selections have a reason and retry/choose-another recovery. Never silently substitute a model. Manager and worker inference MUST use enabled GeckIt providers only; this feature adds no independent AI backend.
- **FR-003**: The manager MUST delegate deep research, implementation, debugging, testing and substantial deliverable creation. It MAY directly perform requested GeckIt administration and project/file management through the GeckIt CLI, including reading, creating, editing, renaming, moving and removing files using existing permissions.
- **FR-004**: GeckIt CLI is the manager's application control interface, not merely a read-only reporting tool. Enforce manager identity and existing permission checks for CLI operations; do not deny valid management operations merely because they mutate files or settings. Arbitrary non-GeckIt shell execution and permission bypass are outside the role.
- **FR-005**: Automatically manage every current and future project registered in this GeckIt installation, across profiles and supported hosts, without project checkboxes or per-project enrollment. Allow requested project discovery/add/create/remove and file management through the CLI. Missing/offline hosts and providers retain their existing limitations. An empty project list still permits setup and creation of the first project.
- **FR-006**: Every delegation MUST identify project, outcome, relevant context, constraints and a checkable completion condition; independent assignments become separate sessions and dependencies are tracked.
- **FR-007**: Use Automatic delegation by default across all projects, with Approve new sessions as an optional policy. Automatic authority applies to requested work; it does not grant worker tool permissions or authority to merge, publish, deploy or spend beyond Alex's existing authorization.
- **FR-008**: Reuse managed sessions when appropriate; attach unrelated existing sessions only with Alex's confirmation. Record durable manager origin and worker identity; ordinary worker navigation must not open the hidden Manager session.
- **FR-009**: Observe worker completion, failure, questions, queue state and interruption automatically; wake the manager for actionable events without repeatedly asking an idle model to check.
- **FR-010**: Produce compact, evidence-linked results; retain In review until Alex accepts completion. Missing evidence MUST trigger worker follow-up or delegated verification.
- **FR-011**: Bind questions and answers to their originating task and request; stale or duplicate actions MUST have no new effect, and ambiguous answers MUST be clarified.
- **FR-012**: Existing worker permission rules remain authoritative. Supported permissions and empty-field elicitation MUST be answerable by the paired user through Telegram with their native approval scopes. Validate current request identity/content, managed ownership, provider access and existing guard checks at dispatch; duplicate, changed, resolved, cross-session and revoked actions have no approval effect. Unsupported typed/URL forms direct Alex to GeckIt. The manager model and CLI MUST NOT answer permissions on the user's behalf.
- **FR-013**: Connect a dedicated user-owned Telegram bot, show its verified identity, and store its token using protected operating-system credential storage; never place it in settings, prompts, task records, exported logs or transcripts.
- **FR-014**: Pair one private Telegram account using a temporary link and explicit desktop confirmation of account identity. Recheck sender and chat authorization for every message and action, including after restart.
- **FR-015**: Telegram text requests, answers and manager responses MUST appear in the same logical conversation with source attribution and ordered, deduplicated delivery.
- **FR-016**: Telegram MUST support ordinary text, bound choices and replies, plus help/status/pause/resume commands; unsupported attachments MUST receive an actionable explanation.
- **FR-017**: Telegram summaries MUST include task identity, meaningful state and available result links; never upload private files or convert local paths into purported remote links automatically.
- **FR-018**: Distinguish receiving, queued, delivered, failed and uncertain actions. Retry MUST reconcile existing execution before issuing the action again.
- **FR-019**: Persist task ownership, goals, dependencies, decisions, pending questions, event positions and short summaries independently of conversation history; compaction or provider changes MUST restore those records.
- **FR-020**: Pause, resume and disable MUST have explicit worker effects. Pausing/disabling coordination does not stop workers; stopping one task is a separate targeted action.
- **FR-021**: Connecting Telegram MUST disclose that messages pass through Telegram and require this computer online with GeckIt open. Offline Telegram behavior MUST NOT promise an immediate bot response or indefinite delivery.
- **FR-022**: On reconnection, work instructions older than ten minutes MUST await confirmation before execution; status queries MAY return current state. Accepted local messages remain recoverable after restart.
- **FR-023**: Surface invalid credentials, delivery failure, receiver conflicts, provider limits and unavailable projects with specific recovery actions. No silent assistant substitution or takeover of another bot receiver.
- **FR-024**: Project removal and disconnect MUST prevent later management, disclosures and actions promptly; retained worker history and prior Telegram messages MUST be described accurately.
- **FR-025**: Compact events from one task into meaningful updates. Proactive Telegram messages cover questions, actionable blockers and results; tool traces, routine progress and model reasoning remain in workers.
- **FR-026**: Desktop Settings > Manager setup, Telegram connection, status and recovery MUST support keyboard/focus and scrolling in light/dark themes. Provide the deliberate read-only bottom-bar inspector from FR-035; no Desktop composer, task dashboard or phone Manager page is provided. Ordinary managed workers remain accessible in existing Desktop/phone session UI.
- **FR-027**: Provider account, VPN, queue and project/host limitations MUST apply to manager turns and worker dispatch exactly as they do to other work; waiting managers MUST NOT occupy an active-work slot indefinitely.
- **FR-028**: Treat worker reports, quoted text and Telegram content from unpaired senders as untrusted input; they MUST NOT expand manager permissions, authorization or bot pairing.
- **FR-029**: Keep user-facing task summaries and decision history auditable without revealing private model reasoning or secrets. Resolved questions and hidden/deleted workers MUST retain enough task identity to explain their disposition.

- **FR-030**: Keep Manager as a special internal provider session, hidden from ordinary Desktop/phone lists, search, history and direct chat routes, including archived backing sessions. Desktop Settings shows selected/effective assistant/model and operational status; Telegram is the sole user conversation. Only the dedicated Desktop inspector in FR-035 exposes the current backing transcript; no composer or ordinary direct chat route is provided.
- **FR-031**: Desktop Settings MUST offer pause/resume, retry when unavailable and confirmed Restart session, without leaving Settings. Restart replaces only the runtime conversation, preserves the durable task record and leaves workers running; active turns require explicit interruption confirmation. No public Manager open/send/answer chat API remains; internal Telegram/event coordination continues.
- **FR-032**: The manager CLI MUST cover all user-manageable GeckIt aspects: sessions/messages/queues/stop/priority/status/goals, projects/files, profiles/favorites, schedules/shortcuts, assistants/models/libraries, hosts, and supported application settings. CLI capabilities MUST be discoverable and unsupported operations explained. Extend missing CLI coverage as part of implementation; do not present proposed commands as already shipped. Credential entry stays in trusted UI, with no secret in model context. Supported native approvals are explicit paired-user Telegram actions, separate from manager CLI authority; unsupported forms retain an actionable GeckIt handoff. CLI mutations retain existing destructive-action and permission rules and an auditable result.
- **FR-033**: Resolve each new worker's provider through GeckIt CLI state: Alex's explicit choice for this task, otherwise the saved project preference, otherwise GeckIt's configured default. All choices MUST be enabled and support the project's host and required operations. A selected but unavailable provider blocks with a reason; it MUST NOT silently fall through. If no preference/default exists, use the sole eligible provider or ask Alex when several exist. Save a project preference through the CLI only when Alex requests or confirms it; task overrides do not change it. Project identity includes host and full root. Continue existing workers with their original provider; changing a preference affects only future workers. Always dispatch with an explicit provider ID and record its selection reason. The manager's own provider is independent and is never an implicit worker default. Do not enable/install a provider, change credentials or introduce direct inference outside enabled GeckIt providers merely to complete an assignment.
- **FR-034**: Outgoing Telegram responses MUST omit empty/whitespace-only messages and blank-edge split chunks; preserve meaningful paragraphs and code indentation. Personal-bot setup MUST guide official BotFather creation, masked token entry, private pairing and exact account confirmation with cancellation, errors and retry. A shared bot requires a separately configured hosted routing service; never distribute a shared bot token among client installations.

- **FR-035**: Provide a deliberate desktop bottom-bar entry to inspect the current Manager backing session with its actual transcript, assistant/model, identity and live state. Inspection must not start work, send messages, answer permissions or change settings. Retain ordinary worker selection/drafts, keyboard dismissal/focus restoration, bounded transcript rendering and current-session lifecycle safety. No-session entry opens Manager Settings; retained disabled history is inspectable. Archived Manager sessions stay outside public discovery; no phone inspection path is introduced. This supersedes the earlier ban on all desktop inspection while keeping Telegram as the primary task conversation.

### Key Entities *(include if feature involves data)*

- **Manager**: One logical coordinator, assistant/model selection, All projects access, delegation policy and lifecycle state; its transcript is replaceable while its identity and task record persist.
- **Managed task**: User outcome, selected project, worker/provider identity and selection reason, completion condition, dependencies, current state, summary and evidence references.
- **Project provider preference**: Optional user-approved enabled-provider ID, saved through GeckIt CLI for a host-qualified project root; absent means inherit GeckIt's configured default for new workers.
- **Decision**: Task-bound question, allowed answer shape, originating request, waiting/resolved state and the source of the accepted answer.
- **Telegram connection**: Dedicated bot identity, protected credential reference, confirmed account and private chat, pairing state and connection health.
- **Delivery record**: Message/event identity, source, accepted order, task binding and known or uncertain action/delivery outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With an available assistant and a bot token ready, complete setup and verified private-account pairing within five minutes, without editing a file or using a terminal.
- **SC-002**: Complete a trial of three independent tasks across two projects, including one correction, one worker question, one stop and a project added after manager setup, entirely through Telegram without opening a worker except for unsupported typed/URL forms explicitly requiring GeckIt; include a native Computer Use approval through Telegram.
- **SC-003**: Through Manager, create a project and file, rename/move/edit that file and change a task goal through the GeckIt CLI; each outcome matches the UI and activity record. Manager role instructions direct application control through GeckIt CLI; structured gateway requests reject arbitrary non-GeckIt commands and permission bypass. Provider-native tools retain their normal permission contract; role instructions alone are not a universal sandbox.
- **SC-004**: Every task, answer and decision in duplicate/reconnect/restart trials has one effective outcome; uncertain deliveries are identified rather than reported as completed.
- **SC-005**: With the computer online and services available, receipt is acknowledged within five seconds and a worker result/question appears in Manager within ten seconds of GeckIt receiving it; Telegram service delays are measured separately.
- **SC-006**: Restart or compact during ten managed tasks with two pending questions; recover all task owners, conditions and pending decisions with no duplicate worker.
- **SC-007**: Unpaired-account, group-message, expired-pairing and revoked-connection checks disclose no task content and perform no task actions.
- **SC-008**: Desktop setup/status controls remain reachable without horizontal scrolling at 1280 x 800 in both themes and work by keyboard. At phone 390 x 844 / 320 x 740, ordinary task UI remains usable with no Manager entry or conversation.

- **SC-009**: Select a nondefault model, switch assistant and inspect the refreshed model list, then change model during a running turn. The UI identifies the current and next-turn selections; the next actual manager turn uses the requested model without changing workers.
- **SC-010**: From Desktop Settings, inspect current Manager status and restart with two pending worker questions; retain task/decision ownership and keep both workers accessible. Desktop/phone board, search, stale direct routes and worker-origin actions cannot open or send to the Manager backing conversation.
- **SC-011**: With two enabled providers, set different project preferences through Manager, restart and dispatch one task in each project; inspect the explicit provider IDs and reasons. A task override leaves the preference unchanged. Disabling a preferred provider or selecting one unsupported on the project's host blocks dispatch without substitution or automatic enabling. With no configured default/preference, one eligible provider is selected automatically and several trigger a bound choice. Changing manager provider or project preference does not migrate existing workers.

## Assumptions

- Alex explicitly requested model selection, automatic management of all projects, project/file management and GeckIt CLI control. Automatic delegation and inclusion of future registered projects are the revised requirements. A dedicated user-owned Telegram bot remains a draft default pending review.
- One installation owns the bot connection and one paired private Telegram account. A shared hosted bot, group chats, several managers and coordinating several GeckIt installations are outside this version.
- Telegram text and task-bound buttons/replies are in scope. Voice notes, photos, file uploads, a Telegram Mini App and arbitrary native permission forms in Telegram are outside this version.
- Existing board, worker sessions, enabled GeckIt providers, SSH routing and concurrency limits remain the execution foundation. Manager controls GeckIt exclusively through GeckIt CLI and does not add a separate inference backend. Manager is a special GeckIt session with manager instructions and dedicated UX; enabled builtin and library providers use their existing authentication/runtime and permissions. This feature does not certify provider terms or introduce a separate API/account requirement; see research.md.
- Telegram is the sole Manager conversation channel. Setup can precede pairing; disconnect retains configuration/history and does not stop workers. Existing encrypted iPhone P2P access remains a separate manual session-management channel.
- A receiving computer must be awake, connected and running GeckIt. This feature does not provide an always-on cloud worker or wake a sleeping computer.
- Remote workers may keep running under existing SSH behavior; local workers retain existing interruption semantics.
- Public provider capabilities and Telegram limitations must be rechecked during implementation planning; unsupported configurations are explained rather than approximated by a prompt alone. Existing CLI coverage must be extended for the proposed management operations.

## Design Handoff

- [UX](../../docs/ux/manager-telegram.md)
- [Interactive UI prototype](../../docs/design/manager-telegram.html)
- [Design and review record](design.md)
- [Evidence and platform constraints](research.md)
