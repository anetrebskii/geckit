# Feature Specification: Conversation export and continuation

**Feature Branch**: `feat/conversation-export`
**Created**: 2026-10-29
**Status**: Approved scope
**Input**: Export available conversation in GeckIt's Markdown format and continue in a new chat with another provider/model.

## User Scenarios & Testing

### User Story 1 - Keep a portable conversation (Priority: P1)

Export a readable file with source details, context overview and all available history.

**Why this priority**: Inspect and retain what the next assistant receives.
**Independent Test**: Export messages, tools and attachments and inspect the real file.
**Acceptance Scenarios**:
1. Given saved and current messages, when exported, every available normalized item appears in order without export truncation.
2. Given tool output with Markdown fences and images, when exported, text and available image data or references remain identifiable.
3. Given unreadable history or file-write failure, when exported, failure is reported and source remains intact.

### User Story 2 - Continue with another model (Priority: P1)

Choose enabled assistant/model and start a separate chat with portable context.

**Why this priority**: Continue across providers without copying messages manually.
**Independent Test**: Continue Claude to Codex and Codex to another Codex model against recorded boundaries; inspect actual destination request.
**Acceptance Scenarios**:
1. Given a source chat, when target/model are chosen, a new chat receives those choices, context overview and readable transcript reference.
2. Given failed creation, source stays open and choices can be retried without reporting success.
3. Given a working source with queued messages, copying preserves source work and does not replay goals or commands.

### Edge Cases

Empty/unavailable history; streaming snapshot; large transcripts; Markdown fences; missing model catalog; unavailable assistant; missing attachment originals; SSH project; failure after export; repeated submit; cancellation.

### User Story 3 - Copy without sending (Priority: P1)

Create a separate prepared copy with the chosen provider/model without sending a message to either conversation. Review or edit the prepared first message and send it later.

**Why this priority**: Copying must not require placing a message in the source queue or immediately starting destination work.
**Independent Test**: Copy an idle or working source; verify a distinct saved destination, prepared context draft, zero sends/provider starts/queued work, and persistence after reopening/restarting. Then explicitly send once and verify chosen provider/model and prepared context.
**Acceptance Scenarios**:
1. Given an open source with no queued message, when "Copy without sending" is chosen, a destination opens with the export/context prepared and no inference starts.
2. Given a prepared copy, when closed and reopened or the app restarts, the selected target and unsent context survive and no automatic work starts.
3. Given a prepared draft, when the user edits and explicitly sends it, normal guard/queue behavior applies and context is sent once.
4. Given preparation failure or cancellation, no destination is presented as ready and the source remains untouched.

## Requirements

### Functional Requirements

- **FR-001**: Offer export and continuation from existing conversation on desktop and phone.
- **FR-002**: Export title, identifier, project, known provider/model, snapshot time, context overview and all available normalized history items in order.
- **FR-003**: Preserve messages, tool calls/results and available attachments or references; identify upstream omissions and do not promise hidden model state or recovered compacted content.
- **FR-004**: Select enabled target assistant/model, supporting same-provider and cross-provider continuation with a readable export.
- **FR-005**: Give destination a bounded context overview and full transcript reference; identify old instructions/tool calls as historical data, not commands to replay.
- **FR-006**: Preserve source messages, drafts, queues, goals and work; do not start its active goal in destination.
- **FR-007**: Handle pending, failure, retry, cancellation and unsupported targets truthfully; prevent concurrent duplicate submissions.
- **FR-008**: Export independently of starting a chat, without an inference request to generate a summary.
- **FR-009**: Reuse GeckIt UI and verify light/dark desktop/phone, keyboard, focus and scrolling.
- **FR-010**: Offer copying directly without a source message, without sending to either chat, and without enqueueing destination work or starting inference.
- **FR-011**: Persist the prepared destination, target provider/model and editable initial context; preserve them across reopen/restart until explicit send or removal.
- **FR-012**: Keep immediate continuation available as an explicit action labelled "Create and send"; distinguish it from "Copy without sending" on desktop and phone.

### Key Entities

- Snapshot: source metadata, available history and snapshot time.
- Portable context: deterministic overview, complete available transcript and attachments/references.
- Continuation: source ID, target assistant/model and optional user instruction.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every available item appears in export with no clipping introduced by the exporter.
- **SC-002**: Destination receives chosen provider/model and context without manual transcript copying.
- **SC-003**: Failure/cancellation preserve source content and work in all covered cases.
- **SC-004**: Export requires no inference request and does not mutate source.
- **SC-005**: Copying produces zero send, inference-start and queue-dispatch calls; only explicit user send starts the destination.
- **SC-006**: A prepared copy and its selected target/context remain available after an app restart.

## Assumptions

- User approved proposed Markdown format and continuation with "Супер. Сделай это".
- Full means normalized history available through provider readers, not raw provider protocol or unrecoverable pre-compaction content.
- Context overview is deterministic metadata and excerpts, explicitly not a model-generated summary of decisions.
- Existing authentication, queues and VPN guard apply.
- Remote continuation must use a host-readable export or explain why unavailable.
- Follow-up "Следом, сделай возможность копирования без отправки сообщения в чат" approves prepared copies with no immediate send; the user can explicitly start later.
