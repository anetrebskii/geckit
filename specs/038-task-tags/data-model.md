# Data model: Tags on tasks

## TaskTag (in `Settings.taskTags`)

| Field | Type | Rule |
|---|---|---|
| `id` | string | Generated once, never reused; stable across renames |
| `name` | string | Trimmed, 1 to 32 characters, unique ignoring case, original spelling kept |
| `color` | integer 0..7 | Index into the project palette (`--project-0`..`--project-7`); new tags take `taskTags.length % 8` |
| `used` | number (ms) | Last time it was added to a task; orders unchecked picker rows |

Order of `taskTags` is creation order. `main/store.ts` normalises a loaded list: drops entries with a missing id, an empty or over-long name, a duplicate name (keeps the first), and clamps `color` into 0..7.

## Task tag set (in `SessionNote.tags`, surfaced as `ChatSession.tags`)

| Field | Type | Rule |
|---|---|---|
| `tags` | readonly TaskTag['id'][] | Order added; no duplicates; ids not in the catalog are dropped when rows are built; absent when empty |

Not offered for Manager conversations (`isManager(id)` refuses).

## Tag filter (in `Settings.tagFilter`)

| Value | Meaning |
|---|---|
| `[]` | All tags (no filter) |
| `['none']` | Untagged tasks only |
| `[id, ...]` | Tasks carrying any of these ids |

Normalised on load and after `tags:delete`: ids not in the catalog are removed; a list left empty means no filter.

## Transitions

- `chat:tag(ids, { add, remove, create })`: `create` names are validated and added to the catalog first (an existing name, ignoring case, resolves to that tag instead), then added to each target note; `remove` takes ids off; `used` is updated for added tags.
- `tags:edit(id, { name, color })`: name validated as above against the others; colour clamped.
- `tags:delete(id)`: catalog entry removed, id stripped from every note, removed from `tagFilter`.

Validation errors are thrown with the UX wording: "A tag with this name exists", "Tag names are up to 32 characters".
