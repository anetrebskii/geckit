# Data Model: Sidebar navigation

## Settings fields (desktop, service-owned)

| Field | Type | Default | Rule |
| --- | --- | --- | --- |
| `chatPlace` | string | `'tasks'` | One of the place ids. Any other value, such as `host:<id>` saved by an earlier build, is read as `'tasks'`. Agents may set it (`agent-settings.ts`: string). |
| `navNames` | boolean | `true` | The person's choice to show names on a wide window. Ignored below the fold width, where names show only when opened over the content. |

Both are in the `conversation` group of `PREFERENCE_SECTIONS`, so they travel with configuration export and import.

## Place

- Ids: `tasks`, `manager`, `questions`, `team`, `shortcuts`, `checklists`, `browsers`, `secrets`, `settings`.
- Groups: work (`tasks`, `manager`, `questions`), Workspace (`team`, `shortcuts`, `checklists`, `browsers`, `secrets`), Computers (This computer and saved GeckIt computers, desktop only; choosing one switches the workspace and is not a place), footer (`settings`).
- Transition: choosing an item sets the place and closes the names shown over the content. Keyboard shortcuts set the place before acting (see [contracts/places.md](contracts/places.md)).

## Phone place (phone only)

- Key `phonePlace` in the web view's storage; same ids without hosts; unreadable or unknown values read as `tasks`.
- Sub-states over Tasks, not kept: Shortcuts list, Search.

## Waiting conversation

- A conversation in state `asks` that is not a general question. Count shown on Tasks, held to `99+`.
- Unread answer: a general question in state `asks` or `unread`; shown as a dot on Questions in the phone menu.

## Menu dot (phone)

| Condition | Dot | Accessible name |
| --- | --- | --- |
| A conversation waits and Tasks is not shown | `asks` (amber) | "Menu, a conversation is waiting for you" |
| Otherwise an answer is unread and Questions is not shown | `unread` (accent) | "Menu, a question has an answer" |
| Otherwise | none | "Menu" |
