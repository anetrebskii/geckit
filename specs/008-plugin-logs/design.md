# Design: Plugin logs

**Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)
**Status**: Implementation authorized by the user's request.

## Scope

Local logs for auditing the three current libraries. Files and provider documentation are the entry points. No renderer, mobile control, layout or styling changes.

## Artifacts

- UX: [plugin logs](../../docs/ux/plugin-logs.md).
- Layout prototype: not applicable; no visible UI layout changes.

## Decisions

Separate rotating JSONL files per plugin under the host data directory. Expose a scoped logger through an optional factory context; never expose builtin providers. Stable host request and plugin backend events prevent counting cache reads as actual checks. Files record scalar diagnostic metadata, not conversation content.

## Requirement Coverage

| Requirements | Decision | Validation |
| --- | --- | --- |
| FR-001/007 | Scoped bounded files and ordered writes | Rotation, path, concurrency tests |
| FR-002/005 | Additive factory context | Old/new factory tests and host events |
| FR-003/004 | All three plugins use shared logger | Fake-backend check/skip/send tests |
| FR-006 | Nonfatal sanitized logging | Failure/redaction/content-exclusion tests |

## Review Evidence

No UI components change. Theme, focus, keyboard, scrolling and viewport review are not applicable. Validation covers files, factory compatibility and deterministic transports; [verification.md](verification.md) records passing suites/builds and the existing full-lint limitation. Installed app rollout remains separate.

## Open Decisions

None.

## Planning Handoff

Preserve API v1, existing no-argument factories, tmux activity/cooldown semantics and concurrent versions. Document actual paths and events. Build maintained standalone artifacts and run host/plugin checks. Preserve concurrent sessions' edits and feature selector.
