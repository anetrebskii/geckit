# Recover a checklist's first goal

- Request: Make GeckIt recover automatically when a saved checklist's first goal never starts.
- Checkout: `/Users/alex/Projects/mine/geckit`, branch `main`.
- Started: 2026-11-19.

## Acceptance conditions

- A conversation with a saved, unstarted checklist finishes a normal turn -> GeckIt dispatches the first item once.
- An existing goal or a checklist awaiting approval -> GeckIt keeps the current state.
- The turn fails, is stopped or hits a limit -> GeckIt does not dispatch the item on that ending.
- Assumption: Recovery follows a normal turn. Opening a conversation is not a trigger.

## Progress

### 1. Prepare the UX document

- [x] Done. The existing [checklist UX](../ux/task-checklists.md) describes recovery for the first and later items.

### 2. Prepare the UI and test it

- Not applicable. The existing checklist states show whether activation occurred.

### 3. Write the feature code

- [x] Done. The session controller recognizes a saved checklist with a waiting item and no goal. It uses the existing handoff path. Typecheck, build and lint on the changed TypeScript files passed. Full lint reports 43 errors in five unrelated scripts.

### 4. Update the related distributed skills

- Not applicable. Checklist setup and commands are unchanged.

### 5. Update the feature list

- Not applicable. The fix restores automatic activation in the existing Goals and review entry.

### 6. Write unit tests

- [x] Done. The new regression failed before the fix and passed afterward. All 287 session tests passed. The first full run timed out in the settings file-watcher test. That suite passed in isolation, and the full rerun passed with 2,247 tests and 7 skipped.

### 7. Test the feature at the session boundary

- [x] Done. The regression sent `continue` to a conversation with a saved checklist and observed one Codex goal dispatch and the first item exposed as the goal. The test substitutes the Codex provider. The live conversation was not restarted or exercised.

### 8. Test the final UI

- Not applicable. There are no renderer or layout changes.

## Result

- Delivery target: `main`.
