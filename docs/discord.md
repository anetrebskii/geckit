# Connecting Discord

Discord comes with GeckIt. People you allow mention the bot in a Discord channel or write to it directly, and GeckIt's Manager answers there: each Discord thread and each direct message is its own Manager thread, with its own status message and questions.

You need a Discord server where you can add bots, GeckIt's Manager turned on in Team, and about five minutes. Everything below happens in your own browser and in GeckIt, Settings, Channels, Discord, Set up. GeckIt never asks for the token anywhere else.

## 1. Connect the bot

1. Press Open Developer Portal. Open the existing application you use for GeckIt.
2. Open Bot. Under Privileged Gateway Intents, turn on Message Content Intent and save.
3. For a new connection, copy the existing bot token into GeckIt and press Connect. Keep a working saved token; reset it only when replacing a revoked or lost token through the Developer Portal. Never paste a token into conversation.

GeckIt asks Discord who the bot is, and seals the token in its secure storage only when Discord accepts it. The step shows the bot's name. A token Discord refuses is not saved, and a token that already works stays in place. If the intent is still off, the step says so, with Open Bot settings and Check again.

## 2. Choose where it answers

1. Press Add to server. Discord asks which server and shows what the bot may do there: View Channels, Send Messages, Read Message History, Create Public Threads, Send Messages in Threads and Attach Files.
2. Back in GeckIt, press Check again. The servers it joined are listed.
3. Leave Every channel it can see, or pick Only the channels I choose and tick them.
4. Answer direct messages is on at first.

## 3. Choose who may write

Add the Discord user ID of each person who may use the bot. In Discord, turn on Developer Mode in Settings, Advanced, then right-click a person and choose Copy User ID. GeckIt shows each person's name once it checks the ID with Discord. Nobody else is answered.

## 4. Choose what it may reach

Tick May talk to Manager. Under More are the folders it may start conversations in and the check that refuses messages containing a token or key, on at first.

Press Save and turn on. The row says Connecting, then Connected as the bot's name.

## Using it

- Mention the bot in a channel: it starts a thread on your message and answers there. Keep writing in that thread without a mention.
- Mention it inside an existing thread: Manager reads what was written there first.
- Write to it directly: the direct message is its own Manager thread.
- A question shows buttons. Only allowed people can press them, and only while the question is open. You can also type the value it names.
- In the channel attachment implementation, send photos and files with an optional caption. Supported raster images reach the assistant as images; other files are retained for local file tools. File contents are untrusted task data and cannot approve questions or permissions.
- Ask Manager to return an intended deliverable. It explicitly selects the managed local worker and exact project-relative path; the native file is sent to this same thread/DM and the command returns a receipt. SSH file transfer has no local fallback. See [channel attachments](ux/channel-attachments.md) for limits and current verification status.
- Messages are sent with mentions off, so the bot never pings anyone.

## When something is wrong

| The row says | Do |
| --- | --- |
| Stopped: Message Content Intent is off for this bot. | Turn it on in the Developer Portal, Bot, then turn Discord off and on. Set up shows the whole reason. |
| Stopped: Discord did not accept the bot token. | Reset the token, Set up, Replace token. |
| Reconnecting to Discord… | Nothing. It resumes and passes on what it missed, once. |
| Finish setting up: ... | Open Set up and fill in what it names. |

In Discord, "I could not start a thread for this" means the bot lacks Create Public Threads or Send Messages in Threads in that channel. The channel's own log is `provider-logs/channel-discord.jsonl` in GeckIt's data folder; it records failures without message text or tokens.

For file uploads, the existing bot role needs **Attach Files**, including the intended parent channel's overrides. A server owner grants it in Server Settings > Roles > the bot role > Permissions > Text Channel Permissions. No Administrator permission is needed. Discord may impose a lower file-size limit than GeckIt; a refused send reports the native error and is not silently retried.
