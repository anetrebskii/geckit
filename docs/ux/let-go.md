---
type: spec
status: draft
owner: Alex
created: 2026-10-13
---

# UX: Letting a process go from the card

## 1. Why

A conversation keeps its `claude` process for ten minutes after its turn ends, so a reply typed soon after goes at once; then GeckIt lets the process go, and the next message takes the conversation up again from the tool's own file. The card says nothing about any of this. Anton, used to closing a terminal when he is done with it, could not tell whether a conversation he had finished with was still holding memory, and found no way to end it short of hiding or deleting the card. The one way to let a process go and keep the card was the button that copies the terminal command, which lets go as a side effect.

## 2. What is added

| Surface | What appears | When seen |
|---|---|---|
| Card menu on the board (`Board.tsx`), existing | "Let the process go", with "Frees its memory; the next message reads its file" beside it, after Terminal and before Hide from this list | While a process holds the conversation and no turn is running in it |
| Row menu in the sidebar (`Sidebar.tsx`), existing | The same item in the same place | The same |

The item does what the ten minutes do, sooner. Nothing is hidden, moved or deleted; the card stays where it is, and the conversation on disk is whole.

## 3. States

| State | When it happens | What the person sees | What to do |
|---|---|---|---|
| Held | A turn ended less than ten minutes ago, or a message is queued in it | The item in the menu | Choose it, or leave it to go by itself |
| Let go | The item chosen, or the ten minutes up | The item is not in the menu; the card is as it was | Nothing; write in it to take it up again |
| Working or asking | A turn runs, or a question waits | The item is not in the menu | Stop the turn first, or answer |

## 4. Transitions

| From | Event | To | What the person sees |
|---|---|---|---|
| Held | "Let the process go" | Let go | The item goes from the menu; the card does not change |
| Held | Ten minutes of quiet | Let go | The same, by itself |
| Let go | A message sent in it | Held | The conversation answers from its file, with everything said in it |
| Working | The turn ends | Held | The item appears in the menu |

## 5. What stays quiet

| State | Why it is not shown |
|---|---|
| Whether a process holds the card, on the card itself | A mark on every quiet card for ten minutes would say nothing the person can act on; the menu says it when asked |
| The item while a turn runs | Letting go mid-turn is Stop, which is a button already |
| The item on the phone | The phone cannot let go; it has no entry for it |

## 6. Wording

| Place | Text |
|---|---|
| The item | "Let the process go" |
| Beside it | "Frees its memory; the next message reads its file" |

## 7. Edge cases

- **A message queued, waiting for a slot:** the process is let go; the message still goes when its slot comes, in a process started for it.
- **A general question (Ask):** not listed, so no menu; it goes by itself a day after it has gone quiet, as before.
- **Chosen twice:** the second time the item is not there; nothing holds the conversation.
- **A conversation on a host:** the same; the host's process is let go.

## 8. What is deliberately not done

| Not done | Why |
|---|---|
| A setting for how long a quiet process is kept | Ten minutes is the time within which a reply usually follows; the item is for the one time it will not |
| A mark on the card while a process holds it | See section 5 |
| Letting go of several picked cards at once | Picked cards are hidden or deleted together; letting go is what the ten minutes do anyway |

## 9. Requirements check

| Requirement | Where it is covered |
|---|---|
| End a finished conversation's process without losing the card | Section 2 |
| Know it will carry on from where it was | Section 4, the last message takes it up from its file |
