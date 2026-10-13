---
type: spec
status: draft
owner: Alex
created: 2026-10-13
---

# UX: The count, the flash and a sound on Windows

## 1. Why

When a conversation needs the person, GeckIt says so three ways: a card in the window when it is in front, a system notification when it is not, and on the Mac the Dock, where the icon carries the count of conversations waiting and bounces for every notice, hard for a question. Windows had the first two only. With the window behind another, a missed notification was the end of it: the taskbar icon said nothing, nothing moved, nothing sounded. Anton, who works on Windows with several conversations at once, asked for the Mac's two signals there, and for a sound, which neither system had.

## 2. What is added

| Surface | What appears | When seen |
|---|---|---|
| The taskbar icon of the Chat window, Windows | A red disc with the count of conversations waiting for the person, over the icon's corner | While any conversation asks or is finished and unread, a question asked with Ask not counted; gone at none |
| The taskbar button, Windows | The window flashing, as Windows flashes a window that wants attention | A notice about another conversation while the window is not in front, until it is brought to the front |
| The system, every platform | The system's alert sound | A notice, whether or not the window is in front, if a sound is chosen |
| Settings, General, Windows | "Flash in the taskbar": For questions, For every notice, Never | Always on Windows; not on the Mac, which bounces the Dock, nor on Linux |
| Settings, General | "Sound for a notice": For questions, For every notice, Never | Always |

A notice is what the card and the notification already are: a question, a permission, a request to start conversations, and a conversation finished, stopped with an error or at the plan limit. None is about the open conversation, so none of this is either.

## 3. States

| State | When it happens | What the person sees | What to do |
|---|---|---|---|
| Nobody waiting | No conversation asks or is finished unread | The plain icon | Nothing |
| Some waiting | One or more do | The disc with the number, 99 at most | Open the window; the cards at the top of In progress are the ones |
| Flashing | A notice came while the window was behind another | The taskbar button flashing | Bring the window to the front; the flashing stops |
| Sound | A notice came and a sound is chosen | The system alert, once | Nothing |

## 4. Transitions

| From | Event | To | What the person sees |
|---|---|---|---|
| Nobody waiting | A conversation asks, or finishes unread | Some waiting | The disc appears with 1 |
| Some waiting | Another does | Some waiting | The number goes up |
| Some waiting | The last is answered or read | Nobody waiting | The disc goes |
| Window in front | A question in another conversation | Window in front | The card in the window, and the sound if chosen; no flashing, the window is seen |
| Window behind | A question in another conversation | Flashing | The notification, the taskbar button flashing, the sound if chosen |
| Flashing | The window brought to the front | Window in front | The flashing stops |
| Any | The Chat window closed and opened again | The same | The disc is drawn on the new window as soon as it is shown |

The defaults change nothing that was: the disc is the Dock's count, the flash for questions its hard bounce; the sound is off until chosen.

## 5. What stays quiet

| State | Why it is not shown |
|---|---|
| The flash for a finished conversation, by default | Six conversations finishing is six flashes; a question is what cannot go on without the person |
| A sound, by default | A sound in an open office is a choice to make, not to be made |
| The count on the Mac's taskbar equivalent beyond the Dock | The Dock has it already |
| The flash on Linux | Not tried there; the setting is not offered rather than offered untested |
| A sound of GeckIt's own | The system's alert is the one the person already chose for the system, and it ships nothing |

## 6. Numbers and time

| Number | Value | Why |
|---|---|---|
| The disc | 16 by 16 px, the size Windows asks for over an icon | Windows scales it with the taskbar |
| The number | 1 to 99; past that, 99 | Three digits do not fit; past ninety-nine the number is not what matters |
| Redrawn | Only when the count changes | The sessions change many times a second while one streams |

## 7. Wording

| State | Text |
|---|---|
| The disc, for a screen reader | "3 waiting for you" |
| Flash setting, label | "Flash in the taskbar" |
| Flash setting, note | "A notice about another conversation, when the window is not in front, flashes it in the taskbar until it is brought to the front." |
| Sound setting, label | "Sound for a notice" |
| Sound setting, note | "The system alert, whether or not the window is in front: a notice is always about a conversation other than the open one." |
| The three choices | "For questions", "For every notice", "Never" |
| What each says | "A question, a permission, or a request to start conversations: what a conversation cannot go on without."; "Questions, and a conversation finished, stopped or at the plan limit."; "The card or the notification alone." |

## 8. Edge cases

- **The Chat window closed:** there is no icon to draw on; the notification still comes, and the disc is drawn when the window opens again.
- **The window minimized:** it flashes in the taskbar as any window does, and the disc is on its button.
- **The window in front:** no flash, the card is seen; the sound still comes if chosen, since the notice is about another conversation.
- **Many notices at once**, with For every notice chosen: one sound each, as the notifications are one each.
- **A high-DPI screen:** Windows scales the 16 px disc; the digits are coarse at 200%.
- **The phone:** nothing changes; the phone has its own notices.

## 9. What is deliberately not done

| Not done | Why |
|---|---|
| The count with `app.setBadgeCount` | Electron gives it to the Mac and Unity only; on Windows the icon's overlay is the way, and it takes a picture |
| A picture per digit shipped in assets | Sixteen pixels square is drawn in a few lines, with no file to keep in step |
| A sound shipped with GeckIt, or a choice of sounds | The system's alert is enough to turn the head; a library of sounds is another feature |
| Flashing for the open conversation's own question | The card is in front of the person already |

## 10. Forks

### Where the sound is heard

| Option | Verdict |
|---|---|
| Only with the window behind another, as the flash | no |
| Whether or not the window is in front | yes |

**Why:** the flash is seen only when the window is not; a sound is for the person who is at the computer but reading another conversation in the same window, which is most of the time. The note under the setting says so.

### What the setting offers

| Option | Verdict |
|---|---|
| On or off | no |
| Never, for questions, for every notice | yes |

**Why:** a question and a finished conversation are not the same call on the person; the Mac bounces hard for one and once for the other, and the setting keeps the difference.

## 11. Requirements check

| Requirement | Where it is covered |
|---|---|
| See from the taskbar that someone waits | Section 2, the disc |
| Not miss a question with the window behind another | Section 2, the flash |
| Hear it, if wanted, and not otherwise | Section 2, the sound; section 4, the defaults |
