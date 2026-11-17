---
type: spec
status: implemented in branch feat/discord-channel, waiting for Alex's review
---

# Discord channel

## Why

People who work in Discord could not reach GeckIt's Manager from there. Telegram and Slack could; Discord had no channel, and a channel library from GitHub would have to reinvent the token storage, allow list, threads and questions that Slack already has. Discord now comes with GeckIt, on the same channel contract as Slack, with a guided setup because a Discord bot needs four things in the right order: a token, a server, the people allowed, and Manager.

## The path

Open Settings, Channels, Discord, Set up. The module-owned screen uses the same public settings contract as every installed channel library; the renderer has no Discord-specific component.

Only two values are configured: Bot token and People who may write (Discord user IDs). Check and save token verifies the token with Discord before sealing it. A rejected token never replaces a working saved token. Check saved setup refreshes the bot identity, Message Content Intent, server list and user identities. Links open the Developer Portal, bot settings and server invitation. Save channel settings saves the allowed users. Escape closes Set up and returns focus to its opener.

The bot always answers in every visible channel and direct message, and always checks messages and files for tokens and keys. Manager access, declared capabilities and all GeckIt project folders are automatic. No folder, channel, direct-message or secret-check controls are shown. Legacy restrictions are ignored. The operational On switch still starts or stops the connection; the global Manager switch still applies.

## States and transitions

| From | Event | Result visible to the person |
| --- | --- | --- |
| Closed | Set up | Connection screen loads; token and allowed-user fields are shown |
| Ready | Check and save token | Working; token is verified, saved on success and cleared from the input |
| Working | Discord refuses token or request fails | Error message; existing token remains, input stays for retry |
| Ready | Check saved setup | Bot identity, intent, servers and allowed user identities refresh |
| Ready | Save channel settings | Allowed-user list is saved and remains visible |
| Ready | Forget token, then Confirm | Token is removed; connection requires a token again |
| Confirming | Cancel or Escape | Forget is cancelled |
| Open | Escape | Set up closes; focus returns to Set up |

A saved token is distinct from a connected gateway. Ready requires a valid token, Message Content Intent and at least one allowed person. Connecting, Connected, Reconnecting and Stopped are reported by the channel. Failure text includes the native reason and remains retryable after correction.

## In Discord

- A mention of the bot in a channel starts a Discord thread on that message, named after its first line, and that thread is its own Manager thread. Later messages in the thread need no mention.
- A mention inside a thread the bot did not start makes that thread its own Manager thread, and Manager first reads what was written there before.
- Each direct message channel is its own Manager thread.
- Manager's answers, the status message and questions go to the thread or direct message they belong to. No mention in them notifies anyone: every message is sent with mentions off.
- A question with up to 25 choices comes with buttons, the first one primary; it also says the values that can be typed instead. A button works only for someone allowed, only on the message that asked it, only in its thread and only while it is open. Anyone else gets "This question is no longer open." or "You are not on the list of people who may use this bot.", seen only by them. After an answer the buttons are removed and the message says who chose what. A question answered in GeckIt loses its buttons in Discord and says "Answered."
- File/photo handling is extended by [channel attachments](channel-attachments.md): retained bytes and native image input, shared worker handoff, and explicit same-thread artifact delivery with a receipt. See that document for the implementation and verification boundary.

## What stays silent

- Messages in channels without a mention, and in threads the bot has not joined, are not answered and not read.
- People not allowed who write in a known thread without a mention are not answered; their words reach Manager only as earlier context when an allowed person writes next.
- Other bots and webhooks are never answered, to avoid loops.
- A repeated or replayed gateway event, and a message older than the last one passed on in that thread, are dropped without a word.
- The bot's ID, application ID and invite link are not shown: Add to server and Open Bot settings use them.
- Reconnecting is shown on the row only; Discord itself shows the bot offline.

## Numbers

| Number | Why |
| --- | --- |
| 2000 characters per message | Discord's limit; longer answers are cut at a line break into several messages. |
| 25 buttons | Discord allows 5 rows of 5. More choices are offered as typed values only. |
| 80 characters per button label | Discord's limit. |
| Thread names up to 90 characters | Discord allows 100; the cut leaves room and reads as a title. |
| Threads archive after 1 day of quiet | Discord's 1440 minutes, the default people know. |
| 100 earlier messages | one page of Discord's history; more would slow every first reply. |
| 30 000 characters of earlier context | the same as Slack, so Manager is not flooded. |
| Reconnect after 1 s, doubling to 30 s | fast after a blip, gentle when Discord is down. |
| Up to 3 waits on a rate limit, each up to 60 s | Discord says how long to wait; a longer wait is reported instead. |
| 25 servers and 50 people checked in Set up | keeps a check under a few seconds. |

## Edge cases

- Saved token revoked in the Developer Portal: Set up shows the refused state and asks for a new one; the row shows Stopped after the next connect.
- Bot removed from every server: step 2 shows No server; direct messages remain available.
- The bot cannot create threads in a channel: it answers the mention there with "I could not start a thread for this: " Discord's reason, and which permissions to give.
- A token pasted into a message: refused, and Manager never sees it.
- Manager off: "Manager is not available to Discord. Allow it in GeckIt, Settings, Channels, Discord."
- History cleared or the thread deleted in GeckIt: open questions there lose their buttons and say "This question was cleared in GeckIt."; older Discord messages are not sent again.
- Restart of GeckIt: known threads, open questions and the last message seen are kept, so nothing is answered twice.

## What is deliberately not there

- No slash commands and no second Manager: Discord talks to the same Manager threads as Slack, through the same channel contract.
- File contents and explicit output now follow the shared [channel attachment contract](channel-attachments.md); no separate Discord attachment system.
- No member picker: listing a server's members needs the privileged Server Members Intent; IDs are pasted instead.
- No setting of server permissions or roles from GeckIt: the invite asks Discord for View Channels, Send Messages, Read Message History, Create Public Threads, Send Messages in Threads and Attach Files, and the server's owner decides.
- No Discord on the phone: channels are set up on the computer that runs them, as Slack.

## Decisions

| Question | Verdict | Why |
| --- | --- | --- |
| Built in, or a channel library from GitHub | Built in | Slack is built in; Discord needs the same sealed secret, allow list and Manager threads, and the same public settings hook as installed libraries. |
| One Manager thread per Discord channel, or per thread | Per thread and per direct message | the same as Slack threads; a busy channel would mix unrelated work. |
| Buttons or typed answers | Both | buttons are native and bound to the message; typed values keep working where buttons cannot be shown. |
| Check the token before saving | Checked first, saved sealed only when accepted | saving first and forgetting a refused token would wipe a working token when a replacement is mistyped. The pasted token goes to the service once, with the check, the same way Save sends it, is used for that one check and is never stored or sent back to the window. |

## Requirements

Covers Alex's request of 2026-11-07: Discord as a place to talk to Manager and worker sessions with Telegram and Slack parity, and the addendum asking for a designed setup with onboarding, server and channel choice, allowed people and visible connection states. Not covered: live Discord, which needs Alex's own bot and server.

The correction of 2026-11-15 supersedes the former four-step permissions form and optional channel/direct-message restrictions. Only token and allowed users remain configurable.
