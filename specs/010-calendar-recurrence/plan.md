# Implementation Plan: Calendar-style recurrence

**Checkout**: Shared main checkout, no branch switch | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

## Summary

Add structured calendar recurrence beside existing cron with fixed start/time, calendar interval, weekday/monthly patterns and date/count endings. Use one evaluator and one recurrence editor across desktop and phone. Preserve current cron execution and scheduler-owned cursor/history.

## Design handoff

- [Design](design.md), [UX](../../docs/ux/calendar-recurrence.md), [interactive prototype](../../docs/design/calendar-recurrence.html).
- Alex approved with "Implement UI and the feature itself" on 2026-10-11.
- Prototype reviewed in Chrome: desktop default 1352x676 light/dark, phone 390x844 dark and 320x568 light; weekly selection, interval/count validation, monthly state, cancellation/Done, keyboard focus and Escape, scrolling. Narrow weekday clipping repaired. Real phone sheet and app integration still require review.
- Count scheduled dates, including missed/skipped dates; manual runs independent. Final occurrence eligible through its local day to accommodate scheduler tick latency, no later catch-up.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node 22+, ESM
**Primary Dependencies**: Existing Electron 38, React and Intl only; no runtime dependency added
**Storage**: Main-owned settings JSON via shared Shortcut / ShortcutDraft
**Testing**: Existing vitest suite, deterministic date/time and mocked IPC/process tests
**Target Platform**: macOS/Windows/Linux desktop, paired iPhone
**Project Type**: Desktop app and shared mobile renderer
**Performance Goals**: Calendar candidates rather than minute scans; next-date queries jump periods; finite endpoints use bounded cache; formatters reused
**Constraints**: No active app restart, real assistant invocation, deployment, unrelated edits or formatter churn
**Scale/Scope**: Existing shortcuts, one additional schedule representation and editor

## Constitution Check

- I: No provider/credential changes.
- II: Main owns persistence and runtime time zone; existing shortcuts IPC/phone calls carry composed contract. Optional calendarTimeZone settings metadata is runtime-owned and cannot be overridden by renderer writes.
- III: New scheduling/persistence behavior gets deterministic offline tests.
- IV: Approved UX and reviewed prototype precede implementation; actual affected states reviewed after implementation.
- V: Shared wording and contract across platforms.
- VI: Existing GeckIt tokens only; append scoped recurrence CSS.
- Constraints: No new runtime dependency; split new calendar logic by responsibility if needed.
- Shared checkout exception: preserve concurrent VPN work and feature pointer; scope all Spec Kit commands to this directory. No commit/PR requested.
- Pre/post-design gates pass. No extension hooks configured.

## Project Structure

Documentation: spec.md, design.md, plan.md, research.md, data-model.md, contracts/shortcuts.md, quickstart.md, tasks.md.

Source: client/src/shared/api.ts and new recurrence module(s); shared/schedule.ts; main/shortcuts.ts; main/store.ts; renderer/src/chat/ShortcutList.tsx, PhoneShortcuts.tsx; new shared custom recurrence editor; styles.css; isolated preview entry/HTML; client/test recurrence, schedule, shortcuts and store tests.

## Implementation phases

1. Domain types, runtime validation and calendar evaluator with fixed anchors/zone.
2. Background eligibility, persistence/save validation and read-only main zone metadata.
3. Shared Custom editor, desktop/phone integration, summaries, errors, paused/ended state.
4. Deterministic regressions and full build/checks; isolated real-component visual review and performance review.

## Complexity Tracking

Structured recurrence is necessary because cron cannot encode multiweek anchors/count endings. Main-zone metadata is necessary for phone parity. Bounded endpoint caching is limited to pure calculations; no framework or generalized scheduler abstraction.
