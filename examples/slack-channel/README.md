# Slack channel for GeckIt

A complete channel library: copy this folder into its own public GitHub repository, then add it in GeckIt under Settings, Channels.

What it does, and which rules are this library's own rather than GeckIt's:

- A thread that mentions the bot becomes a Claude Code conversation in the folder chosen in its settings. Later messages in that thread go to the same conversation, and the answer is posted back when the conversation stops working.
- A direct message to the bot goes to Manager, when GeckIt allows this channel to talk to Manager.
- Only the Slack user IDs listed in its settings are answered.
- A message that looks like it holds a token or private key is refused before it reaches GeckIt.
- A permission card is posted in the thread; replying `allow`, `allow always` or `deny` answers it.

It has no dependencies: Node 22's own `fetch` and `WebSocket` reach Slack over Socket Mode, so nothing has to be built and `index.mjs` is the whole library.

## Slack app

Create an app at https://api.slack.com/apps, then:

1. Socket Mode: on. Create an app-level token with `connections:write`; that is the App token (`xapp-`).
2. OAuth and Permissions, bot scopes: `app_mentions:read`, `chat:write`, `im:history`. Install it to the workspace; the bot token (`xoxb-`) is the Bot token.
3. Event Subscriptions: on, with the bot events `app_mention` and `message.im`.
4. Invite the bot to the channels it should hear.

## Test

```sh
npm test
```

The tests use a fake Slack and a fake GeckIt context, so they need no tokens.
