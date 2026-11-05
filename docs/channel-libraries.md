# Channel libraries

A channel library brings GeckIt's conversations to another place where people write: Slack, Telegram, a company's own system. It is a public GitHub repository, installed in Settings, Channels, and it runs inside the GeckIt service.

GeckIt owns the conversations, assistants, queue, Manager and secure storage. The library owns its policy: who may write, which assistant and folder a thread gets, what is checked before text reaches a conversation, and how answers and cards look where it lives. Two companies can install two Slack libraries that behave differently without GeckIt changing.

[`examples/slack-channel`](../examples/slack-channel/README.md) is a complete library with no dependencies: one Claude Code conversation per Slack thread, Manager over direct messages, an allowlist, and a check for tokens and keys before anything is sent.

## For users

1. Settings, Channels, Add channel, paste the repository address.
2. Set up: fill in what the library asks for. Secrets are sealed in GeckIt's secure storage, never written to `settings.json`, and never shown again.
3. Tick the folders it may use and, if it should, May talk to Manager. Both are off at first.
4. Turn it on. The row says Connected, or what is missing, or why it stopped.

Updates follow Update channels automatically at the bottom of Channels, and Check now. A changed library is stopped, swapped and started again. Remove stops it, moves its copy to Trash and forgets its settings and secrets; the conversations it started stay.

On a headless service the same calls are `service call channels:view '[]'`, `channels:install`, `channels:configure`, `channels:remove` and `channels:checkUpdates`.

## Repository layout

```text
geckit-plugin.json
index.mjs        # the whole library, or a prebuilt bundle; committed
README.md
```

```json
{
  "apiVersion": 1,
  "kind": "channel",
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

The settings form is drawn from `config`, in its order. GeckIt adds two grants of its own to every channel: the folders it may use, and whether it may talk to Manager.

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
| `start({ root, text, provider?, model?, mode?, employeeId?, images? })` | A new conversation in an allowed folder; returns its id. Provider defaults to GeckIt's choice and must be enabled |
| `send(id, { text, images?, from? })` | The next message. For Manager, `from` is shown to it with the channel's name |
| `manager()` | Manager's conversation id, when this channel may talk to Manager and Manager is on |
| `get(id)`, `list()` | `{ id, root, title, state, provider, manager }`; `list` is what this channel started |
| `items(id)` | The transcript so far |
| `watch(id, listener)` | `items` (upserted by id, with `gone`), `state`, `notice`, and for Manager `decisions`; returns an unwatch function |
| `answer(id, card, answer)` | A permission card (`once`, `session`, `no`, or a choice's words), or one of Manager's decisions |
| `stop(id)` | Stops the current turn; Manager is paused in GeckIt instead |

A channel reaches only the conversations it started and, when allowed, Manager. Anything else is refused with "This channel did not start that conversation", so a company's library cannot read personal chats in the same GeckIt.

## Trust

Library code runs in the GeckIt service with that OS account's access, like a provider library. The scope above keeps an honest library to its own conversations; it is not a sandbox against a hostile one. Add repositories you trust, and pin a company's library to a repository the company controls.
