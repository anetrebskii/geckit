# Contract: what the driver hands Camoufox at launch

`client/src/cli/testing.ts`, `firefox.launchPersistentContext`. Built by one pure function, `launchSettings({ addon, server, known })` in `client/src/cli/launch-settings.ts`, which the unit tests cover; `prepareLaunch` in `client/src/cli/launch.ts` gathers its inputs.

## Every system

`CAMOU_CONFIG_1` (JSON):

| Key | Value |
|---|---|
| `humanize` | `true` (unchanged) |
| `humanize:maxTime` | `1.5` (unchanged) |
| `allowMainWorld` | `true` (unchanged) |
| `addons` | `[<uBlock Origin folder>]`, the copy bundled with Camoufox (`addons/UBO` beside the binary, or `Contents/Resources/addons/UBO` on macOS); left out when the Camoufox has none |

## Linux server, in addition

- `headless: false`, `env.DISPLAY = :<n>` from Xvfb (R5), The window opens at Firefox's own default size inside that screen, like a window a person has not maximized. Screen and window values are the real ones, not spoofed. (`-width`/`-height` were tried and dropped: with them Camoufox never hands Playwright its first page.)

Profile `desktop` only, mapped from `device.json` and the base profile:

| Camoufox key(s) | Source |
|---|---|
| `navigator.hardwareConcurrency` | `cores` |
| `navigator.language`, `headers.Accept-Language`, `locale:language`, `locale:region` | `language` |
| `timezone` | `timezone` |
| `webGl:vendor`, `webGl:renderer` | base: `Intel`, `Intel(R) HD Graphics, or similar` (what Firefox on Linux reports) |
| `mediaDevices:enabled`, `mediaDevices:micros`, `mediaDevices:webcams`, `mediaDevices:speakers` and their `Labels` and `Groups` | base: built-in audio (with its PulseAudio monitor), one integrated camera |
| `voices` | base: the espeak voices, with `urn:moz-tts:speechd:` URIs |
| `fonts` | the server's installed families (`fc-list`) that the base Linux catalogue lists |

Not set, unlike the plan: the canvas, audio and font-spacing seeds (Camoufox removed these settings, so its own per-launch values apply), `navigator.languages` (removed), and the full WebGL parameter set (only vendor and renderer: the WebGL databases ship with Camoufox's Python package, whose install was declined; the real Mesa parameters remain).

Not set on purpose: `navigator.userAgent` and `navigator.buildID` (Camoufox's real Firefox), every `webrtc:*`, `geolocation:*` and proxy setting (no proxy, spec item 2), any blocking preference (spec item 6).

Keys the installed Camoufox does not list in its `properties.json` are dropped with the log line in [cli.md](cli.md).

## macOS, Windows, Linux with a display

Only the "Every system" rows. The browser shows the computer as it is (FR-010).
