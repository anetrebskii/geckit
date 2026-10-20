# Feature Specification: Telegram attachments

**Feature Branch**: `feature/telegram-attachments`
**Created**: 2026-10-20
**Status**: Draft, implementation authorized; manual review pending
**Input**: Alex requests images and files both to and from the paired Telegram bot, with useful provider handoff, explicit authorized deliverable selection, secure bounded storage and verified observable paths.

## User Scenarios & Testing

### User Story 1 - Send task material (Priority: P1)

A paired user sends photos, image documents or ordinary files with optional caption, including as a reply to a known Manager message.

**Why this priority**: Screenshots and source documents must reach the assistant as usable content.
**Independent Test**: Send harmless synthetic inputs and inspect the actual input accepted by the selected provider boundary, retained bytes and routing context.

**Acceptance Scenarios**:

1. **Given** paired private chat and enabled Manager, **When** the user sends a photo, **Then** the selected provider receives image content with caption and source context.
2. **Given** an ordinary file, **When** ingestion succeeds, **Then** the assistant can read its real bytes, with filename/type/size and truthful format limits.
3. **Given** a known earlier Manager response, **When** the user replies with a file, **Then** original session/task context is preserved without directly controlling unrelated sessions.
4. **Given** an unpaired user, external reference, invalid file or failed download, **When** it arrives, **Then** unauthorized content is not fetched or dispatched and paired-user failures have a useful recovery.

### User Story 2 - Receive selected deliverables (Priority: P1)

Manager or its worker identifies an intended task deliverable and returns that exact file to the paired chat.

**Why this priority**: Two-way support is incomplete if the user cannot receive actual results.
**Independent Test**: Select a harmless project file through the supported operation, verify outbound bytes/caption/chat and reply origin, then exercise upload rejection and uncertainty.

**Acceptance Scenarios**:

1. **Given** an owned local worker with an intended deliverable, **When** Manager explicitly selects its path, **Then** the paired chat receives a photo or downloadable file with caption and mapped origin.
2. **Given** an arbitrary transcript file link, **When** it appears without a selection command, **Then** no file is uploaded.
3. **Given** an outside-root/symlink/remote/unowned target, **When** delivery is requested, **Then** it is rejected without reading a substitute file.
4. **Given** an upload interruption, **When** outcome is uncertain, **Then** no automatic retry or false success occurs.

### User Story 3 - Resume and clean up safely (Priority: P2)

Retained inputs and message mappings survive restart within documented bounds, and private storage does not grow without limit.

**Why this priority**: Offline/restart operation must not lose accepted work silently or retain unlimited private data.
**Independent Test**: Reopen stores/controller with synthetic records, verify readable retained bytes, expiration/cap behavior and uncertain-operation recovery.

**Acceptance Scenarios**:

1. **Given** queued accepted input and a restart, **When** processing resumes, **Then** content is still usable or a specific failure is reported; no blind replay occurs.
2. **Given** expired input or full storage, **When** cleanup/ingestion runs, **Then** the documented bound is enforced and queued content is not silently replaced.

### Edge Cases

No caption; multiple photo sizes; supported/unsupported image document formats; media-group messages; malformed metadata; missing size; oversized streamed body; cross-chat/cross-bot reply; delayed input; native decision reply; re-pair mid-flight; long hostile filenames; source symlink; file modified during read; empty/large captions; expired source and worker deletion.

## Requirements

### Functional Requirements

- **FR-001**: Accept photos and documents only from the paired user in its private chat, checking reference boundaries before fetching.
- **FR-002**: Preserve caption, message identity, media-group identity when supplied, and authorized reply/session context.
- **FR-003**: Supply real content through the selected provider's supported image or file-reading mechanism; hand off selected input bytes to an owned local worker.
- **FR-004**: Expose explicit deliverable selection for Manager and a documented worker-to-Manager delivery request; use photo/document delivery with known outcome and mapped origin.
- **FR-005**: Limit outgoing scope to authorized session/host and intended files; never auto-upload links, scan for deliverables or read arbitrary private files.
- **FR-006**: Bound retained input lifetime and bytes; protect local paths and filenames, redact secrets and private download URLs, and document cleanup.
- **FR-007**: Report unsupported/oversized/download/upload errors and uncertain outcomes without silent content loss or blind replay.
- **FR-008**: Preserve existing native permission and manual-session ownership boundaries; attachment content cannot grant approval.
- **FR-009**: Verify the named observable paths with harmless controlled fixtures, label substituted boundaries and leave live account verification unclaimed.
- **FR-010**: Preserve concurrent branches/worktrees and provide a reviewable local diff, integration notes and current day-plan entry.

### Key Entities

- **Attachment**: Opaque ID, safe display name, actual type/size, retained bytes, source message/group, lifetime and owning conversation context.
- **Delivery**: Explicit selected file, owned session/project, caption/type, paired chat and returned message identity or failure/uncertainty.
- **Reply origin**: Existing persisted bot-message/session/managed-task mapping, kept separate from untrusted quoted text.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All three input categories reach a usable assistant input with identical content and preserved captions in controlled checks.
- **SC-002**: Both selected photo and document outputs deliver identical intended content and retain usable reply origins in controlled checks.
- **SC-003**: Every tested unauthorized chat/reference/path is rejected before content transfer; no native approval or unrelated-session control is granted.
- **SC-004**: Restart, expiration, capacity, download rejection and upload failure checks produce the documented result without false success or automatic duplicate side effects.
- **SC-005**: Review artifacts name each controlled/live boundary, include exact usage and identify concurrent integration overlap.

## Assumptions

Existing pairing and enabled Manager are prerequisites. Generic documents use supported local file tools; understanding every document format is provider-dependent. Remote file-transfer support is explicitly unavailable unless implemented with an actual host transfer. Albums can be independent messages with shared group identity. No new desktop/phone layout is required. No live message/upload, merge, push, release or deploy is authorized by this task.
