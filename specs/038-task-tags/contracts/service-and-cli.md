# Contract: tags in the service interface and CLI

## Shared types (`client/src/shared/api.ts`)

```ts
export interface TaskTag { readonly id: string; readonly name: string; readonly color: number; readonly used: number }
// Settings gains
readonly taskTags: readonly TaskTag[]          // default []
readonly tagFilter: readonly string[]          // default []
// ChatSession gains
readonly tags?: readonly TaskTag['id'][]
// New task message (SessionMessage) gains
readonly tags?: readonly TaskTag['id'][]
```

## Service methods (`core/application.ts`, exposed through `shared/renderer-api.ts` and `main/index.ts` CORE_CHANNELS)

| Method | Arguments | Result | Errors |
|---|---|---|---|
| `chat:tag` | `ids: ChatSession['id'][]`, `{ add?: TagId[], remove?: TagId[], create?: string[] }` | `TaskTag[]` created or resolved from `create` | Unknown session; Manager conversation; "Tag names are up to 32 characters" |
| `tags:edit` | `id: TagId`, `{ name?: string, color?: number }` | `TaskTag` | Unknown tag; "A tag with this name exists"; "Tag names are up to 32 characters" |
| `tags:delete` | `id: TagId` | `{ removedFrom: number }` | none for an unknown id (already gone) |

Each successful call triggers the existing settings broadcast and session-list change; no notice, push, toast or channel message is emitted.

Renderer API: `chat.tag(ids, change)`, `tags.edit(id, change)`, `tags.delete(id)`.

## CLI (`core/product-sessions.ts`)

```text
geckit sessions tag --id <id> [--add <name>] [--remove <name>]
geckit sessions list [--tag <name>] ...
```

- `--add` names an existing tag (ignoring case) or creates it. `--add` and `--remove` take one name each; run the command again for another tag.
- `--remove <name>` or `--tag <name>` naming no tag: prints `No tag named "<name>".`, exits non-zero, changes nothing.
- `sessions tag` prints the task's resulting tag names as JSON: `{ "id": "...", "tags": ["release", "client"] }`.
- `sessions list` rows include `"tags": ["release"]` (names, in the task's order).
- Manager conversations: `This conversation cannot have tags.`
