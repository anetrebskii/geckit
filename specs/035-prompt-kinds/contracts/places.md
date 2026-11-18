# Contract: places, views and keys

Pure rules in `client/src/renderer/src/chat/places.ts`, covered by `client/test/places.test.ts`.

| Rule | Value |
| --- | --- |
| `WORK_PLACES` | Tasks, Manager, Quick chats (id `questions`) |
| `PROMPT_PLACES` | Repeating (`refresh`), Scheduled (`clock`, new glyph), Shortcuts (`bolt`), header "Prompts" |
| `WORKSPACE_PLACES` | Team, Checklists, Browsers, Secrets, header "Workspace" |
| Group headers | plain text, not buttons, never fold |
| `keptPlace(kept)` | `repeating`, `scheduled`, `shortcuts` and the rest open themselves; unknown opens Tasks |
| Badge | Scheduled only, `needYou(prompts)` above 0, accessible name `needYouSaid(n)` |

## Scheduled views

| View | Desktop | Phone |
| --- | --- | --- |
| Week (default) | seven day columns, Monday first, cards with time, name up to 4 lines, assignee, model when not Default | not offered |
| Month | Apple Calendar month, dot, name, time; 3 per day or 2 and "{n} more"; time hidden under 96 px cell width | Calendar: month with dots and the selected day's runs |
| List | rows by set time, problems first, "Ran today" footer | List |

The switch sits where Tasks has Board / List; the choice is `scheduledView`.

## Keys

| Key | Action |
| --- | --- |
| Cmd+J | Shortcuts (unchanged) |
| Cmd+Shift+N | Quick chats, then New quick chat |
| Arrow keys | move the selected day (Week, Month) |
| Page Up / Page Down | previous / next week or month |
| Enter | open the selected day's runs |
| Cmd+D (Ctrl+D) | Duplicate the focused row or run |
| Escape | close the menu, focus returns to its opener |
| Option-drag (Alt-drag) | copy a run to another day as Duplicate |
