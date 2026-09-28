# Data model: Conversations on remote hosts

## HostConfig (kept in `Settings.hosts`)

| Field | Type | Rule |
|---|---|---|
| `id` | string | `[a-z0-9-]{1,40}`, unique, made from the Name when added, never changed; appears in project roots |
| `name` | string | 1–40 characters; what the board shows |
| `address` | string | host name, IP, or an SSH config `Host`; no spaces, no `@`, no `:` |
| `user` | string | may be empty (the SSH config's or the local account's is used) |
| `port` | number | 1–65535; 22 by default |
| `auth` | `'key'` \| `'password'` | |
| `keyFile` | string? | only with `auth: 'key'`; absent is "Default keys" |
| `remember` | boolean | only with `auth: 'password'`; true means a password is in `secrets.json` |
| `seen` | `{ version?: string; plan?: string }`? | last known Claude Code version and plan, for Settings and the status bar while not connected |

## Project root

- Local: an absolute path, as today.
- On a host: `ssh://<host id><absolute path on the host>`, e.g. `ssh://devbox/home/leo/trailmap`. Parsed by `shared/hosts.ts`: `hostOf(root) → id | undefined`, `pathOf(root) → string`, `remoteRoot(id, path) → string`.

## HostState (in memory, main process)

`'idle' | 'connecting' | 'up' | 'lost' | 'needs' | 'missing' | 'signin'`

```text
idle --open/start--> connecting
connecting --ssh ok & claude answers--> up
connecting --askpass prompt--> needs
connecting --no claude--> missing
connecting --not signed in--> signin
connecting --20 s--> needs (timed out)
needs --answered--> connecting
needs --Not now--> idle
missing --installed--> connecting
signin --reconnect--> connecting
up --link dead ≥ 10 s--> lost
lost --back--> up
lost --prompt--> needs
up|lost --Disconnect--> idle
```

## HostView (sent to windows, `hosts:changed`)

| Field | Type | Note |
|---|---|---|
| `id`, `name`, `address`, `user`, `port`, `auth` | as HostConfig | |
| `state` | HostState | shown state, after the 1 s and 10 s thresholds |
| `since` | number? | when it became `up`, ms |
| `version`, `plan` | string? | from `claude --version`, `claude auth status --json` |
| `problem` | string? | the exact line for `needs`/`missing`/`signin` ("Could not reach devbox: timed out after 20 s.") |
| `remembered` | boolean | a password is kept |

## HostPrompt (sent to windows, `hosts:prompt`; answered with `hosts.answer`)

| Field | Type | Note |
|---|---|---|
| `id` | string | one prompt |
| `host` | string | host id |
| `kind` | `'password' \| 'passphrase' \| 'code' \| 'trust' \| 'other'` | read from the prompt's words |
| `text` | string | the card's words from the UX wording table |
| `detail` | string? | fingerprints for `trust`, key file for `passphrase` |

Answer: `{ id, answer?: string, remember?: boolean }`; no `answer` is "Not now".

## RemoteRun (in `userData/hosts/runs.json`)

| Field | Type | Note |
|---|---|---|
| `session` | string | conversation id |
| `host` | string | host id |
| `root` | string | the `ssh://` root |
| `offset` | number | bytes of whole lines read from `out` |
| `started` | number | ms |

Removed when the run's `geckit_exit` line is read, or when it is found gone.

## Mirror (in `userData/hosts/<host id>/projects/<slug>/<id>.jsonl`)

A byte-for-byte prefix of the host's file of the same name; its mtime is set to the host's. Listing edges are cached in memory keyed by `size:mtime`.
