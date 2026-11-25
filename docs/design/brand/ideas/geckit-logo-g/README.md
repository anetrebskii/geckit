# GeckIt logo kit

The GeckIt logo is the wordmark "GeckIt" set in XCharter Bold with hand-adjusted spacing, and the mark is its G in the app's dark-theme accent green on an ink tile. Sources and tests are in `docs/design/logo-concepts/round-14-xcharter/`; `../build.py` regenerates everything here.

## Colours

| Token | Hex | Use |
| --- | --- | --- |
| Ink | `#16191D` | Tile, wordmark on light |
| Accent green | `#4AC85C` | The G (`--accent` in the dark theme) |
| Tile on dark | `#2A2E34` | Tile when the background is already ink |
| White | `#FFFFFF` | Wordmark on dark |

Do not put a white G on a green tile or a green circle: it reads as Grammarly's icon.

## Logo (`logo/`)

- `geckit-lockup-on-light.svg`, `geckit-lockup-on-dark.svg`: tile and wordmark, transparent background, for standalone use (not inside an interface). PNG at 1200 px wide beside each.
- `geckit-wordmark-on-light.svg`, `geckit-wordmark-on-dark.svg`: the word alone.
- `geckit-mark.svg`: the tile with the G.
- `geckit-g-green.svg`, `geckit-g-black.svg`, `geckit-g-white.svg`: the G alone, for one-colour and reversed use.

Letters are outlined, so the SVGs need no font. Keep clear space of half the tile's width around the lockup. Below 24 px use the mark, not the lockup.

## Instagram (`instagram/`)

`geckit-avatar-1080.png`: upload as the profile picture. It is circle-safe: the G sits inside the crop.

## Landing (`web/` and `fonts/`)

Copy `web/` to the site root and add to `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:image" content="https://geckit.app/og-image.png">
```

In the site header, use `logo/geckit-mark.svg` as the icon and keep the name "GeckIt" as live text in the site's own font. The XCharter lockup sits badly next to a sans-serif interface (see `geckit-site-header-check.png`), so keep it for places where it stands alone: the OG image, covers and slides. The site does not need XCharter; if a page ever wants text in the wordmark's face:

```css
@font-face { font-family: "XCharter"; src: url("/fonts/XCharter-Bold.woff2") format("woff2"); font-weight: 700; font-display: swap; }
@font-face { font-family: "XCharter"; src: url("/fonts/XCharter-Roman.woff2") format("woff2"); font-weight: 400; font-display: swap; }
```

XCharter is free under the Bitstream Charter licence (`fonts/LICENSE-XCharter.txt`): keep that file next to the font files. Never use the macOS system Charter: its licence does not cover this use.

## Application icon (`app-icon/`)

| Platform | Files | Replaces |
| --- | --- | --- |
| macOS 26 | `macos/icon.icon` | `client/assets/icon.icon` (`mac.icon` in `client/package.json`) |
| macOS 15 and earlier | `macos/icon.icns`, `macos/icon.png` | legacy builds; tile 824 of 1024 with a squircle corner |
| Windows | `windows-linux/icon.ico` | `client/assets/icon.ico` |
| Linux and the tray fallback | `windows-linux/icons/*.png` | `client/assets/icons/` |
| macOS menu bar | `tray/trayTemplate.png`, `@2x` | `client/assets/trayTemplate*.png` |
| iOS | `ios/AppIcon-512@2x.png` | `mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/` |
| Android | `android/mipmap-*/`, `ic_launcher_background.xml` | `mobile/android/app/src/main/res/` |

Not made yet: the tray's Asleep, Waiting and Working states, and `client/assets/icon-dev.png` (the dev build's Dock icon).

## What was checked

All ten Lebedev logo tests, against 15 marks in the category. The colour test fails formally, because Ema also uses green; the green was kept on purpose, since it is the app's accent. The Dock was checked at 128 and 64 px beside Notes and Calendar on light and dark. Small sizes were checked in true pixels: macOS and Windows at 16, Windows at 32, the favicon at 16 and 32, and the tray template on light and dark. The Android circle mask, the iOS rounded mask and the Instagram circle were also rendered. The `.icon` bundle was not opened in Icon Composer, so its glass and its Clear and Tinted appearances are unverified.
