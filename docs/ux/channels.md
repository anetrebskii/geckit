# Channels

A channel is a library from GitHub that takes GeckIt to another place where people write: Slack, Telegram, a company's own system. GeckIt keeps the conversations, the assistants and Manager; the library decides who may write, which assistant a thread gets, what is checked before a message reaches a conversation, and how answers look where it lives.

## Where

Settings, Channels, after Integrations. Assistant libraries are added in Assistants; channel libraries have their own section here. Not on the phone: channels are installed and set up on the computer that runs them.

## The section

- Heading "Channels", with "Add channel" at its right, as Assistants has "Add assistant".
- Under it one line: "Libraries from GitHub that bring your conversations to Slack, Telegram or another place. Each decides how it works with them."
- Nothing installed: "No channels installed."
- At the bottom, "Update channels automatically", on at first, and "Check now", which fetches newer versions and restarts each one that changed.

## A channel's row

Icon, name and the line below, with its repository shown on hover; then a tick "On", "Set up" and "Remove".

The line under the name says where it stands, in its library's words where it gave any:

| State | Line |
| --- | --- |
| Off | Off |
| On, a required setting empty | Fill in Bot token, App token. |
| Starting | Starting… |
| Running | Connected, then what the library said: "Connected · Listening in 3 channels" |
| Failed | Stopped: and the reason, in the danger colour |

When it has started conversations: "4 conversations" after the state.

Turning it on with a required setting empty does not start it; the row says what to fill in and Set up opens.

## Set up

Opens under the row. Fields come from the library's own list, in its order, each with its help line:

- text: one line
- secret: a password field. A saved one shows "Saved" as its placeholder, and "Forget" beside it. Typing replaces it. Secrets are sealed in GeckIt's secure storage, never in settings.json, and are never shown again.
- list: one entry per line
- yes or no: a tick

Then what GeckIt itself grants, the same for every channel:

- "Folders it may use": ticks over GeckIt's projects. None ticked means it cannot start conversations.
- "May talk to Manager": a tick, off at first.

"Save" applies everything and restarts the channel if it was on; "Cancel" closes without saving. A refused value says why under the form and keeps what was typed.

## Remove

"Remove" asks in the row: "Remove Slack? It stops, its copy moves to Trash, and GeckIt forgets its settings and secrets. Conversations it started stay." with "Cancel" and "Remove channel".

## A library that did not load

A row with the danger icon: "Could not load this channel: <reason>" and "Remove".

## Add

"Add channel" opens a field for the repository address with "Add" and "Cancel", and under it: "Channel code runs on this computer and reaches the conversations you allow it. Add a repository you trust." A new channel is added off.
