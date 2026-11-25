# Design: Tags on tasks

**Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)
**Status**: Ready for review (not approved; Alex has not yet said yes to the UX document)

## Scope

The person marks tasks with their own tags, sees them on cards, in the conversation and on the phone, edits the tag list where tags are used, filters the board by tags and finds tasks by tag in Search. Manager and workers use tags through the CLI. Manager conversations have no tags. Settings > Tags is not added.

## Artifacts

- UX document: [docs/ux/task-tags.md](../../docs/ux/task-tags.md)
- Layout prototype: [docs/design/task-tags.html](../../docs/design/task-tags.html), drawn on the app's own `styles.css`

## Decisions

- One tag picker everywhere (card menu, header, details panel, New task form, phone sheet): field, rows with check marks, `Create tag "<typed>"`, and a per-row "..." with Rename, Colour, Delete. See UX sections 2, 3 and 10.
- Chips are neutral with the tag colour only in a dot; 3 on cards and headers, then "+N"; all in the details panel. UX section 6.
- The details panel gets a Tags section above the checklist and opens for every task conversation; the toggle reads "Show details" / "Hide details". UX fork "Tags in the details panel".
- Filter is any-of, plus "No tags". UX fork "Filter logic".
- Delete of a tag in use is confirmed with the count; unused tags are deleted without asking. UX sections 3 and 7.
- No notifications for any tag change. UX section 5.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-001..003, FR-007 | UX 3 "The picker", prototype Board | Create "release" from a card; chip appears; 5 tags show 3 and "+2" |
| US2, FR-013, FR-014 | UX 3 "The board filter" | Filter by two tags shows either; "No tags"; empty board offers Clear filters |
| US3, FR-004..006 | UX 3 picker rows "Tag options" to "Confirm delete" | Rename refuses a taken name; delete in use shows the count dialog |
| US4, FR-009..011, FR-016 | UX 2 details panel, header, phone info | Remove a tag in the panel, card matches; phone sheet adds and renames |
| US5, FR-012 | UX 2 New task form | Start a task with a tag; card carries it |
| US6, FR-015, FR-017 | UX 2 CLI, UX 5 silence | `sessions tag --add` shows on the card; no notice is sent |

## Review Evidence

Implementation reviewed on 2026-11-25 in the real Chat window on a fake backend (`client/src/renderer/sidebar-preview.html?tags`, served by Vite, Camoufox test profile `geckit:geckit`). Nothing below was checked against a real service or account.

- Desktop 1440x900 light: board chips and "+N", card menu Tags to picker, search, create with Enter, row "..." menu, delete dialog "Delete tag "Release"? It is removed from 2 tasks. The tasks stay." and its result, Filters Tags page filtering the board, details panel Tags section, removing the last tag moves focus to "Add tag".
- Keyboard: Enter on "Add tag" focuses the field, Tab reaches each row "<name> options", Enter opens Rename / Colour / Delete, arrows move through them and the swatches, Colour focuses the current swatch, Escape returns to the field. Two defects found and fixed: the picker field never got focus (autoFocus ran while the menu was hidden for measuring) and the options menu ignored arrows.
- Desktop 1024x768 dark: details panel Tags section and picker placement (8px from the window edge).
- Phone 390x844 light: row chips.
- Phone 320x568 light: long-press row menu "Tags...", picker as a sheet with "..." per row, Colour sheet (swatches 44px), Rename with "A tag with this name exists" and a successful rename, "+2" wrapping, the Tags filter chip, the conversation info "Tags" row and its picker sheet. Fixed: the info row clipped chips with no sign of the rest; it now shows one chip and "+N".
- New task Tags control: desktop 1440x900 light and dark, 1024x768 light (3 chips and "+1"), phone 320x568 and 390x844 dark (one chip and "+N"). Picking and creating a tag in the form, then Start, puts the tags on the new card (desktop and phone). Fixed: on the phone sheet the Employee and Tags labels were grey and indented because `.phone-task-cell span` also matched the label of those rows; the chip names were cut mid-word, now one chip and "+N". The harness had no `chat:send` answer, so Start blanked the page with or without tags; a fake answer was added to the harness.
- Full matrix, scripted and inspected: 1440x900, 1024x768, 390x844 and 320x568, each in light and dark, showing the board, New task with three tags picked (picker open, then closed), and the conversation's tags (desktop details panel with the picker open from "Add tag"; phone conversation info with its Tags picker sheet). No clipping, overlap or contrast problem found in any of the 40 screens.
- Performance, dev build, 202 cards / 337 chips against no tags: unrelated settings write 32-36 ms in both; tag filter toggle 25-75 ms against 16-83 ms; adding or removing a tag on one card 25-37 ms. Fixed: the tag lookup was rebuilt on every settings write.
- Real service, 2026-11-25: a headless service built from the working tree (`vite build --config service.vite.config.ts --outDir <scratch>`) ran on a scratch data directory with a scratch `HOME`, driven over its operator RPC by a script. 17 checks passed: create (trimmed, rotating colours), a planned task created with a tag, add to several tasks, case-insensitive reuse on create, remove, rename refused onto another tag's name, rename and recolour keeping the id, delete reporting 2 tasks and clearing the tag from tasks, catalog and filter, a gone task refused, a 33-character name refused. After a restart the catalog, filter and task tags were all kept. The built CLI against it: `sessions list` gives tag names (`[]` when untagged), `--tag client` matches ignoring case, `--tag Nope` says `No tag named "Nope".` `sessions tag` itself is refused under an agent shell by the operator guard, so the write path is covered by `tags-cli.test.ts` only. Tasks were created with `chat:schedule`, so no assistant turn ran.
- Real Chat UI on a real service, 2026-11-25: the preview's `?live=<port>` mode sends the list, tag and settings calls through a local bridge to the scratch headless service (`chat:send` mapped to `chat:schedule`, so no assistant turn). Through the UI, each confirmed in the service's own state: details panel pick and create, rename refused with "A tag with this name exists" shown inline, rename, delete dialog "It is removed from 1 task. The tasks stay." removing it everywhere, card menu Tags, Filters Tags saved and read back after a page reload, New task with a picked and a created tag, Search by a tag name, phone row menu "Tags..." at 390x844.
- Not checked: the native phone app (not rebuilt), the `sessions tag` CLI write against a running service, the Electron preload and main relay between the window and the service (the renderer reached the service through the bridge instead), Camoufox cannot run the phone title's scroll-driven animation so the header was inspected with that animation overridden. The harness shows a pre-existing "piece is undefined" line because it has no `chat:before` answer.

## Open Decisions

- Any-of filtering (FR-013), the New task form control (FR-012, US5) and the CLI (FR-015, US6) are taken at the UX document's verdicts; Alex has not confirmed them. Declining one drops that story only.
- Approval of the UX document itself is pending.

## Planning Handoff

Preserve the wording of UX section 7 verbatim, the 3-chip limit, the 32-character name limit, and the 8-colour palette. Shared contracts touched: `shared/api.ts` (`ChatSession`, `Settings`), `shared/renderer-api.ts`, `core/application.ts` service methods, `main/index.ts` core channel list, the client view's session rows, and `geckit sessions` CLI. Validation must cover both themes, desktop and phone widths, keyboard reach of the row "...", and `docs/performance.md` for the board (chips must not add per-card work).
