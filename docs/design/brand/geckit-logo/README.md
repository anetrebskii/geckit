# GeckIt logo kit

**This is the current GeckIt logo, approved on 2026-11-24. Use only the files in this folder.** Every other logo, concept and earlier kit is in `../ideas/` for reference and is not to be used.

The GeckIt logo is the Joint mark beside the wordmark "GeckIt" in XCharter Bold. Joint is two pieces that lock into each other: the conversation and the AI employee connected to it. The geometry is the original `joint` from `../ideas/ceo-logo-finalists/joint/`, aligned on 2026-11-25: both pieces are 72 units high and offset by 12 at the top and the bottom, every gap between them is 10, and the tab sits on the notch's axis. `../build.py` regenerates everything here; it reads the wordmark outlines and fonts from the previous kit with the G mark, `../ideas/geckit-logo-g/`.

## Colours

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#16191D` | Tile, left piece and wordmark on light |
| Green on light | `#1F8031` | Right piece on a light background |
| Green on dark | `#4AC85C` | Right piece on ink (`--accent` in the dark theme) |
| White | `#FFFFFF` | Left piece and wordmark on dark |

Green belongs to the mark only. Keep the wordmark in one colour.

## Logo (`logo/`)

- `geckit-lockup-on-light.svg`, `geckit-lockup-on-dark.svg`: mark and wordmark, transparent background. The mark spans the capital height, from the top of the G to the baseline. PNG at 1200 px wide beside each.
- `geckit-lockup-black.svg`, `geckit-lockup-white.svg`: one-colour versions for print, stamps and partner pages.
- `geckit-wordmark-on-light.svg`, `geckit-wordmark-on-dark.svg`: the word alone.
- `geckit-mark.svg`: the mark on an ink tile.
- `geckit-joint-on-light.svg`, `geckit-joint-on-dark.svg`, `geckit-joint-black.svg`, `geckit-joint-white.svg`: the mark alone.

Letters are outlined, so the SVGs need no font. Keep clear space of half the mark's width around the lockup. Below 24 px high use the mark, not the lockup.

## Instagram (`instagram/`)

- `geckit-avatar-1080.png`: the profile picture. It is circle-safe.
- `geckit-post-lockup-1080.png`: a square post with the lockup on ink.

## Landing (`web/` and `fonts/`)

Copy `web/` to the site root and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="https://geckit.app/og-image.png">
```

In the site header, use `logo/geckit-joint-on-light.svg` and keep the name "GeckIt" as live text in the site's own font (see `../mockups/landing.png`). Keep the XCharter lockup for places where it stands alone: the OG image, covers and slides.

XCharter is free under the Bitstream Charter licence (`fonts/LICENSE-XCharter.txt`): keep that file next to the font files. Never use the macOS system Charter: its licence does not cover this use.

## Application icon (`app-icon/`)

| Platform | Files | Replaces |
| --- | --- | --- |
| macOS 26 | `macos/icon.icon` (two glass layers, one per piece) | `client/assets/icon.icon` (`mac.icon` in `client/package.json`) |
| macOS 15 and earlier | `macos/icon.icns`, `macos/icon.png` | legacy builds; tile 824 of 1024 with a squircle corner |
| Windows | `windows-linux/icon.ico` | `client/assets/icon.ico` |
| Linux and the tray fallback | `windows-linux/icons/*.png` | `client/assets/icons/` |
| macOS menu bar | `tray/trayTemplate.png`, `@2x`, and the states `trayAsleepTemplate`, `trayWorkingTemplate`, `trayWaitingTemplate` | `client/assets/tray*Template*.png` |
| iOS | `ios/AppIcon-512@2x.png` | `mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/` |
| Android | `android/mipmap-*/`, `ic_launcher_background.xml` | `mobile/android/app/src/main/res/` |

The 16 and 32 px sizes use a larger mark (`icon-small.svg`). `macos/icon-dev.png` is the Dock icon of the build run from source (`npm run dev`), with an orange LOCAL band; it replaced the "It" icon on trial (`../ideas/it-local/`) in `client/assets/icon-dev.png`. The menu bar states: Asleep pulls the two pieces apart, Working joins them, Waiting joins them with a dot at the top right. All of these were copied into `client/assets/` on 2026-11-25.

## What was checked

`../geckit-logo-tests.png` covers the lockup on light and dark, in black and white, and at 24 px high, plus the macOS icon at 512, 64, 32 and 16 px, the favicon at 16 px and the tray template. `../mockups/` shows the Instagram profile in both themes, the macOS Dock, the iPhone home screen and the landing page.

Open risks:

- At avatar size, the green piece with its tab can read as a video camera (test 3, "looks like").
- The idea of connecting pieces fits any integration product (test 4, meaning).
- In one colour, the two pieces almost merge at the tab, and the joint reads as a single block with a notch.
- The green is shared with Tasklet and Ema (test 10).

The `.icon` bundle was not opened in Icon Composer, so its glass and its Clear and Tinted appearances are unverified.
