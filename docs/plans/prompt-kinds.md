# Repeating, Scheduled and Shortcuts

- Request: implement specs/035-prompt-kinds (tasks.md); day plan 2026-11-18, "Shortcuts: split into Repeating, Scheduled (postpone until) and Shortcuts"
- Checkout: /Users/alex/Projects/mine/geckit-prompt-kinds, branch feat/prompt-kinds from origin/main 9a3abdac
- Started: 2026-11-18

## Acceptance conditions

- quickstart.md Q1 to Q10 and the CLI checks pass; unit checks in quickstart.md pass offline.
- Assumption: delivery is local (no commit, push or PR) until Alex asks.

## Progress

### 1. Prepare the UX document

- [x] Done
- Evidence: docs/ux/shortcut-kinds.md, docs/design/shortcut-kinds.html, specs/035-prompt-kinds/

### 2. Prepare the UI and test it
- [x] Done
- Evidence: real Chat window on the fake backend `sidebar-preview.html?prompts` in Chrome. Light and dark at 1200 and 760 px: Week, Month, List, chip menu, Postpone menu, day popover (mouse and keyboard), drag to postpone with Undo, New scheduled editor and save, Repeating and Shortcuts rows, Run later with Show, Team grouped by kind. Phone at 390 x 844 in light and dark: Calendar, day list, List, long-press sheet, Postpone, Duplicate, Delete with Undo, Repeating editor. Older host (no `promptKindsVersion`): Scheduled shows only its empty state. Found and fixed during review: the week day popover clipped at the top, Undo of a move losing an earlier Postponed-from, "at" shown for varied timetables on desktop rows and Team. Option-drag (synthetic drag events with Alt) opens an unsaved "{name} copy" on the dropped day and leaves the original. Testing found and fixed: a drop on a past day was silently refused instead of showing "{time} on {day} has passed. Drop it on a later day or use Postpone.".

### 3. Write the feature code
- [x] Done
- Evidence: specs/035-prompt-kinds/tasks.md (54 of 58 done; T002, T040, T052 and T057 open with reasons).

### 4. Update the related distributed skills
- [x] Done
- Evidence: skills/schedule-tasks (SKILL.md step 4, references/schedules.md: --at, --postpone, --vary, fixed kind); skill tests pass.

### 5. Update the feature list
- [ ] Done
- Evidence: entries proposed to Alex on 2026-11-18; waiting for approval.

### 6. Write unit tests
- [x] Done
- Evidence: client/test/prompt-kinds.test.ts (17), scheduler cases in client/test/shortcuts.test.ts, schedule, save, persistence and product CLI tests updated.

### 7. Verify the change
- [x] Done
- Evidence: `npm run typecheck` and `npm run lint` pass; vitest 2141 passed, 7 skipped, twice in a row. End-to-end on a real headless service with the fixture assistant (test/headless-service.test.ts): CLI --at saves a Scheduled prompt, a kind change and --at with --cron are refused, a past --postpone is refused, --postpone keeps the first time, an overdue run starts once at service start and reaches the assistant, and is not run again after another restart. performance-review: no formatter per call, no animations, list ordering memoized; not measured with 200 runs. Unverified: the real phone build, the desktop app on a real service (Alex's dev app was not touched), real mouse drags in the packaged app.
