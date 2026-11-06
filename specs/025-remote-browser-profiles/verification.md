# Verification: signed-in browser profiles on any computer

2026-11-06. Working tree on `feat/simple-remote-control`, not committed and not released.

## What was built

| Spec | Where |
| --- | --- |
| FR-001 to FR-003, `--computer` | `client/src/cli/computer.ts` (the request folder `~/.geckit/computers/`), `client/src/service/remote/computers.ts` (this service paired as a device of another, sealed in `computers.sealed`), `nodeDial` in `client/src/service/remote/transport.ts`, `cli:run` in `client/src/core/cli-run.ts`; `geckit computers [add|forget]` in `client/src/cli/remote.ts` |
| FR-004 to FR-007, account profiles | `testAccount`/`saveTestAccount` in `client/src/cli/browser-lifecycle.ts` (notes in `~/.geckit/browser-state/accounts/`), `profiles create|note` in `client/src/cli/browser.ts`, `.account` requests served by `serveTestLaunches` |
| FR-008 to FR-012, links and live view | `client/src/cli/live-view.ts`; driver commands `view-open|frame|input|close` in `client/src/cli/testing.ts`; core methods `browser:viewStart|viewFrame|viewInput|viewEnd|account|signInLink`; `client/src/renderer/src/chat/LiveView.tsx` |
| FR-013, phone | page fills the height, scrolls sideways, pinches; Keyboard button |
| FR-014, Linux | `chromeFlags`: `--password-store=basic`, and `--headless=new` where there is no `DISPLAY`/`WAYLAND_DISPLAY` |
| FR-015, channels | the link is plain text an assistant posts; `signin <name> --done` ends it |
| FR-016, Settings | Test browsers: note, Sign in, New account profile; on another computer through the toolbar's computer menu |
| FR-017, built-in skills | `client/src/main/guide.ts`: "Other computers" section with the paired names, account profiles and sign-in in the browser skill |
| Links on devices | `geckit://signin` on the phone (`mobile/src/main.ts`) and the desktop (`open-url`, `second-instance`, `protocols` in `client/package.json`) open Servers for that computer, then the live view |

## Checks run

- `npm run typecheck`, `npm run lint`: clean.
- `npx vitest run`: 1751 passed; `headless-service`, `core-application` and `manager-store` fail in the full run when they rebuild `out/service` at the same time, and pass on their own (8, 1, 9 tests). New: `test/remote-browser-profiles.test.ts`, 8 tests.
- Two headless services on this Mac with separate data and home folders, paired over the real signaling and WebRTC:
  - `geckit computers add <code>` paired B with A; `computers` listed it.
  - As an assistant (`CLAUDECODE=1`): `computers add` refused; `pair --computer`, `service --computer` refused; `browser profiles create github-work --note "GitHub as alex" --computer <A>` made it on A only; `browser profiles --computer` listed it with its note; `browser signin` printed a link; `signin --done` answered; an unknown computer named the paired ones.
  - On A, through the same core methods a paired device calls: the link opened the view once, and a second time said `This sign-in link was already opened.`; the picture of example.com and httpbin's form came back at 1280x800; a click focused a field, text (with Cyrillic) and Tab reached it; Done closed the browser; a cookie set during sign-in was there after the browser started again.
  - Chrome ran headless (through a wrapper adding `--headless=new --password-store=basic --use-mock-keychain`) because a headful Chrome for Testing started from this session's shell waited a long time before answering on macOS, most likely on the keychain. That is the mode a Linux server without a screen uses.
- The live view in Chrome through `live-view-preview.html`: desktop light, phone dark, failure state; clicks and keys typed into the picture's field.

## Not checked

- A real Linux computer, and a site with real sign-in (Google may refuse a browser driven over the debugging protocol).
- The link opening in the iPhone and installed desktop apps: needs a build of each; the scheme was already registered on the phone and is added to the desktop's packaging.
- The live view across a real paired desktop or phone connection: the pieces were checked separately (core calls over the paired connection by `cli:run`, the view calls on the computer itself).
