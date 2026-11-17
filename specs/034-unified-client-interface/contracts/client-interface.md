# Contract: client interface

Core methods and events served by the service's client view (research R1). Every client reaches them the same way: the local desktop through main over local RPC, a remote desktop and a phone as `core-call` and `core-event` over the remote channel. Names follow `CoreMethods` (`client/src/core/application.ts`) and `CoreEvents` (`client/src/core/events.ts`). Types are in [data-model.md](../data-model.md).

## Capabilities

| Method | `link:can(can: string[]) -> { can: string[] }` |
|---|---|
| When | First call on every connection, before anything else |
| Client says | Any of `deflate`, `pictures`, `steps`, `sessionsChanged`, `find` |
| Server answers | The subset it supports. Remote channels switch to deflated frames for everything after this reply when both sides have `deflate`. |
| Old client | Never calls it: gets whole conversations and whole lists, as today (FR-017) |

## Conversations

| Method | Returns | Notes |
|---|---|---|
| `chat:watch(ids: string[])` | `void` | Replaces the client's viewed set. Item updates outside it stop. |
| `chat:turns(id, count)` | `Piece` | End of the folded conversation, at least `count` items and every pending one. Re-reads the conversation. Adds `id` to the viewed set and resets its sent rows. |
| `chat:turnsBefore(id, before, count)` | `Piece` | `count` folded items before item `before`. Empty with `left: 0` when `before` is unknown. |
| `chat:steps(id, ids)` | `SessionItem[]` | The named steps, pictures as references. |
| `chat:picture(ref, width)` | `SessionImage \| null` | Scaled when a desktop app is attached, else original. `null` when the picture no longer exists. |
| `chat:queuedPicture(id, queued, index, width)` | `SessionImage \| null` | As today, plus scaling as above. |
| `chat:find(id, words)` | `{ total, hits }` | Case-insensitive, same text as Transcript's Find. Whole conversation. |
| `chat:firstAsked(id)` | existing | Used by `shortcutFrom` instead of reading every item. |
| `chat:items(id)` | existing | Kept for the CLI and old clients. New clients do not call it. |

## Events (per client)

| Event | Payload | When |
|---|---|---|
| `chat:sessions` | `ChatSession[]` | Once per connection, then only to clients without `sessionsChanged` |
| `chat:sessionsChanged` | `{ changed, gone }` | Rows that changed, gathered over 300 ms |
| `chat:items` | `SessionItems` | Only for viewed conversations. For clients with `steps`: folded rows from the first that differs from what was sent, with `gone` for what it replaces. Gathered over 100 ms. |
| `chat:earlier` | `{ id, left }` | Client-side only, told by the client adapter after a page arrives |
| Other events | unchanged | Gathered over 50 ms on remote channels, as since `d2de441a` |

## Scope (FR-020)

Every method taking a conversation id fails with "Conversation is outside this device scope." when the id is outside the device's projects or Manager access. List rows and events outside it are never sent. The local desktop is unscoped.

## Old phone pairing (US3, R11)

Over the peer window's old link only the read methods above, `chat:list`, `settings:get` and their events are answered. Every other call fails with exactly `Pair this phone again.`; the phone shows the Pair again card when it sees that error.

## Client-side rules (shared client link module)

- Calls made while the link is down are held up to 60 s and sent when it returns; then they fail with the link-down error. Calls sent before the drop fail at once and are never resent (FR-021).
- `settings:get`, `settings:set` and `settings:changed` pass through the client's own layer: `theme`, `profile`, `chatProjects`, `chatAll`, `analytics`, `analyticsAsked`, `sendErrors`, `client` are read and written on the client, per server (FR-022).
- Errors are held and sent from the client under its own consent.

## Push presence

| Method | Notes |
|---|---|
| `push:here(away: boolean)` | New. Replaces the peer window's `push.away` and main's `push.here` count; the service counts phones that are not away |
| `push:token(token)` | Existing core method, unchanged |

Whether to push stays as today: no phone here and nobody at the computer for a minute. The idle check needs the desktop app (`powerMonitor` in `main/index.ts`); the service asks main for it over the native-callback channel and, with no desktop app attached, treats the computer as idle.

## Errors

| Case | Error text |
|---|---|
| Method unknown to an older server | `Unknown GeckIt method.` (existing; client says to update the server) |
| Conversation gone | `This conversation no longer exists.` |
| Link dropped during a call | existing link-down error; the client shows "Could not load. Try again" in place |
