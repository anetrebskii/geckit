# Research: Tags on tasks

## Where a task's tags are kept

- **Decision**: on the task's `SessionNote` as `tags: readonly TagId[]`, surfaced on `ChatSession.tags` the way `employeeId` is (`main/sessions/index.ts`, the `sessions.push({...})` row builder).
- **Rationale**: notes are already the per-task record on this computer, survive restart, cover unborn tasks, host conversations and Codex alike, and travel to every client through the client view rows.
- **Alternatives considered**: a separate tags file keyed by session id (a second store to keep in step with deletes and ids); writing tags into the provider's session file (not ours to change, and absent for hosts until copied).

## Where the tag catalog is kept

- **Decision**: in `Settings.taskTags: readonly TaskTag[]` with `{ id, name, color, used }`, owned by the service's `main/store.ts`, broadcast to every window and client as settings already are.
- **Rationale**: one small list read everywhere a chip is drawn; settings already reach desktop, phone, remote clients and `settings show`; ids keep renames off the tasks.
- **Alternatives considered**: deriving the catalog from the tags on notes (cannot hold colour, an unused tag, or a rename without touching every task).

## How tags change

- **Decision**: service methods, not raw settings writes: `chat:tag(ids, { add, remove, create })` and `tags:edit(id, { name?, color? })`, `tags:delete(id)`. Validation (trim, 1..32 chars, unique ignoring case) runs in a pure `core/tags.ts` used by the service and by tests.
- **Rationale**: creating a tag and adding it to a task must be one step (no half-made tag if the client drops between two calls); uniqueness must hold when the phone and desktop rename at the same moment; constitution III wants this logic pure and tested.
- **Alternatives considered**: renderer calls `chat.change({ taskTags })` then `chat.tag()` (two writes, races between clients, validation only in the UI).

## Deleting a tag

- **Decision**: `tags:delete` removes the catalog entry and strips the id from every note in the same service call; `ChatSession.tags` also drops ids not in the catalog when rows are built, as a guard. Any filter entry for it is removed from `tagFilter`.
- **Rationale**: SC-005/SC-006: no place may keep a stale chip.
- **Alternatives considered**: lazy filtering only (leaves dead ids in notes forever and in exports).

## Board filter

- **Decision**: `Settings.tagFilter: readonly string[]` (`[]` all, `['none']` untagged, else any-of ids), applied beside `matchesEmployee` in `useChat.ts` `visibleSessions`, in `Switcher.tsx` and the phone board, through one `matchesTags` in `core/tags.ts`.
- **Rationale**: the employee filter already persists in settings and is honoured by board, list, phone and search; tags follow the same rule so "Clear filters" clears both.

## Search

- **Decision**: `named()` in `Switcher.tsx` includes the session's tag names in the text it matches; title matches already rank first by closeness.
- **Rationale**: FR-014 with no new index.

## The details panel

- **Decision**: the inspector toggle in `Chat.tsx` shows the panel for any task conversation; `TaskChecklist.tsx`'s panel gets a `TaskTags` section rendered above its header, or a thin wrapper renders `TaskTags` then the checklist. Tooltip "Show details" / "Hide details", aria-label "Details".
- **Rationale**: UX fork; the panel's sizing, persistence and toggle already exist.

## Picker component

- **Decision**: one `TagPicker` renderer component built on `ui/Menu.tsx`'s floating menu (its `search` field, `menu-side`) with tag rows that carry a second "..." button, and a `ui/Sheet.tsx` variant on the phone; the delete confirmation reuses the existing `.dialog` / `dialog-actions` pattern from `TaskChecklist.tsx`'s Clear dialog.
- **Rationale**: constitution VI and Apple "one decision, reused"; Menu already handles anchor, Escape, phone-sheet rendering.
- **Alternatives considered**: extending `Menu` choices with row actions for everyone (wider change to a shared component for one use).

## CLI

- **Decision**: in `core/product-sessions.ts`: `sessions tag <id> [--add <name>]... [--remove <name>]...` and `sessions list --tag <name>`; `sessions list` rows carry `tags: string[]` (names). Unknown `--remove` / `--tag` name: "No tag named "<name>"." and exit non-zero with no change. Manager guidance gains one line in `docs/` guide text.
- **Rationale**: matches `sessions assign` and `sessions mark`; agents read names, not ids.

## Remote and phone

- **Decision**: new methods are added to `shared/renderer-api.ts`, `core/application.ts` and `main/index.ts`'s `CORE_CHANNELS`; the obsolete peer phone link (`renderer/src/phone.ts`) is not extended.
- **Rationale**: every current client uses the unified client interface (spec 034); the old link only serves the screen.

## Performance

- **Decision**: cards receive resolved tags from a `Map` built once per settings change in the board, not a lookup per card per render; `BoardCard`'s memo comparison includes the tag list and catalog version.
- **Rationale**: `docs/performance.md`; the board is the hot path.
