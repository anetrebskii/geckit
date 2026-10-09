# Feature Specification: Send queued messages now

**Feature Branch**: `feat/send-queued-now`
**Created**: 2026-10-09
**Status**: Ready for implementation
**Input**: Support immediate queued-message injection for built-in Codex, Claude and provider libraries, including external Claude tmux; update provider interface.

## User Scenarios & Testing

### User Story 1 - Correct running work (Priority: P1)
Alex queues guidance, then presses "Send now" to deliver that specific message into running work.
**Independent Test**: While a supported assistant works, queue two messages and send the second now. Only that message leaves the queue; work continues and the message appears once in the transcript.
**Acceptance Scenarios**:
1. Given an active supported assistant, when Send now succeeds, the selected text and attachments reach the current work without restarting the conversation.
2. Given delivery fails or the turn ends first, when Send now is pressed, the message remains queued and the user sees why.

### User Story 2 - Libraries use the same action (Priority: P1)
Built-in and library assistants expose the same capability; existing libraries continue working.
**Independent Test**: Install a supporting library and an older library. Send now is available only for the supporting live driver.
**Acceptance Scenarios**:
1. Built-in Codex, Claude and updated Claude tmux can receive guidance during active work.
2. Older libraries still load and queue normally without advertising unsupported injection.
3. Desktop and phone share the same behavior and wording.

### Edge Cases
Duplicate clicks, turn completion during submission, rejection, disconnection, editing/removing/reordering during submission, pending native approval, images, commands/goals, provider update during work and unsupported providers.

## Requirements

### Functional Requirements
- **FR-001**: Show "Send now" per queued message only while its active provider can inject guidance.
- **FR-002**: Deliver selected text and images into current work, preserving other queued messages and active model/mode.
- **FR-003**: Remove a message only after accepted delivery; retain it on failure with an error.
- **FR-004**: Prevent duplicate submission and competing queue actions during delivery.
- **FR-005**: Built-in Codex, Claude and updated external Claude tmux support the operation; library contract remains backward compatible.
- **FR-006**: Desktop and phone use the same operation; no concurrency slot is bypassed or new turn restarted by host.
- **FR-007**: Commands/goals remain ordinary queue operations; injection does not bypass pending approvals.

### Key Entities
Queued message, active provider driver, delivery capability and transient pending delivery.

## Success Criteria
- **SC-001**: All three requested assistants accept a selected queued message during running work in deterministic transport tests.
- **SC-002**: Failed and duplicate submissions lose or duplicate zero queued messages in race tests.
- **SC-003**: Existing library fixtures load unchanged; keyboard and touch can invoke the action in both themes.

## Assumptions
Normal Send keeps queueing. Send now is deliberate and does not undo earlier actions. A provider accepts guidance at its next supported processing opportunity. Native approval remains authoritative. Initial implementation did not include publication. Alex subsequently requested pushing this work to main and removing the feature worktree.
