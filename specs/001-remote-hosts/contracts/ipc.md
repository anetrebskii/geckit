# Contract: windows ↔ main for hosts

Added to `window.geckit` in `client/src/preload/index.ts`. Types from `client/src/shared/hosts.ts`.

| Call | Kind | Arguments | Returns | Phone |
|---|---|---|---|---|
| `hosts.list()` | invoke `hosts:list` | — | `HostView[]` | yes |
| `hosts.onChanged(cb)` | event `hosts:changed` | — | `HostView[]` | yes |
| `hosts.known()` | invoke `hosts:known` | — | `{ host: string; user?: string; address?: string; port?: number }[]` from the SSH config | no |
| `hosts.check(draft)` | invoke `hosts:check` | `HostDraft` (fields of HostConfig without `id`, plus `password?`) | `{ ok: true; host: HostView } \| { ok: false; problem: string }`; streams `hosts:checks` lines while it runs | no |
| `hosts.onChecks(cb)` | event `hosts:checks` | — | `{ draft: string; lines: { text: string; done: boolean }[] }` | no |
| `hosts.remove(id)` | invoke `hosts:remove` | host id | `void`; its projects leave `Settings.projects` | no |
| `hosts.connect(id)` | send `hosts:connect` | host id | — (state through `hosts:changed`) | yes |
| `hosts.disconnect(id)` | send `hosts:disconnect` | host id | — | yes |
| `hosts.folders(id, path?)` | invoke `hosts:folders` | host id, path on the host (home when absent) | `Folders` (same shape as the phone's local browser) | yes |
| `hosts.addFolder(id, path)` | invoke `hosts:addFolder` | host id, path | the `ssh://` root, remembered as a project | yes |
| `hosts.onPrompt(cb)` | event `hosts:prompt` | — | `HostPrompt` | yes |
| `hosts.answer(answer)` | send `hosts:answer` | `{ id; answer?; remember? }` | — | yes |
| `hosts.install(id)` | invoke `hosts:install` | host id | `{ ok: boolean; text: string }` | no |
| `hosts.terminal(id, path?, run?)` | send `hosts:terminal` | host id, folder, command | — | no |

Existing calls keep their shapes; a `root` may now be `ssh://…`:

- `chat.send`, `chat.shell`, `chat.list`, `chat.git`, `chat.file`, `chat.exists`, `chat.files`, `chat.mcp` route by root.
- `chat.terminal(id, root)` on a host opens `ssh -t` with `claude --resume <id>` there.
- `chat.openFile`, `chat.reveal`, `chat.fileMenu` do nothing for a host root (the renderer does not offer them).
- `chat.browsers` answers `undefined` for a host root.
- `open:link` for `http://localhost:*` said in a conversation on a host goes through `hosts:forward` first (main decides by the conversation's root, passed as a second argument).

`Settings.hosts` is read and written through `settings:get` / `settings:set` like every setting, but the renderer changes hosts only through `hosts.check` and `hosts.remove`, so a host is saved only after it was reached.
