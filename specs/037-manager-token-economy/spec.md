# Feature Specification: Manager token economy

**Feature Branch**: `037-manager-token-economy`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Manager used most of a Claude Max 5x plan with nobody using it. Wake the Manager about a worker only on milestones, group worker updates into one turn, compact the Manager's conversation automatically when its context reaches 240,000 tokens (a Manager setting; GeckIt starts the compaction itself; starting compaction is part of the assistant contract), and do not resume the Manager unattended after a usage limit resets."

## Background

On 2026-11-19 a headless GeckIt (EntechBot) spent the five-hour window of a Claude Max 5x plan while no person was typing. Measured from its session files:

- Manager was 55% of the day's tokens; in the five hours before the limit it was 63%.
- 97% of the tokens were the assistant rereading earlier conversation, not new text.
- One Manager turn reread about 760,000 tokens of conversation.
- In the 50 seconds after the limit reset, Manager took 19 turns and reread 14.4 million tokens, woken by a worker's progress, with nobody writing to it.

Four behaviors produce this:

1. Every change a tracked worker goes through wakes Manager, including each background command a still-working worker finishes. A worker polling a long search every 20 seconds wakes Manager every 20 seconds.
2. Each update is its own Manager turn. Fourteen updates seconds apart are fourteen turns.
3. A Manager thread keeps one conversation forever, so every turn costs more than the last.
4. When the plan's limit resets, Manager wakes itself and resumes the interrupted work, which restarts the cycle unattended.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manager wakes for what matters about a worker (Priority: P1)

A person asks Manager (in the app or through a channel such as Slack) for work that a worker carries out over many minutes, running long commands and checking on them. Manager hears from that worker when there is something to act on: it finished, failed, asks a question, is blocked, or its goal was judged met or not met. It does not hear about each command the worker starts or finishes along the way.

**Why this priority**: Worker progress was the main trigger of unattended Manager turns. Removing it cuts most of the waste with no change in what the person sees.

**Independent Test**: Run a tracked worker that starts and finishes several background commands before it ends. Count Manager turns: exactly one about that worker, when it ends.

**Acceptance Scenarios**:

1. **Given** a tracked worker that is working, **When** one of its background commands ends and the worker keeps working, **Then** Manager is not woken.
2. **Given** a tracked worker, **When** it finishes, fails, asks a question Manager must answer, becomes blocked, or its goal result changes, **Then** Manager is woken once with an update about it.
3. **Given** a worker update, **When** Manager receives it, **Then** it carries the worker's identity, title, state, status, a short summary and each background command's status and short label, not the full command text or output.
4. **Given** a tracked worker whose background command asks for a decision, **When** that happens, **Then** Manager is woken, because a question is a milestone.

---

### User Story 2 - Updates that arrive together are one Manager turn (Priority: P1)

Several workers tracked by the same Manager thread change state within moments of each other, or several updates queue while Manager is still answering. Manager receives them as one message and answers once.

**Why this priority**: Bursts happen after a restart, after a limit reset and when a batch of workers finishes. Each separate turn rereads the whole conversation.

**Independent Test**: Queue five worker updates for one thread while Manager is busy. When it is free, it takes one turn containing all five.

**Acceptance Scenarios**:

1. **Given** several worker updates queued for the same Manager thread, **When** Manager is free to take its next turn, **Then** all those queued updates are delivered together as one turn, oldest first.
2. **Given** a queued person's message and queued worker updates in the same thread, **When** Manager takes its next turn, **Then** the person's message is not merged into the update batch and keeps its own reply, attribution and order.
3. **Given** updates for two different Manager threads, **When** they are delivered, **Then** each thread receives only its own updates.
4. **Given** a group of updates, **When** it is delivered, **Then** the update for any one worker appears once, showing its latest state.

---

### User Story 3 - Manager's conversation stays a bounded size (Priority: P1)

A Manager thread that has been coordinating for days keeps a conversation that never grows past a set size. When its context reaches the compaction threshold, GeckIt compacts it while the thread is idle, and the next turn continues from the compacted conversation with the same tasks, decisions and channel threads.

**Why this priority**: Each turn costs roughly the size of the conversation. Bounding it bounds the price of every turn, including the ones that remain necessary.

**Independent Test**: Run a Manager thread past the threshold, let it go idle, and confirm GeckIt starts one compaction, the thread's next turn reports a context below the threshold, and its tracked workers and pending decisions are unchanged.

**Acceptance Scenarios**:

1. **Given** a Manager thread whose last turn reported a context at or above the threshold, **When** the thread is idle, **Then** GeckIt starts compaction of that thread's conversation once.
2. **Given** a compaction in progress, **When** a message for that thread arrives, **Then** it waits in the thread's queue and is delivered after compaction ends.
3. **Given** the Manager setting "Compact conversation at" set to a value, **When** a thread's context reaches it, **Then** compaction uses that value. The default is 240,000 tokens.
4. **Given** the setting is turned off, **When** context grows, **Then** GeckIt does not start compaction itself.
5. **Given** an assistant that does not support compaction started by GeckIt, **When** a thread on it reaches the threshold, **Then** nothing is started and the Manager setting says compaction is not available for that assistant.
6. **Given** compaction fails, **When** the failure is known, **Then** the thread is not marked failed, GeckIt does not retry it more than once per turn, and the next message is delivered as usual.
7. **Given** compaction finished, **When** Manager next answers, **Then** it still knows its tracked workers, open decisions and the channel threads it serves, because GeckIt gives it the same durable record it uses after a restart.

---

### User Story 4 - Nothing restarts by itself after a usage limit (Priority: P2)

The plan's usage limit stops Manager mid-turn. When the limit resets, Manager does not wake up and resume work on its own. If people wrote to the thread during the limit, those messages are answered at the reset, as the limit reply promised them. If nobody did, the thread shows that the limit has reset and waits: Manager continues at the next real message (from the person, a channel or a scheduled task the person set up) or when the person presses Retry or Resume.

**Why this priority**: Unattended resumption is what turned a reset into an immediate burn. It is lower than P1 because, with Stories 1-3 in place, the cost of one resumption is much smaller.

**Independent Test**: Hit the limit in a Manager thread with a worker interrupted, pass the reset time with no new messages and confirm no Manager or worker turn is taken; then send a message and confirm Manager continues the interrupted request.

**Acceptance Scenarios**:

1. **Given** a Manager thread stopped by the usage limit and no message from a person, channel or schedule waiting, **When** the reset time passes, **Then** no Manager turn is started by GeckIt and the thread's state changes from "Limit reached, back at <time>" to "Limit reset. Continues with the next message."
2. **Given** that state, **When** a person, a channel or a scheduled task sends the thread a message, **Then** Manager takes that message together with the instruction to reconcile the work the limit interrupted.
3. **Given** that state, **When** the person presses Retry or Resume, **Then** Manager reconciles and continues immediately.
4. **Given** that state, **When** worker updates arrive, **Then** they wait in the queue and do not start a turn on their own.
5. **Given** a channel thread stopped by the limit and nobody wrote there since, **When** the limit resets, **Then** the channel receives no new automatic message; its earlier "back at <time>" reply stays the last word until someone writes.
6. **Given** people wrote to the thread during the limit, **When** the limit resets, **Then** Manager takes those messages in one turn, together with the instruction to reconcile the interrupted work.
7. **Given** Manager is reconciling after a limit, **When** it decides how to continue, **Then** it does not schedule its own continuation for a later time; it continues now for a waiting message or waits for one.

---

### Edge Cases

- A worker whose background command keeps ending and restarting for hours never wakes Manager until it ends, fails, asks or is blocked; the person can still ask Manager for status at any time.
- A worker that finishes while Manager is compacting: the update is queued and delivered after compaction.
- The context size of the last turn is unknown (an assistant that does not report it): no automatic compaction is started for that thread.
- Compaction itself reports a context still at or above the threshold: GeckIt does not compact again until a later turn has run.
- The threshold is set lower than the assistant's base context (instructions alone exceed it): GeckIt compacts at most once per turn, so it cannot loop.
- A Manager thread is paused: neither compaction nor update delivery starts.
- Several threads reach the threshold at once: each compacts independently; the working-at-once limit for conversations does not apply to Manager compaction.
- The limit resets while the person has the thread open: the state wording changes in place, without a toast or sound.
- Older saved Manager state from a version without these fields loads with the default threshold and the new wake rules.

## Requirements *(mandatory)*

### Functional Requirements

**Waking on milestones**

- **FR-001**: GeckIt MUST wake a Manager thread about a tracked worker only when that worker stops (finishes a turn with no background command running, no message waiting for it and no unmet goal that keeps it going), fails, asks a question Manager must answer, becomes blocked, its goal result changes, or one of its background commands asks for a decision. A turn that ends while the worker carries on by itself MUST NOT wake Manager; the wake comes when it stops. (Amended 2026-11-19: EntechBot's Manager answered such turns with no-op turns, each rereading about 175,000 tokens.)
- **FR-002**: GeckIt MUST NOT wake Manager when a background command of a still-working worker starts, runs or ends.
- **FR-003**: A worker update MUST contain the worker's identity, title, project, state, status, short summary, delivery state and, per background command, its identity, status and a short label of at most 120 characters, and MUST NOT contain full command text or command output.

**Grouping**

- **FR-004**: When Manager takes its next turn in a thread, GeckIt MUST deliver every worker update queued for that thread in that one turn, oldest first, keeping only the latest update per worker.
- **FR-005**: GeckIt MUST NOT merge a message from a person, channel, scheduled task or CLI result into a group of worker updates; those keep their own turn, reply origin and order.

**Compaction**

- **FR-006**: Manager settings MUST include "Compact conversation at" with a number of tokens and an off state, default 240,000, applying to every Manager thread.
- **FR-007**: After each Manager turn, GeckIt MUST record that thread's context size as reported by the assistant.
- **FR-008**: When a thread's recorded context is at or above the threshold and the thread is idle (no turn running, no message being delivered, no command running, not paused, no limit in effect), GeckIt MUST start compaction of that thread's conversation once.
- **FR-009**: Messages for a thread that arrive during its compaction MUST wait and be delivered after compaction ends, in order.
- **FR-010**: After compaction, the next turn MUST include the thread's durable record (recent operations, open decisions, tracked workers), as after a restart, so coordination continues.
- **FR-011**: A failed compaction MUST NOT mark the thread failed or block delivery, and GeckIt MUST NOT start another compaction for that thread until a later turn has completed.
- **FR-012**: The assistant contract MUST state whether an assistant supports compaction started by GeckIt and how it is started; Claude Code and Codex MUST declare their support; a provider plugin that declares nothing MUST be treated as not supporting it.
- **FR-013**: When the thread's assistant does not support compaction, GeckIt MUST NOT attempt it, and the Manager setting MUST say so for that assistant.

**After a usage limit**

- **FR-014**: When a usage limit resets, GeckIt MUST start a Manager turn only if a message from a person, channel or person-made schedule is waiting for that thread; otherwise it MUST NOT start a Manager turn or resume a worker on its own.
- **FR-015**: After the reset, the thread state MUST read "Limit reset. Continues with the next message." until a turn starts.
- **FR-016**: The next message from a person, channel or scheduled task, or Retry/Resume, MUST start a turn that also asks Manager to reconcile the work the limit interrupted.
- **FR-017**: Worker updates arriving after the reset MUST stay queued and MUST NOT by themselves start a turn while the thread is in that state.
- **FR-017a**: Manager's instructions MUST tell it not to schedule its own continuation at or after a limit reset (one-time scheduled tasks it creates for that purpose).

**Compatibility**

- **FR-018**: Saved Manager state from earlier versions MUST load unchanged, with the default threshold and the new wake and grouping rules.
**Instructions**

- **FR-020** (added 2026-11-19): Manager's instructions MUST NOT be repeated in every Manager message. An assistant that takes a system prompt (Claude Code) MUST get them as its system prompt when its process starts; any other assistant MUST get them in a thread's first message, again after its context shrank (a compaction), and again when the instructions change. On EntechBot, the copies took about 71,000 of the main thread's 216,000 tokens.

- **FR-019**: The same behavior MUST hold for the desktop app and the headless service, on every system.

### Key Entities

- **Worker update**: a milestone of one tracked worker, addressed to the Manager thread that tracks it. Attributes: worker identity, title, project, state, status, summary, delivery, background commands (identity, status, short label), observed time.
- **Manager thread**: one Manager conversation (the app's, or one per channel place). Gains: last reported context size, compaction state (idle, compacting, failed this turn), limit state (limited until a time, or reset and waiting).
- **Compaction threshold**: one Manager setting, a token count or off, default 240,000.
- **Assistant compaction ability**: part of an assistant's declaration in the assistant contract: supported or not, and how compaction is started.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A tracked worker that runs 10 background commands and then finishes causes exactly 1 Manager turn, down from up to 11.
- **SC-002**: Five worker updates queued for one thread are answered in 1 Manager turn, down from 5.
- **SC-003**: No Manager turn in a thread rereads a conversation larger than the threshold plus one turn's growth; with the default, a thread that previously reached about 760,000 tokens stays below about 300,000.
- **SC-004**: With no message from a person, channel or schedule, the number of Manager and worker turns between a limit reset and the next real message is 0, down from 19 in the measured incident.
- **SC-005**: On a replay of the 2026-11-19 EntechBot workload, Manager's share of the plan's usage falls from 55% to under 20%, and no work requested by a person is lost or repeated.

## Assumptions

- The assistant reports, for each turn, the size of the context it read; Claude Code and Codex already do, and GeckIt already shows it in Chat's status bar.
- Claude Code and Codex can compact a conversation on request without starting a new conversation; a plugin may not, and then falls under FR-013.
- The threshold is in tokens and is one value for all Manager threads; per-thread thresholds are out of scope.
- The assistant's own automatic compaction, if any, keeps working; GeckIt's compaction comes earlier and does not turn it off.
- Choosing a smaller model for Manager is a separate setting already available and out of scope here.
- Workers (non-Manager conversations) are not compacted by this feature.
- The milestone list matches what GeckIt already treats as a reason for a person to look at a conversation; "background command ended while working" is the only signal removed.
