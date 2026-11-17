# Feature Specification: Channel contract v2

**Feature Branch**: `feat/channel-contract-v2`

**Created**: 2026-11-14

**Status**: Clarified

**Input**: User description: "Channel contract v2: one contract for all channels (Telegram, Slack, Discord, external libraries). Source proposal: docs/channel-contract.md. Channels declare capabilities (conversations, manager, replies, delivery, control, files, shares) in geckit-plugin.json apiVersion 2; v1 libraries keep working. Core (manager, core/, service/) stops knowing channel names; Telegram moves onto the contract as a built-in module with data migration, no visible behavior change except Telegram setup moving to Settings, Channels."

## Context

GeckIt has two ways to connect a place where people write. Slack, Discord and installed channel libraries share one contract. Telegram does not: it is wired into Manager directly and owns abilities no other channel can reach (a reply to a specific message goes back to the worker who wrote it, a typing indicator driven by Manager's queue, pausing and resuming Manager from the chat, sending project files, stop buttons for shared local pages). Its name appears in about 115 places in Manager, the service and the desktop adapter.

This feature makes one contract for every channel. A channel states which abilities it needs; all declared abilities are enabled; GeckIt checks every call in one place. Telegram becomes a built-in channel on that contract, with its saved state carried over.

Settings, Channels already shows Telegram's row (`renderer/src/ui/Channels.tsx`), so the proposal's "setup moves to Settings, Channels" is already true and this feature changes nothing a Telegram user sees.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Telegram keeps working after the update (Priority: P1)

A person who already paired a Telegram bot, privately or with a team topic, updates GeckIt. Without touching anything, the bot answers as before: the same Manager thread and history, the same decision buttons, approvers and typing indicator, files and shared-link stop buttons, pause and resume from the private chat.

**Why this priority**: Telegram is in daily use. A migration that drops the pairing, repeats or loses a message is worse than no migration.

**Independent Test**: Start the new version over a data folder saved by the current release with a paired private chat and a paired team topic; send a message, answer a decision, reply to a worker's message, pause and resume; compare with the same steps on the current release.

**Acceptance Scenarios**:

1. **Given** a paired private chat and saved Manager history, **When** GeckIt starts the first time after the update, **Then** the bot is connected without pairing again and the Manager thread shows the earlier history.
2. **Given** an update the bot had received but not yet handed to Manager before the update, **When** GeckIt starts, **Then** that update is handled exactly once.
3. **Given** a message from a worker posted in Telegram before the update, **When** the person replies to it after the update, **Then** the reply reaches the same worker.
4. **Given** an open decision with buttons in a team topic, **When** a listed approver taps a button after the update, **Then** the decision is answered and the approver is recorded, and a member who is not an approver is refused as before.
5. **Given** saved state that cannot be read, **When** GeckIt starts, **Then** Telegram shows a failed state with the reason, the old state is kept untouched, and the rest of GeckIt starts.

---

### User Story 2 - A channel author gets everything Telegram has (Priority: P1)

A developer writes a channel library for another messenger. In its manifest it lists the abilities it needs. Each granted ability gives it what Telegram has today: replies routed to the worker who wrote the answered message, delivery receipts to drive a typing indicator, decisions answered with who answered, and, when the person allows it, Manager pause and resume, attachments and project files, and stop buttons for shared pages.

**Why this priority**: This is the reason for the contract. Without it a new channel is a second-class Telegram.

**Independent Test**: A test library declaring every ability runs against a fake Manager and exercises each ability; the same library with an ability removed from its manifest, or not granted, gets a clear refusal for that ability only.

**Acceptance Scenarios**:

1. **Given** a library that declared replies, **When** it reports where it posted an answer and later sends a person's reply to that post, **Then** Manager routes the reply to the workers behind that answer.
2. **Given** a library that declared delivery, **When** it sends a message, **Then** it receives the message's id at once and then each change of that message's state: queued, accepted, answered or refused with a reason.
3. **Given** a library that did not declare an ability, **When** it calls that ability, **Then** the call is refused with a message naming the ability, and nothing else changes.
4. **Given** a library that declared files but the person has not allowed files for it, **When** it offers an attachment, **Then** it is refused, and Settings shows that the library asks for files.

---

### User Story 3 - The person controls what each channel may do (Priority: P2)

In Settings, Channels each channel lists the abilities it asked for. Abilities that only shape how answers come back are granted with access to Manager. Abilities that reach files, the network or Manager itself are off until the person turns them on.

**Why this priority**: A company's library runs inside the person's GeckIt; the person must see and decide what it reaches.

**Independent Test**: Install a library that asks for files, shares and control; check that each is off, turn one on, and verify only that one starts working without restarting GeckIt.

**Acceptance Scenarios**:

1. **Given** a newly installed library asking for control, **When** the person opens its row, **Then** Pause and resume Manager is listed and off.
2. **Given** a running channel, **When** the person turns an ability off, **Then** the channel is restarted without it and further calls to it are refused.
3. **Given** the built-in Telegram, Slack and Discord, **When** GeckIt starts after the update, **Then** the abilities they use today are on, so nothing they do stops working.

---

### User Story 4 - Existing libraries keep working (Priority: P2)

Someone who installed a channel library written for the current contract updates GeckIt. The library runs as before without a new release.

**Why this priority**: Authors outside the project cannot be asked to ship on GeckIt's schedule.

**Independent Test**: Run `examples/slack-channel` unchanged against the new version.

**Acceptance Scenarios**:

1. **Given** a library with `apiVersion: 1`, **When** it starts, **Then** it gets conversations and Manager as today, and its calls behave as today.
2. **Given** a library with an `apiVersion` GeckIt does not know, **When** it is installed, **Then** installation is refused with a message naming the version.

---

### User Story 5 - Discord routes replies to workers (Priority: P3)

In a Discord thread, a person replies to a message a worker's result came in, and the reply goes to that worker, as it does in Telegram.

**Why this priority**: The first proof that the contract is general, and a visible gain for people on Slack and Discord. It can follow after the rest.

**Independent Test**: In a test server, two workers answer in one thread; a reply to the second worker's message reaches the second worker.

**Acceptance Scenarios**:

1. **Given** two workers' answers in one Discord thread, **When** the person uses Discord's reply on one of them, **Then** only that worker receives it.
2. **Given** a plain message in the thread with no reply target, **When** it is sent, **Then** it goes to Manager as today.
3. **Given** a Slack thread, **When** the person writes in it, **Then** it goes to Manager as today; Slack offers no reply to one message inside a thread.

---

### Edge Cases

- The update stops partway through moving Telegram's state: the next start finishes or redoes it, and never runs with half-moved state.
- The person downgrades to the previous release after the update: Telegram's own sealed state is untouched; Manager's record copy taken before the carry-over restores its Telegram threads.
- A reply targets a post GeckIt no longer remembers (pruned or from before the record existed): it goes to Manager as a plain message, as today.
- A channel reports the same post twice, or a post for an answer that does not belong to it: the second report changes nothing; the foreign one is refused.
- An ability is turned off while a call using it is waiting: the call is refused when it resumes, as files are today.
- Manager is off: channels asking for Manager get no thread, as today; delivery receipts are not sent.
- The phone uses generic channel requests and updates; old Telegram-only endpoints are removed by the latest explicit requirement.
- A team topic member sends /pause: refused, as today, because pause is owner-only in a team.

## Requirements *(mandatory)*

### Functional Requirements

**Contract**

- **FR-001**: GeckIt MUST accept channel manifests of version 1 and version 2, and refuse any other version with a message naming it.
- **FR-002**: A version 2 manifest MUST list the abilities the channel needs, from: conversations, manager, replies, delivery, control, files, shares. An unknown ability MUST be refused at install.
- **FR-003**: A version 1 manifest MUST be treated as asking for conversations and manager only.
- **FR-004**: A channel MUST receive only the abilities it both asked for and was granted; calling any other MUST be refused with a message naming the ability.
- **FR-005**: Every call a channel makes MUST pass through one check of its abilities and of whether it may reach that conversation or thread; there MUST be no second path into Manager for any channel.

**Abilities**

- **FR-006**: With replies, a channel MUST be able to report where it posted each Manager answer, and to send a person's message as a reply to such a post; GeckIt MUST route it to the workers behind that answer.
- **FR-007**: GeckIt MUST keep the link between a channel's post and its workers across restarts, scoped to that channel, and MUST prune it with the same limits Telegram uses today.
- **FR-008**: With delivery, sending a message MUST return its id, and the channel MUST be told each later state of that message: queued, accepted, answered, or refused with a reason.
- **FR-009**: A refused message MUST say why in terms the channel can show (too late, Manager paused, not allowed, queue full), and the channel MUST be able to send it again on the person's request.
- **FR-010**: Answering a decision MUST accept who answered; GeckIt MUST record that person with the decision. Who may answer stays the channel's decision.
- **FR-011**: With control, a channel MUST be able to pause and resume Manager, and Manager MUST record which channel did it.
- **FR-012**: With files, a channel MUST be able to hand in attachments for its Manager threads and receive project files Manager sends to that thread, with the checks that apply to Slack and Discord today.
- **FR-013**: With shares, a channel MUST be able to list the local pages shared through it and stop one.
- **FR-014**: Each Manager answer handed to a channel MUST carry the language of the conversation, so the channel's own wording (pause notices, refusals) matches it.

**Grants**

- **FR-015**: Settings MUST NOT show separate Manager, control, files or shares permission switches. The host adds no folder controls; all GeckIt project folders are available.
- **FR-016**: All declared capabilities MUST be enabled automatically for every library. Undeclared capabilities MUST remain unavailable.
- **FR-017**: Bundled and installed libraries MUST receive the same capability policy, including existing settings with legacy permissions disabled.
- **FR-018**: Legacy manager/grants settings MUST NOT restrict capabilities or trigger unnecessary restarts. Global Manager enablement and channel enablement still apply. Legacy per-channel folder restrictions are ignored.

**Telegram**

- **FR-019**: Telegram MUST run as a built-in channel on the contract, with no Telegram-specific entry into Manager.
- **FR-020**: On the first start after the update, GeckIt MUST carry over Telegram's bot token, pairing (private or team, with approvers), polling position, pending updates and uploads, open decision buttons, reply records and decision audit, and its Manager threads with their history.
- **FR-021**: The carry-over MUST happen once and MUST be safe to interrupt and repeat. Before changing Manager's record it MUST keep a copy of it beside the original, so a downgrade can be undone by hand.
- **FR-022**: Every channel MUST use the same Settings row and renderer. Library-owned connection screens MUST be supplied through the public contract. No Telegram-specific status or controls may remain in Manager. Preserve transport behavior, pairing verification and grants.
- **FR-023**: The phone MUST use generic requests and published views by channel ID. Telegram-only aliases MUST be removed. This supersedes the earlier compatibility exception.

**Scope of the core**

- **FR-024**: Manager, the service and the core runtime MUST NOT name any specific channel; a channel is known to them only by its id.
- **FR-025**: The channel library guide MUST describe version 2, every ability, its grant and its refusals, with the version 1 behavior noted.

**Slack and Discord**

- **FR-026**: Slack and Discord MUST move to version 2 in this feature. Discord MUST route a native reply to the message an answer came in to the workers behind that answer. Both keep their existing working indicator (the eyes reaction and the status message), now driven by delivery. Slack has no reply to a single message inside a thread, so in Slack a thread stays one Manager thread with no per-message routing.

### Key Entities

- **Channel ability**: one of conversations, manager, replies, delivery, control, files, shares; asked for in the manifest, granted per channel by the person or by default.
- **Channel grant**: per channel, which asked-for abilities are on; kept with the channel's settings.
- **Reply record**: per channel, a post in that channel linked to the Manager answer and the workers behind it; pruned by age and count.
- **Delivery receipt**: a message a channel sent, its id and its current state.
- **Decision answer**: a decision, the choice, the channel and the person who answered.
- **Telegram state**: what Telegram keeps today (token, pairing, position, pending updates and uploads, buttons, reply records, audit), carried into the channel's own store, secrets and reply records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Telegram pairing made before the update works after it with zero extra steps, for private chats and team topics.
- **SC-002**: Across an update with messages in flight, no Telegram message is handled twice or lost, checked over at least 20 interrupted-start runs.
- **SC-003**: The channel names Telegram, Slack and Discord appear zero times in Manager's logic, the channel host and the core runtime, except the common module registration table and historical test fixtures. Legacy field migration belongs to the module through the public contract.
- **SC-004**: The example library written for version 1 runs unchanged, and a test library on version 2 reaches every ability Telegram uses, with no access to anything Telegram can reach that it cannot.
- **SC-005**: A library author can implement reply routing and a typing indicator using only the published guide, without reading GeckIt's source.
- **SC-006**: Every ability a channel did not ask for or was not granted is refused in 100% of attempts in the test suite.

## Assumptions

- Telegram's Settings row already lives in Settings, Channels; it keeps its own setup screen (pairing, private or team) and the Manager window keeps its Telegram status.
- Who may write and who may answer a decision stay the channel's decision; GeckIt records but does not enforce them, as today.
- External channel libraries still run inside the GeckIt service with no sandbox; the grants limit an honest library, not a hostile one.
- The pruning limits for reply records stay those Telegram uses today (2048 records).
- External libraries asking for files get the same per-file checks Slack and Discord have today; whether they may ask at all is decided by the grant (FR-016).
- Pause and resume stay global to Manager, as in Telegram today, and owner-only in a team topic.
- The phone and CLI are not channels and are out of scope.
- A new branch and pull request carry this work; nothing reaches `main` without the person asking.

- **FR-026**: Slack configuration MUST contain only Bot token and App token. All human users in its workspace MUST be answered regardless of a legacy allowlist.
- **FR-027**: Discord configuration MUST contain only Bot token and People who may write. All visible channels, direct messages and secret checks MUST always be enabled, regardless of legacy settings.
