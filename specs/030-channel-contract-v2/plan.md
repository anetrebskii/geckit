> Latest accepted correction (2026-11-14): no Telegram exceptions. [Design handoff](design.md) supersedes the old UI/phone/storage exceptions below. Modules own settings, presentation and saved-record transformations through optional public hooks. Host storage, file cleanup and capability checks remain generic. External and bundled modules run the same migration hooks. The implementation retains transport helpers in their existing files, bundled without host implementations.

# Implementation Plan: Channel contract v2

**Branch**: `feat/channel-contract-v2` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

## Summary

One contract for every channel. A manifest of version 2 names the abilities a channel needs; `Channels` hands each started channel a context with only the granted parts and checks every call. Telegram's wiring in `core/runtime.ts` moves into a built-in Telegram channel module that drives the existing `ManagerTelegram` class through that context, so its tested behavior is kept. Manager's Telegram-specific names become generic ones keyed by thread: shared threads, channel replies, request tracking. Slack and Discord move to version 2; Discord routes native replies to workers.

## Technical Context

**Language/Version**: TypeScript, Node 22, ESM, Electron service runtime

**Primary Dependencies**: none new

**Storage**: `manager.json` (Manager record), `channels/<slug>.json` (channel state), `manager-telegram.sealed` (Telegram's sealed state, unchanged), settings `channels[]`

**Testing**: vitest against fakes and recorded data; `npm run lint`, `npm run typecheck`, `npm test`

**Target Platform**: GeckIt service on macOS, Windows, Linux

**Constraints**: no visible change for Telegram; v1 libraries unchanged; no new dependency

## Constitution Check

- I. The Person's Own Plan: no change to how sessions start or to secrets; Telegram's token stays sealed by the vault.
- II. One Contract Between Main and Windows: the desktop renderer reaches Telegram through the generic `channels:request` and `channels:view`; phone calls keep their names until FR-023.
- III. Recorded Output: the new contract logic is covered by unit tests with fake Manager, fake channels and recorded Telegram updates.
- IV. UX Before Pixels: the only visible additions are ability rows in Settings, Channels; described in `docs/ux/channels.md` before the UI change.
- V. Every System, One Word: "ability" is the term in UI, docs and code comments (`capability` in the manifest key and types).
- VI. Tokens Only: the ability rows reuse existing channel row classes.

## Design

### Contract (version 2)

`ChannelInfo` gains `capabilities`. Version 1 manifests read as `['conversations', 'manager']`. `ChannelSetting` gains `grants`: the optional abilities the person turned on (`control`, `files`, `shares`). Replies and delivery come with manager.

Additions to the context (types in `channel-api.ts`):

| Part | Ability | What it does |
| --- | --- | --- |
| `capabilities` | all | The abilities this run has |
| `view(json)` | all | The channel's own view for its Settings screen; sent as core event `channels:view` |
| `Channel.request?(json)` | all | A running channel answers its own Settings screen (pairing, actions) through `channels:request` |
| `ChannelThread.shared` | manager | A thread many people write in: answers are kept durably and delivered once; queue limit applies |
| `ChannelThread.owner`, `pairing` | control | The owner's own chat: also gets GeckIt-wide decisions and worker review notices; `pairing` identifies it for intake decisions |
| `send` returns the message id; `ChannelSend.id`, `request`, `replyTo` | manager, replies | Idempotent send, who asked (opaque), reply to an earlier answer |
| `delivery(id)`, `pending(thread)`, `working(thread)` and event `delivery` | delivery | Message state and whether Manager is at work, for a typing indicator |
| `decide(thread, id, choice, { by, authorized })`, `decisions(thread)` | manager | Answer a decision and get the outcome; who answered is recorded |
| `language(thread)`, `current(ref)`, `ready(thread)`, `close(reason)`, `deliver(thread, sender)`, `summary(thread)` | manager | Thread language, whether a reply reference is still valid, resume durable work, close own threads, durable delivery route for shared threads, thread status line |
| `watchManager(listener)` | manager | Manager turned on or off |
| `control.pause()`, `resume()`, `view()` | control | Owner-only Manager controls |
| `files` | files | As today, no longer limited to built-ins |
| `shares.list()`, `stop(id)`, `onChanged`, `onEnded` | shares | Local pages shared through this channel |

Events gain `delivery`, `review` (owner threads), and `answer` carries `reply` (the reference to pass back as `replyTo`) and `language`.

Reply routing keeps the reference with the channel (Telegram already stores it per posted message); `Channels` checks that the reference's thread is the channel's own and that its session is still current before Manager gets it. This replaces the proposal's `posted()` call: no second store in the core.

### Manager

- `teamThread(id)` (id prefix) becomes the thread record's `shared` flag; `TEAM_QUEUE_LIMIT` moves to `manager.ts` as `SHARED_QUEUE_LIMIT`.
- `telegramReplies`, `deliverTelegramReplies`, `telegramPending`, `telegramTypingAllowed`, `activeTelegram` become `channelReplies`, `deliverChannelReplies`, `pendingRequests`, `working`, `activeRequests`; the record is read with the old key as fallback.
- Message source `'telegram'` merges into `'channel'`; stored `'telegram'` messages read as `'channel'`. Channels write `[Via <place>, from <who>]`; the transcript parser reads that as "From <place>", and still reads the old `[Telegram]` prefix.
- `ManagerTelegramSource` becomes `ManagerRequestSource`; notes key `managerTelegramSource` becomes `managerRequestSource`, read with fallback.
- `renameChannel(from, to, shared)` renames a channel in thread records and history boundaries once, after copying `manager.json` to `manager.json.before-channels-v2`.
- The CLI's `telegram send-file` goes; `channels send-file` serves every channel's thread.
- `telegramText` (Markdown to plain text) moves to a generic `plainText` in `main/channel-text.ts`.

### Telegram module

`main/channels/telegram.ts` exports `telegramChannel(deps)` returning a `ChannelModule` with `TELEGRAM_INFO` (`channel:telegram`, abilities all seven, no config fields: the token is entered on its own screen and kept in its sealed file). `create(context)` builds `ManagerTelegram` with a `TelegramManager` adapter over the context and moves the runtime wiring into the module: thread opening, decisions and resolve, progress from `status`, answers, worker review notices, durable team delivery, history, shared links, closing threads when not connected, disconnect when Manager is turned off. `Channels` gets built-in modules from its deps so the module receives the vault, directory and attachment store.

Migration on first start (`migrate` hook of built-ins, run by `Channels.start`): add the Telegram setting enabled with manager and all grants on; `renameChannel('telegram', 'channel:telegram')` marking `team:` keys shared; notes key rename. Repeating it is harmless.

### Compatibility shims (removed with FR-023)

- `phone:telegram` and `phone:telegramAction` in `core/application.ts`, mapped to `channels.request('channel:telegram', …)`.
- `main/index.ts` forwards `channels:view` for Telegram to the phone as `telegram:view`.
- `service/application.ts` keeps the safeStorage to vault migration of `manager-telegram.sealed` (older desktop data).

### Slack and Discord

Both declare version 2 with conversations, manager, replies, delivery, files. Their working indicator stays. Discord stores the reply reference of each answer it posts (by Discord message id, last 500) and passes it as `replyTo` when a person replies to that message.

## Project Structure

```text
client/src/main/channels/channel-api.ts     contract v2 types
client/src/main/channels/libraries.ts       manifest v2, abilities
client/src/main/channels/channels.ts        grants, context v2, events, migration hook
client/src/main/channels/telegram.ts        new: Telegram built-in module
client/src/main/channels/discord.ts         reply routing
client/src/main/channels/slack.ts           v2 info
client/src/main/channel-text.ts             plainText (from telegram-text)
client/src/main/manager.ts                  generic names, shared threads, renameChannel
client/src/main/manager-operations.ts       channels send-file only, request source
client/src/core/runtime.ts                  Telegram wiring removed
client/src/core/application.ts              channels:request, phone aliases
client/src/shared/channels.ts               capabilities, grants
client/src/shared/manager.ts                ManagerRequestSource, source 'channel'
client/src/shared/renderer-api.ts           telegram API over channels:request
client/src/renderer/src/ui/Channels.tsx     ability rows
client/src/renderer/src/chat/manager-said.ts  [Via …] prefix
docs/channel-libraries.md, docs/ux/channels.md, CLAUDE.md
```

## Complexity Tracking

| Exception | Why | Simpler alternative rejected because |
| --- | --- | --- |
| Telegram keeps its own sealed state file | It holds the token and polling state; moving it buys nothing and risks loss | Moving into channel secrets and store means a second migration of live data |
| Telegram files stay in `main/telegram-*.ts` | Moving them only changes import paths and 8 test files | No behavior gain |
| Compatibility shims above | Old phone builds and old desktop data | Breaking them violates FR-023 |
