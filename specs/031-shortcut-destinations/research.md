# Research

## Decisions

Use the channel module boundary for destination discovery and publication. Core must not name transports. Existing Channel has only start/stop/request; add optional typed methods, retaining v1/v2 compatibility. Discord creates native threads and keeps thread/answer/seen records; Slack uses channel + root timestamp. Telegram's current module is restricted to its paired owner chat or team topic and cannot supply isolated per-run native threads.

Persist every admitted destination-bearing run before dispatch. Existing shortcuts.ts keeps only lastSession and returns before completion. This cannot distinguish runs, recover after restart or snapshot edits. Legacy shortcuts retain the old path.

Manager-target shortcuts currently use MAIN and return after enqueue (manager.ts runShortcut). Inbox completed and onResponse are turn acknowledgments: worker commands may follow. A destination-bearing run needs its own Manager thread from admission, with completion gated by its settled coordination, owned workers, pending decisions, queue, active goals and background tasks. Ordinary source sessions retain their own provider and context and become explicitly associated with that run's Manager thread, using existing attach/follow ownership checks.

Discord's inbound key is native thread channel_id. A provisional per-run Manager thread must be explicitly bound to that native key before accepting replies, retaining its backing session and worker ownership. A callback scoped to the current published run can perform the bind; the module cannot choose another run or worker. No label is treated as authorization.

Before remote mutation persist sending. A definite failure can be reported; an ambiguous POST response or crash is uncertain and cannot trigger blind automatic repost. Known receipts suppress repeated completion events. All outbound result text crosses existing cleanText/broker boundary. Preserve result/context even when destination setup disappears.

## Evidence

Read-only research agent destination_architecture inspected shortcuts.ts:95-136, manager.ts:704-789 and 929-975, manager-operations.ts:287-294 and 540-561, sessions/index.ts:3960-4120, channels/channels.ts:334-340 and 652-663, discord.ts:405-479 and 594-616. Source code is authoritative; no live provider or channel was called.

## Alternatives

Posting only a text summary loses worker identity. Routing all runs through MAIN mixes contexts. Creating another Manager thread after result delivery loses the original Manager backing session. Treating the first Manager answer as completion publishes before delegated work finishes. Blind POST retry can create duplicate threads. All are rejected.
