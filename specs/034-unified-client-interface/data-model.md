# Data model: One client interface for every GeckIt client

Types already in `client/src/shared/api.ts` keep their shape: `SessionItem`, `SessionItems`, `ChatSession`, `SessionImage`, `Piece`. This document names what the interface adds or how existing types are used.

## Client view (service, per connected client)

| Field | Meaning |
|---|---|
| `client` | Connection it belongs to: one remote channel, or the local desktop's RPC connection |
| `can` | Capabilities the client said it has: `deflate`, `pictures`, `steps`, `sessionsChanged`, `find` |
| `viewed` | Set of conversation ids the client has open (normally one on a phone, one per Chat window on a desktop) |
| `sentList` | Map of conversation id to the serialised row last sent; empty until the first whole list |
| `sentRows` | Per viewed conversation: the ordered (id, serialised item) pairs last sent, folded |
| `scope` | Projects and Manager access of the device (FR-020); local desktop is unscoped |

Rules:
- Created when a client connects, dropped when it closes. Nothing is persisted.
- Item updates for a conversation not in `viewed` are not sent to that client.
- When `viewed` gains a conversation, its `sentRows` start empty; the client's `chat:turns` call fills them.
- Every value leaving the view is filtered by `scope` first.

## Conversation cache (service, shared by all views)

| Field | Meaning |
|---|---|
| `whole` | Map of conversation id to its items in order, as last read and updated by events |
| limit | 8 conversations, least recently used dropped, as `WHOLE_KEPT` today |

A conversation is read again when a client calls `chat:turns`, because one continued in a terminal changes on disk without an event. Events arriving while it is being read are applied after the read, as `wholeOf` does today.

## Folded conversation

Derived, never stored: `pendingLast(collapse(items))`, each picture replaced by a `SessionImage` with empty `data` and a `ref` (`pictureRef(session, item, index)`) when the client can `pictures`.

- A run of steps is one `steps` item with `id = runKey(firstStepId)`, `ids`, `latest`, and its pictures.
- Pending cards and requests always go last and are always included in a page, however long it is.

## Page

`Piece` = `{ items, left }`: a contiguous slice of the folded conversation ending at its end (`chat:turns`) or before a given item (`chat:turnsBefore`), and how many folded items are still before it. Default sizes: 60 for the end, 200 for each earlier page (phone values today).

## Picture reference

`ref` string `session \n item \n index`. Resolved by `chat:picture(ref, width)` to a `SessionImage`, scaled to `width` when a desktop app is attached (research R4), otherwise the original. Cache: 60 (ref, width) results.

## List change

`{ changed: ChatSession[], gone: string[] }`, sent as the `chat:sessionsChanged` event after the first whole `chat:sessions` on a connection. Gathered over 300 ms.

## Find result

`{ total: number, hits: { item: string, run?: string }[] }` in conversation order. `run` is the id of the folded run containing the item, when there is one.

## Kept copy (client, remote only)

IndexedDB store `kept`, keys prefixed with the server id:

| Key | Value |
|---|---|
| `<server>:list` | Last whole list |
| `<server>:settings` | Last settings |
| `<server>:items:<id>` | `Piece` of the end of a conversation, at most 30 conversations |
| `<server>:recent` | Ids of the conversations kept, most recent first |

Written 1 s after the last change (`KEEP_AFTER`). Replaced by the server's version once connected.

## Pairing state (phone)

| State | Meaning | Transitions |
|---|---|---|
| `server` | Paired with `geckit pair`; full use | - |
| `old` | Paired by the Settings QR; read only, Pair again card | to `server` on scanning a new code; old pairing forgotten |
