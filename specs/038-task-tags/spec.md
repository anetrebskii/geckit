# Feature Specification: Tags on tasks

**Feature Branch**: `038-task-tags`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "Tags on tasks: the person marks board tasks with their own named, coloured tags; adds, creates, renames, recolours and deletes tags from a picker on the card menu, the conversation header, the conversation details panel (above the checklist), the phone conversation info sheet and the New task form; sees up to 3 tag chips on cards then +N; filters the board by tags (any-of, or No tags) through Filters; finds tasks by tag name in Search; Manager and workers read and write tags through `geckit sessions tag` and `sessions list --tag`. Settings > Tags is not added. The approved-draft UX is docs/ux/task-tags.md and the prototype docs/design/task-tags.html."

The behaviour, states and exact wording are decided in [docs/ux/task-tags.md](../../docs/ux/task-tags.md); the layout is drawn in [docs/design/task-tags.html](../../docs/design/task-tags.html). Where this spec and the UX document disagree, the UX document is corrected first (constitution IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mark a task with a tag from its card (Priority: P1)

The person right-clicks a card on the board, opens Tags, and checks an existing tag or types a new name and presses Enter. The tag appears on the card at once as a chip with a coloured dot, and stays there across restarts, column moves, archive and a change of model.

**Why this priority**: marking tasks in the person's own words is the whole point; everything else builds on tags existing on tasks.

**Independent Test**: on a board with no tags, create "release" from one card's menu, add it to a second card, restart GeckIt, and confirm both cards still show the chip.

**Acceptance Scenarios**:

1. **Given** no tag exists, **When** the person opens Tags on a card, **Then** the picker shows the field "Search or create a tag" and the hint "Type a name to create a tag".
2. **Given** the picker is open, **When** the person types "release" and presses Enter, **Then** a tag "release" is created with the next palette colour, checked for this card, and its chip appears on the card; the field clears and the picker stays open.
3. **Given** "Release" exists, **When** the person types "release", **Then** no create row is offered and the existing tag is the match.
4. **Given** a card carries a tag, **When** the person unchecks it, **Then** the chip disappears from the card.
5. **Given** a card carries five tags, **When** the board shows it, **Then** the card shows three chips and "+2", whose tooltip lists the remaining two names.
6. **Given** several cards are picked with Cmd/Ctrl+click and differ on a tag, **When** the person opens Tags, **Then** that tag shows a dash, and pressing it adds it to all picked cards; pressing again removes it from all.
7. **Given** the typed name is longer than 32 characters, **Then** the create row is disabled with "Tag names are up to 32 characters".

---

### User Story 2 - Narrow the board to a tag (Priority: P1)

The person opens Filters, then Tags, and chooses one or more tags or "No tags". The board, list view and phone board show only matching tasks, the Filters button shows its active dot, and "Clear filters" returns everything.

**Why this priority**: a mark that cannot be used to find work is decoration; filtering is the usable result.

**Independent Test**: tag two of five tasks "release", filter by "release", confirm only those two show on desktop and phone, then clear.

**Acceptance Scenarios**:

1. **Given** no tag exists, **When** the person opens Filters, **Then** there is no Tags row.
2. **Given** tags exist, **When** the person chooses "release" and "hotfix", **Then** tasks carrying either tag are shown.
3. **Given** "No tags" is chosen, **Then** only untagged tasks are shown.
4. **Given** a filter leaves no task, **Then** the board says "No tasks match these filters" with "Clear filters".
5. **Given** the board is filtered by a tag, **When** that tag is deleted, **Then** it leaves the filter and, if no other tag remains chosen, the filter turns off.
6. **Given** tags exist, **When** the person types a tag's name in Search, **Then** tasks carrying it are found after title matches.

---

### User Story 3 - Rename, recolour and delete a tag where it is used (Priority: P2)

In any picker, the person points at a tag and presses its "..." to Rename (in place), change Colour (the palette swatches) or Delete. Deleting a tag that tasks carry asks first, naming how many tasks lose it.

**Why this priority**: the tag list drifts as work changes; without editing it the person ends up with stale or misspelled tags, but tagging and filtering already work without it.

**Independent Test**: rename "relase" to "release" from a card's picker and see every chip change; try renaming to an existing name and see the refusal; delete a tag carried by three tasks and see the dialog and the chips disappear.

**Acceptance Scenarios**:

1. **Given** the picker lists tags, **When** the person presses a tag's "...", **Then** a menu shows "Rename", "Colour" and "Delete".
2. **Given** Rename is chosen, **When** the person types a free name and presses Enter, **Then** every card, header, panel, filter and phone row shows the new name; Escape keeps the old one.
3. **Given** Rename to a name another tag has, ignoring case, **Then** the field stays open with "A tag with this name exists".
4. **Given** Colour is chosen, **When** a swatch is picked, **Then** the tag's dot changes everywhere.
5. **Given** a tag carried by no task, **When** Delete is chosen, **Then** it is removed without a dialog.
6. **Given** a tag carried by N tasks, **When** Delete is chosen, **Then** a dialog "Delete tag "<name>"?" says "It is removed from N tasks. The tasks stay." with Cancel focused and Delete marked destructive; Delete removes the tag and its chips, Cancel or Escape changes nothing.
7. **Given** checking a tag in the picker, **Then** it never renames, recolours or deletes it.

---

### User Story 4 - See and edit tags in the conversation (Priority: P2)

In an open conversation, the header shows the task's tags after the project, and the details panel on the right shows a Tags section above the checklist with every tag, a remove button on each, and "Add tag". On the phone the conversation's info has a Tags row that opens the picker as a sheet.

**Why this priority**: the person is often inside a conversation when they decide how to mark it; the board path already covers the need.

**Independent Test**: open a tagged conversation, remove a tag in the panel, add one with "Add tag", and confirm the card on the board matches; do the same from the phone's info sheet.

**Acceptance Scenarios**:

1. **Given** a task conversation, **When** the person presses the inspector toggle, **Then** the details panel opens even if the task has no checklist; its tooltip reads "Show details" / "Hide details".
2. **Given** the panel is open, **Then** a Tags section sits above the checklist with every tag of the task (no "+N"), each with "Remove <name>", followed by "Add tag".
3. **Given** the last tag is removed in the panel, **Then** focus moves to "Add tag".
4. **Given** the header shows tags, **When** the person presses them, **Then** the picker opens anchored there.
5. **Given** a Manager conversation, **Then** no tag section, header chips or info row are offered.
6. **Given** the phone conversation info, **When** the person presses Tags, **Then** the picker opens as a sheet with the same rows, create row and each tag's "..." with Rename, Colour and Delete.

---

### User Story 5 - Tag a task when starting it (Priority: P3)

The New task form on desktop and phone has a Tags control beside Employee that opens the same picker; the task starts with those tags.

**Why this priority**: saves a step, but tagging right after creation already works.

**Independent Test**: start a task with "release" chosen in the form and confirm the new card carries it.

**Acceptance Scenarios**:

1. **Given** the New task form, **When** the person chooses tags and sends, **Then** the new card shows them.

---

### User Story 6 - Manager and workers read and write tags (Priority: P3)

Through the CLI, Manager and workers list tasks by tag and add or remove tags on a task when the person asks. The changes appear on cards without a notification.

**Why this priority**: lets the person ask Manager "what is on release" or "mark these for review"; the UI is complete without it.

**Independent Test**: run `geckit sessions tag <id> --add release`, see the chip on the card; run `geckit sessions list --tag release` and see that task.

**Acceptance Scenarios**:

1. **Given** a task id, **When** `sessions tag <id> --add <name>` runs, **Then** the tag is added, creating it if it does not exist, and the card shows it.
2. **Given** `--remove <name>` or `list --tag <name>` names no existing tag, **Then** the command says "No tag named "<name>"." and changes nothing.
3. **Given** `sessions list`, **Then** each task's tags are included in its output.
4. **Given** an agent changed a tag, **Then** no notice, push or channel message is sent.

### Edge Cases

- A card with a work link, a host tag and five tags: project, host, links, then three tags and "+2"; long names truncate with the full name as a tooltip.
- Leading and trailing spaces are trimmed; an empty name cannot be created or saved by Rename.
- A conversation on a disconnected host keeps and shows its tags; tags are kept on this computer.
- A phone or paired computer changes the tags of the computer it looks at; tags are not synced between computers. While its link is down, the change is held with the client's existing held calls and withdrawn with the existing error if it fails.
- A task is deleted: the tag stays available in the picker.
- A tag carried by no task stays until deleted.
- Rename to an existing name is refused; merging is not offered.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The person MUST be able to create a tag by typing its name in the tag picker and confirming; the tag gets the next colour of the existing project palette, rotating through its 8 colours.
- **FR-002**: Tag names MUST be unique ignoring case, trimmed, non-empty and at most 32 characters; the original spelling is kept.
- **FR-003**: The person MUST be able to add and remove tags on one task, or on several picked tasks at once, from the card menu's Tags picker; a tag on some but not all picked tasks MUST show as mixed.
- **FR-004**: Every picker row MUST offer Rename (in place), Colour (palette swatches) and Delete behind a per-row "..." that is reachable by pointer and keyboard; checking a row MUST NOT change the tag itself.
- **FR-005**: Deleting a tag carried by tasks MUST be confirmed in a dialog naming the tag and the number of tasks, with Cancel as default and Delete marked destructive; deleting an unused tag MUST NOT ask.
- **FR-006**: Renaming, recolouring and deleting a tag MUST update every place it is shown at once: cards, list rows, headers, the details panel, filters, phone rows and sheets.
- **FR-007**: Board cards, list rows and phone task rows MUST show up to 3 tag chips after the project and work links, then "+N" with the remaining names in its tooltip; chips are neutral with the tag's colour only in a dot.
- **FR-008**: A task's tags MUST persist with the task across restarts, column moves, archive and unarchive, and resuming with another model.
- **FR-009**: The conversation header MUST show the task's tags (3, then "+N") and open the picker when pressed.
- **FR-010**: The desktop details panel MUST show a Tags section above the checklist with every tag, a remove button per tag and "Add tag"; the panel MUST be available for every task conversation, and its toggle MUST read "Show details" / "Hide details".
- **FR-011**: The phone conversation info MUST have a Tags row that opens the picker as a sheet with the same create and per-row actions.
- **FR-012**: The New task form on desktop and phone MUST offer a Tags control beside Employee using the same picker.
- **FR-013**: Filters MUST offer a Tags page with "All tags", "No tags" and each tag; several chosen tags MUST match tasks carrying any of them; the row MUST be hidden when no tag exists; "Clear filters" MUST clear it; the choice MUST persist as left.
- **FR-014**: Search MUST match tasks by tag name, ranked after title matches.
- **FR-015**: The CLI MUST provide `sessions tag <id> --add <name> --remove <name>`, `sessions list --tag <name>`, and include tags in `sessions list`; `--add` creates a missing tag; an unknown name for `--remove` or `--tag` MUST be reported as "No tag named "<name>"." without changes.
- **FR-016**: Manager conversations MUST NOT offer tags.
- **FR-017**: Adding, removing, renaming, recolouring or deleting tags, by the person or an agent, MUST NOT produce notifications, pushes, toasts or channel messages.
- **FR-018**: Paired phones and remote clients MUST read and change tags through the same client interface as other task changes.
- **FR-019**: All wording MUST match section 7 of docs/ux/task-tags.md verbatim.

### Key Entities

- **Tag**: a name the person chose, and a colour from the project palette; identified so a rename does not touch the tasks carrying it. Belongs to this computer, shared by all folders.
- **Task tag set**: the tags a task carries, kept with the task's own record on this computer, in the order added.
- **Tag filter**: the board's current choice: all tags, no tags, or a set of tags matched as any-of.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a card, the person can create a new tag and see it on that card in one picker open and under 5 seconds.
- **SC-002**: A tag change appears on the card, header and panel where it was made without a visible delay (within 100 ms), and on a paired phone within the client's usual update time.
- **SC-003**: Filtering a board of 200 tasks by a tag shows the matching tasks with no noticeable delay, and clearing it restores all 200.
- **SC-004**: 100% of tags survive an app restart on the tasks that carried them.
- **SC-005**: A rename or recolour is reflected in every place the tag is shown, with zero places left with the old name or colour.
- **SC-006**: No deletion of a tag in use happens without the confirming dialog.

## Assumptions

- Tags are global across folders and profiles on one computer; per-folder tags are out of scope.
- Tags are not synced between computers, as tasks are not.
- Settings > Tags, tag counts in the picker, clicking a chip to filter, board columns by tag, all-of filtering, tags on shortcuts, merging tags and agents tagging on their own initiative are out of scope (docs/ux/task-tags.md section 9).
- The existing client interface, held calls, Filters menu, Search, details panel and phone sheets are reused.
- The open questions in the UX document (any-of filtering, New task form now, CLI now) are taken at their recommended verdicts; changing one moves the related story's priority, not the others.
