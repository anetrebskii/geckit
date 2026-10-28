# Feature Specification: The gecko

**Feature Branch**: `feat/gecko-character`
**Created**: 2026-10-28
**Status**: Built on the desktop: the gecko from the finished demo's frames, with its menu, voice task, camera, idle sleep, resize, move and hide/show
**Input**: Alex wants GeckIt to have a character, the gecko from its icon, drawn in a soft glossy "glass" style, that people remember and share. The reason is measured: @louis_rlee's Coucou mascot Mochi is in two of his three biggest reels (2.4M and 442k views), and Mochi works because its face is the status of Claude, not decoration. GeckIt's whole job is showing which conversation is working and which is waiting, so the gecko carries that.

## The idea in one paragraph

One small gecko stands on the desktop in a transparent window of its own, always on top, outside the board, like Mochi in Coucou. It shows, at a glance and without opening GeckIt, what the conversations are doing: it types on a little laptop while Claude works, sits up and watches the cursor with an orange count when a conversation waits for the person, hops for joy when a card moves to In review, and sleeps when nothing runs; left alone for 5 minutes, waiting falls asleep too. Pressing it opens a radial menu round it: take a screenshot (it raises a camera), start a new task, say a task (it listens and writes), open the waiting conversation, open GeckIt, or hide it. Files dropped on it are caught and can start a new task or go to the waiting conversation. It can be dragged anywhere and resized from its corner. The tray icon shows the same state in the gecko's simplest form, and its menu shows or hides the gecko. The look and behaviour are the finished HTML demo's (`~/Desktop/gecko-ref/port/gecko-demo.html`, Alex's), drawn from its frames; the Mochi-style SVG drawing built before it is replaced.

## User Scenarios & Testing

### US1 - See what the conversations are doing without reading the board (P1)

The person has several conversations running and is working in another app. The gecko's pose, floating in the corner of the screen, tells them whether anything needs them.

**Independent test**: with fixture sessions, every combination of working / waiting / none produces the pose in the table below within one second of the change.

**Acceptance**:
- Waiting wins over working: one waiting conversation among five working ones shows the waiting pose.
- The gecko never shows waiting when nothing is waiting, and never sleeps while something works.
- Hidden conversations and other profiles' projects do not count, the same as the board.

| What the conversations are doing | Gecko |
|---|---|
| nothing working, nothing waiting | asleep: sitting, eyes shut, eight slow breaths |
| at least one working, none waiting | typing on a little laptop, nodding |
| at least one waiting for the person (question, permission, a reply) | sits up with an "o" mouth, watches the cursor, bounces, taps its foot now and then; the orange count from one; asleep after 5 minutes alone, the count staying |
| a card has just moved to In review | a happy hop with arms up, then a happy look until it dozes or another state takes over |

### US2 - Go to the conversation that needs me (P1)

**Independent test**: with two waiting conversations, pressing the gecko and choosing the waiting conversation brings GeckIt to the front on the one that has waited longest; doing it again opens the next.

**Acceptance**: an accessible name that says the state ("2 conversations waiting for you"); the menu's Waiting item appears only while one waits. The floating gecko never takes the keyboard; its menu does while open (arrows, Enter, Esc), and the board and the tray stay the keyboard way to the same conversations.

### US3 - The gecko outside the window (P2)

The tray / menu bar icon uses a simplified gecko silhouette with the same three states (asleep, working, waiting). On macOS it stays a template image so the system colours it; the waiting state is readable at 16-22 px.

**Independent test**: tray images for each state at 1x and 2x, light and dark menu bars, checked by eye in screenshots.

### US4 - It stays out of the way (P1)

**Acceptance**:
- Settings has one switch to hide the gecko; the window goes and the tray falls back to today's icon. Right-clicking it and choosing "Hide the gecko" does the same; the tray menu's "Show the Gecko" brings it back without opening Settings.
- It can be dragged anywhere, kept wholly on the display it is dropped on, and resized from its corner from 72 to 320 px; both are remembered. It is on every desktop, above other windows, never in the Dock, the taskbar or the window switcher, and never takes the focus.
- Reduced motion (system setting) replaces animation with still poses; the eyes still follow the cursor, since a look is a pose.
- No animation runs while the panel is hidden or the screen is locked; idle CPU does not change measurably.
- No sound.

### US5 - On the phone (P3)

The iPhone and Android apps show the same gecko in the Tasks header with the same states. Built after the desktop is approved.

## Look

- The gecko is the finished HTML demo's (`gecko-demo.html` and its frames, 512 px transparent PNGs drawn in a 1024 view), ported exactly: a green gecko with a pale belly and spots, big eyes with pupils that follow the cursor, standing on the desktop with a soft shadow and no tile. The frames are in `client/src/renderer/src/gecko/frames/` as WebP; nothing was redrawn or generated.
- Each pose is one body frame with one head over it; only the hands, the foot or the pen change between frames, so nothing flickers. A blink swaps in the drawn closed eyes for 130 ms; a hover bends the head on eight pre-drawn frames.
- Superseded: the earlier rows of this section (the glossy "glass" gecko, then the Mochi-style white SVG drawn in parts on the icon's green tile) describe drawings that were built and replaced; their screenshots stay in `docs/design/gecko/` as the record.

## Requirements

- FR-001: One aggregate state is derived from the board's own session data (working, waiting, idle, just-moved-to-review), with waiting taking priority. It is a pure function with tests.
- FR-002: The gecko renders in a separate always-on-top, frameless, transparent window from that state, with the poses in the US1 table and the demo's frames; not in the board. Waiting and the look after a hop fall asleep after 5 minutes without a hover, a click or a new event.
- FR-003: Pressing it opens the radial menu round it, in its own window kept on the gecko's screen: Screenshot (macOS; `screencapture -i` at once, while the gecko shows the camera pose and flash), New task, Voice task (the dictation capsule opens and the gecko listens with it; Stop, the app's own local transcription, then New task with the words; the capsule's Cancel or Esc keeps nothing), Waiting (longest-waiting first, cycling on repeat, only while one waits), Open GeckIt. Right-click: "Hide the gecko". The gecko's window is a panel, so pressing it does not bring GeckIt's other windows forward; only Open GeckIt and the items that open a form do. Over it the pointer is a hand.
- FR-004: The tray icon follows the same state with simplified images; the tray menu gains "Show the Gecko" / "Hide the Gecko".
- FR-005: Settings switch to show or hide the gecko; reduced motion honoured; nothing animates and no timer runs while it is hidden or the screen is locked.
- FR-006: The art is the demo's raster frames (WebP) with CSS and SVG layering; no new runtime dependency.
- FR-007: A preview page like the other `*-preview.tsx` mounts the gecko in every pose, at four sizes, its menu and its bubble, light and dark.
- FR-009: Resize from a grip on its corner, square, 72 to 320 px; a drag is kept wholly on the display it is dropped on; both remembered in `geckoBounds`.
- FR-008: Files dropped on it open its bubble: a new task with them, or into the waiting conversation's message (only while one waits), or Cancel. Pictures go with the message, other files as their paths. The bubble is keyboard reachable, named by its question, and closes on Esc or a click elsewhere.

## Out of scope

Text on the gecko itself, a personality that talks (speech bubbles were out of scope until Alex allowed them on 2026-10-28; they now carry the drop question and the voice task's notes), placing it in the macOS notch, sounds, more than one gecko, customising it, an In review count.

## Success Criteria

- Alex approves the look from still poses before any animation is built.
- In the preview, each state is recognisable by someone who has not read this spec.
- No change in idle CPU with the window hidden.
- A 8-15 s screen recording of the real app shows all four states, usable as @thealexnet reel 015.

## Order of work

1. Design: poses for the four states as stills, light and dark, top bar and tray sizes (apple-ux for states and behaviour, app-icon and apple-ui for the drawing). Alex picks.
2. State derivation with tests.
3. The floating panel with animation, preview page (first built as a tile in the top bar, moved out on 2026-10-28).
4. Tray states.
5. Settings switch, reduced motion, visibility pause.
6. Phone, after desktop approval.
