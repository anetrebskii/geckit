---
type: spec
status: draft
owner: Alex
created: 2026-11-02
---

# Conversation history loading and recovery

## Purpose and journey

Opening a conversation from the board must end in its history or an actionable error. A rejected history request currently leaves the loading skeleton visible. The existing Refresh button refreshes the board listing but does not retry that request.

The user opens a card, reads its history, and can continue the same conversation. No setup or new choice is needed. If reading fails, the existing error surface explains the failure; Refresh or Cmd/Ctrl+R retries the selected conversation. Closing and reopening remains available.

## Surfaces

| Surface | Behavior |
|---|---|
| Desktop and phone conversation | Existing loading skeleton ends when reading succeeds or fails. Existing messages remain visible during a refresh. |
| Existing error surface | Displays the read error; no success claim or new dialog. |
| Refresh and Cmd/Ctrl+R | Refresh the listing and reread the selected conversation. |

## States and transitions

| From | Event | To | What the user sees and does |
|---|---|---|---|
| Board | Open a card | Loading | Existing skeleton; wait or close the conversation. |
| Loading | History arrives automatically | Ready | Messages, or the existing empty transcript; continue normally. |
| Loading | History request rejects automatically | Failed | Existing error surface with the returned error; use Refresh. Skeleton stops. |
| Ready or failed | Press Refresh or Cmd/Ctrl+R | Loading | Existing messages remain while the selected conversation is reread. |
| Any | Open another conversation | Loading another | Previous response cannot replace the newly selected conversation. |
| Any | Close conversation | Board | No conversation; an outstanding response cannot reopen it. |

## What stays silent

Successful refreshes have no toast. Discarded responses from earlier selections have no error banner. Manager conversations retain their existing separate entry point and guidance.

## Timing

No new timer or automatic retry loop. The transport retains responsibility for request timeouts. A failed read must leave the loading state regardless of the transport error.

## Wording

Retain the existing `Refresh` label and `Reading the conversation` loading label. Use the returned error message in the existing error surface. Do not introduce a separate success or empty-history message.

## Edge cases and decisions

Empty history is a completed read. Live events received during reading take precedence over the snapshot. Repeated refreshes use the latest request. Failures and late successes from another conversation must not affect the current one. A failed refresh preserves messages already visible. Manager guidance continues to return the ordinary conversation view to the board.

No new modal, status badge, timer, history cache or provider restart: this repair restores the existing loading and refresh controls. It does not establish why either reported native request failed.

## Acceptance

Regression checks must cover success, read rejection, retry through Refresh, live events during reading, and stale responses after switching conversations. Live verification must separately establish that the two reported Codex conversations open in the running application; synthetic API responses do not prove this.
