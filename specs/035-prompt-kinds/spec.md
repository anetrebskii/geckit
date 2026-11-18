# Feature Specification: Repeating, Scheduled and Shortcuts

**Feature Branch**: `feat/prompt-kinds`

**Created**: 2026-11-18

**Status**: Draft; UX document and prototype ready for review

**Input**: User description: "Split GeckIt's Shortcuts into three kinds of prompts with their own places: Repeating (timetable), Scheduled (runs once at a time, can be postponed; Week, Month and List views) and Shortcuts (run by hand). Regroup the left menu (first group Tasks, Manager, Quick chats; Prompts group: Repeating, Scheduled, Shortcuts; Workspace group: Team, Checklists, Browsers, Secrets; plain non-folding headers). Rename Questions to Quick chats. One shared editor for the three kinds with the kind fixed at creation and only the timing section differing. Updated list rows for Repeating and Shortcuts with assignee and model. Duplicate creates a new prompt of the same kind from any row or calendar item."

The behavior, states, numbers and exact wording are decided in [docs/ux/shortcut-kinds.md](../../docs/ux/shortcut-kinds.md) and drawn in the prototype [docs/design/shortcut-kinds.html](../../docs/design/shortcut-kinds.html). This spec states what must hold; the UX document is the source for every label, message and threshold. It partly supersedes [docs/ux/cron-start-window.md](../../docs/ux/cron-start-window.md): the start window becomes one "Vary start time" switch.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan a prompt to run once, later, and postpone it (Priority: P1)

Alex wants a piece of work done once at a later time ("draft the release notes tomorrow at 10:00"). He opens Scheduled, presses New scheduled, writes the prompt, picks a date and time and saves. The run waits in Scheduled and starts by itself at its time. Until then he can postpone it with one click (In 1 hour, This evening, Tomorrow, Monday or a chosen time), run it now, edit or delete it. A run that could not start (the assistant was unavailable, the folder unreachable, the employee archived, Manager off) or was missed while GeckIt was not running stays on top in red, counts in a badge on Scheduled and waits for him. A run that started leaves the list into "Ran today" for 24 hours.

**Why this priority**: it is the one kind GeckIt cannot express today; the only workaround is a recurrence that ends after one run and stays in the list. It delivers value alone, in a List view, before calendars exist.

**Independent Test**: create a Scheduled prompt a few minutes ahead, postpone it to the next hour and back, let it run, and check it appears in "Ran today" with Open; stop GeckIt across another one's time for over 12 hours and check it shows as Missed with the badge.

**Acceptance Scenarios**:

1. **Given** Scheduled is empty, **When** Alex opens it, **Then** the page says "Nothing scheduled", explains what it is for and offers "New scheduled".
2. **Given** the New scheduled editor, **When** it opens, **Then** the date and time default to tomorrow 09:00, and a time less than one minute ahead is refused with "Pick a time from now on."
3. **Given** a waiting run at Tomorrow 10:00, **When** Alex chooses Postpone > In 1 hour at 14:20, **Then** the row moves to its new place in time order with "Postponed from Tomorrow 10:00".
4. **Given** a run whose time came while its assistant was unavailable, **When** Scheduled is drawn, **Then** the row is on top, its time in red, with "Didn't start: Claude isn't available.", the Scheduled sidebar item shows a badge counting it, and one GeckIt notice "{name} didn't start" was shown.
5. **Given** GeckIt was not running from before a run's time until more than 12 hours after its latest start, **When** GeckIt starts, **Then** the run is not started and shows "Missed. GeckIt wasn't running."; within 12 hours it starts and "Ran today" says how many minutes late.
6. **Given** a Didn't start or Missed row, **When** Alex postpones it, **Then** the red goes, the row takes its place in time order and the badge drops by one, disappearing at zero.
7. **Given** a run started, **When** 24 hours pass, **Then** it leaves "Ran today"; before that "Schedule again" opens the editor for tomorrow at the same time.

---

### User Story 2 - Three places in a regrouped left menu (Priority: P1)

The Chat window's sidebar and the phone's left menu show three groups: Tasks, Manager and Quick chats with no header; "Prompts" with Repeating, Scheduled and Shortcuts; "Workspace" with Team, Checklists, Browsers and Secrets; Settings apart at the bottom. Group headers are plain labels that do not fold. Each prompt kind is its own page with its own title, subtitle, New button, search and empty state, laid out under the same top bar as Tasks.

**Why this priority**: the three kinds need a place each before any of them can be found; today one Shortcuts page under Workspace mixes timed and hand-run prompts.

**Independent Test**: open the Chat window and the phone menu, check the groups and their order, choose each prompt place and check its page, title, New button and empty state; restart and check the window reopens on the last place, including a kept "shortcuts" place from the earlier build.

**Acceptance Scenarios**:

1. **Given** the first start after the update, **When** the sidebar is drawn, **Then** it shows the three groups in the order above, Shortcuts is no longer under Workspace, and neither header can be folded or clicked.
2. **Given** Scheduled has one Didn't start and one Missed run, **When** any place is shown, **Then** Scheduled carries the badge 2, read as "2 need you"; no other prompt place shows a count.
3. **Given** the window was last on the old Shortcuts place, **When** it opens after the update, **Then** Shortcuts (the hand-run kind) is shown.
4. **Given** the sidebar shows icons only on a narrow window, **When** it is drawn, **Then** Repeating, Scheduled and Shortcuts have distinct glyphs and the groups are separated.
5. **Given** the gecko in the menu bar, **When** its menu opens, **Then** Shortcuts are listed at the top level, Repeating jobs in a "Repeating" submenu, and the next Scheduled run as one disabled line "Next: {name}, {time}".

---

### User Story 3 - See scheduled runs by week and month (Priority: P2)

Scheduled has a view switch where Tasks has Board / List: Week, Month and List, Week first and the default, the choice kept. Week shows seven day columns of cards with each run's time, full name, assignee and model. Month shows the whole month like Apple Calendar's month view, each run as a line with a folder-colour dot, name and time. On either calendar a run is postponed by dragging it to another day, keeping its time of day, with Undo. Clicking a run opens its menu (Edit, Run now, Postpone..., Duplicate, Delete); a busy day's "{n} more" or Enter opens a popover with all its runs; double-clicking a day creates a run on it. The phone has Calendar (a month with dots and the selected day's runs) and List.

**Why this priority**: scheduled work is about dates; seeing the week and month answers "what runs when" at a glance. It builds on Story 1's runs.

**Independent Test**: with runs on several days, open Scheduled and check Week is shown with full names, assignees and models; drag one to a later day and Undo; drag one onto a past day and check the refusal; switch to Month, open a run's menu and a busy day's popover; reopen the window and check the view is kept.

**Acceptance Scenarios**:

1. **Given** Scheduled was never opened, **When** it opens, **Then** Week is shown with today selected.
2. **Given** Week, **When** a run has a long name, an employee and a chosen model, **Then** its card shows the time, the whole name (up to four lines), the employee's avatar and name, and the model; a run with the Default model shows no model.
3. **Given** Month, **When** a day has four runs, **Then** it shows two of them and "2 more", which opens the day popover listing all four.
4. **Given** either calendar, **When** Alex drags a run to a later day, **Then** it moves there at the same time of day and "Moved {name} to {day}." with "Undo" shows for 6 seconds.
5. **Given** either calendar, **When** Alex drops a run on today after its time of day has passed, or on a past day, **Then** the run stays and "{time} on {day} has passed. Drop it on a later day or use Postpone." is shown.
6. **Given** keyboard only, **When** Alex uses the arrow keys, Page Up / Page Down and Enter, **Then** he can select a day, change week or month and open the day's runs; Postpone > Choose... replaces dragging.
7. **Given** the phone, **When** Scheduled opens on Calendar, **Then** a month with a dot per day that has runs (red if one needs Alex) is shown with the selected day's runs below; drag is not offered.

---

### User Story 4 - One editor for three kinds (Priority: P2)

Every prompt is created and edited in one editor whose kind is fixed by where it was made (the page's New button, Run later..., Schedule again or Duplicate) and never changes. The fields and their order are the same for all three kinds; only the timing section differs: none for a Shortcut; Date, Time and "Vary start time" for Scheduled; the Repeat picker, "Vary start time" and "Timetable on" for Repeating. "Vary start time" is one switch, on by default: on, a run starts at a hidden moment up to 30 minutes either side of its set time; off, at the set time. Nothing else about the variation is shown.

**Why this priority**: three kinds must stay consistent without three editors to maintain, and an item must never leave its page because its kind was switched.

**Independent Test**: open New repeating, New scheduled and New shortcut and compare fields and order; edit an existing item of each kind and check no control changes its kind; toggle "Vary start time" and check the summary changes between "around" and "at".

**Acceptance Scenarios**:

1. **Given** any editor, **When** it opens, **Then** its kicker names the kind ("New scheduled" when creating, "Scheduled" when editing) and no control can change the kind.
2. **Given** the Scheduled editor with "Vary start time" on, **When** Alex reads the summary, **Then** it says "Runs once on {day} around {time}."; turned off, "at {time}".
3. **Given** a saved run with "Vary start time" on, **When** any place shows its time (rows, calendars, Next, notices, the gecko menu, the CLI), **Then** only the set time appears, never the drawn start or the spread.
4. **Given** an hourly Repeating job with "Vary start time" on, **When** its runs start, **Then** each starts within 15 minutes either side of its set time.
5. **Given** a run saved or postponed for "In 1 hour", **When** its start is drawn, **Then** it is never earlier than the moment of saving.

---

### User Story 5 - Clearer Repeating and Shortcuts lists (Priority: P2)

Rows on all three pages lead with the assignee's avatar (an employee, Manager, or the assistant when there is no employee) and start their meta line with the assignee's name, then the folder, then the model when it is not Default. Repeating rows show the timetable, "Next {time}", Run now and an on/off switch that pauses the job in place. Shortcuts rows show Run and a "Run later..." that copies the prompt into Scheduled. Each page searches its own list, including the assignee's name.

**Why this priority**: today the list does not say who does the work or what will run by itself; this makes each row answer who, where and when.

**Independent Test**: with prompts for an employee, for Manager and for a plain assistant, check each row's avatar and meta line; pause and resume a Repeating job from its switch; use Run later... on a Shortcut and check the copy in Scheduled while the Shortcut stays.

**Acceptance Scenarios**:

1. **Given** a prompt assigned to employee Mira Chen with model Opus 5.5, **When** its row is drawn, **Then** it leads with Mira Chen's avatar and its meta line starts "Mira Chen · {folder} · Opus 5.5".
2. **Given** a Repeating job that is on, **When** Alex turns its switch off, **Then** the row says "Paused" at once with no Next; turning it on shows "Next {time}" with no catch-up run.
3. **Given** a Repeating job whose employee is archived, **When** its row is drawn, **Then** it says "Paused while archived" and its switch is disabled.
4. **Given** a Shortcut, **When** Alex chooses Run later... and a time, **Then** a Scheduled copy is created, the Shortcut stays, and "Scheduled for {time}." with "Show" appears under its row for 4 seconds.
5. **Given** a search on Repeating, **When** it matches nothing, **Then** the page says "Nothing matches."

---

### User Story 6 - Create a new prompt by duplicating one (Priority: P2)

From any row or calendar run, Duplicate opens the editor with every field copied, the name "{name} copy" and the same kind; nothing exists until Save. Duplicate is in the row's More menu, the calendar run's menu, the right-click menu, under Cmd+D (Ctrl+D), on Option-drag (Alt-drag) of a calendar run to another day, and in the phone's long-press sheet.

**Why this priority**: most new prompts are variations of existing ones; copying avoids retyping prompts, folders, employees and models.

**Independent Test**: duplicate one prompt of each kind through each entry point, check the editor's copied fields and name, cancel once (nothing created) and save once (a new row, original unchanged).

**Acceptance Scenarios**:

1. **Given** any row, **When** Alex presses Cmd+D on it, **Then** the editor opens with kicker "New {kind}", name "{name} copy" and every field copied; Cancel creates nothing.
2. **Given** a Didn't start or Missed Scheduled run, **When** it is duplicated, **Then** the copy's time moves to the next day at the same time, and Postponed-from, Didn't start and Missed are not copied.
3. **Given** a Repeating job, **When** it is duplicated and saved, **Then** the copy keeps the timetable and on/off state and its first run is the next one after Save, never a catch-up; last run and last conversation are not copied.
4. **Given** Week or Month, **When** Alex Option-drags a run to Friday, **Then** the duplicate editor opens set to Friday at the original time, and the original stays on its day.

---

### User Story 7 - Questions becomes Quick chats (Priority: P3)

The place for transient chats outside the board is renamed from Questions to Quick chats on desktop, the phone and the CLI, with the subtitle "Off the board. Each is deleted a day after its last answer, unless kept." and the entry "New quick chat" in place of "Ask a question". Behavior is unchanged.

**Why this priority**: "Questions" reads as the questions agents ask Alex; the rename is copy only and can ship alone.

**Independent Test**: check the sidebar, phone menu, page title, subtitle, entry button and CLI help; check an existing quick chat, its kept flag and its deletion after a day are unchanged; run the old CLI command name.

**Acceptance Scenarios**:

1. **Given** the sidebar, **When** it is drawn, **Then** the first group reads Tasks, Manager, Quick chats.
2. **Given** existing quick chats, one kept, **When** the update is installed, **Then** both are still listed and the unkept one is still deleted a day after its last answer.
3. **Given** the CLI, **When** Alex uses the old command name, **Then** it still works.
4. **Given** an agent asks Alex a question in a conversation, **When** its card is shown, **Then** its wording is unchanged (only the place is renamed).

---

### Edge Cases

- Existing data: prompts with a cron or recurrence become Repeating, the rest Shortcuts; a recurrence that ends after one run stays Repeating.
- Existing start windows: a job saved with a varied start keeps "Vary start time" on, whatever its minutes were; an exact job keeps it off.
- A Scheduled run is edited while its time comes: it waits until Save or Cancel, then runs if the saved time has passed, within 12 hours.
- A Scheduled run is deleted and restored with Undo after its time: it comes back as Missed, never running by surprise.
- Several runs are due at once after a restart: each goes through the conversation queue; one waiting for a slot counts as Ran.
- Postpone is disabled while a run is Starting.
- A run's time is in the past when a day is double-clicked today: the new run defaults to the next whole hour.
- Days and times are the scheduling computer's; a run at 00:30 belongs to the day it starts on.
- A host or older client without one-time runs: the editor hides Scheduled creation and Run later..., so a one-time run is never saved as a Shortcut.
- A Scheduled run for Manager: Ran means Manager accepted it; Manager off gives "Didn't start: Manager is off".
- A Week whose days span two months is titled "Nov – Dec 2026"; an empty week says "Nothing scheduled this week. Double-click a day to plan a run."
- A narrow Month drops the times and keeps the names on every day at once.
- Repeating jobs are not drawn in the calendars; past days show only Didn't start and Missed runs.

## Requirements *(mandatory)*

### Functional Requirements

**Left menu and places**

- **FR-001**: The desktop sidebar and the phone's left menu MUST show the groups and items of User Story 2 in that order, with plain, non-folding, non-clickable group headers and Settings apart at the bottom.
- **FR-002**: Repeating, Scheduled and Shortcuts MUST each be a place with its own page, title, subtitle, New button, search and empty state, using the wording of the UX document.
- **FR-003**: Scheduled MUST carry a badge counting runs that are Didn't start or Missed, with the accessible name "{n} need you", shown only above zero; no other prompt place shows a count.
- **FR-004**: A kept place from the earlier build ("shortcuts") MUST open Shortcuts; the kept place logic MUST still fall back to Tasks for unknown places.
- **FR-005**: The gecko menu MUST list Shortcuts at the top level, Repeating jobs in a "Repeating" submenu and the next Scheduled run as one disabled "Next: {name}, {time}" line.
- **FR-006**: Team > an employee MUST list that employee's prompts under the three kind headings.

**Scheduled runs**

- **FR-007**: A prompt MUST be able to hold one set moment for a single run; a prompt with that moment is Scheduled, one with a timetable is Repeating, one with neither is a Shortcut. The kind is derived, never stored on its own.
- **FR-008**: A Scheduled run MUST start by itself at its start moment, through the normal conversation queue, and then leave the list into "Ran today", kept 24 hours with Open and Schedule again.
- **FR-009**: Postpone MUST offer In 1 hour, This evening 18:00 (only before 17:00), Tomorrow 09:00, Monday 09:00 (Next Monday on Mondays) and Choose..., and MUST record the time it was postponed from.
- **FR-010**: A run that cannot start MUST become Didn't start with the reason, move to the top in red, count in the badge and raise one notice; it MUST never be dropped silently.
- **FR-011**: A run whose latest start passed while GeckIt was not running MUST start on the next launch if within 12 hours of that latest start, reporting minutes late, and otherwise become Missed without running.
- **FR-012**: Deleting any prompt MUST offer Undo for 6 seconds in place.
- **FR-013**: A Shortcut's Run later... MUST create a Scheduled copy and leave the Shortcut unchanged.

**Calendar views**

- **FR-014**: Scheduled MUST offer Week, Month and List views on desktop, in that order, in the position of Tasks' Board / List switch; Week MUST be the default and the choice MUST be kept in the person's settings.
- **FR-015**: Week MUST show seven day columns, Monday first, each run as a card with time, full name (up to four lines), assignee and model when not Default; Month MUST show the whole month with each run as a dot, name and time line, up to three per day or two and "{n} more".
- **FR-016**: On both calendars, dragging a run to a later day MUST postpone it to that day at the same time of day with Undo for 6 seconds; dropping on a past moment MUST be refused with the UX document's message.
- **FR-017**: On both calendars, clicking or right-clicking a run MUST open its menu (Edit, Run now, Postpone..., Duplicate, Delete) headed by its name, time, assignee, folder and model, or its Didn't start / Missed line; "{n} more" or Enter on a day MUST open a popover with all its runs; double-clicking a day today or later MUST open a new Scheduled run on it.
- **FR-018**: The calendars MUST be fully usable from the keyboard: arrow keys move the day, Page Up / Page Down change the week or month, Enter opens the day's runs, Escape closes menus and returns focus.
- **FR-019**: The phone MUST offer Calendar (month with dots and the selected day's runs) and List, without drag.

**Shared editor and start time**

- **FR-020**: One editor MUST serve all three kinds with the same fields in the same order (name, prompt, target, employee, folder, assistant, model, checklist, Send result); only the timing section, kicker, summary and save target MAY differ.
- **FR-021**: The editor MUST NOT offer any control that changes an item's kind, and an item MUST never move between pages by itself or by an edit.
- **FR-022**: Scheduled and Repeating MUST have one "Vary start time" switch, on by default for new items; on, each start MUST be drawn at save, postpone, drag, edit and after each Repeating run, within 30 minutes either side of the set time (a quarter of the gap for hourly and shorter repeats), never before the moment of saving; off, the start is the set time.
- **FR-023**: The drawn start and the spread MUST NOT be shown anywhere; between the set time and a later drawn start the row MUST say "Due".
- **FR-024**: Run now MUST start at once regardless of the switch.

**Lists**

- **FR-025**: Every row on the three pages MUST lead with the assignee's avatar and start its meta line with the assignee's name, then the folder, then the model when not Default; rows MUST NOT be grouped by employee.
- **FR-026**: Repeating rows MUST show the timetable, "Next {time}", Run now and an on/off switch that pauses and resumes in place without catch-up; archived owners MUST show "Paused while archived" with the switch disabled.
- **FR-027**: Scheduled rows MUST lead with the set date and time and show Postpone, Run now and More; Didn't start and Missed rows MUST be first.
- **FR-028**: Each page's search MUST match name, prompt, folder and assignee within that kind only.

**Duplicate**

- **FR-029**: Duplicate MUST be available from the row More menu, the calendar run menu, right-click, Cmd+D (Ctrl+D), Option-drag (Alt-drag) on the calendars and the phone's long-press sheet.
- **FR-030**: Duplicate MUST open the editor unsaved with the same kind, name "{name} copy" and every setting copied except run history, postponed-from and problem states; a Scheduled copy whose time has passed MUST move to the next day at the same time.

**Quick chats**

- **FR-031**: Every user-visible name of the Questions place MUST read "Quick chats", its entry "New quick chat", on desktop, phone and CLI; the old CLI command name MUST keep working; quick chats' behavior and data MUST be unchanged.

**All**

- **FR-032**: All copy MUST match the UX document verbatim and read the same on macOS, Windows and Linux; every state MUST work in light and dark themes.
- **FR-033**: The CLI MUST create, edit and postpone one-time runs and set "Vary start time" on or off.

### Key Entities

- **Prompt** (today's shortcut): name, prompt text, target (new task or Manager), employee, folder, assistant, model, checklist, Send result, and at most one of: a one-time set moment (Scheduled) or a timetable with on/off (Repeating). "Vary start time" applies to both timed kinds.
- **Scheduled run state**: for a one-time prompt, the moment it was postponed from, its drawn start, and its outcome: waiting, started (with when and minutes late), didn't start (with reason) or missed.
- **Ran today entry**: a started one-time run kept 24 hours with a link to its conversation.
- **Scheduled view choice**: Week, Month or List, kept in the person's settings beside the board's view.
- **Place**: adds Repeating, Scheduled and Shortcuts as places; Questions is renamed Quick chats on screen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Alex can plan a prompt to run once at a chosen time in under 30 seconds from opening Scheduled, and postpone it in one click plus one choice.
- **SC-002**: 100% of one-time runs whose start fails or is missed end visible in Scheduled with a badge; none disappear silently.
- **SC-003**: In Week, the full name of every run up to 120 characters is readable without opening it, at the Chat window's default width.
- **SC-004**: Every one of the six Duplicate entry points opens a correctly filled editor of the same kind, and saving it never changes the original.
- **SC-005**: Over 20 varied starts of the same Scheduled time, no start is shown anywhere, all fall within 30 minutes either side, and none is earlier than the save.
- **SC-006**: Every prompt place, view and action is reachable by keyboard alone, and every badge, avatar and switch has a spoken name.
- **SC-007**: After the update, every existing prompt appears on exactly one of the three pages, with its timing and start variation unchanged.

## Assumptions

- The UX document and prototype of 2026-11-18 are the agreed design; any change found while building goes back into the UX document first (constitution IV).
- Scheduled runs use the existing conversation queue, notices, Manager inbox and employee archive rules; nothing about how a conversation runs changes.
- The phone shows the same places and actions through the existing client interface; drag and the Week view are desktop only.
- Repeating jobs keep their current no-catch-up behavior.
- Out of scope: skipping one occurrence of a Repeating job, "send later" from the composer, a history page of all runs, snoozing a board conversation, scheduling from Telegram or Slack through Manager, and Postpone on the board card a Scheduled run started.
