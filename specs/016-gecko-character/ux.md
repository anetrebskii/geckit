---
type: spec
feature: 016-gecko-character
status: draft, direction C chosen
---

# The gecko: states and behaviour

## Why

Today the person has to read the board's cards to learn whether anything needs them. With several conversations running and attention elsewhere in the window, a waiting question sits unseen. The gecko answers one question without reading: does anything need me right now.

## What is added

| Surface | What appears on it |
|---|---|
| Board top bar (`TopBar` in `client/src/renderer/src/chat/Board.tsx`), in the empty stretch before Ask | One gecko, 28-32 px tall, in one of four poses; a count beside it when more than one conversation waits |
| Tray / menu bar (`client/src/main/tray.ts`) | The gecko's simplified silhouette in three states (asleep, working, waiting) |
| Settings | One switch, "Show the gecko" (step 5, not drawn in this step) |

## States

| State | When | What the person sees | What they do |
|---|---|---|---|
| asleep | nothing working, nothing waiting | gecko curled up, eyes shut | nothing; it is safe to look away |
| working | at least one working, none waiting | gecko mid-stride, tail out | nothing; Claude is busy |
| waiting | at least one waiting for the person | gecko stopped, head turned toward the board, eyes on it; count when 2 or more | press the gecko to open the conversation that has waited longest |
| review | a card has just moved to In review by itself | tail curled up (and a small hop in direction B), once | look at In review when convenient; the gecko returns to the state below on its own |

Waiting wins over working; review is a one-off on top of whichever of the other three holds.

## Transitions

```mermaid
stateDiagram-v2
  direction LR
  state "Asleep" as asleep
  state "Working" as working
  state "Waiting" as waiting
  state "Moved to review" as review
  [*] --> asleep
  asleep --> working: one starts
  working --> asleep: all stop
  working --> waiting: one asks
  asleep --> waiting: one asks
  waiting --> working: answered, others work
  waiting --> asleep: answered, none work
  working --> review: card to In review
  asleep --> review: card to In review
  review --> working: curl done
  review --> asleep: curl done
  classDef idle fill:#e5e7eb,color:#111
  classDef busy fill:#dbeafe,color:#111
  classDef hands fill:#fee2e2,color:#111
  classDef done fill:#dcfce7,color:#111
  class asleep idle
  class working busy
  class waiting hands
  class review done
```

| From | Event | To | What the person sees |
|---|---|---|---|
| asleep | a conversation starts working (by itself, no action) | working | the gecko wakes and walks |
| working | the last working conversation stops with nothing waiting (by itself) | asleep | the gecko curls up |
| working or asleep | a conversation asks a question, a permission or a reply (by itself) | waiting | the gecko stops and looks at the board; count when 2 or more |
| waiting | the person answers the last waiting conversation, others still work | working | the gecko walks again |
| waiting | the person answers the last waiting conversation, nothing works | asleep | the gecko curls up |
| waiting | the person presses the gecko | waiting (or the state below once answered) | the longest-waiting conversation opens; pressing again opens the next |
| working or asleep | a card moves to In review by itself | review | one tail curl |
| review | the curl finishes (by itself) | the state that holds now | the pose of that state |
| any | the person presses the gecko with nothing waiting | same | the board opens; nothing else happens |

A card moving to In review while something waits does not interrupt waiting: the review curl is dropped, since the person has a more urgent thing to see.

## What stays silent

- How many conversations work: the gecko walks the same for one or five. The board shows the number; the gecko only says "busy".
- Which project waits: the conversation opens on press; the gecko itself names nothing (no text from the gecko, spec "Out of scope").
- Hidden conversations and other profiles' projects: not counted, as on the board.
- Background tasks inside a conversation: the conversation's own state counts, not its tasks.
- Errors and stopped conversations: not a gecko state; the card shows them.

## Thresholds and time

- Pose follows within one second of the change (spec US1): the board's own session updates already arrive faster than that, so no extra polling.
- Review curl plays once, about one second, then returns: long enough to be noticed in the corner of the eye, short enough not to compete with waiting.
- Count shown from 2: one waiting conversation needs no number, the pose says it.

## Wording

- Accessible name, asleep: "Nothing running"
- Working: "Claude is working"
- Waiting, one: "1 conversation waiting for you"
- Waiting, more: "2 conversations waiting for you" (the number changes)
- Review is not announced on its own: the name stays that of the state below.
- Tray tooltip keeps today's "GeckIt" text.

## Edge cases

- Everything at once (waiting, working, review): waiting.
- A waiting conversation is hidden: it stops counting; the gecko leaves waiting if it was the only one.
- Two cards reach In review together: one curl.
- The window is hidden or minimised: the pose is still right when it comes back; nothing animates meanwhile (step 5).
- Reduced motion: the still pose of each state, no curl, no walking cycle.
- The gecko switched off: no gecko in the bar; the tray shows today's icon.

## Not included on purpose

- Speech bubbles, text or a "z" for sleeping: the spec keeps the gecko wordless; the shut eyes carry sleep.
- A separate pose for errors: errors belong to the card that has them.
- Sound.

## Decisions

| Question | Verdict | Why |
|---|---|---|
| Which visual direction (A glass gecko, B gecko on the edge, C glass tile) | C, the glass tile (Alex, 2026-10-28) | strongest link to the app icon; its weakness, poses that are hard to tell apart at 30 px, is answered by letting the tile carry the state too (next row) |
| How C stays readable at 30 px | the tile carries the state as well as the gecko: asleep dims the tile and stops the inner glow; working walks the gecko inside; waiting adds the amber badge on the tile's corner; review lifts the whole tile in one small hop | the gecko inside is about 20 px long, too small to carry four poses alone; tile brightness, badge and hop read from the corner of the eye |
| Where in the top bar | the empty stretch before Ask, right-aligned | the only place in the bar with no control; it never covers one |
| Count form | small amber disc at the gecko's shoulder, white numeral | amber is the board's own "asking you" colour; the final badge will be HTML from the app's tokens, the stills only place it |

## Coverage

FR-002 (poses), FR-004 (tray states) and FR-007 (preview) are covered by the stills in this step; FR-001, FR-003, FR-005 and FR-006 are behaviour described here and built in steps 2-5.
