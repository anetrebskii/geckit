# Tasks: Tags on tasks

**Input**: Design documents from `specs/038-task-tags/` ([plan.md](plan.md), [spec.md](spec.md), [design.md](design.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)); UX [docs/ux/task-tags.md](../../docs/ux/task-tags.md); prototype [docs/design/task-tags.html](../../docs/design/task-tags.html).

**Tests**: included, because constitution III requires pure logic covered by vitest; UI is reviewed in the preview harness in a browser.

**Gate**: do not start Phase 2 until Alex approves docs/ux/task-tags.md (constitution IV). Wording in every task comes verbatim from UX section 7.

Paths are relative to the repository root.

## Phase 1: Setup

- [x] T001 (Done as the `?tags` fixture of `client/src/renderer/sidebar-preview.html` rather than a separate page.) Create the review harness `client/src/renderer/tags-preview.html` and `client/src/renderer/src/tags-preview.tsx` by copying `client/src/renderer/src/sidebar-preview.tsx`'s fake transport, with fixture sessions in all three columns (one asking, one on a host, one Manager), a `taskTags` catalog of 5 tags, one card with 5 tags, query flags `?phone`, `?theme=dark`, `?empty` (no tags)

## Phase 2: Foundational (blocks every story)

- [x] T002 Add `TaskTag`, `Settings.taskTags` and `Settings.tagFilter` (defaults `[]`), `ChatSession.tags` and `SessionMessage.tags` to `client/src/shared/api.ts` per [contracts/service-and-cli.md](contracts/service-and-cli.md)
- [x] T003 [P] Create `client/src/core/tags.ts` with pure functions: `cleanTagName` (trim, 1..32, throws "Tag names are up to 32 characters"), `findTag` (ignoring case), `createTags` (resolve existing or append with `color = length % 8`), `editTag` (unique ignoring case, throws "A tag with this name exists"; colour clamped 0..7), `deleteTag` (catalog and filter), `withTags` / `withoutTag` for a note's list, `knownTags` (drop ids not in catalog), `matchesTags(session, filter)` ([data-model.md](data-model.md))
- [x] T004 [P] Write `client/test/tags.test.ts` covering every function in `client/src/core/tags.ts`: trimming, empty, 32/33 characters, case-insensitive duplicate on create and rename, colour rotation and clamping, delete strips filter, `matchesTags` for `[]`, `['none']`, any-of
- [x] T005 Normalise `taskTags` and `tagFilter` on load in `client/src/main/store.ts` (drop bad entries, keep first of duplicate names, clamp colour, drop unknown filter ids); extend `client/test/store.test.ts`
- [x] T006 Add `tags?: readonly string[]` to `SessionNote`, surface it as `ChatSession.tags` through `knownTags` in the row builder, write tags from `SessionMessage.tags` when a task is created (both note writes that set `unborn`), and add `setTags(ids, add, remove)` and `stripTag(id)` refusing Manager conversations with "This conversation cannot have tags." in `client/src/main/sessions/index.ts`
- [x] T007 Add service methods `chat:tag`, `tags:edit`, `tags:delete` in `client/src/core/application.ts` (catalog in settings and notes changed in one call; `tags:delete` returns `{ removedFrom }`), the renderer API `chat.tag`, `tags.edit`, `tags.delete` in `client/src/shared/renderer-api.ts`, and the three channels in `CORE_CHANNELS` in `client/src/main/index.ts`
- [x] T008 Write `client/test/tags-sessions.test.ts`: create-and-add in one call, add to several sessions, remove, delete strips every note and the filter, tags survive a reload of notes, Manager conversation refused, no notice or channel message is emitted
- [x] T009 [P] Extend `client/src/renderer/src/chat/Tags.tsx` with a `TagChips` part: neutral `.tag.user-tag` with a `.tag-dot` in `--project-N`, `limit` prop (3 by default, none for the panel), "+N" chip whose title lists the rest one per line; add the chip and dot rules to `client/src/renderer/src/styles.css` using tokens only
- [x] T010 Create `client/src/renderer/src/chat/TagPicker.tsx` on `ui/Menu.tsx`'s floating menu: field "Search or create a tag", rows (check / dash / empty, dot, name) ordered checked first then by `used`, `Create tag "<typed>"` only without an exact match, disabled past 32 with "Tag names are up to 32 characters", first-use hint "Type a name to create a tag", ArrowUp/Down, Enter toggles or creates and clears the field, Escape closes; calls `chat.tag` for the given ids; on the phone renders as a sheet via `ui/Sheet.tsx`

**Checkpoint**: tags can be stored, changed through the service and drawn; the picker exists.

## Phase 3: User Story 1 - Mark a task from its card (P1) MVP

**Goal**: create and toggle tags from a card's menu; chips on cards.

**Independent test**: quickstart scenarios 1 and 2.

- [x] T011 [US1] Build a `Map` of resolved tags once per catalog change in `client/src/renderer/src/chat/Board.tsx`, pass each card its resolved tags, include them in `BoardCard`'s memo comparison, and render `TagChips` after the project and work links in the card foot
- [x] T012 [US1] Add the "Tags" item after "Mark as" in the card context menu in `client/src/renderer/src/chat/Board.tsx`, opening `TagPicker` as a side menu for `targets(menu.id)`, with mixed state for several picked cards
- [x] T013 [P] [US1] Show `TagChips` on list rows in `client/src/renderer/src/chat/Sidebar.tsx` and phone rows in `client/src/renderer/src/chat/PhoneBoard.tsx`, and add "Tags..." to the phone row menu opening the picker sheet
- [x] T014 [US1] Review in the harness: create, toggle, 5 tags show 3 and "+2", several picked cards with a dash; light and dark at 1440x900 and 1024x768, phone 390x844 and 320x568; fix what is off

## Phase 4: User Story 2 - Narrow the board to a tag (P1)

**Goal**: Filters > Tags and Search by tag.

**Independent test**: quickstart scenarios 3 and 4.

- [x] T015 [US2] Apply `matchesTags(session, settings.tagFilter)` beside `matchesEmployee` in `visibleSessions` in `client/src/renderer/src/chat/useChat.ts` and in `client/src/renderer/src/chat/Switcher.tsx`; make the board's empty state and "Clear filters" also clear `tagFilter` in `client/src/renderer/src/chat/Board.tsx` and `client/src/renderer/src/chat/Sidebar.tsx`
- [x] T016 [US2] Add the "Tags" row (hidden with no tags; subtitle "All tags", "No tags" or names joined by ", ") and its page ("All tags", "No tags", divider, each tag with a check, staying open) in `client/src/renderer/src/chat/TaskFilters.tsx`; include `tagFilter` in `filtered` and in "Clear filters"
- [x] T017 (Done as a Tags chip beside the Employee chip, `TagFilter` in `TaskFilters.tsx`, since the phone has no filter sheet.) [P] [US2] Add the same Tags choice to the phone filter sheet in `client/src/renderer/src/chat/PhoneScope.tsx` (or the phone filter owner found there) and its empty state in `client/src/renderer/src/chat/PhoneBoard.tsx`
- [x] T018 [P] [US2] Include tag names in `named()` in `client/src/renderer/src/chat/Switcher.tsx`; extend `client/test/switcher.test.ts` so a tag name finds a tagged task after title matches
- [x] T019 [US2] Review filters and search in the harness on desktop and phone, both themes

## Phase 5: User Story 3 - Rename, recolour, delete where used (P2)

**Goal**: per-row "..." in every picker.

**Independent test**: quickstart scenario 5.

- [x] T020 [US3] Add the per-row "..." button (`"<name> options"`, visible on hover and focus, reachable by Tab) and its side menu "Rename", "Colour", "Delete" to `client/src/renderer/src/chat/TagPicker.tsx`
- [x] T021 [US3] Implement in-place rename (field with the name selected, Enter saves through `tags.edit`, Escape cancels, "A tag with this name exists" under the field) and the Colour swatches (8, current ringed) in `client/src/renderer/src/chat/TagPicker.tsx`; styles in `client/src/renderer/src/styles.css`
- [x] T022 [US3] Implement Delete: unused tag removed at once; a tag in use opens the `.dialog` "Delete tag "<name>"?" / "It is removed from 1 task. The tasks stay." or "... <N> tasks ..." with Cancel focused and Delete `primary danger`, calling `tags.delete`, in `client/src/renderer/src/chat/TagPicker.tsx`
- [x] T023 [US3] On the phone sheet, the row "..." opens an action sheet Rename (field sheet with Save), Colour, Delete with the same dialog, in `client/src/renderer/src/chat/TagPicker.tsx`
- [x] T024 [US3] Review rename, colour and delete in the harness, including keyboard-only, both themes, desktop and phone

## Phase 6: User Story 4 - Tags in the conversation (P2)

**Goal**: header chips, details panel section, phone info row.

**Independent test**: quickstart scenarios 6 and 7.

- [x] T025 [US4] Show `TagChips` (limit 3) after the project in the conversation head, as one button opening `TagPicker`, hidden for Manager conversations, in `client/src/renderer/src/chat/Chat.tsx`
- [x] T026 [US4] Create `client/src/renderer/src/chat/TaskTags.tsx`: section "Tags" with every chip, each with a remove button "Remove <name>", then "Add tag" opening `TagPicker`; focus moves to "Add tag" when the last tag is removed; styles in `client/src/renderer/src/styles.css`
- [x] T027 [US4] Render `TaskTags` above the checklist in the inspector panel, open the panel for every task conversation (not Manager), and change the toggle to title "Show details" / "Hide details", aria-label "Details", in `client/src/renderer/src/chat/Chat.tsx` and `client/src/renderer/src/chat/TaskChecklist.tsx`
- [x] T028 [P] [US4] Add the "Tags" cell with chips to `client/src/renderer/src/chat/PhoneInfo.tsx`, opening the picker sheet; not for Manager conversations
- [x] T029 [US4] Review header, panel (with and without a checklist, resized narrow) and phone info in the harness, both themes

## Phase 7: User Story 5 - Tag when starting a task (P3)

**Independent test**: start a task with a tag; the new card carries it.

- [x] T030 (The phone New task form is the ON_PHONE branch of `NewTask` in `chat/Board.tsx`, not `PhoneHome.tsx`.) [US5] Add a "Tags" control beside Employee in the desktop New task controls in `client/src/renderer/src/chat/Chat.tsx` and the phone new-task sheet in `client/src/renderer/src/chat/PhoneHome.tsx`, keeping chosen ids in the draft and sending them as `SessionMessage.tags`
- [x] T031 [US5] Review the New task control on desktop and phone, both themes

## Phase 8: User Story 6 - Manager and workers (P3)

**Independent test**: quickstart scenario 8.

- [x] T032 [US6] Add `sessions tag <id> [--add <name>]... [--remove <name>]...` and `sessions list --tag <name>`, and `tags` (names) on each `sessions list` row, with `No tag named "<name>".` for unknown names, in `client/src/core/product-sessions.ts` and its help text in `client/src/core/product-cli.ts`
- [x] T033 [P] [US6] Write `client/test/tags-cli.test.ts`: add creates, remove, unknown name refuses without change, list filter, list rows carry names, Manager refused
- [x] T034 [US6] Add one line on tags (`sessions tag`, `sessions list --tag`, only when the person asks) to the Manager and worker guides where `sessions assign` is documented (find with llmdex or grep in `profiles/` and `skills/manage-conversations/`)

## Phase 9: Polish

- [x] T035 Run `performance-review` against `docs/performance.md` with 200 cards in the harness (board render, hover, filter change) and fix regressions
- [x] T036 Full visual pass per `build-product-ui` review: every surface in light and dark at 1440x900, 1024x768, 390x844, 320x568; record evidence in [design.md](design.md) Review Evidence and correct `docs/ux/task-tags.md` where the build disagreed
- [x] T037 `cd client && npm run lint && npm run typecheck && npm run test`
- [x] T038 (Approved by Alex on 2026-11-25.) Propose the feature entry for `docs/features.md` to Alex and, after approval, add it with evidence in `docs/feature-audit.md`

## Dependencies

- Phase 2 needs the UX approval gate and Phase 1.
- T003 and T004 can run together; T005 to T008 follow T002 and T003; T009 and T010 follow T002.
- US1 (Phase 3) and US2 (Phase 4) need only Phase 2; they can proceed in parallel.
- US3 needs T010 (picker). US4 needs T009 and T010. US5 needs T010. US6 needs T006 and T007 only.
- Polish runs last.

## Parallel examples

- Phase 2: T003 with T004; then T009 with T005.
- US1: T013 alongside T011/T012.
- US2: T017 and T018 alongside T016.
- US4: T028 alongside T026/T027.
- US6 can be done by a second person at any time after T007.

## Implementation strategy

1. MVP: Phases 1-3 (tags created and shown from the card). Review and show Alex.
2. Add US2 (filter and search): tags become useful for finding work.
3. Add US3 and US4 together (editing where used, conversation surfaces).
4. Add US5 and US6 if Alex keeps them in scope (design.md Open Decisions).
5. Polish, feature list proposal.
