# Feature Specification: Manager single-session deletion

**Feature Branch**: `feat/manager-session-delete`
**Created**: 2026-11-06
**Status**: Implemented locally; ready for integration/review
**Input**: Add native Manager deletion of a chosen worker; investigate cleanup without assuming its scope. No live user data deletion or deployment.

## User Scenarios & Testing

### User Story 1 - Delete one chosen worker (Priority: P1)

Alex asks Manager to delete a specific work conversation. Manager identifies it using fresh host state, requests the existing bound user decision and reports the actual result.

**Why this priority**: Archive is reversible organization; deletion removes the conversation retained by its provider.
**Independent Test**: A disposable worker is deleted through the compiled CLI, authenticated host dispatch and provider deletion with a real temporary transcript; another worker and project files survive.

**Acceptance Scenarios**:
1. Given an exact managed worker ID, when approved, stop its runtime, cancel queued follow-ups and remove the provider conversation; then remove it from active listings, favorites and Manager subscriptions.
2. Given a pending request, when refused, change no worker, queue, favorite or transcript.
3. Given a provider deletion refusal/error, when deletion is attempted, report failure and retain a visible conversation; stopped work stays stopped and queued messages are canceled.
4. Given a partial, unknown, unmanaged, Manager, question or unregistered-project ID, reject without deleting any conversation.
5. Given a queued worker without a provider transcript, delete its host record and cancel its pending first message after approval.

### Edge Cases

Working or handing-over runtime; concurrent send/drain/delete; prepared and unborn workers; archived workers; provider false/throw; lost CLI response; reused operation ID; stale approval/disabled Manager or changed registration; SSH/provider failures.

## Requirements

### Functional Requirements

- **FR-001**: Delete exactly one selected managed worker using its full ID; no title, prefix, filter, wildcard or bulk selection.
- **FR-002**: Require the existing authenticated host-bound Allow/Refuse decision under every delegation policy; preserve native permissions.
- **FR-003**: Stop the runtime and cancel pending turns before provider deletion; prevent queue/send races and wait for runtime shutdown.
- **FR-004**: Confirm success only after provider deletion or removal of a host-only unborn/prepared record; on failure preserve visible conversation and report that work stopped and pending messages were canceled.
- **FR-005**: On success remove favorites and Manager ownership/followers; retain only host tombstone/audit data needed to avoid resurrection and reconcile the operation.
- **FR-006**: Keep archive separate and reversible; keep project files, copied project inputs, exports, other chats and Manager history; do not add provider-wide cache cleanup. Provider-owned transcript side data follows the existing provider deletion contract.
- **FR-007**: Advertise the same command and semantics in capabilities and built-in Manager instructions; reconcile uncertain results with existing operation identity, never blind retry.
- **FR-008**: Verify compiled CLI/authenticated host routing on isolated test data, and record evidence plus branch/worktree in day-plan; no push, publication or user-app restart.

### Key Entities

- Worker: exact ID, project, provider and transport, runtime, queue, archive/hidden state and Manager owner/followers.
- Operation: stable operation ID, bound args, pending decision, authorized Manager session, terminal result.

## Success Criteria

- **SC-001**: Every accepted deletion fixture removes only its selected worker and preserves a sentinel transcript/project file.
- **SC-002**: Every rejected, refused or unauthorized fixture deletes zero conversations.
- **SC-003**: Failure fixtures never report deletion success or hide retained conversations; no canceled turn runs later.
- **SC-004**: Local review artifacts identify exactly what was tested and the unresolved cleanup scope.

## Assumptions

- Reuse the existing UI/backend removal contract and product decision flow, without a new screen or layout.
- This development request authorizes implementation and disposable-fixture decisions, not deletion of Alex's conversations.
- Bulk cleanup is a separate dependent task. Alex has already been asked whether it means completed/archived sessions, message history or temporary files. No answer is assumed.
