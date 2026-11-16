# Verification: Sidebar navigation

**Cases**: [ui-test-cases.md](ui-test-cases.md) | **Date**: 2026-11-16 | **Branch**: `feat/sidebar-navigation` (worktree, uncommitted)

Every case marked H ran in the harness (`client/src/renderer/sidebar-preview.html`): the real Chat window, pages, phone menu and stylesheets on a fake backend, served by Vite and driven in a background Chrome tab through `geckit-local browser`. It proves the renderer, not the service. Desktop ran at 1180 x 760 and 820 x 760, phone at 390 x 844. LD cases were inspected in light and dark.

Result: 50 pass, 0 fail, 1 not run (P-14), over 51 cases (D-31 added). D-03, D-04 and D-23 ran as a harness reload plus the real settings store, not in the isolated app the cases name.

## Desktop

| ID | Result | Notes |
| --- | --- | --- |
| D-01 | Pass, harness, fake backend, LD | |
| D-02 | Pass, harness, fake backend, LD | |
| D-03 | Pass, harness restart and real settings store | Manager chosen, page reloaded with settings kept as the service keeps them: Manager shown. `store.test.ts` saves `chatPlace` and `navNames` with the real store and reads them back from a fresh module. Not run in the isolated app: Alex's dev app was running, and a second desktop would rewrite the shared `~/.geckit/bin` wrappers |
| D-04 | Pass, harness restart | Redefined after Alex's correction (no host pages any more): the kept place `host:build-box`, as an earlier build saved it, opens on Tasks. Also covered by `places.test.ts`. Same isolated-app limit as D-03 |
| D-05 | Pass, harness, fake backend | |
| D-06 | Pass, harness, fake backend | No computer selector in the bar any more |
| D-07 | Pass, harness, fake backend, LD | Spoken name "Tasks, 3 conversations waiting for you" |
| D-08 | Pass, harness, fake backend | |
| D-09 | Pass, harness, fake backend | |
| D-10 | Pass, harness, fake backend, LD | Threads GeckIt and a Telegram thread listed beside the chat |
| D-11 | Pass, harness, fake backend | |
| D-12 | Pass, harness, fake backend, LD | |
| D-13 | Pass, harness, fake backend | |
| D-14 | Pass, harness, fake backend, LD | |
| D-15 | Pass, harness, fake backend, LD | |
| D-16 | Pass, harness, fake backend, LD | Fixed while running: the Browsers page said "Web Browser"; the section headings repeated the page title |
| D-17 | Pass, harness, fake backend, LD | No Checklists, Browsers or Secrets; Hosts is back in the list |
| D-18 | Pass, harness, fake backend, LD | Redefined: "This computer, shown", "Studio Mac", "office-mini", "Connect computer", "Manage computers"; Connect computer from Secrets shows Tasks with "Connect a computer" over it; Close shuts it |
| D-19 | Pass, harness, fake backend | No saved computers: "This computer" and "Connect computer" only; Connect computer opens the dialog |
| D-20 | Pass, harness, fake backend | 12 saved computers. Fixed while running: the footer fell off the window |
| D-21 | Pass, harness, fake backend, LD | Monograms "SM", "OM". Fixed while running: the rail's scrollbar covered the icons once the middle scrolled |
| D-22 | Pass, harness, fake backend | Fixed while running: opening names moved the content |
| D-23 | Pass, harness restart and real settings store | At 1180 px Cmd+Ctrl+S hid the names; after the reload the rail shows; Cmd+Ctrl+S shows the names again. Same isolated-app limit as D-03 |
| D-24 | Pass, harness, fake backend | |
| D-25 | Pass, harness, fake backend | |
| D-26 | Pass, harness, fake backend | Fixed while running: Cmd+P from another place left the board search unfocused |
| D-27 | Pass, harness, fake backend | |
| D-28 | Pass, harness, fake backend, LD | Order and ring on all 13 controls; Enter chooses. The tool's Tab does not move focus, so each control was focused after a key press |
| D-29 | Pass, harness, fake backend | Checked in the accessibility tree, not with VoiceOver; the shown computer has a spoken state |
| D-30 | Pass, harness, fake backend | 10 switches, each committed in 3 to 6 ms; `chat:list` not called again. Measured to commit, not to paint: a background tab runs no animation frames |
| D-31 | Pass, harness, fake backend, LD | Added with the correction: "Studio Mac" shown as the connected computer, marked with a green dot and spoken "Studio Mac, connected"; one sidebar; This computer asks the workspace to switch back. The real switch over GeckIt's link was not exercised |

## Phone

| ID | Result | Notes |
| --- | --- | --- |
| P-01 | Pass, harness, fake backend, LD | |
| P-02 | Pass, harness, fake backend, LD | Fixed while running: the menu's classes collided with the conversation drawer's `.phone-drawer`. Its position check first failed because the check's wait was counted in message hops, not milliseconds, and read the panel before its 280 ms slide; with a timed wait the panel is at 0 when open (two clean runs) |
| P-03 | Pass, harness, fake backend | |
| P-04 | Pass, harness, fake backend, LD | All nine places |
| P-05 | Pass, harness, fake backend | |
| P-06 | Pass, harness, fake backend | |
| P-07 | Pass, harness, fake backend | |
| P-08 | Pass, harness, fake backend | |
| P-09 | Pass, harness, fake backend, LD | |
| P-10 | Pass, harness, fake backend | |
| P-11 | Pass, harness, fake backend, LD | Gap as planned: Manager's threads list on the phone is not built |
| P-12 | Pass, harness, fake backend, LD | Gap as planned: no page for one channel |
| P-13 | Pass, harness, fake backend | Slack shows "Set up on the computer" with its switch on and disabled, because it is turned on but has no tokens |
| P-14 | Not run | Needs this branch's desktop app running (the phone's `channels.configure` exists only here) and a build on Alex's iPhone; both would replace what Alex is using now. Alex chose on 2026-11-16 to leave it not run until the branch is merged |
| P-15 | Pass, harness, fake backend, LD | |
| P-16 | Pass, harness, fake backend | The refusal comes only after the whole form, the value included, is filled in and saved |
| P-17 | Pass, harness, fake backend, LD | |
| P-18 | Pass, harness, fake backend | Reduced motion emulated: no transition, the menu at 0 at once |
| P-19 | Pass, harness, fake backend | |
| P-20 | Pass, harness, fake backend | |

## Checks after the fixes

`npm run typecheck` passes, eslint on the changed files finds nothing, `npm run test`: 156 files, 2054 tests pass, 23 skipped.

## Change after the run

On 2026-11-16 Alex corrected the Computers group: it holds the GeckIt computers from the board bar's computer selector, and SSH hosts go back to Settings, Hosts. D-04, D-18, D-19, D-20, D-21 and D-29 were rewritten for it and D-31 added; every desktop case was run again after the change, in a GeckIt test browser (no extensions; D-10's drag check in a Chrome tab, since the test browser has no `app-region`), and the phone cases again. `npm run lint` reports two `no-undef` in `client/scripts/dev-bundle.js`, a file this branch does not change. The phone suite was rerun from a clean state (no kept place) after the change: all phone cases pass except P-14.
