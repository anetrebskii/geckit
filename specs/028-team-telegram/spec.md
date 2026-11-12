# Feature Specification: Team Telegram topic

**Feature Branch**: feat/team-telegram-20261111
**Created**: 2026-11-11
**Status**: Ready for design
**Input**: Implement native team Telegram topic, preserving private mode and existing Manager queue and attachments.

## User Scenarios & Testing

### User Story 1 - Owner connects a topic (Priority: P1)
The installation owner chooses Private account or Team topic in Channels, pastes a bot token, posts an expiring command in a forum topic, and confirms the displayed bot, group, topic and named sender locally.
**Why this priority**: No remote work before explicit local authorization.
**Independent Test**: A fake bot exposes a candidate only for the correct code and forum topic; confirmation activates only that target.
**Acceptance Scenarios**:
1. Given a working connection, when pairing fails, expires, is canceled or the service restarts, then the working connection remains authorized.
2. Given a candidate, when confirmed, then previous callbacks, queued output and remote control cannot transfer to the new connection.

### User Story 2 - Team gives work (Priority: P1)
Named humans in the selected topic send addressed commands or replies to the bot, including one image, and receive answers tied to their requests.
**Why this priority**: Reliable shared work is the purpose.
**Independent Test**: Two participants send several requests; after restart each accepted request remains separately recorded without duplicate execution.
**Acceptance Scenarios**:
1. Given another group, topic, private chat, bot or anonymous sender, when a message arrives, then no download, model work or data response occurs.
2. Given a crash after saving input, before dispatch or after dispatch, then recovery consults the existing durable Manager receipt and never blindly repeats started work.
3. Given a lost send receipt, then the send is marked uncertain without automatic resend.
4. Given an image without caption, then the test provider receives its exact bytes; invalid formats, albums and oversized files receive a clear rejection.

### User Story 3 - Scoped authority (Priority: P1)
Everyone can request work. Only explicitly selected approvers, or all members when enabled by the owner, may approve current team decisions after verified membership.
**Why this priority**: Work executes with installation access.
**Independent Test**: Old, duplicate, unrelated, changed and unauthorized decisions cannot execute an action, including across asynchronous checks.
**Acceptance Scenarios**:
1. Given unverified membership, then approval is refused with a reason and the local UI remains available.
2. Given a team tool request for personal data or another channel, then the tool refuses before reading or mutating it.
3. Given any participant, then stopping Manager globally and clearing history require local owner action; team members may cancel only work owned by this team thread, including work requested by other team members.

### Edge Cases
Expired/reused/wrong codes; replacement by same bot; restart while pairing; Telegram conflict or revoked bot; provider without images; failed history; deletion of source; overflowing queue/cache/journal; revoked authority while checking membership; old worker completes after reconnect.

## Requirements

### Functional Requirements
- **FR-001**: One installation connection uses private or team mode. Existing saved private connections retain their mode and rights.
- **FR-002**: Pairing uses a random single-use code valid ten minutes and owner confirmation of bot, group, topic and sender. Failed attempts preserve the active connection.
- **FR-003**: Team accepts only named humans in its forum group/topic; target validation precedes all downloads and assistant calls.
- **FR-004**: Requests preserve generation, bot, group, topic, sender, source message and durable request identity. They are saved before Telegram acknowledgement. Existing Manager queue and receipts remain authoritative.
- **FR-005**: Thread, tools, decisions, attachments, workers, output and status enforce scope and generation; no personal history, decisions or cross-channel controls reach the team.
- **FR-006**: Owner sets explicit approvers, initially none, or all verified members. Membership failure denies approval. Authorization is checked immediately before execution after waits. Decisions bind exact message, choice, request, thread and current identity; record actor/outcome with bounded retention.
- **FR-007**: Team participants may stop any worker belonging to their shared thread. Global Manager pause/resume, connection changes and history deletion are owner-only in GeckIt. No team controls affect personal channels.
- **FR-008**: One supported image per message uses native image input and pinned cached bytes through restart. Albums and unsupported formats are rejected before provider input.
- **FR-009**: Preserve bot privacy. Explain addressed commands/replies and group-scoped menus, preserving unrelated commands. All output and typing target the bound topic.
- **FR-010**: Distinguish connected, paused, queued, approval, uncertain delivery, lost access and receiver conflict. Use existing edited status message.
- **FR-011**: Maximum 100 pending team requests; 16384 input characters; 20 MiB download; 256 cached files and 200 MiB total; unpinned files expire after 24h. Full resources reject new requests without evicting active work. Keep 2048 reply links, 256 callbacks, 128 questions, 512 audit entries, 64 entry-message links, 512 uncertain-upload identities and 2048 worker-source links; expired links/buttons reject explicitly.
- **FR-012**: Fake Telegram and test providers verify isolation, replay, images, failure and compatibility without live sends or paid generations. Document controlled transition and rollback without restoring an old offset.

### Key Entities
Connection generation; candidate; structured request provenance; Manager thread and receipt; retained attachment; bound decision and audit entry.

## Success Criteria
### Measurable Outcomes
- **SC-001**: Two people can send three requests each, restart mid-queue and receive six correctly scoped outcomes without duplicate execution.
- **SC-002**: All negative isolation and authorization scenarios produce zero foreign reads, actions or outgoing messages.
- **SC-003**: The accepted image bytes match the bytes delivered to the test assistant.
- **SC-004**: Existing private connection fixtures remain valid and the standard offline checks pass.

## Assumptions
One team topic per installation; named Telegram identity is sufficient for task submission, not approval. The owner trusts the team with installation access. No clarification is needed: user delegated technical choices. Deployment, adapter cutover and live acceptance are separate authorized operations.