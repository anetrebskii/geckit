# Design: Calendar-style recurrence

**Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)
**Status**: Implemented; actual component review and performance verification complete, ready for Alex's review

## Scope

Extend existing shortcut schedules on desktop and phone with the Custom recurrence interaction supplied by Alex. Covers US1-US3 and FR-001 through FR-012. Entry points remain the existing desktop Runs by itself picker and phone Repeats menu. Google integration and scheduling while GeckIt is closed are outside scope.

## Artifacts

- UX document: [calendar-recurrence.md](../../docs/ux/calendar-recurrence.md)
- Layout prototype: [calendar-recurrence.html](../../docs/design/calendar-recurrence.html)
- Specification checklist: [requirements.md](checklists/requirements.md)

## Decisions

The reference groups interval/unit, weekday toggles and exclusive end conditions. Preserve those groups and use GeckIt's own dialog, Picker, phone sheet and stylesheet tokens. Add start date/time because a shortcut has no calendar event from which to inherit an anchor. Preserve raw cron and existing named schedules.

Calendar recurrence uses anchored dates rather than converting interval/count rules to cron. Proposed After semantics count scheduled dates, including missed/skipped occurrences; manual runs remain independent. See the UX document for exact states, transitions, calendar boundaries and wording.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1; FR-001 to FR-005 | Custom editor, explicit anchor, conditional weekdays/monthly patterns | Every two weeks Tue/Thu; monthly second/last Tuesday; existing cron unchanged |
| US2; FR-006, FR-007, FR-011 | Never / On / After; scheduled / paused / ended states | Inclusive end date, three occurrences, manual run and pause/restart |
| US3; FR-008, FR-010 | Shared rules, platform-specific dialog/sheet, retained drafts | Desktop/phone round-trip, invalid inputs, cancel/Escape, failed save |
| FR-009, FR-012 | Existing execution owner; calendar/clock-change rules | Catch-up, no overlap, assistant unavailable, missing dates, clock changes |

## Review Evidence

- Read actual desktop `ShortcutList.tsx`, phone `PhoneShortcuts.tsx`, shared schedule parser/next-date logic, shortcut contracts and background scheduler.
- Read product feature list, constitution, existing shortcut CSS and `docs/performance.md`.
- Supplied screenshot is interaction evidence. Current single-weekday selector and raw cron field cannot express the proposed calendar rule.
- Prototype reviewed: desktop 1352x676 light/dark, phone 390x844 dark and 320x568 light. Exercised interval/weekday selection, Never/After, monthly picker, invalid interval/disabled Done, Cancel draft rollback, Done summary persistence, visible focus and Escape return, and scrolling. Fixed narrow weekday clipping and dark native input color scheme.
- Actual shared editor and desktop/phone shortcut components reviewed full-window in Chrome at desktop 1440x900 / 1024x768 and phone 390x844 / 320x568, each in light and dark. Reviewed adjacent editor/list hierarchy, spacing, alignment, contrast, date fields, all units/monthly patterns/end choices, invalid interval/count/empty weekdays, nested menus, keyboard Tab/Space/Enter/Escape, focus return, cancellation, save rejection/retry, paused/ended/raw cron states and scrolling. Fixed Never radio alignment, date-input styling, phone nested overlay stacking, picker selection focus and 320 px weekday overflow. Final narrow weekday row measured 278 px content / 278 px scroll width. No remaining visible problems found.
- Screenshots show actual components with isolated mocked IPC: [desktop light](screenshots/desktop_light.jpg), [phone dark](screenshots/phone_dark.jpg). They do not demonstrate a real assistant launch or physical iPhone execution. Detailed checks and runtime limits: [verification.md](verification.md).
- UX Mermaid state diagram rendered successfully with local Mermaid CLI and Chrome; evidence: `/private/tmp/geckit-calendar-recurrence.svg`.
- Performance constraints: bounded date calculation without enumerating every minute or historical occurrence; reuse date formatters; avoid expensive schedule work on unrelated keystrokes; rebuild phone after shared Chat changes.

## UI follow-up: 2026-10-12

Alex's live screenshot exposed active-looking disabled end fields, clipped input focus and uneven end-row spacing. Scoped CSS now gives inactive fields the existing muted tokens, preserves a full focus gutter, aligns end rows and follows the form's 12 px section rhythm. Phone inputs/pickers use 44 px touch targets. Behavior, messages and recurrence rules are unchanged. Review evidence and [corrected screenshots](verification.md#screenshot-follow-up-2026-10-12) are recorded in verification.md.

A second screenshot showed that the outside input outline still clipped. Non-radio input focus now draws entirely inside the control using a -2 px offset. See [focus correction evidence](verification.md#focus-correction-after-second-screenshot).

The mobile screenshot exposed a safe-area header collision and native date/time fields exceeding their narrow columns. The phone header now reserves 52 px plus the top safe area; its title can truncate between fixed action targets. Starts and At stack at full width on phone, while desktop keeps two columns. Weekday controls remain round 44 px targets, using more of the horizontal gutter below 360 px. The body scrolls under the fixed header with the bottom safe area reserved. This is a cosmetic correction to the approved fields, states and actions. See [mobile review evidence](verification.md#mobile-screenshot-follow-up-2026-10-12).

## Open Decisions

Second mobile design rejection on 2026-10-12: the iPhone screenshot shows nested gray value pills, oversized rows and native date/time text aligned toward the top. The revised direction is a compact grouped form with plain trailing values, one shared value baseline, and no nested field backgrounds. Native date/time values use explicit WebKit value centering. Rows retain 44 px direct targets without extra vertical padding; labels and values use the phone's 17 px scale. Selected weekdays use the existing soft accent and a thin accent edge instead of five large solid green disks. Group footnotes remain aligned and disabled values remain visible. Fields, validation, labels and scheduling behavior stay unchanged. The actual component preview is the interactive design surface; an installed build is not a substitute for inspecting the design.

Mobile review correction on 2026-10-12: the earlier phone checks concentrated on clipping and safe areas, but accepted a desktop-form treatment that does not match the adjacent shortcut sheet. Use GeckIt's `phone-group`, `phone-cell`, native phone input treatment and existing check icon for the phone layout. Keep the header safe-area correction and 44 px controls; group Starts/At, repeat controls, weekdays and end choices with aligned value columns and inset separators. Summary is a footnote, not another form section. Desktop layout and all recurrence semantics stay unchanged. Actual-device review requires explicit iPhone Mirroring screen access; auto-review rejected that method pending approval.

None. Alex instructed "Implement UI and the feature itself" on 2026-10-11 after reviewing the proposed behavior, including scheduled-occurrence counting.

Occurrence-count validation is bounded at 10,000 to keep finite date evaluation responsive without a historical checkpoint subsystem. Finite series beyond year 9999 reject explicitly; no silent truncation.

## Planning Handoff

Approval and prototype review complete. Follow plan, tasks, analysis and implementation, then review actual components. Preserve raw cron persistence and execution, use the shared main/renderer contract, validate stored and incoming rules, and retain scheduler-owned progress on unrelated edits. Cover persistence, calendar boundaries, recurrence changes, concurrency, finite-series catch-up and desktop/phone parity with deterministic tests. Active app/conversations must not be restarted merely to load changes.

Feature commands should scope `SPECIFY_FEATURE_DIRECTORY=specs/010-calendar-recurrence` because this checkout contains concurrent work on another feature.

### Capacitor keyboard verification

Phone custom sheet is anchored to the top and uses `calc(100dvh - var(--keyboard, 0px))`, matching the native app's Keyboard resize:none contract. The body scrolls independently above the keys; header actions stay fixed. Full-screen browser verification covers portrait safe-area fixtures, narrow larger-text layout and short landscape scrolling. Physical WKWebView controls remain a separate verification limit.

### Numeric editing correction

Phone number inputs use the existing accent-soft background with a 6 px radius while focused, replacing the inherited square desktop outline. Inset text by 6 px; occurrence width includes that inset so 10000 remains visible. Both inputs request numeric inputMode. Phone initial focus is the dialog (tabIndex-1) rather than an input; desktop interval focus remains.
