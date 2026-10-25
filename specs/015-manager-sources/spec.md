# Feature Specification: Manager task sources

**Feature Branch**: `feat/manager-source-intake`
**Created**: 2026-10-25
**Status**: Ready for implementation
**Input**: Alex requests opt-in scheduled intake from synced iPhone Voice Memos, with AI classification and Telegram confirmation.

## User Scenarios & Testing

### US1 - Discover new recordings safely (P1)
User enables a Voice Memos source and defines working hours. Existing recordings become the baseline, never tasks. A new fully synced recording is transcribed locally and classified without tool access.
**Independent test**: adapter fixture establishes baseline, adds a stable new revision, restarts; exactly one pending confirmation exists.
**Acceptance**: denied access shows an actionable state; unsupported platforms/schemas do not silently pretend success; incomplete audio waits.

### US2 - Decide in Telegram (P1)
The paired user sees a summary and chooses Take into work, Save note or Skip. No work starts before confirmation.
**Independent test**: each choice produces its defined durable outcome; duplicates, stale revisions and changed pairing cannot duplicate work.
**Acceptance**: confirmed task uses existing Manager delegation; ambiguous project requires clarification; note has a real deterministic file; ignore persists.

### US3 - Set a schedule and sources (P2)
Settings exposes opt-in intake, timezone, compact weekly intervals, automatic Apple Voice Memos connection, availability and recent items. Manual Manager work and queue remain usable outside source hours.
**Independent test**: browser edits and saves configuration, exercises empty/access/error states; clock fixtures cover overnight, DST, sleep/restart.

## Requirements

- FR-001: A typed source contract lists items with cursor, reads data and reports capabilities/status; a filtered fake source proves extensibility without implementing Linear.
- FR-002: Code persists stable source/item/revision identity, baseline IDs/cutoff and lifecycle; process overlap, restart and repeated approval cannot repeat effects.
- FR-003: Disabled by default; explicit configured timezone/day/interval gates only automated intake. Reopening after sleep checks current local time, not missed intervals.
- FR-004: Voice Memos reads a stable snapshot, never alters original recordings/database, rejects inaccessible/unsupported data and waits for stable audio.
- FR-005: Initial baseline excludes existing items and late-synced older recordings. Reconfiguring the source establishes a fresh baseline.
- FR-006: Use installed local transcription only, report missing model/tool; restricted AI classification validates output and treats content as untrusted data.
- FR-007: Paired Telegram confirmation binds current source/item/revision. Take work, Save note and Skip are idempotent, durable and explicit. Ordinary delegation permissions remain.
- FR-008: Settings exposes working time, source connection/status/access issues without manual library or transcription parameters and empty state; no preference changes until Save.
- FR-009: Notes persist in the computer's GeckIt data directory; task handoff is durable and never guesses an ambiguous project.
- FR-010: Errors are visible, retryable where safe; no LLM polling/dedup/claim, paid API, automatic model downloads or host restart.

### Key Entities
Source configuration; weekly schedule; baseline/cursor; item revision; classification; paired decision; durable task outbox; saved note.

## Success Criteria
- SC-001: A new stable fixture recording reaches exactly one paired confirmation; the old library produces none.
- SC-002: All three decisions survive restart with one effect; stale/duplicate/foreign callbacks cannot start work.
- SC-003: Manual work continues outside source hours; automatic intake respects timezone and overnight boundaries.
- SC-004: Actual Settings components pass light/dark keyboard, scroll and viewport review. Native/iCloud/Telegram limits are recorded separately.

## Assumptions
GeckIt remains open for intake. iCloud sync is performed by Apple, not GeckIt. Voice Memos storage is an observed private macOS format, not a promised Apple API; configured access can be unavailable. Telegram pairing and an enabled compatible Manager are prerequisites for approval delivery.

Revision acceptance: automatic current-user library discovery, safe legacy-setting preservation, explicit native access and local-transcription readiness, source-first compact settings, no path/folder/SQL/command/model fields in normal setup.
