# Feature Specification: The gecko

**Feature Branch**: `feat/gecko-character`
**Created**: 2026-10-28
**Status**: Draft, design first
**Input**: Alex wants GeckIt to have a character, the gecko from its icon, drawn in a soft glossy "glass" style, that people remember and share. The reason is measured: @louis_rlee's Coucou mascot Mochi is in two of his three biggest reels (2.4M and 442k views), and Mochi works because its face is the status of Claude, not decoration. GeckIt's whole job is showing which conversation is working and which is waiting, so the gecko carries that.

## The idea in one paragraph

One small gecko lives in the top bar of the board. It shows, at a glance and without reading a card, what the conversations are doing: it walks while Claude works, stops and looks toward the card when a conversation is waiting for the person, curls its tail when a card moves to In review, and sleeps when nothing runs. Pressing it opens the conversation that is waiting. The tray icon shows the same state in the gecko's simplest form. Everything else in the app stays as it is.

## User Scenarios & Testing

### US1 - See what the conversations are doing without reading the board (P1)

The person has several conversations running and is looking at something else in the window. The gecko's pose tells them whether anything needs them.

**Independent test**: with fixture sessions, every combination of working / waiting / none produces the pose in the table below within one second of the change.

**Acceptance**:
- Waiting wins over working: one waiting conversation among five working ones shows the waiting pose.
- The gecko never shows waiting when nothing is waiting, and never sleeps while something works.
- Hidden conversations and other profiles' projects do not count, the same as the board.

| What the conversations are doing | Gecko |
|---|---|
| nothing working, nothing waiting | asleep on the top bar edge, slow breathing |
| at least one working, none waiting | walking in place, tail swaying |
| at least one waiting for the person (question, permission, a reply) | stops, head turned toward the board, slow blink; a small count when more than one |
| a card has just moved to In review by itself | one tail curl or small hop, then back to the state above |

### US2 - Go to the conversation that needs me (P1)

**Independent test**: with two waiting conversations, pressing the gecko opens the one that has waited longest; pressing again opens the next.

**Acceptance**: keyboard reachable, with an accessible name that says the state ("2 conversations waiting for you"); does nothing harmful when nothing is waiting (opens the board).

### US3 - The gecko outside the window (P2)

The tray / menu bar icon uses a simplified gecko silhouette with the same three states (asleep, working, waiting). On macOS it stays a template image so the system colours it; the waiting state is readable at 16-22 px.

**Independent test**: tray images for each state at 1x and 2x, light and dark menu bars, checked by eye in screenshots.

### US4 - It stays out of the way (P1)

**Acceptance**:
- Settings has one switch to hide the gecko; the tray falls back to today's icon.
- Reduced motion (system setting) replaces animation with still poses.
- No animation runs while the window is hidden or minimised; idle CPU does not change measurably.
- No sound.

### US5 - On the phone (P3)

The iPhone and Android apps show the same gecko in the Tasks header with the same states. Built after the desktop is approved.

## Look

- The existing green gecko from the app icon (`docs/icon-walk.svg`, `client/assets/icons`) is the character. Its identity is kept: same species, same green, same silhouette.
- "Glass" means the character's own material: a soft glossy body with a highlight and a gentle inner glow, close to macOS 26 Liquid Glass in feel. It is drawn into the character, not taken from the OS blur, so it looks the same on Mac, Windows and Linux and in light and dark.
- Not fully transparent: at 24-32 px and in a phone-sized video the silhouette must stay solid and readable.
- It must not read as a copy of Mochi (a white rounded blob with dot eyes). The gecko keeps its own silhouette, colour and moves.
- Size in the top bar about 28-32 px tall, never covering controls.

## Requirements

- FR-001: One aggregate state is derived from the board's own session data (working, waiting, idle, just-moved-to-review), with waiting taking priority. It is a pure function with tests.
- FR-002: The gecko renders in the Chat window's top bar from that state, with the poses in the US1 table.
- FR-003: Pressing it opens the longest-waiting conversation, cycling on repeat; keyboard and screen reader supported.
- FR-004: The tray icon follows the same state with simplified images; the existing tray menu is unchanged.
- FR-005: Settings switch to hide it; reduced motion honoured; animations paused when not visible.
- FR-006: The art is vector (SVG or Lottie-free CSS/SVG animation) in the repo; no new runtime dependency unless the design step shows SVG/CSS cannot do it.
- FR-007: A preview page like the other `*-preview.tsx` mounts the gecko with fixture states, light and dark, for review and for recording the reel.

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
3. Top bar gecko with animation, preview page.
4. Tray states.
5. Settings switch, reduced motion, visibility pause.
6. Phone, after desktop approval.
