# The gecko: still poses

Step 1 of [spec 016](../../specs/016-gecko-character/spec.md): still poses for Alex to choose a direction from. No animation, no app integration, no state logic. States, transitions and wording are in the [UX document](../../specs/016-gecko-character/ux.md).

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
