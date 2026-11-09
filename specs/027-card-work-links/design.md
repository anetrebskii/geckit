# Design: Conversation work links

**Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)
**Status**: Implemented and reviewed in isolated component harness; not installed

## Scope and artifacts

Restore existing tags for Codex, extend to GitLab/follow-ups across desktop and phone. [UX](../../docs/ux/card-work-links.md). Mount actual Tags and stylesheet in a temporary browser harness for layout review; artifacts stay outside source.

## Decisions

First subject plus latest related item, maximum two. Existing native button treatment. Add optional workItems beside legacy work. Main supplies bounded metadata, renderer does not inspect history. User authorized implementation following the supplied screenshot.

## Requirement coverage

| Requirements | Decision | Validation |
| --- | --- | --- |
| FR-001, FR-002 | canonical provider-independent parsing | Codex listing and parser regressions |
| FR-003, FR-004 | changed-message index, two tags | send, stream, dedup and ignored-tool tests |
| FR-005 | existing buttons and tokens | Chrome themes, keyboard and narrow widths |
| FR-006 | notes and history read | restored/read/clear regressions |
| FR-007 | stable cached metadata | performance checklist and measurement |

## Review evidence

Real Tags and phone RowBody were mounted in a temporary Chrome harness against the current main implementation. Reviewed light/dark at 1440x900, 1024x768, 390x844 and 320x568: zero/one/two/legacy/long identifiers, click, Enter, Space and Tab. Board, list-footer and phone metadata wrap long identifiers without horizontal overflow. Browser evidence and working reports remain outside the repository. Open decisions: none. No claim of installed support.

The performance checklist from docs/performance.md was applied directly: existing card/row memo comparisons and sameAsBefore remain intact, extraction stays outside renderer code, unchanged arrays retain identity, callbacks read openLink at interaction time, and no animation or formatter is added. In an isolated development component harness, 300 memoized cards receiving 100 draft updates produced zero extra card renders for both baseline and new Tags. The incremental index handled 500 unrelated updates/listings across 300 conversations of 200 messages each in approximately 3 ms with stable output arrays. These are component measurements, not a full installed-board benchmark.

## Planning handoff

Preserve active sessions. No install, restart, publication or new runtime dependency. Typecheck, lint, tests, builds and performance review required.
