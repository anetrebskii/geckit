# Implementation Plan: Test browser that looks like a real person

**Branch**: `036-real-person-browser` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/036-real-person-browser/spec.md`

## Summary

Make GeckIt's Camoufox test browsers look like a person's browser without faking the machine they run on:

1. **No GeckIt traces** (all systems): refs, secret marks and the pointer move out of the page's document into Camoufox's isolated world and onto the pictures GeckIt takes ([research R1-R3](research.md)).
2. **uBlock Origin by default** (all systems): the copy bundled inside Camoufox, loaded through Camoufox's `addons` setting (R4, revised).
3. **Linux virtual display** (Linux without a screen): Xvfb instead of headless mode (R5).
4. **Server desktop identity** (Linux without a screen): one Ubuntu desktop with Intel graphics per server, made once from values captured on a real machine, with media devices, voices and fonts; profiles from before keep their presentation until moved (R6-R9).

Location matching, proxies and resource blocking are out (spec items 2 and 6). Computers with a screen keep presenting themselves as they are.

## Technical Context

**Language/Version**: TypeScript (ESM) on Node 22+ for the driver and CLI; plain JavaScript for the shared page functions in `client/extension/background.js`.

**Primary Dependencies**: `playwright-core` (already used to drive Camoufox); Camoufox 158.0.1-beta.41 from `anetrebskii/geckit-browser-assets`; Xvfb from the server's package manager, installed by the person. No new npm dependency.

**Storage**: JSON files in `~/.geckit/camoufox/` ([data-model.md](data-model.md)); pinned assets in GeckIt's asset releases.

**Testing**: vitest, offline, for the pure parts (identity making, launch settings, Xvfb output handling, presentation migration, picture masking geometry); the [quickstart](quickstart.md) for real browsers on macOS and Ubuntu 24.04.

**Target Platform**: test browsers on macOS, Windows and Linux; parts 3 and 4 only on Linux without `DISPLAY`/`WAYLAND_DISPLAY`.

**Project Type**: desktop app with a headless service and CLI (`client/src/cli/`).

**Performance Goals**: a test browser start is at most 2 s slower than today on a server (Xvfb start) and unchanged elsewhere after the one-time downloads (uBlock Origin about 4 MB, server font set about 30 MB).

**Constraints**: the Chrome extension's behavior and Web Store package stay unchanged (FR-011); nothing installed outside GeckIt's folders (constitution, Constraints); signed-in profiles keep their presentation (FR-009, SC-005).

**Scale/Scope**: one driver process per open test profile; one identity per server.

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1.*

| Principle | Status | How |
|---|---|---|
| I. The Person's Own Plan | Pass | No session or credential change. Secrets stay out of pictures, now by masking (R2). |
| II. One Contract Between Main and Windows | Pass | `ViewFrame` in `client/src/shared/api.ts` gains `pointer`; the live view reads it through the existing contract. |
| III. Recorded Output, Not Live Calls | Pass | All decisions are pure functions with offline tests; real browsers only in the quickstart. |
| IV. UX Before Pixels | Pass | `docs/ux/chrome-testing.md` and `docs/ux/chrome-cursor.md` are updated first ([design.md](design.md)). |
| V. Every System, One Word | Pass | Copy says "a Linux computer without a screen", never "this Mac"; features degrade (no uBlock Origin, the browser still starts; no Xvfb, a clear failure) rather than break. |
| VI. Tokens Only | Pass | The live view pointer reuses existing styles and tokens. |
| Constraints: no new runtime dependency | Pass | Xvfb is a system program the person installs; assets follow the Camoufox pattern. |
| Constraints: files under about 400 lines | Pass | New logic goes into new files (below); `testing.ts` only wires them in. |
| Constraints: nothing installed on another computer unasked | Pass | Xvfb is named in an error, not installed. |

Re-check after Phase 1: unchanged, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/036-real-person-browser/
├── spec.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   └── launch-config.md
├── fixtures/traces.html      (first task)
└── tasks.md                  (/speckit-tasks)
```

### Source Code

```text
client/
├── extension/background.js        ref, secret and pointer indirection (Chrome behavior unchanged)
├── src/cli/
│   ├── camoufox.ts                add-on and server font assets; server detection
│   ├── virtual-display.ts         new: start, find and stop Xvfb (R5)
│   ├── desktop-identity.ts        new: make, read and validate device.json; presentation.json (R6-R9)
│   ├── launch-settings.ts         new: pure launchSettings() per contracts/launch-config.md
│   ├── desktop/ubuntu-intel.json  new: captured base values (R7)
│   ├── testing.ts                 wiring: launch, hidden-ref mode, picture masking, pointer in frames
│   └── browser.ts                 profiles device command, profile line suffix, help
├── src/shared/api.ts              ViewFrame.pointer
├── src/renderer/src/chat/LiveView.tsx  draws the pointer over the frame
└── test/
    ├── launch-settings.test.ts
    ├── desktop-identity.test.ts
    ├── virtual-display.test.ts
    └── browser-testing.test.ts    hidden-ref mode, masking geometry
docs/ux/chrome-testing.md, docs/ux/chrome-cursor.md
skills/use-browser/references/test-browsers.md, skills/configure-remote-geckit/references/installation.md
```

**Structure Decision**: the existing CLI package; three small new modules keep `testing.ts` (already past 400 lines and being extended by the frames work) from growing further.

## Phases of delivery

Each phase is its own commit and can ship alone, in this order.

### Phase A: No GeckIt traces (P1)

1. Spike R1 (isolated-world persistence in Camoufox); add `fixtures/traces.html`.
2. UX documents per [design.md](design.md).
3. `background.js`: route every `data-geckit-ref` and `data-geckit-secret` use through `markRef`, `findRef`, `markSecret`, `isSecret`; `pagePointer`/`pageOverlay` return early in hidden mode. Default (Chrome) code path produces identical DOM to today; `test/browser-testing.test.ts` checks the extension's functions unchanged in Chrome mode.
4. `pageScript()` puts the hidden-mode constant and registry in front of the functions for Camoufox.
5. Masking: secret boxes painted over in `shot` and `record` pictures; `FIELDS_SCRIPT` marks secret field boxes from the registry, and the viewer paints them.
6. `ViewFrame.pointer` and the live view drawing; `shot --pointer`/`record --pointer` draw onto the picture.
7. Quickstart 1 and 5, including `geckit:zabookni` on Instagram.

Depends on the other session's frames work (`refAt`, `inFrame`, `upload`, `drop`, `drag`) being merged first, since it rewrites the same ref lookups.

### Phase B: uBlock Origin (P2)

1. Spike R4.
2. (Revised) Nothing to publish: Camoufox bundles uBlock Origin. `prepareLaunch` finds `addons/UBO` beside the binary.
3. `addons` in `launchSettings`.
4. Quickstart 2.

### Phase C: Linux virtual display (P2)

1. `virtual-display.ts` with `-displayfd`, pid file beside the profile lock, cleanup of a crashed driver's display.
2. `camoufoxHeadless()` replaced by a server check that starts the display; failure messages per [contracts/cli.md](contracts/cli.md).
3. `configure-remote-geckit` installation reference lists `xvfb`.
4. Quickstart 3 on Ubuntu 24.04.

### Phase D: Server desktop identity (P3)

1. Spike R7 (capture from a real Ubuntu 24.04 desktop with Intel graphics) into `desktop/ubuntu-intel.json`; spike R8 (bundled fonts).
2. (Revised) No font asset: the server's installed families that the catalogue lists are handed over; the server guide names the packages.
3. `desktop-identity.ts`: make once, read, validate, never replace; `presentation.json` migration.
4. `launchSettings` maps identity and base per [contracts/launch-config.md](contracts/launch-config.md), dropping keys Camoufox does not list.
5. `profiles device <name> --desktop`, the `profiles` suffix, help.
6. `skills/use-browser/references/test-browsers.md`: one line on the server identity and the command (no new rules for agents).
7. Quickstart 4.

## Risks

| Risk | Effect | Handling |
|---|---|---|
| Isolated-world state does not persist in Camoufox | Phase A design | Spike first; Xray expando fallback (R1). |
| A captured base from one machine becomes a known signature | Many GeckIt servers look alike | Values vary per server where people vary (screen, cores, seeds); the base can be extended with more captured machines later without changing the format. |
| Datacenter address | Server traffic still looks like a server | Out of scope (no proxy, spec item 2); stated in the spec's assumptions. |
| uBlock Origin breaks a site the person needs | A task fails | uBlock Origin's own per-site switch; noted in `docs/ux/chrome-testing.md`. |
| Another session edits `background.js` and `testing.ts` now | Merge conflicts | Phase A starts after that work lands. |

## Complexity Tracking

No constitution violations to justify.

## Implementation notes - 2026-11-19

What changed from this plan while building it, and why; details in [research.md](research.md) R4, R7 and R8:

- uBlock Origin comes inside Camoufox, so no asset or download.
- Fonts are the server's own installed families, filtered by the catalogue; no font asset.
- The base profile comes from Camoufox's MIT data, not a capture. WebGL is vendor and renderer only; installing Camoufox's Python package for its full WebGL database was declined.
- No seeds: Camoufox removed those settings.
- Screen and window are the real Xvfb values; the window keeps Firefox's default size, since `-width`/`-height` stop Camoufox's first page from reaching Playwright.
- `ViewFrame.pointer` carries GeckIt's last cursor position for three seconds after a move; the live view draws it over the picture and drops it when the person moves their own mouse.
- Playwright's screenshot hides the caret by writing a style on every field; GeckIt asks for `caret: 'initial'` so pages see no change.
- Phase A revised: a recording's sheet and GIF stay in the page's main world (`mw:`), inside one function that keeps nothing on the page's global and adds nothing to its document, because Firefox forbids reading pixel arrays across the isolated world's boundary. FR-001 still holds: `traces.html` reported nothing added during `record`. Refs, secrets and the pointer painting run in the isolated world as planned.
- The live view's caret in a single-line field is now measured with a canvas, so sign-in pages see nothing added. A textarea still uses a measuring element appended for a moment.
