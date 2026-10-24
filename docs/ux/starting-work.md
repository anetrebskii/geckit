---
type: spec
status: draft
owner: Alex
created: 2026-09-25
---

# UX: Ways to start a task

Continues `docs/ux/screen-recording.md`, and changes where recording is started from inside the app.

## 1. Why

The board head has two bare icons, a microphone and a screen, between the search field and the Shortcuts button. Nothing about them says that they start work: they sit with the tools (Shortcuts, Keyboard shortcuts, Settings), not with "Ask" and "New task", and their meaning is only in a tooltip. Alex, who built them, looked at the head and could not see that recording the screen is a way to make a task. The two verbs that start work are already there with words on them, "Ask" and "New task"; recording and speaking are ways of saying what the work is, so they belong inside those two, not beside the tools.

## 2. What is added

| Surface | What appears | When seen |
|---|---|---|
| Board head (`Board.tsx`), existing | The microphone and screen icons are removed. "New task" becomes a split button: pressing its words opens the form as today, its arrow opens a menu of ways to start | Always |
| Menu under the arrow, new | "Write it", "Record the screen", "Say it", each with a line saying what happens and its shortcut | When the arrow is pressed |
| New task form (`NewTask` in `Board.tsx`), existing | Under "What to do", a row of two buttons: "Record the screen" and "Dictate" | Always |
| Ask form, existing | The same row | Always |
| New task form, after a recording | The words at the end of "What to do", the frames among the pictures, and under them "From a 0:42 recording. Claude gets the video too." with an x | After a recording made from the form |
| List view head (`Sidebar.tsx`), existing | The microphone and screen icons are removed; "New conversation" stays as it is. It opens the composer, not this form, so recording from the list view is Cmd+Alt+R or the tray | Always |
| Panel tabs (`Panel.tsx`), existing | "Record" is removed; "Say" stays | Always |

```mermaid
block-beta
  columns 2
  h1["Board head, today"] h2["Board head, proposed"]
  a1["All projects | Search | mic | screen | bolt | keys | settings ... Ask | New task"] a2["All projects | Search | bolt | keys | settings ... Ask | New task | v"]
  b1[" "] b2["menu: Write it / Record the screen / Say it"]
  style a1 fill:#e5e7eb,stroke:#9ca3af
  style a2 fill:#e5e7eb,stroke:#9ca3af
  style b2 fill:#e5e7eb,stroke:#9ca3af
```

```mermaid
block-beta
  columns 1
  t["New task"]
  p["Project: geckit"]
  w["What to do: text"]
  r["Record the screen   Dictate"]
  f["frames from the recording, if any"]
  g["Goal"]
  s["Cancel   Start"]
  style r fill:#dbeafe,stroke:#2563eb
  style f fill:#e5e7eb,stroke:#9ca3af
```

The global shortcut and the tray item keep the capsule's own Choosing card, since there is no form open when they are pressed. From the form, the capsule never asks "Ask or Make a task": the form was opened to make one of the two, and already holds the project and the goal.

## 3. States

The states of the recording itself (Recording, Writing it down, No permission, Failed) are those of `screen-recording.md`. What this document adds is what happens around them when the recording is started from a form.

| State | When it happens | What the person sees | What to do |
|---|---|---|---|
| Menu open | The arrow beside "New task" was pressed | The three ways, each with its line and shortcut | Pick one, or Escape |
| Form | "New task", "Write it" or "Ask" | The form, with "Record the screen" and "Dictate" under the field | Write, or record, or dictate |
| Recording from the form | "Record the screen" in the form was pressed | The Chat window goes behind other windows, so whatever is to be shown is in front; the capsule records | Show and talk, then Stop |
| Back in the form | The recording was written down | The Chat window comes forward with the form as it was left, plus the words at the end of "What to do", the frames among the pictures, and the recording line | Read it over, set the goal, Start |
| Back unchanged | The recording was thrown away, failed and was closed, or was not allowed | The form exactly as it was left | Carry on writing, or record again |

## 4. Transitions

```mermaid
stateDiagram-v2
  direction LR
  classDef quiet fill:#e5e7eb,stroke:#9ca3af,color:#111827
  classDef going fill:#dbeafe,stroke:#2563eb,color:#111827
  classDef done fill:#dcfce7,stroke:#16a34a,color:#111827

  state "Board" as board
  state "Menu open" as menu
  state "Form" as form
  state "Recording" as rec
  state "Writing it down" as writing
  state "Back in the form" as back
  state "Capsule, Choosing" as choosing
  state "Card started" as card

  board --> menu: arrow
  board --> form: New task
  menu --> form: Write it
  menu --> choosing: Record the screen
  menu --> board: Escape
  form --> rec: Record the screen
  rec --> writing: Stop
  rec --> form: Throw away
  writing --> back: words ready
  writing --> form: failed, closed
  back --> rec: Record again
  back --> card: Start
  form --> card: Start
  form --> board: Cancel
  back --> board: Cancel
  choosing --> card: Make a task
  choosing --> board: Ask or Cancel

  class board quiet
  class menu quiet
  class form quiet
  class rec going
  class writing going
  class back quiet
  class choosing quiet
  class card done
```

| From | Event | To | What the person sees |
|---|---|---|---|
| Board | Pressed the words "New task" or Cmd+N | Form | The New task form, as today, with the new row under the field |
| Board | Pressed the arrow beside "New task" | Menu open | "Write it", "Record the screen", "Say it" under the button |
| Menu open | Picked "Write it" | Form | The New task form |
| Menu open | Picked "Record the screen" | Capsule, Choosing, through the recording | The Chat window goes behind, the capsule records; after Stop it asks "Ask" or "Make a task", as the shortcut does |
| Menu open | Picked "Say it" | The capsule for saying what to do | The same as Cmd+Alt+G today |
| Menu open | Escape or a press outside | Board | The menu closes |
| Form | Pressed "Record the screen" | Recording | The Chat window goes behind other windows; the capsule records |
| Form | Pressed "Dictate" | Form | The dictation capsule; what is heard is typed where the cursor is in "What to do", as Cmd+Alt+V does |
| Recording | Stop, Enter or Cmd+Alt+R | Writing it down | "Writing it down" in the capsule |
| Recording | Escape or the x | Form | The capsule goes, the Chat window comes forward, the form is as it was |
| Writing it down | The words and frames are ready, by itself | Back in the form | The Chat window comes forward; the words are added at the end of "What to do", on a new line when there was text; the frames join the pictures; the recording line is under them; the cursor is at the end of the words |
| Writing it down | It failed, and the capsule was closed | Form | The form as it was; nothing from the recording is kept |
| Back in the form | Pressed the x on the recording line | Form | The frames and the recording line go; the words stay, since they may have been edited |
| Back in the form | Pressed "Record the screen" again | Recording | A second recording; its words and frames are added after the first's |
| Back in the form or Form | Pressed "Start" or Cmd+Enter | Card started | The form closes and the card is in In progress, with the frames in its first message and the recording's note under the words |
| Back in the form or Form | Cancel or Escape | Board | The form closes, the recording with it |

## 5. What stays quiet

| State | Why it is not shown |
|---|---|
| That the Chat window was sent behind | It comes back by itself when the recording ends; saying so would only be one more thing to read before showing the screen |
| The recording's note (length, frame times, the video's path) in "What to do" | It is for Claude, not for the person; it is put under the words when the task starts. The recording line says the same thing briefly |
| Which of the three ways the task was started with | The card is the same card |

## 6. Numbers and time

| Number | Value | Why |
|---|---|---|
| Pictures in the form | 8 at most, the frames counting among them | The form already holds 8 pictures; a recording's frames are pictures like any other |
| Frames kept when the pictures would pass 8 | The ones furthest apart in time, as in `screen-recording.md` | The same rule wherever frames are cut down |

## 7. Wording

| Place | Text |
|---|---|
| Arrow beside "New task", tooltip | "Other ways to start a task" |
| Menu, first | "Write it" / "The form: project, what to do, a goal. Cmd+N" |
| Menu, second | "Record the screen" / "Show it and talk. The recording becomes the task. Cmd+Alt+R" |
| Menu, third | "Say it" / "Tell GeckIt what to start, answer or mark. Cmd+Alt+G" |
| Form row, first | "Record the screen" |
| Form row, second | "Dictate" |
| Form row, first, tooltip | "Show what you mean and talk; the words and frames come back into this form (Cmd+Alt+R)" |
| Form row, second, tooltip | "Say it instead of typing it (Cmd+Alt+V)" |
| Recording line | "From a 0:42 recording. Claude gets the video too." |
| Recording line, x tooltip | "Take the recording off" |
| Placeholder of "What to do", changed | "Ask Claude Code. Paste a picture, drop a file, or record the screen" |

## 8. Edge cases

- **Empty:** a recording where nothing was heard comes back with its frames and the line, and "What to do" as it was; Start stays off until there is text or a picture, as today.
- **Everything at once:** the form already has 6 pictures and the recording brings 5 frames: the pictures the person put in stay, and the frames are cut to the 2 furthest apart.
- **Interrupted:** the Chat window is closed while recording: the recording ends as thrown away, since the form it was going into is gone.
- **Repeated:** Cmd+Alt+R pressed while the form is open is the same as its "Record the screen" button: the recording goes into the form.
- **Stale:** the project picked in the form is kept; the recording does not choose a project when started from the form.
- **Phone:** the row is not shown on the phone, which records nothing.

### Remembering the task folder

Added at Alex's request on 2026-10-14. The existing "Folder" picker on desktop and phone restores the last folder chosen for a task, so making another task does not require choosing it again. This is a preference in shared settings, separate from the form's temporary text and goal.

| State | When it happens | What the person sees | What to do |
|---|---|---|---|
| Remembered folder | New task opens and the last folder is available in the active profile | "Folder" with that folder's name and path | Write the task or choose another folder |
| Restored draft | The app restarts with an unfinished form | "Folder" with the draft's folder, and its text and goal | Continue the draft or choose another folder |
| Fallback folder | No folder was remembered, or it was removed or excluded by the active profile | "Folder" with the current available folder, otherwise the first available folder; "Choose a folder" when none is available | Write the task or choose/add a folder |

```mermaid
stateDiagram-v2
  state "Board" as board
  state "Task form" as form
  [*] --> board
  board --> form: New task
  form --> form: Choose folder
  form --> board: Cancel or Start
```

| From | Event | To | What the person sees |
|---|---|---|---|
| Board | Opens New task; the folder is resolved automatically | Task form | The draft's folder, otherwise the available remembered folder, current folder or first available folder, in that order |
| Task form | Chooses a folder | Task form | Its name and path; the choice is saved immediately |
| Task form | Cancel, Escape or switches to Ask a question | Board or question form | The task form closes; its folder preference stays |
| Task form | Starts a task | Board/conversation | The task starts in the displayed folder; that folder is remembered |
| App closed | Opens the app, then New task | Task form | The same available folder after settings are loaded |

The preference is saved on selection or Start, without a timer or expiry. Opening a question never changes it. Text, goal and pictures still follow the existing draft rules. An unfinished draft keeps its folder even before settings finish loading, following the existing recovery behavior; the person can change it if unavailable. Persistence stays quiet: the selected folder already shows what will be used, so there is no notice or added control.

A profile fallback does not overwrite the previous choice until a folder is explicitly chosen or a task is started. An unavailable remembered folder is ignored, without reconnecting a host or re-adding a removed folder. An available SSH folder keeps its full host-qualified root. There is one preference shared by desktop and phone, matching the existing shared settings. It does not reorder folders or change the board's filter. Keeping the preference only after a successful task was rejected: "last chosen" must survive cancelling the form too.

Requirement: "remember the last chosen folder" is covered by the selection, close/reopen and restart transitions above.

Verification on 2026-10-14: the native settings test covers loading an older settings file, saving the chosen folder, changing the board scope and reading the folder from disk in a fresh settings-store instance. All 909 tests, typecheck, configured lint and desktop/mobile builds pass. Code review against `docs/performance.md` found no new per-card work, animation or per-keystroke settings writes; folder resolution runs only when the form opens.

Browser verification remains unavailable: Chrome automation failed to load its request-header policy, the in-app browser was unavailable, and native Chrome control stalled. Reopen/reload, keyboard selection, scrolling and full-screen light/dark review were not completed. The temporary native-boundary harness is retained in `/private/tmp/geckit-folder-verification` for that review. No running GeckIt conversation was restarted.

### Assistant-specific model selection - 2026-10-21

Fix the reported case where choosing OpenCode + Ollama after Claude Code (tmux) leaves "opus" selected and sends an incompatible model. In New task, Ask a question and a new conversation's composer, choose the assistant first, then its model, then submit. The displayed model and the submitted model must belong to the same assistant, including when a folder's assistant preference changes the effective assistant.

| From | Event | To | What the person sees |
|---|---|---|---|
| Form or new composer | Chooses another assistant, or chooses a folder with another assistant | Same form with that assistant's saved model | Its saved model, or "Default" if none was saved; the previous assistant's model disappears immediately |
| Form or new composer | Chooses a model, including "Default" | Same form with the chosen model | The choice is saved for that assistant alone |
| Form or new composer | Switches back, reopens the form or restarts GeckIt | Restored selection | That assistant's own saved choice |
| Model catalog loading or unavailable | Changes assistant | Same form with the new assistant's choice | "Default" or its own saved model, alongside the existing loading/unavailable option; no borrowed model while waiting |
| Ready form or composer | Presses Start, Ask or Send | New task or question | The request uses exactly the displayed assistant and its model; "Default" leaves model selection to that assistant |
| Existing conversation | Opens or continues it | Same conversation | Its existing chosen model remains; switching assistants elsewhere does not replace it |

Use the existing wording, layout, keyboard controls and theme rules. Preference saving is immediate and silent, with no timer, notice or confirmation. Cancelling preserves the saved assistant/model preferences and follows the existing text/draft rules. Existing builtin Claude and Codex model preferences remain compatible; independent libraries start at "Default" until a model is chosen for that library. Libraries backed by the same runtime still have independent model preferences. Custom saved identifiers remain selectable if a catalog is temporarily unavailable. No new settings screen or catalog-based rejection is added: a missing catalog entry is not proof a saved model is invalid.

Verification on 2026-10-21: all 1,149 tests across 85 files, type checks, lint and desktop/mobile builds passed. Fresh native-store loads verify legacy settings and independent model preferences survive restart. An isolated browser harness using the actual Board, NewTask, Composer and useChat verified Claude/tmux/Ollama/Codex switching, saved choices after reload, Default with unavailable catalogs, and matching task/question/composer send payloads. Full-context visual review covered desktop at 1352 x 621 and phone at 390 x 844 in light/dark, with form scrolling, focus and keyboard activation. Static performance review found no new row work, list sorting, polling or animation; model lookup scans only the small preference list. Native calls and model responses were fixtures: no live inference, installed-app update or physical-phone verification was performed. The temporary harness was removed after review.

## 9. What is left out on purpose

| Not done | Why |
|---|---|
| Keeping the two icons and giving them words | The head would have five labelled buttons; the ways to start belong with the verb that starts |
| "Record" in the panel | The panel is for correcting and transcribing text; a task does not start there |
| A split arrow on "Ask" too | Asking is the lighter case; the row in the Ask form is enough, and two arrows side by side read as one control |
| Letting the capsule pick the project when recording from the form | The form already has a project chosen; guessing over it would undo the person's choice |

## 10. Forks

### Where the in-app entry to recording goes

| Option | Verdict |
|---|---|
| A screen icon in the head, beside the microphone | no - this was built first and read as a tool, not as a way to start |
| A "Record the screen" row inside the New task and Ask forms, plus a menu on "New task" | yes |
| A third labelled button in the head, "Record" | no |

**Why:** the forms are where a task is made, so a button there cannot be misread; the menu on "New task" lets it be reached from the board in one step without a new button in the head.

### What a recording from the form does

| Option | Verdict |
|---|---|
| Fills the form: words into the field, frames into the pictures | yes |
| Opens the capsule's Choosing card, as the shortcut does | no |

**Why:** the form was opened to make a task in a project with a goal; asking again whether it is a task, and which project, would repeat what was already answered.

## 11. Requirements

| Requirement | Where closed |
|---|---|
| It is clear that recording is a way to create a task | sections 1, 2, 10 |

**Changes to `screen-recording.md`:** its section 2 rows for the board head, the sidebar head and the panel tab are replaced by this document.
