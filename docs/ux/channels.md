# Channels

A channel is a library from GitHub that takes GeckIt to another place where people write: Slack, Telegram, a company's own system. GeckIt keeps the conversations, the assistants and Manager; the library decides who may write, which assistant a thread gets, what is checked before a message reaches a conversation, and how answers look where it lives.

## Where

Settings, Channels, after Integrations. Assistant libraries are added in Assistants; channel libraries have their own section here. Not on the phone: channels are installed and set up on the computer that runs them, and Telegram is connected on the computer too.

## The section

- Heading "Channels", with "Add channel" at its right, as Assistants has "Add assistant".
- Under it one line: "Places outside GeckIt where people write to your conversations and Manager. Telegram, Slack and Discord come with GeckIt; add others from GitHub."
- Telegram, Slack and Discord use the same row with Set up and the on switch. Bundled rows cannot be removed. Their module-owned connection screens use the same declarative contract available to installed libraries.
- Telegram's module supplies bot creation, pairing, private/team setup, disconnect and shared links. Telegram controls do not appear in Manager.
- Slack uses manifest fields for bot token and app token. Each Slack thread is its own Manager thread (see [Manager threads](manager-threads.md)).
- Discord's module supplies token checks and configuration through the generic settings hook (see [Discord channel](discord-channel.md)).
- Manager configuration has no Telegram-specific account panel or controls. Channels are configured in Settings, Channels.
- Nothing installed from GitHub: Telegram, Slack and Discord are still listed, so the section is never empty.
- At the bottom, "Update channels automatically", on at first, and "Check now", which fetches newer versions and restarts each one that changed.

## Loading

Until the service answers, the list shows three placeholder rows in the shape of a channel row (icon, name, line, controls), breathing, with "Loading channels…" for screen readers. The list is never an empty box. With nothing installed and nothing failed: "No channels yet. Add one from GitHub."

## A channel's row

Icon, name and the line below, with its repository shown on hover; then "Set up", "Remove" and, at the trailing edge, a switch that turns the channel on and off (the same switch as in Assistants). "Update channels automatically" is a switch too.

The line under the name says where it stands, in its library's words where it gave any:

| State | Line |
| --- | --- |
| Off | Off |
| On, a required setting empty | Fill in Bot token, App token. |
| Starting | Starting… |
| Running | Connected, then what the library said: "Connected · Listening in 3 channels" |
| Failed | Stopped: and the reason, in the danger colour |

A dot before the line shows the state at a glance: green Running, amber Starting or setup missing, red Failed, grey Off.

When it has started conversations: "4 conversations" after the state; when it has Manager threads: "3 threads".

Turning it on with a required setting empty does not start it; the row says what to fill in and Set up opens.

## Set up

Opens under the row. Fields come from the library's own list, in its order, each with its help line:

- text: one line
- secret: a password field. A saved one shows "Saved" as its placeholder, and "Forget" beside it. Typing replaces it. Secrets are sealed in GeckIt's secure storage, never in settings.json, and are never shown again.
- list: one entry per line
- yes or no: a tick

GeckIt adds no folder or permission controls. All project folders configured in GeckIt and every declared capability are available automatically for every channel, including installed libraries. Legacy permission and folder lists do not restrict them. The operational channel On switch and global Manager switch remain.

Slack has only Bot token and App token. All workspace users may write, including guests; bots, deleted users and users from other workspaces are refused. Discord has only Bot token and People who may write. It always answers in every visible channel and in direct messages, and checks messages and files for secrets. Old restrictions and disabled check settings are ignored.

"Save" applies everything and restarts the channel if it was on; "Cancel" closes without saving. A refused value says why under the form and keeps what was typed.

## Remove

"Remove" asks in the row: "Remove Slack? It stops, its copy moves to Trash, and GeckIt forgets its settings and secrets. Conversations it started stay." with "Cancel" and "Remove channel".

## A library that did not load

A row with the danger icon: "Could not load this channel: <reason>" and "Remove".

## Add

"Add channel" opens a field for the repository address with "Add" and "Cancel", and under it: "Channel code runs on this computer and reaches the conversations you allow it. Add a repository you trust." A new channel is added off.

## Module-owned connection screen

The current behavior and transitions are in [Library-owned settings](../../specs/030-channel-contract-v2/ux.md). Every channel uses the same row and permission form. A module may return declarative connection steps via `settings(context, request)`; Telegram pairing and Discord checks use this hook. The renderer contains no channel-ID switches. Manager has no Telegram account panel. Phone calls and updates use the channel ID and the same contract.
