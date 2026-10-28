# Feature Specification: The gecko

**Feature Branch**: `feat/gecko-character`
**Created**: 2026-10-28
**Status**: Draft, design first
**Input**: Alex wants GeckIt to have a character, the gecko from its icon, drawn in a soft glossy "glass" style, that people remember and share. The reason is measured: @louis_rlee's Coucou mascot Mochi is in two of his three biggest reels (2.4M and 442k views), and Mochi works because its face is the status of Claude, not decoration. GeckIt's whole job is showing which conversation is working and which is waiting, so the gecko carries that.

## The idea in one paragraph

One small gecko lives in a glass panel of its own that floats on the desktop, outside the board, like Mochi in Coucou. It shows, at a glance and without opening GeckIt, what the conversations are doing: it is busy while Claude works, perks up and looks at the person when a conversation is waiting for them, hops and curls its tail when a card moves to In review, and sleeps when nothing runs. Pressing it brings GeckIt forward on the conversation that is waiting. The tray icon shows the same state in the gecko's simplest form. The board itself stays as it is.

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
| nothing working, nothing waiting | asleep: eyes shut, head resting on its feet, tail wrapped round them, a few slow breaths |
| at least one working, none waiting | busy in place: bobbing, front feet tapping in turn, tail swinging a beat behind |
| at least one waiting for the person (question, permission, a reply) | perks up, pupils wide, looks at the person, a gentle bounce; a small count when more than one |
| a card has just moved to In review by itself | a happy hop, squashed on landing, the tail curling up, then back to the state above |

### US2 - Go to the conversation that needs me (P1)

**Independent test**: with two waiting conversations, pressing the gecko brings GeckIt to the front on the one that has waited longest; pressing again opens the next.

**Acceptance**: an accessible name that says the state ("2 conversations waiting for you"); with nothing waiting it only brings GeckIt to the front. The panel never takes the keyboard, so the keyboard way to the same conversations stays the board and the tray.

### US3 - The gecko outside the window (P2)

The tray / menu bar icon uses a simplified gecko silhouette with the same three states (asleep, working, waiting). On macOS it stays a template image so the system colours it; the waiting state is readable at 16-22 px.

**Independent test**: tray images for each state at 1x and 2x, light and dark menu bars, checked by eye in screenshots.

### US4 - It stays out of the way (P1)

**Acceptance**:
- Settings has one switch to hide the gecko; the panel goes and the tray falls back to today's icon. Right-clicking the panel offers the same, "Hide the gecko".
- The panel can be dragged anywhere and comes back where it was left; it is on every desktop, above other windows, never in the Dock, the taskbar or the window switcher, and never takes the focus.
- Reduced motion (system setting) replaces animation with still poses; the eyes still follow the cursor, since a look is a pose.
- No animation runs while the panel is hidden or the screen is locked; idle CPU does not change measurably.
- No sound.

### US5 - On the phone (P3)

The iPhone and Android apps show the same gecko in the Tasks header with the same states. Built after the desktop is approved.

## Look

- The existing green gecko from the app icon (`docs/icon-walk.svg`, `client/assets/icons`) is the character. Its identity is kept: same species, same green, same silhouette.
- "Glass" means the character's own material: a soft glossy body with a highlight and a gentle inner glow, close to macOS 26 Liquid Glass in feel. It is drawn into the character, not taken from the OS blur, so it looks the same on Mac, Windows and Linux and in light and dark.
- Not fully transparent: at 24-32 px and in a phone-sized video the silhouette must stay solid and readable.
- It must not read as a copy of Mochi (a white rounded blob with dot eyes). The gecko keeps its own silhouette, colour and moves.
- It faces the person, sitting in the panel and looking out: two big eyes on the sides of its head with gecko slit pupils that widen, toe pads, the curling tail, the icon's green gradient and glossy body. It is drawn in parts (body, head, each eye with its lid and pupil, tail, front feet) so each part moves on its own, with continuous eased motion: springy easing, squash and stretch, the tail following the body a beat late, blinks with lids, a small head tilt now and then.
- It notices the person: its pupils, and a little its head, follow the mouse cursor anywhere on screen; hovered, it looks up at them with a small happy wiggle (asleep, it opens one eye sleepily and shuts it again); pressed, it squashes a little before GeckIt comes forward.
- A floating panel about 100 px square, the gecko about 80 px tall in it, large enough to be funny and expressive.

## Requirements

- FR-001: One aggregate state is derived from the board's own session data (working, waiting, idle, just-moved-to-review), with waiting taking priority. It is a pure function with tests.
- FR-002: The gecko renders in a separate always-on-top, frameless glass panel from that state, with the poses in the US1 table; not in the board.
- FR-003: Pressing it brings GeckIt to the front on the longest-waiting conversation, cycling on repeat; with nothing waiting it only brings GeckIt to the front. Right-click: "Hide the gecko".
- FR-004: The tray icon follows the same state with simplified images; the existing tray menu is unchanged.
- FR-005: Settings switch to show or hide the panel; reduced motion honoured; nothing animates while the panel is hidden or the screen is locked.
- FR-006: The art is vector (SVG or Lottie-free CSS/SVG animation) in the repo; no new runtime dependency unless the design step shows SVG/CSS cannot do it.
- FR-007: A preview page like the other `*-preview.tsx` mounts the panel in all four states, light and dark, for review and for recording the reel.

## Out of scope

Speech bubbles or text from the gecko, a personality that talks, placing it in the macOS notch, sounds, more than one gecko, customising it.

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
