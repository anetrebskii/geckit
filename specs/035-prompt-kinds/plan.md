# Implementation Plan: Repeating, Scheduled and Shortcuts

**Branch**: `feat/prompt-kinds` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/035-prompt-kinds/spec.md`

## Summary

Split Shortcuts into three kinds of prompts with their own places under a new "Prompts" sidebar group: Repeating (timetable), Scheduled (one set moment, postponable, Week, Month and List views) and Shortcuts (by hand). The kind is derived from the timing fields of the existing `Shortcut` type, so existing items need no move. One editor serves all three. Start variation becomes one "Vary start time" switch. Rows show assignee and model, Duplicate reaches every row and calendar run, and Questions is renamed Quick chats. The design handoff is [design.md](design.md); behavior, wording and numbers are in [docs/ux/shortcut-kinds.md](../../docs/ux/shortcut-kinds.md); the prototype is [docs/design/shortcut-kinds.html](../../docs/design/shortcut-kinds.html).

## Technical Context

**Language/Version**: TypeScript, React 19, Node 22+ (ESM)

**Primary Dependencies**: Electron with electron-vite; hand-written CSS with the tokens in `styles.css`; Capacitor for the phone. No new dependency: the calendars are plain CSS grid, the dates use `Intl.DateTimeFormat` as the Repeating summaries already do.

**Storage**: the service-owned settings file. `Shortcut` gains `at`, `postponedFrom`, `outcome` and `vary` and loses `startWindowMinutes`; settings gain `scheduledView` and `promptKindsVersion`. The phone keeps `phoneScheduledView` in its web view storage. Details in [data-model.md](data-model.md).

**Testing**: vitest. New `client/test/prompt-kinds.test.ts`; extended `schedule.test.ts`, `shortcuts.test.ts`, `shortcut-save.test.ts`, `shortcut-persistence.test.ts`, `shortcut-product.test.ts`, `places.test.ts`. Rendered review per [quickstart.md](quickstart.md).

**Target Platform**: macOS, Windows, Linux desktop; iPhone and Android through the phone app; the CLI.

**Project Type**: desktop app with a background service, a phone client sharing the Chat renderer, and a CLI.

**Performance Goals**: switching places or views shows the next frame; Week and Month draw a month of up to 200 runs without a visible delay; the scheduler's look stays O(prompts) per tick. Rows and calendar cells are memoised as `EmployeeShortcut` is, per `docs/performance.md`.

**Constraints**: wording verbatim from the UX document; the drawn start and the spread never leave the scheduler; tokens only; files under about 400 lines; no prettier; the phone reaches only listed calls.

**Scale/Scope**: 3 places (2 new), 3 Scheduled views plus 2 phone views, 1 shared editor, 6 Duplicate entry points, 1 new service call, 3 CLI flags.

## Constitution Check

| Principle | Status |
| --- | --- |
| I. The person's own plan | Pass: Scheduled runs start through `runShortcut` and the conversation queue like Repeating ones; no new process or key. |
| II. One contract between main and windows | Pass: the new fields go into `shared/api.ts`, `configuration.ts` and `agent-settings.ts`; `shortcuts:postpone` is added to the service methods, `renderer-api.ts`, `CORE_CHANNELS` and the phone call list; capability through the `promptKindsVersion` settings flag. |
| III. Recorded output, not live calls | Pass: kind, duplicate, postpone choices, lead text, spread and catch-up are pure functions in `shared/prompt-kinds.ts` and `shared/schedule.ts`, tested with fixed clocks. |
| IV. UX before pixels | Pass: UX document and prototype exist and are revised by Alex's comments; differences found while building go back into the UX document first. |
| V. Every system, one word | Pass: Cmd+D is Ctrl+D and Option-drag is Alt-drag elsewhere; copy is the same on every system. |
| VI. Tokens only | Pass: the prototype uses existing tokens; the danger fill for problem cards uses `--danger` mixes as Board cards do. |

Post-design re-check: no new violation. `ShortcutList.tsx` (584 lines) and `PhoneShortcuts.tsx` (471) are already over the guide; this plan splits them rather than growing them (Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/035-prompt-kinds/
├── spec.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── prompt-rules.md
│   ├── service-calls.md
│   └── places.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/shared/api.ts, configuration.ts, agent-settings.ts      Shortcut fields, scheduledView
client/src/shared/prompt-kinds.ts                                  new: pure kind, duplicate, postpone, lead, badge rules
client/src/shared/schedule.ts                                      spread, drawnStart, latestStart, catchUp; start window removed
client/src/main/store.ts                                           migration startWindowMinutes -> vary, ran items cleanup
client/src/main/shortcuts.ts                                       look for Scheduled, outcomes, notices, postpone, kind guard
client/src/main/tray.ts                                            gecko menu groups and Next line
client/src/core/application.ts, product-shortcuts.ts, product-cli.ts   shortcuts:postpone, CLI fields and flags, capabilities
client/src/main/store.ts                                           promptKindsVersion: 1 capability flag
client/src/cli/                                                    employees shortcut --at, --postpone, --vary; quick chat name
client/src/main/index.ts, shared/renderer-api.ts, renderer/src/phone-calls.ts   new call wiring
client/src/renderer/src/chat/places.ts, Sidebar.tsx, PlacePages.tsx  Prompts group, badge, Quick chats name
client/src/renderer/src/chat/PromptPage.tsx                        new: shared page shell (title, subtitle, New, search, empty, Undo)
client/src/renderer/src/chat/PromptRow.tsx                         new: row with assignee avatar and meta line, More menu, Duplicate
client/src/renderer/src/chat/PromptEditor.tsx                      new: the one editor, moved out of ShortcutList.tsx, timing by kind
client/src/renderer/src/chat/ShortcutList.tsx                      Repeating and Shortcuts pages on the shared parts
client/src/renderer/src/chat/Scheduled.tsx                         new: page, view switch, List view, Ran today
client/src/renderer/src/chat/ScheduledWeek.tsx, ScheduledMonth.tsx new: calendars, run menu, day popover, drag, keys
client/src/renderer/src/chat/scheduled.css                         new: calendar rules
client/src/renderer/src/chat/PhoneShortcuts.tsx, PhoneScheduled.tsx  phone pages, long-press sheet
client/src/renderer/src/chat/PhoneHome.tsx, Questions.tsx, PhoneQuestions.tsx  Quick chats wording, phone menu group
client/src/renderer/src/employees/shortcuts.tsx, Team.tsx           kind headings in an employee's page
client/src/renderer/src/ui/Icon.tsx                                clock glyph
client/test/prompt-kinds.test.ts, schedule.test.ts, shortcuts.test.ts, shortcut-save.test.ts, shortcut-persistence.test.ts, shortcut-product.test.ts, places.test.ts
docs/features.md, docs/feature-audit.md                            proposed entries, after Alex approves them
```

**Structure Decision**: the existing client layout. Rules that decide what is shown go to pure modules so they are tested without rendering. The editor and row move out of `ShortcutList.tsx` into shared components so all three pages and the phone use one code path (FR-020).

## Validation Constraints from the Design

- Every label, state and message is copied from UX section 7; a mismatch is a defect.
- The drawn start, the spread and "30 minutes" appear in no UI, notice, tray line or CLI output (SC-005); a test greps the listing output.
- Week is the default; the switch keeps its place across launches.
- Didn't start and Missed are never dropped: covered by scheduler tests with a stubbed `start` that fails and a clock moved past 12 h.
- Rendered review in light and dark at 1200 and 760 px and on a 390 x 844 phone, with keyboard only, before the feature is called done.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| `outcome` stored on the prompt | A Scheduled item has one run; the badge, list and calendar read it with the prompt | A separate run file would need its own migration, cleanup and phone call for at most one entry per item |
| Hashed draw instead of a stored start | Restarts keep the same start with nothing hidden in settings to leak through the CLI listing | A stored drawn moment is another field every client would carry |
| Renderer-delayed delete for Undo | Restoring after removal would need a new id and lose `lastSession` | A tombstone in settings adds a state every reader must skip |
