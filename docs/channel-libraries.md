# Channel libraries

A channel library brings GeckIt's conversations to another place where people write: Slack, Telegram, a company's own system. It is a public GitHub repository, installed in Settings, Channels, and it runs inside the GeckIt service.

GeckIt owns the conversations, assistants, queue, Manager and secure storage. The library owns its policy: who may write, which assistant and folder a thread gets, what is checked before text reaches a conversation, and how answers and cards look where it lives. Two companies can install two Slack libraries that behave differently without GeckIt changing.

[`examples/slack-channel`](../examples/slack-channel/README.md) is a complete library with no dependencies: one Claude Code conversation per Slack thread, Manager over direct messages, an allowlist, and a check for tokens and keys before anything is sent.

## For users

1. Settings, Channels, Add channel, paste the repository address.
2. Set up: fill in what the library asks for. Secrets are sealed in GeckIt's secure storage, never written to `settings.json`, and never shown again.
3. All GeckIt project folders, Manager access and every declared capability are available automatically.
4. Turn it on. The row says Connected, or what is missing, or why it stopped.

Updates follow Update channels automatically at the bottom of Channels, and Check now. A changed library is stopped, swapped and started again. Remove stops it, moves its copy to Trash and forgets its settings and secrets; the conversations it started stay.

On a headless service the same calls are `service call channels:view '[]'`, `channels:install`, `channels:configure`, `channels:inspect`, `channels:remove` and `channels:checkUpdates`.

Telegram, Slack and Discord come with GeckIt and are set up the same way, from their rows; [Connecting Discord](discord.md) walks through the Discord bot.

## Repository layout

```text
geckit-plugin.json
index.mjs        # the whole library, or a prebuilt bundle; committed
README.md
```

```json
{
  "apiVersion": 2,
  "kind": "channel",
  "capabilities": ["conversations", "manager", "replies", "delivery", "files"],
  "entry": "index.mjs",
  "channel": { "id": "channel:slack", "name": "Slack", "icon": "chat", "description": "..." },
  "config": [
    { "key": "botToken", "label": "Bot token", "type": "secret", "required": true, "help": "xoxb-..." },
    { "key": "allow", "label": "People who may write", "type": "list", "required": true },
    { "key": "folder", "label": "Folder for new threads", "type": "text" },
    { "key": "checkSecrets", "label": "Refuse messages with a token", "type": "boolean", "default": true }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `kind` | Always `channel`; a provider library has none |
| `channel.id` | `channel:<lowercase-slug>`, stable across versions; an update with another id is refused |
| `channel.icon` | One of GeckIt's icon names; an unknown one shows the chat icon |
| `config[].type` | `text`, `secret`, `list` (one entry per line) or `boolean` |
| `config[].required` | The channel is not started until it is filled in |
| `apiVersion` | `1` or `2`; any other version is refused with the version it needs |
| `capabilities` | Version 2 only, required: the abilities below. A version 1 manifest means `["conversations", "manager"]` |

### Abilities (version 2)

| Ability | What it gives | Who decides |
| --- | --- | --- |
| `conversations` | Start and talk to conversations in any GeckIt project | Projects configured in GeckIt |
| `manager` | Manager threads, decisions, shared threads, language, `watchManager` | Declared by the library; global Manager switch applies |
| `replies` | `send` with `replyTo`: a reply to an earlier answer reaches the work it was about | With `manager` |
| `delivery` | `delivery(id)`, `pending(thread)`, `working(thread)` and `delivery` events, for a typing or seen indicator | With `manager` |
| `control` | `context.control` (pause, resume, Manager's view) and owner threads | Declared by the library |
| `files` | `context.files`: attachments in, a worker's file out | Declared by the library |
| `shares` | `context.shares`: pages shared from this computer | Declared by the library |

`context.capabilities` contains every capability declared by the library. Calls to undeclared capabilities are refused by name. Bundled and installed libraries follow the same policy. Legacy `manager` and `grants` settings and change inputs are retained for compatibility but cannot disable declared abilities. The global Manager switch and channel On switch still apply.

The settings form is drawn from `config`, in its order. GeckIt adds no folder or permission controls; all configured project folders are available. Legacy per-channel project lists are ignored.

## Contract

Types are in [`channel-api.ts`](../client/src/main/channels/channel-api.ts).

```js
export function create(context) {
  return {
    start: async () => { /* connect; throw to show the reason in Settings */ },
    stop: async () => { /* disconnect; GeckIt has already removed your watchers */ },
  }
}
```

`create` is called each time the channel starts: when it is turned on, when its settings change and after an update. A context from an earlier start refuses every call with "This channel was stopped".

| `context.` | |
| --- | --- |
| `config()` | Non-secret settings, defaults filled in |
| `secret(key)` | A secret setting, or undefined |
| `store.get(key)`, `store.set(key, json)` | The library's own small state, kept across restarts; `undefined` deletes |
| `status(state, says)` | `starting`, `connected` or `failed`, with a short line shown in Settings |
| `projects()` | The folders this channel may use |
| `providers()` | Assistants enabled in GeckIt |
| `employees()` | Employees, without archived ones |
| `log.write(level, event, fields)` | Local diagnostics in `provider-logs/channel-<slug>.jsonl`; text, tokens and prompts are dropped |

`context.conversations`:

| | |
| --- | --- |
| `start({ root, text, provider?, model?, mode?, employeeId?, images?, labels? })` | A new conversation in an allowed folder; returns its id. Provider defaults to GeckIt's choice and must be enabled. `labels` stay on it (below) |
| `send(id, { text, images?, attachments?, authorized?, from?, id?, request?, replyTo? })` | The next message; returns the session that took it. For a Manager thread, `from` is shown to Manager with the channel's name (`[Via <name>, from <who>]`) and becomes the thread's "who wrote last". Version 2: `id` makes sending again after a restart queue it once, `request` says who asked (never permissions), `replyTo` is the `reply` of an earlier `answer` |
| `manager({ key, title?, from?, link?, labels?, shared?, owner?, pairing? })` | The Manager thread for one place, when this channel may talk to Manager and Manager is on. The same `key` is always the same thread: use a chat id, or a channel and Slack thread. Without an argument, the channel's one default thread |
| `label(id, labels)` | Adds labels to a conversation it started or to one of its Manager threads; an empty value removes one |
| `get(id)`, `list()` | `{ id, root, title, state, provider, manager }`; `list` is what this channel started |
| `items(id)` | The transcript so far |
| `watch(id, listener)` | `items` (upserted by id, with `gone`), `state`, `notice`, and for a Manager thread `decisions` raised in it `answer`, Manager's reply ready to post, whoever wrote the message it answers, and `status`, what Manager and the thread's own and followed workers are doing now (`activity`: a Manager line, an ending, whether Manager is active and one line per worker; render it with `StatusMessage` semantics from `docs/ux/channel-status.md`); returns an unwatch function |
| `answer(id, card, answer)` | A permission card (`once`, `session`, `no`, or a choice's words), or one of Manager's decisions |
| `stop(id)` | Stops the current turn; Manager is paused in GeckIt instead |

Version 2 adds, each behind its ability:

| | |
| --- | --- |
| `decide(thread, decision, choice, { by?, authorized? })`, `decisions(thread)` | Answer a decision with who answered; free words go to Manager as a reply to it |
| `language(thread)`, `managerOn()`, `watchManager(listener)` | The thread's language; whether Manager is on, and when that changes |
| `current(reply)` | Whether an answer's reply reference still leads to work Manager follows |
| `deliver(thread, sender)`, `ready(thread)` | Shared threads: answers are kept until the route posts them once; `ready` resumes the thread after the connection is verified |
| `close(reason)` | Close the channel's threads with a reason, or open them again |
| `summary(thread)` | Manager's state, the thread's state, its workers and uncertain replies, for a `/status` command |
| `delivery(id)`, `pending(thread)`, `working(thread)` | Where a message stands and whether Manager is at work |

Events: `answer` carries `reply` (pass it back as `replyTo`) and `language`, and is not sent for shared threads, which use `deliver`; `delivery` when a message changes state; `review` in an owner thread when a worker asks the person; `status` without `activity` when a thread's activity ends. A shared thread (`shared: true`) is one many people write in; its queue is limited to 100 messages. An owner thread (`owner: true`, needs `control`) is the owner's own chat: it also gets GeckIt-wide decisions and worker review notices, and `pairing` identifies it so a decision made under an earlier pairing is not used.

`context.sealed` keeps one text of the channel's own, such as a token it was given while connecting, sealed by GeckIt's secure storage: `available()`, `read()` (undefined when nothing is kept) and `write(text)` (undefined removes it). A built-in channel's `migrate` may call `adoptSealed(name)` to move a file an earlier version sealed in the data folder into it; one the desktop sealed waits until the desktop has moved it to the service.

A running channel may also answer its own Settings screen: `Channel.request(json, from)` through `channels:request`, where `from` is `desktop` or `phone`, and `context.view(json)`, sent to the windows as `channels:shown`. Telegram uses both for its connect flow.

### Files

`context.files` comes with the `files` ability. `files.has(thread, id)` says whether a kept file is still there, and `files.hold(ids)` keeps the channel's files from expiring until the next call (an empty list lets them go). `files.keep(thread, bytes, name, media)` retains input in the shared channel attachment store, scoped to that Manager thread, and returns its opaque ID. Pass those IDs through `conversations.send` as `attachments`; the host supplies readable retained files and signature-validated native images. `authorized` rechecks the originating user's current channel access before queued dispatch. Contents and names are untrusted task data.

`files.bind(thread, sender, limit?)` registers a native output route (`limit`: the largest document in MB, 10 when absent) and returns its cleanup function. The host rejects a stale, disabled or inaccessible route. Manager's authenticated `channels send-file` selects a tracked local worker and exact project-relative path; the adapter receives the validated bytes and returns native receipt IDs. No destination comes from file content or model-supplied channel IDs. See [the UX and permission contract](ux/channel-attachments.md) and [operator guide](channel-attachments.md).

### Checking a setup

A library may also export `inspect(setup, request)`. Settings calls it through `channels:inspect` while the channel is being set up, whether or not it runs, to check a saved secret and list what it can reach. `setup` has `id`, `log`, `config()` and `secret(key)`; `request` and the answer are JSON the library and its own setup screen agree on. A library without it answers "<name> has nothing to check". The built-in Discord channel uses it to show the bot, its servers and channels, and who the allowed IDs are (`client/src/shared/discord.ts`).

### Manager threads and labels

Manager keeps one conversation per place a channel names, so two Slack threads never read each other's answers. All threads share Manager's settings, decisions and the conversations it manages; a conversation Manager starts from a thread reports back to that thread. Alex can read every thread in GeckIt's Manager window and write into one; Manager's answer then arrives as `answer` and the channel posts it.

Labels are up to 8 `key: value` pairs, keys up to 40 characters and values up to 300; more is cut and the channel's log says so. They say where something came from (who started it, a thread id, a ticket) so it can be traced later: GeckIt shows them in Session info and finds them in Search, and never treats them as permissions. Who may write is decided by the channel before a message reaches GeckIt.

A channel reaches only the conversations it started and, when allowed, its own Manager threads. Anything else is refused with "This channel did not start that conversation", so a company's library cannot read personal chats in the same GeckIt.

## Trust

Library code runs in the GeckIt service with that OS account's access, like a provider library. The scope above keeps an honest library to its own conversations; it is not a sandbox against a hostile one. Add repositories you trust, and pin a company's library to a repository the company controls.

## Library-owned Settings and migrations

All channels, including Telegram, use `ChannelModule` from `client/src/main/channels/channel-api.ts`. The host has no channel-specific renderer or phone endpoint. A bundled module has the same context as an installed library; bundled registration only controls updates and removal. Modules must bundle their transport and pure helpers and must not import GeckIt's Manager, runtime, filesystem stores, Electron or service implementation.

Optional exports alongside `create(context)`:

| Export | Contract |
| --- | --- |
| `settings(context, request)` | Returns a `Promise<ChannelScreen>` even while the channel is off. The host renders it using its existing controls. |
| `inspect(context, json)` | Checks configuration while off; receives only its own config, secret lookup and logger. |
| `present(value, from)` | Produces desktop or phone-safe published JSON. Applied to both live events and reconnect snapshots. Without it the published value is public to both clients. |
| `migrate(context)` | Runs for installed and bundled modules before reconciliation on each host start. Must be repeat-safe. `created` indicates a newly added setting. |
| `restoreManager(record)` | Repeat-safe transformation of saved Manager JSON before Manager reads it. Used only for a module's legacy schema. A thrown error aborts restoration instead of saving an empty record. Libraries run as trusted code in the service process. |

A `ChannelScreen` has optional `title`, `text` (paragraphs), `fields` (the same schema as manifest fields), `actions`, `sections` and JSON `state`. Each action has `label` and either JSON `action` or `href`, plus optional `primary` and confirmation text `confirm`. The host returns `{ state, action, values }` on submission. State may hold step names or checked results; never put tokens or other secrets in it. Returned secret inputs are cleared after a successful action. Errors retain entered values. When `settings` exists the module owns its configuration fields, validation and saving; the manifest still declares required fields and secrets. Without `settings`, the host renders manifest fields. The host adds no permission form after the module screen.

`ChannelSettingsContext` supplies `id`, `log`, `config()`, `secret(key)`, `setting()`, `viewed()`, `request(json)`, `inspect(json)` and `configure(change)` for that channel only. `request` reaches the running channel on desktop; configuring an off channel can enable it before a request. `context.view(json)` triggers a refresh of an open screen. The host exposes the same `channels.screen`, `channels.request` and `channels.onShown` calls for every ID. Phone configuration stays unavailable; phone runtime requests include `from: 'phone'`, and the module enforces its own policy.

```js
export async function settings(context, request) {
  if (request.action === 'connect') {
    const token = request.values?.token
    if (typeof token !== 'string' || !token.trim()) throw new Error('Enter a token.')
    await context.configure({ secrets: { token: token.trim() }, enabled: true })
  }
  return {
    title: context.setting().enabled ? 'Connection enabled' : 'Connect',
    fields: [{ key: 'token', label: 'Token', type: 'secret' }],
    actions: [{ label: 'Connect', action: 'connect', primary: true }],
  }
}
```

Migration context has `configure({enabled?, manager?})`, `renameManagerChannel(from, to, shared)`, `renameNoteKey(from, to)` and `adoptSealed(filename)`. Thread renames can target only the module's own ID. `adoptSealed` moves a legacy sealed file into the module's `context.sealed`; the host handles desktop decryption handoff without knowing the channel name. Runtime `sealed` is available to every channel. Files go through `context.files.keep/has/hold/bind`; cleanup belongs to the host.

Decision failures use the contract's `ChannelDecisionError.reason` (`paused`, `native`, `choice`, `changed`). Use `channelDecisionReason(error)` to inspect a reason structurally: an independently bundled library must not use `instanceof` a host Manager class.

## Shortcut result destinations

A running module may opt into scheduled and manual shortcut results with both `destinations(): Promise<readonly ShortcutDestinationChoice[]>` and `publishShortcut(input): Promise<ShortcutDestinationReceipt>`. Existing v1/v2 libraries without these optional hooks keep their existing behavior and are unavailable for result selection. The host discovers support without naming transports and requires the active connected module and Manager at publication time. Discovery `supported` describes the active instance hooks, not a promise from static metadata. Disabled or disconnected channels and an unavailable Manager return a readiness error even when hooks cannot be inspected; a connected library lacking hooks returns unsupported without that readiness error.

`destinations` returns stable native place IDs, human names (including workspace/server and identity when names collide), and `model: 'thread'`. These are places in which the module can create a fresh isolated native reply route. Discovery must not create messages. Saved configuration is `{channel: ChannelId, destination: string, label?: string}`; labels are display text, never routing or authorization.

`publishShortcut` receives `{runId, destination, title?, text, bind, beforeSend?}`. Invoke the host-supplied `beforeSend` guard immediately before every native mutation; it rejects a disabled connection, changed module generation or unavailable Manager, including between result chunks. The host supplies already cleaned result text and a callback scoped to that exact run and active module generation. After creating the native thread/root, call `bind(ChannelThread)` once, keep the resulting Manager thread ID, persist the ordinary native inbound route and install ordinary answer watchers before accepting replies. The callback retains the run's original Manager backing context; a library cannot choose another source worker. Return `{destination, thread, message?, link?}` with actual native identities, where `thread` equals the bound `ChannelThread.key`. Missing or mismatched receipts are uncertain, never a successful delivery. The callback expires when publication returns or fails.

Write operations must not be blindly retried after an ambiguous network/server outcome. `ChannelShortcutError(false, reason)` identifies a definite refusal; `ChannelShortcutError(true, reason)` identifies uncertainty. The host recognizes the boolean `uncertain` field structurally, so separately bundled libraries retain these semantics without sharing a class instance. Core persists sending before publication, retains results after failures and does not repost known or uncertain deliveries automatically. A result thread uses the same existing sender authorization and Manager permission checks as ordinary traffic. Restore its saved route after module restart; a saved route grants nobody new access.

The bundled Discord module lists server text channels, creates a new public native thread per result and disables mention notifications while sending every result chunk. Known thread replies need no bot mention but still require the configured user allowlist. The bundled Slack module lists joined nonarchived channels, creates a new root plus result replies, and accepts ordinary unmentioned text replies only in known shortcut result threads after its workspace human membership check. Slack discovery additionally needs `channels:read` and `groups:read` on the existing app. Telegram's current module does not implement these hooks and promises no isolated native result threads. No module discovery or offline test proves live API permissions or delivery.
