# The gecko

Step 1 of [spec 016](../../specs/016-gecko-character/spec.md) drew still poses for Alex to choose a direction from; steps 2-5 built it, first as a tile in the board's top bar, then, on Alex's direction of 2026-10-28, as a separate floating panel with the gecko redrawn facing the person (see Build, below). States, transitions and wording are in the [UX document](../../specs/016-gecko-character/ux.md).

## Choice

Alex chose **C, the glass tile**, on 2026-10-28, and later the same day moved the gecko out of the board into **a small floating panel of its own**, like Mochi in Coucou. Two drawings of that panel were rejected the same day (a front-facing gecko that read as a baby or a frog, then a three-quarter lizard, see [the first comparison](gecko/panel-redraw-compare.jpg)); the one built is **in the style of Mochi**, drawn after a reference Alex approved, made with Gemini through Echopub: [`ref/gecko-master.jpg`](gecko/ref/gecko-master.jpg) and [`ref/gecko-poses.jpg`](gecko/ref/gecko-poses.jpg). A and B stay in the repository as drawn alternatives; the top-down stills below are the record of step 1.

## Build: the floating panel

- **Placement.** Its own window: frameless, transparent, always on top (`floating` level), on every desktop (`setVisibleOnAllWorkspaces` without the full screen spaces, which would take GeckIt's Dock icon away), not in the Dock, the taskbar or the window switcher (`skipTaskbar`, `focusable: false`), never taking the keyboard, clicks accepted without activating (`acceptFirstMouse`). 108 px square: a 96 px tile plus room for its shadow. First at the top right of the main display, 24 px in; dragged, the position is kept in `geckoBounds` in settings. Switched off or with the screen locked there is no window at all.
- **Tile, not glass.** The gecko sits on the app icon's green tile (`#62c96d` to `#23963a`, 24 px corners, a soft top shine, a light edge and a small shadow), drawn by the page the same on every system and in light and dark. The glass panel was tried with this drawing too and dropped: a white gecko on light glass nearly disappears in light mode and only reads on dark, while on the green tile it reads in both and is the reference's own look. macOS vibrancy is no longer used, since an opaque tile covers it.
- **The gecko.** Drawn in `client/src/renderer/src/gecko/Gecko.tsx` as one SVG of parts, flat and soft as Mochi is: no outlines, white with a light mint tint (`#ffffff` to `#dcf1e1`), a big round head a little wider than tall with a highlight, two tiny nostril dots, small solid dark dot eyes set wide (`#2b211c`) with a white glint, pink oval blush (`#f6a8bc`), a tiny smile, a round body with a white belly, short front paws, back feet turned to the person with a big pad and three toe pads in darker mint (`#bfe3c8`), a tail ending in a spiral curl, a soft green shadow under it. Faint mint lines separate the paws from the body. The mouth has three shapes (smile, "o", happy), each eye three (the dot, the shut arc, the happy arc). Asleep it is a second drawing of the same gecko lying on its belly, chin on its front paws, cross-faded with the sitting one.
- **Motion.** CSS keyframes and transitions on the parts' transforms and opacity only, each part turning about its own joint: springy easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`), squash and stretch on the hop, the press and the bounce, the tail a beat behind. Working: it sits at a tiny light grey laptop placed low in front of it, a mint glow from the screen on its chest, its paws on the keys over the lid tapping in turn (560 ms), the head nodding to the beat and every 4.8 s glancing down at the screen, the tail swaying, without end. Asleep: lying down, eyes shut arcs; the back rises and falls eight times (4.2 s each) and the tail tip twitches four times, then still. Waiting: the head up and 3% larger, the "o" mouth, one bounce as it sits up; the orange count pops in. Then, at the blink timer's moments (every 2.5 to 6.5 s), a slow blink and, six times in ten, a burst of impatience: one back foot taps three times while it sways and the tail swings, about a second, then it is still again. Review: a 0.9 s hop 6 units high with paws up, happy arc eyes and mouth, a squash on take-off and landing, the shadow shrinking under it, the tail flicking. Blinks every 2.5 to 6.5 s (the dots flatten), a third with an 8 degree head tilt. Hover: looks straight out and wiggles; asleep, one eye opens and shuts. Press: a 170 ms squash, then its bubble opens. Files dragged over it: it looks up; dropped, a 420 ms happy squash with the happy eyes and mouth as it catches them, then its bubble opens.
- **The bubble.** Alex allowed speech bubbles on 2026-10-28. A press opens one beside the gecko, in a window of its own: 280 px wide, as tall as its page draws it, to the gecko's left with its tail pointing at the head, or to its right where the screen has no room, kept on the gecko's screen. It is the app's raised card (`--bg-raised`, `--shadow`, 14 px corners), light or dark with the system, popping in over 160 ms from the tail. It asks "What should I do?": Take a screenshot (macOS only, the Mac's own `screencapture -i -x` crosshair; the picture goes to the New task form, or into the form already open, as the screenshot shortcut's does; Esc in the crosshair takes nothing), New task, Open the waiting conversation (with the count from 2; each time the next one that waits, wrapping round, as the press used to), and Open GeckIt. Files dropped on the gecko ask "What should I do with this file?" (or "with these N files?"): New task with this file (or these files), Send to the waiting conversation (only while one waits), and Cancel. Pictures (PNG, JPEG, GIF, WebP, up to 8) go with the message, read as the chat reads a dropped one; any other file, and a picture too big to send, goes into the words as its path, copied to the host first for a project on another computer, as a file dropped on the chat is. The bubble is a dialog named by its question, the first choice focused; the arrows move between the choices, Tab and Enter work as usual, and Esc, a click beside the card or anywhere else closes it, letting go of the files. On the Mac it is a panel, so it takes the keyboard while the app in front stays in front; GeckIt comes forward only for the choice made.
- **The eyes follow the cursor.** Main reads `screen.getCursorScreenPoint()` ten times a second while the cursor moves and once a second after it has rested two seconds, and tells the panel only when it moved; the page turns that into a direction from its eyes, weaker within 240 px, which moves the dot eyes inside the face up to 2 units and the head up to 4 degrees.
- **Reduced motion and not seen.** Reduced motion keeps the still pose of each state (no keyframes, no hop, no blinks, no wiggle, squash or catch, the bubble without its pop); the eyes still follow. A hidden page holds still too.
- **Tray.** Unchanged from the tile build: `client/assets/tray{Asleep,Working,Waiting}Template.png` and `@2x`, rendered from `tray-c-*.svg` at 18 and 36 px. macOS only; Windows and Linux keep the colour app icon. Switched off, the tray goes back to `trayTemplate.png`. Seen composed on a [light bar](gecko/build-c-tray-light.jpg) and a [dark bar](gecko/build-c-tray-dark.jpg), not in the real menu bar.

Code: `client/src/shared/gecko.ts` (the state, tests in `client/test/gecko.test.ts`), `client/src/main/gecko.ts` (window life, state, cursor, bubble and its choices, dropped files, screenshot, menu, drag), the windows in `client/src/main/windows.ts`, `client/src/renderer/gecko.html` and `client/src/renderer/src/gecko/` (the page, tests in `client/test/gecko-panel.test.ts`), `client/src/main/tray.ts`, the "Show the gecko" switch in Settings, General.

The preview opens with "Built: the floating panel": the four states at real size on a stand-in desktop, a live panel going through them every 3.5 s that follows the pointer, wiggles on hover, squashes and opens its bubble on a click, and catches a file dropped on it, then the bubble as it asks after a press and after a drop, then the reference next to the four built states, and the tray PNGs on a light and a dark bar. The step 1 stills follow below it.

### Screenshots and recordings

- Asleep: [light](gecko/panel-asleep-light.jpg), [dark](gecko/panel-asleep-dark.jpg)
- Working: [light](gecko/panel-working-light.jpg), [dark](gecko/panel-working-dark.jpg)
- Waiting with 2: [light](gecko/panel-waiting-light.jpg), [dark](gecko/panel-waiting-dark.jpg)
- Review hop: [light](gecko/panel-review-light.jpg), [dark](gecko/panel-review-dark.jpg)
- The reference next to the built states: [panel-mochi-style-compare.jpg](gecko/panel-mochi-style-compare.jpg)
- The two rejected drawings, for the record: [panel-redraw-compare.jpg](gecko/panel-redraw-compare.jpg)
- The preview section: [light](gecko/panel-preview-light.jpg), [dark](gecko/panel-preview-dark.jpg)
- The bubble, after a press and after a drop: [light](gecko/panel-bubble-light.jpg), [dark](gecko/panel-bubble-dark.jpg); as Electron draws it in its window: [panel-bubble-electron.jpg](gecko/panel-bubble-electron.jpg)
- 15 s of the live panel (asleep with a hover peek, working with a hover wiggle, a press that opens the bubble and New task that closes it, waiting with its foot taps and a file dropped on it, caught and asked about, Cancel, then review), the dot eyes following a white dot that stands for the cursor: [light](gecko/panel-live-light.mp4), [dark](gecko/panel-live-dark.mp4)
- The page as Electron draws it in the real window, captured with `capturePage` (asleep, working, waiting mid-bounce, review mid-hop, then looking at a cursor down and to the left): [panel-electron.jpg](gecko/panel-electron.jpg). The backdrop is added.

The stills are from Chrome at 1200 x 900, device scale 2, the states drawn still; the review stills freeze the hop at 380 ms, its highest point. The recordings are Chrome's screencast at about 60 frames a second with the live panel at 1.6x, cut to 800 x 450.

### Checked in Electron

The worktree's Electron 38.8.6 was installed into `client/node_modules` and the app built with `electron-vite build`. The whole app was not started: it would share Claude's and GeckIt's real folders with the instance already running. Instead a small harness opened the built `gecko.html` with the real preload in a window made with exactly the options of `geckoWindow`, on a profile folder of its own, and found:

- The window shown without focus: visible, always on top, on all workspaces, not focusable, no focused window afterwards, the Dock icon still there.
- A click sent `gecko:press` (after the squash), a 40 px drag sent `gecko:move` and moved the window 40 px, a right-click sent `gecko:menu`.
- The bubble, in a second harness that opens the built page as `gecko.html?bubble=left` in a window with the options of `bubbleWindow`, its IPC answered by the harness: a click on the gecko sent `gecko:press`, the bubble asked `gecko:bubble`, told `gecko:fit` its height (187 px), showed and took the keyboard on "Take a screenshot", named by "What should I do?", and GeckIt did not become the active app; Esc sent `gecko:choose` `cancel`; Down then Enter sent `task`; a PNG dropped on the gecko gave it the `gecko-catch` class and sent `gecko:drop` with one picture, and the bubble asked "What should I do with this file?"; focusing another window closed it. With an explicit `focus()` after `show()`, the second bubble lost the keyboard straight away and closed, so the window is only shown.
- Renderer and GPU CPU over 5 s, from `app.getAppMetrics`, with the Mochi-style gecko: asleep after its breaths 0.05% and 0.06%, waiting after its bounces 0.00% and 0.00%, working 0.4% and 0.2%; `document.getAnimations()` listed nothing running asleep or waiting, and only the paws, the nod and the tail working. Measured again with the laptop, the typing paws and the foot taps: asleep 0.00% and 0.00%, working 0.92% and 0.53%, waiting 0.16% and 0.16% (the taps come in bursts between the blinks); nothing runs asleep or waiting between bursts, and working only the tail, the two paws, the nod and the glance.

### Not checked

- How it looks on the real desktop: the tile's shadow and corners over other apps. Screen capture needs screen recording permission this session does not have.
- Real hover in a window that is not focused (the harness sends synthetic events), the right-click menu's position, and dragging across displays.
- A real drag of files from Finder onto a window that cannot be focused, and a click on another app closing the bubble; the harness dispatches the drop in the page and focuses a window of its own.
- The screenshot choice end to end: the crosshair, the screen recording permission it asks for, and the picture reaching the form. Main's choices, `chat:task` and `chat:attach` reaching the chat window, and the paths copied to a host, were checked by type and lint only, not by running the app.
- Spaces and full screen apps, the window switcher, the lock screen closing and reopening the panel, a disconnected display.
- Windows and Linux: the transparent window, `focusable: false` keeping it out of Alt+Tab, the bubble taking the keyboard and closing on blur, the trays.
- The real menu bar with the tray images.

## The three directions

All three keep the icon's green (`#54cc61` to `#1c8c33`), its species and its toe pads and curling tail. The "glass" is drawn into the character: a top-to-bottom green gradient, a dark green rim so the silhouette stays solid on any background, a pale inner edge glow, a white specular streak on the back and head, and a soft drop shadow. None of it depends on the OS blur, so it looks the same on Mac, Windows and Linux.

- **A. Glass gecko.** The icon gecko seen from above, out of its tile, head to the right along the bar. Bulging eyes with a vertical slit pupil, which is the main thing that keeps it from reading as Mochi's dot eyes. Closest to the icon's own pose.
- **B. Gecko on the edge.** The same gecko seen from the side, standing on the bottom edge of the top bar. The most character: one big slit-pupil eye, a small mouth line, near and far legs. Reads best as "walking" and "looking at the board", and gives the hop on review a natural ground shadow.
- **C. Glass tile.** The app icon itself as a small glass tile, the white top-down gecko inside it taking the poses. Strongest link to the icon, but the gecko inside is only about 20 px long at bar size, so the poses are the hardest of the three to tell apart.

| Pose | A | B | C |
|---|---|---|---|
| Asleep | curled into a ring, head tucked, eye shut | lying flat, tail curled over the back, eye shut | curled ring inside the tile |
| Working | mid-stride, diagonal legs, tail swaying | mid-stride, near and far legs alternate | mid-stride inside the tile |
| Waiting + count | stopped, legs planted, head turned down toward the board, both eyes on it, amber "2" at the shoulder | stopped, chest up, head tipped down toward the board, pupil looking down, amber "2" | head turned, amber "2" on the tile's corner like a Dock badge |
| Moved to review | legs planted, head up, tail curled into a spiral over the back | the same tail spiral, all four feet off the ground, shadow below | tail spiral inside the tile |

Tray: one black template silhouette per state (asleep, working, waiting). Toes and eyes are dropped, feet are round pads, limbs and tail are thicker, and a solid dot at the top right stands for "waiting" since a template image cannot show a number. A and C are drawn diagonally like today's tray icon; drawn head-up they read as a running person. C's tray is a black rounded square with the gecko knocked out. B's tray is 24 x 16, wider than square.

## Files

- Poses: `gecko/a-asleep.svg`, `a-working.svg`, `a-waiting.svg`, `a-review.svg`, the same for `b-` and `c-`.
- Tray: `gecko/tray-a-asleep.svg`, `tray-a-working.svg`, `tray-a-waiting.svg`, the same for `tray-b-` and `tray-c-`.
- `gecko/draw.mjs` holds the hand-placed geometry for all of them and writes them again: `node docs/design/gecko/draw.mjs`.
- Preview: [`client/src/renderer/gecko-preview.html`](../../client/src/renderer/gecko-preview.html) with [`gecko-preview.tsx`](../../client/src/renderer/src/gecko-preview.tsx). Open `/gecko-preview.html?theme=light` (or `dark`) on the renderer Vite server. It mounts the board's real `TopBar` with a fixture and puts each pose into the bar's empty stretch before Ask, at 30 px tall; below that each pose at 4x (128 px tall); below that the tray images at 16 and 22 px on a light and a dark menu bar.

## Screenshots

- A: [light](gecko/preview-a-light.jpg), [dark](gecko/preview-a-dark.jpg)
- B: [light](gecko/preview-b-light.jpg), [dark](gecko/preview-b-dark.jpg)
- C: [light](gecko/preview-c-light.jpg), [dark](gecko/preview-c-dark.jpg)
- One bar close up (A, waiting): [light](gecko/topbar-a-waiting-light.jpg), [dark](gecko/topbar-a-waiting-dark.jpg)

Taken from the preview in Chrome at 1440 x 900, device scale 2.

## What was checked

- Every pose of every direction at 30 px tall in the real top bar, light and dark: it sits in the empty stretch, covers no control, and its height matches the 28 px buttons.
- At 4x, light and dark: rim, glow and highlight read as glass on both backgrounds; the dark rim keeps the edge on white, the bright body and inner glow keep it on dark.
- Tray at 16 and 22 px on light and dark menu bars (dark simulated by inverting the template, as macOS does).
- No image failed to load in the preview; Chrome reported one 404 that is not one of the gecko images.
- `npm run lint` and `npm run typecheck` in `client/`.

## Known weaknesses, for the choice

- The asleep ring (A and C) can read as a letter C at a glance. B's asleep pose does not have this.
- At bar size, B's asleep and review poses both show a curled tail; the difference is lying flat versus lifted with a shadow. With animation the hop will separate them, as a still it is weaker.
- C's four poses are hard to tell apart at 30 px; the tile reads as "GeckIt" before it reads as a state.
- The count disc is about 10 px at bar size, small next to the board's 11-12 px text. The stills only place it; the built one should be HTML from the app's tokens, sized to the text.
- A and C trays are close to today's tray icon at 16 px; the waiting dot carries the waiting state more than the pose does.

## Not checked

- The real menu bar: tray images were seen in the preview's stand-in bars, not as `trayTemplate` images in the macOS menu bar, at 1x or 2x, nor on Windows or Linux trays.
- Electron itself: the preview ran in Chrome, not in the app window.
- Recognition by someone who has not read the spec (a success criterion of the spec): only Alex can arrange that.
- Phone sizes (spec US5, after desktop).
- The preview ran on a Vite server with the renderer settings from `electron.vite.config.ts` (root, React plugin, `__SENTRY_DSN__`), not on `electron-vite dev --rendererOnly`: that command also tries to start Electron and stopped with "No electron app entry file found: client/out/main/index.js" in this fresh worktree.
