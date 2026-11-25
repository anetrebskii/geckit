# Quickstart: validating tags on tasks

## Prerequisites

- `cd client && npm install`
- Unit and integration checks: `npm run test`, `npm run typecheck`, `npm run lint`
- Renderer review without the Electron app: serve `client/src/renderer/*-preview.html` with plain Vite (see the project memory "Renderer preview server"), using a `tags-preview.html` harness that mounts the real Chat with fixture sessions and tags.

## Scenarios

1. **Create and mark (US1)**: in the harness with no tags, right-click a card, Tags, type `release`, Enter. Expect the chip on the card, the field cleared, the picker still open. Add four more tags; expect three chips and `+2` with the other names in its tooltip.
2. **Persist (FR-008)**: in the dev app on an isolated data folder, tag a task, quit, start again. Expect the chip.
3. **Filter (US2)**: Filters, Tags, pick two tags. Expect tasks with either; the Filters dot; `Clear filters` restores all. Pick `No tags`; expect only untagged tasks.
4. **Search (FR-014)**: open Search, type a tag name. Expect tagged tasks after title matches.
5. **Edit and delete (US3)**: in any picker press a row's "...", Rename to a taken name; expect `A tag with this name exists`. Recolour; expect every dot to change. Delete a tag on 3 tasks; expect `Delete tag "<name>"?` / `It is removed from 3 tasks. The tasks stay.` with Cancel focused; Delete removes every chip.
6. **Details panel (US4)**: open a task without a checklist, press the inspector toggle (`Show details`). Expect Tags above the checklist; remove the last tag; focus lands on `Add tag`. Manager conversation: no Tags section.
7. **Phone (FR-011)**: harness with `?phone`: conversation info, Tags, create, rename and delete through the sheet.
8. **CLI (US6)**: `geckit-local sessions tag <id> --add release` then `geckit-local sessions list --tag release`; expect the task. `--remove nope` prints `No tag named "nope".` and changes nothing.
9. **Silence (FR-017)**: after 1-8, no desktop notification, push or channel message was produced.

## Visual review

Both themes; desktop 1440x900 and 1024x768; phone 390x844 and 320x568; keyboard: Tab reaches each row's "...", Escape closes the innermost layer, Enter creates or toggles. Then `performance-review` against `docs/performance.md` with 200 cards.
