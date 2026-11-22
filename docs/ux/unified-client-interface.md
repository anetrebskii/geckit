---
type: spec
status: draft
owner: Alex
updated: 2026-11-17
---

# One client interface: what a person sees

Spec: `specs/034-unified-client-interface/spec.md`. This document covers only what changes on screen. Everything else in the change is invisible: a conversation, the board and Manager look and behave as they do today, on the local desktop, a desktop connected to another computer, and the phone.

## Purpose

A desktop connected to another computer opens and stays as quick as the phone does. The phone works with a computer that runs GeckIt without the desktop app. To get there every client loads conversations the way the phone does today: the end first, earlier parts and opened runs of steps when asked, pictures when they come into view. Five things become visible.

## 1. A part still loading

Applies to local desktop, remote desktop and phone.

| Moment | What is shown | Why |
|---|---|---|
| Conversation opened, its end not yet here | The existing grey placeholder lines shown while a conversation is first read (`skeleton-bubble`, `skeleton-line` in `chat/Chat.tsx`), in the transcript area. Composer usable. | Same look on every client; nothing new to learn. |
| Scrolled to the top, earlier part asked for | The existing Load earlier row stays in place and reads "Loading earlier" while the part is on its way. No spinner. | The row the person is looking at says what is happening. The row is the existing one at the top of the transcript that draws more of what is loaded; it now also asks the computer when nothing more is loaded. |
| A run of steps opened, its steps not yet here | The chevron points down and a grey placeholder appears beneath the row. When the steps arrive, they replace the placeholder. | The press visibly took effect. |
| A picture scrolled into view, not yet here | A grey box at the picture's drawn size (the existing `picture-waiting` box in `chat/Transcript.tsx`). | The layout does not jump when it arrives. |

Thresholds: on the local desktop each of these normally finishes in under 100 ms, so a placeholder is shown only after 150 ms without an answer. A placeholder shown for less than that reads as a flicker. On a remote link the placeholder appears at once.

Step runs use a chevron while work is active as well as after it finishes. The collapsed active run shows the latest step, and the existing "Still working" line reports overall activity. The disclosure target on phones is at least 44 points high.

Failure: if a part cannot be loaded (link dropped, server stopped), the place it was asked for says "Could not load. Try again" as a quiet button in the row. Pressing it asks again. No dialog.

## 2. Find in a conversation searches all of it

Applies to every client. Today Find searches only what is loaded and offers Load earlier with the tooltip "Only what is loaded is searched".

- The count covers the whole conversation: "3 of 41".
- Moving to a match in a part not yet loaded loads that part first, then scrolls to the match, as moving to a match does today.
- The Load earlier button and its tooltip are removed from the Find strip.
- While the server is searching, the count reads "Searching". If it takes more than 2 s it stays "Searching" without other change; Escape still closes Find.
- No matches: "Not found", as today.
- Keyboard unchanged: Enter goes to an earlier match, Shift+Enter to a later one, Escape closes.

## 3. A phone paired the old way

Applies only to a phone paired with a computer through the QR code in Settings, Phone, before this change. A phone paired with `geckit pair` sees nothing new.

After the person updates both apps, the phone keeps showing what it can read over the old pairing: the board and conversations. It cannot send. A notice card sits at the top of the board, using the existing notice card (`notices` in `chat/Notices.tsx`):

- Title: "Pair this phone again"
- Body: "This phone is paired the old way. To send messages and answer questions from here, pair it again. Run geckit pair on the computer, then scan the code."
- Actions: "Scan code" (opens the existing scanner), "Not now" (hides the card until the app is next opened).

While the card is shown, the composer, Answer buttons and anything else that sends are disabled, and pressing one shows the same card body as a short message in place of the action. Reading, scrolling and opening conversations work.

After pairing again, the old pairing is forgotten on the phone and the card does not return.

A later release removes the old pairing entirely. Its wording is decided then.

## 4. Pictures on a phone connected to a computer without the desktop app

A picture in a conversation arrives at its full size rather than at the width it is drawn. It looks the same. It takes longer on a slow network. Nothing is said about it. With the desktop app running on the computer, pictures arrive scaled, as today.

## 5. A link that drops for a moment

Applies to a desktop connected to another computer and to the phone. The phone already behaves this way.

- While the link is down the computer selector reads "Reconnecting…" as today. The composer and buttons stay usable.
- Whatever the person does meanwhile waits and happens when the link is back. If the link is not back within 60 s, each waiting action fails with "The link to the computer is down. Try again when it is back." in the place it was done.
- An action that had already gone out when the link dropped is not sent again. It fails with the existing "Connection lost. Check the computer before retrying this action."
- 60 s: long enough for a network change or a short tunnel, short enough that nothing goes out long after the person stopped expecting it.
- When the connection returns, GeckIt refreshes the open conversation and retries the read once if it fails. New messages appear even when details for an open step run are unavailable. A run whose details are missing appears collapsed and can be opened again.
- Returning to the phone app refreshes the conversation in place even if the connection stayed open. During live updates, details for an expanded run get up to two seconds to arrive. If they take longer, GeckIt shows the collapsed run and delivers the waiting messages.

This replaces "Reconnecting… writes disabled" in `docs/ux/remote-clients.md` for remote desktops.

Theme, which projects the board shows, and the answers about counting usage and sending errors belong to each remote client, as on the phone. Changing them on a remote desktop does not change the computer it is connected to. Nothing says so.

## What stays silent

The interface change itself, compression, how much was loaded, reconnection catch-up, and whether a part came from what the client kept or from the computer. A remote desktop and the phone keep a copy between launches so they open quickly; it is never shown or named as a copy.

## Desktop and phone

Sections 1, 2 and 5 apply to both, in each one's existing transcript, Find strip and computer selector. Section 3 is phone only. Wording uses "computer", never "Mac".
