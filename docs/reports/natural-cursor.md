# Natural test-browser cursor verification

Verified on 2026-11-12 in Codex session `01a1cfcc-a096-7b41-b13d-3b7e6f592236`, main source checkout. These are local working-tree changes, not a release or a push.

The test driver uses an original bounded cubic path with acceleration and deceleration for element clicks, hovering, typing and scrolling. Actual native mouse events drive the existing visible overlay. Default test-browser clicks now use native press/release events. Background native input stalled in Chrome for Testing 131 until focus emulation was enabled; the final implementation uses focus emulation and does not bring the target forward. It does not import Camoufox code or add a browser dependency. Manual sign-in input and recording triggers retain their direct input behavior.

## Actual browser checks

The source service CLI was built and a fresh named profile, `geckit:natural-cursor-01a1cfcc`, was started through the normal GeckIt browser commands. Browser: Chrome for Testing 131.0.6778.204, macOS ARM64. The page was a local HTML fixture with actual buttons, input, hover styles, a disabled button and a target below the fold. No account, external integration or fake backend was involved.

| Check | Observed result |
| --- | --- |
| Native default clicks A then B, without `--real` | Correct target received trusted clicks; 43 and 53 trusted mousemove events, 700 and 861 ms, curves deviated 55 and 59 px from the straight line |
| Continuity | The first point of the second path was within 2 px of the preceding endpoint |
| Hover at the same position | One native event with no travel interval; CSS hover matched |
| Typing | 41 trusted movement events; the input was focused and contained the requested text |
| Keyboard focus | Tab moved from the input to the next enabled button |
| Hover in dark mode | 49 trusted movement events; CSS hover matched |
| Element scrolling and click below the fold | Page scrolled over 500 px; 54 trusted movement events, followed by a trusted click on the below-fold button |
| Narrow viewport after resize | All recorded positions stayed within 390x700, including the clamped first point |
| Reduced motion | Exactly one immediate native movement event and a trusted target click |
| Oversized fixed target in reduced motion | Its center was outside the viewport; one native move landed at x=374 in the 375 px content area, excluding the scrollbar, and a trusted click reached the target |
| Disabled target | No additional click event on the disabled button |
| Missing numeric ref | Existing missing-element error; zero movement events |
| Independent tab | New tab's first point was (1, 0), followed by 52 trusted movement events to the target |
| Screenshot visibility | Default screenshot hid the overlay and restored its host visibility afterward |
| Rest interval | Pointer and edge were absent in a `--pointer` screenshot after 3.4 seconds |
| Existing launch flag | `navigator.webdriver` remained false |

Full-page screenshots were visually inspected at 1280x800 and 390x700 in light and dark, including reduced motion. The black pointer with white outline remained legible, followed the final native coordinate, and did not shift layout. The fixture's drawn green path is test instrumentation, not an added product trail.

The task-owned fixture, CLI verification script, raw event evidence and screenshots are under `/private/tmp/geckit-chrome-cursor-01a1cfcc/`. `verification.json` contains the raw native input events and summaries. A fresh final driver passed the oversized-target check and a normal curved click with 17 trusted movement events. Verification tabs were closed afterward; the named profile remains for review and the managed driver follows conversation cleanup. No direct browser-protocol client was used for these checks.

## Source checks and limits

- `npm run typecheck`: passed.
- ESLint on `cursor.ts`, `testing.ts`, `cursor.test.ts` and `extension/background.js`: passed.
- `npm run build:service`: passed.
- Focused cursor, browser testing, routing and lifecycle suites: 19 tests passed across four files.
- An earlier wider run including remote-browser profiles passed 26 of 27 tests. The unrelated failure is `remote-browser-profiles.test.ts:21`, which still requires empty descriptions to throw while concurrent profile-management changes remove that requirement in `saveTestAccount`. Cursor changes do not edit that function or test.

The performance-review skill and `docs/performance.md` were read. This task changes the browser driver and extension overlay, with no app renderer, shared renderer contract or mobile changes, so that skill's renderer review scope does not apply. Movement is bounded to 1.5 seconds and scheduled at about 60 native events per second; the live evidence shows the intended cadence. No CPU or memory benchmark is claimed.

Not checked: a packaged release, Linux, signed-in third-party flows, standalone Chromium with this new path implementation, or third-party automation detection. Chromium uses the same input protocol, but the new movement was verified here in Chrome for Testing. `webdriver=false` and natural movement do not establish undetectability. Existing running drivers keep their loaded implementation until relaunched.
