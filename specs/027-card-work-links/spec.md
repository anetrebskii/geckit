# Feature Specification: Conversation work links

**Feature Branch**: `fix/conversation-work-links`
**Created**: 2026-11-09
**Status**: Ready for implementation
**Input**: Restore missing Jira badges on existing Codex cards and show reviewed/created GitLab MRs.

## User Scenarios & Testing

### US1 — Recognize the task (P1)

See the linked task without opening an existing or new conversation. Its title may be truncated or renamed.
Independent test: list an existing Codex conversation beginning with a Jira URL; the task badge appears without opening it.
Acceptance: Jira, GitHub, Linear and GitLab URLs produce clickable identifiers independent of conversation titles.

### US2 — Reach the related MR (P1)

See an MR mentioned during review or created during work alongside the original task.
Independent test: an assistant reply adds a GitLab MR; both task and MR appear during work and remain after restart.
Acceptance: either speaker can add a link; repeated URL fragments do not add duplicates.

### Edge cases

No recognized links means no badges. Ignore tool output and unsent prompts. Show at most two badges: original subject and latest distinct related item. The complete links menu remains available. Same MR numbers in different projects have distinct destinations/tooltips. Later historical links are recovered when the conversation is read.

## Requirements

- **FR-001**: Existing/new Codex first-prompt links MUST appear without opening the conversation, even with a renamed title.
- **FR-002**: Recognize hosted/private GitLab canonical MR and issue links alongside existing trackers.
- **FR-003**: Sent user/assistant messages MUST update badges during work; tools and unsent messages MUST be ignored.
- **FR-004**: Keep the original subject and latest distinct related item; at most two badges.
- **FR-005**: Badges MUST open destinations without selecting the card, support keyboard use and fit desktop/phone themes and widths.
- **FR-006**: Discovered links MUST survive restart; first-prompt history is recovered on listing, later history on read; clearing a conversation clears its new card's links.
- **FR-007**: Unrelated message updates MUST NOT rescan conversations or redraw unchanged cards.

### Key entities

Work item: canonical destination, identifier and accessible description. Conversation: original subject plus latest related item.

## Success Criteria

- **SC-001**: All supported regression first-prompt URLs appear without opening their conversations.
- **SC-002**: A newly mentioned MR appears within one board update and survives restart beside the task.
- **SC-003**: Each badge is keyboard accessible and opens its intended URL in both themes at desktop/phone widths.
- **SC-004**: Board updates do not scan full transcripts and unchanged cards retain their redraw behavior.

## Assumptions

Reuse tags and the links menu. No tracker API, credentials, status polling, install or restart. GitLab paths are `/-/merge_requests/N` and `/-/issues/N`. Implementation runs in an isolated worktree.
