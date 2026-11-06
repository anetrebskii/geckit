# Design: Manager single-session deletion

**Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)
**Status**: Ready for local implementation under Alex's explicit request; no separate design approval claimed.

## Scope

US1, FR-001 through FR-008. Add an authenticated CLI action that uses existing Manager decision surfaces. No new screen, layout or CSS.

## Artifacts

- UX: [Manager session deletion](../../docs/ux/manager-session-delete.md)
- Existing decision surface: [Manager threads](../../docs/ux/manager-threads.md)
- Layout prototype: not applicable; existing shared confirmation card is reused.

## Decisions

Exact managed ID, always host-bound approval, stop/cancel before provider removal, truthful failure, project files retained. See UX for states, wording and edge cases.

## Requirement Coverage

| Requirements | Design | Validation |
| --- | --- | --- |
| FR-001/002 | Full-ID bound decision | Refusal/invalid ID/auth tests |
| FR-003/004 | Runtime/queue teardown then provider receipt | Active, queued, provider-failure and concurrency tests |
| FR-005/006 | Remove selected worker tracking only | Persisted notes/favorites/sentinel checks |
| FR-007/008 | Instructions and isolated CLI routing | Compiled CLI/socket fixture and local evidence |

## Review Evidence

Code review of current renderer remove handler, core removal wrapper and Sessions.remove. No renderer changes planned. Existing light/dark/keyboard/scroll behavior is reused; no new visual layout review claimed. Actual approval flow tested at host boundary; no real user permission cards are answered.

## Open Decisions

Cleanup: completed/archived sessions, message history or temporary files? Already asked by originating Manager. Outside single-session implementation until Alex answers.

## Planning Handoff

Preserve existing native permissions and host-bound decisions, project/worker checks and operation reconciliation. Use existing provider delete contract; do not invent provider-wide erasure. Fixtures own all files and transcripts. No deployment or app restart.
