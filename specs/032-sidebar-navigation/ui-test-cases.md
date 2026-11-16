# UI test cases: Sidebar navigation

**Spec**: [spec.md](spec.md) | **UX**: [docs/ux/sidebar-navigation.md](../../docs/ux/sidebar-navigation.md) | **Date**: 2026-11-16

**Status**: Approved by Alex on 2026-11-16; run on 2026-11-16, results in [verification.md](verification.md)

Expected wording is quoted from the UX document's section 7 and its Phone section. Results go in `verification.md` beside this file, one line per case: pass, fail with a screenshot, or not run with the reason.

## Where they run

| Environment | What it is | Used for |
| --- | --- | --- |
| **H: harness** | A new `client/src/renderer/sidebar-preview.html` that mounts the real Chat window, sidebar, pages and phone menu with the real stylesheets, on a fake backend with fixture conversations, questions, hosts, channels and secrets. Served with plain Vite on port 5199 and opened in a background Chrome tab of my own through `geckit-local browser` | Every layout, state, theme, keyboard and wording case |
| **A: isolated app** | The dev app started with its own data folder (`--user-data-dir` in scratch), only when no other session runs `electron-vite dev` | Cases that need a real restart or real settings: D-03, D-04, D-23 |
| **P: iPhone** | The phone app installed on Alex's iPhone | P-14 only, and only if Alex agrees to a mobile build |

The fake backend proves layout and behavior in the renderer, not the service. Every case run on H is reported as "harness, fake backend". Alex's own dev app and Chrome tabs are not used.

Viewports: desktop 1180 x 760 (wide), 820 x 760 (narrow); phone 390 x 844. Themes: light and dark for every case marked **LD**.

## Desktop

| ID | Env | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| D-01 | H, LD | 1180 px, first start (no saved place) | Open Chat | Sidebar on the left with "Tasks", "Manager", "Questions"; header "Workspace" with "Team", "Shortcuts", "Checklists", "Browsers", "Secrets"; header "Computers" with "This computer", each saved GeckIt computer, "Connect computer" and "Manage computers"; "Settings" at the bottom. Tasks is marked current and the board shows as before |
| D-02 | H, LD | 1180 px | Choose each item in turn | Its place fills the content area; only that item is marked current (bold, accent icon, `aria-current="page"`); the status bar stays visible below |
| D-03 | A | Manager shown | Quit and reopen the app | Manager is shown |
| D-04 | A | The kept place is `host:build-box`, saved by an earlier build | Quit and reopen | Tasks is shown |
| D-05 | H | Tasks, a conversation open, a draft typed, the list scrolled | Choose Team, then Tasks | Same conversation, same draft, same scroll, same view and filters |
| D-06 | H | Tasks shown | Look at the board's top bar | Board/List, Filters, Search, New task. No computer selector. No Shortcuts, Team, Manager, gecko, Settings or Questions control. The status bar has no Manager portrait |
| D-07 | H, LD | 3 conversations wait, 1 general question waits | Look at Tasks | Count "3"; its tooltip and spoken name "3 conversations waiting for you"; the question is not counted |
| D-08 | H | 1 conversation waits | Look at Tasks | Count "1", "1 conversation waiting for you" |
| D-09 | H | 120 conversations wait | Look at Tasks | Count "99+" |
| D-10 | H, LD | Manager shown, Manager on | Look at the page | Manager's chat with its threads beside it, the composer and a settings button; the window can be dragged by the page header |
| D-11 | H | Manager off | Open Manager | "Manager is off" text with "Set up Manager" |
| D-12 | H, LD | Questions shown, 2 questions | Look, then open one | The list with "Ask a question" and Cmd+Shift+N in the header; opening a question shows it on Tasks in the conversation pane |
| D-13 | H | Questions shown | Press Cmd+Shift+N, type, send | The form opens over the Questions page, not behind it |
| D-14 | H, LD | Team shown | Press Escape, click empty space | Team stays; no Back button |
| D-15 | H, LD | Shortcuts shown | Press Escape; open a shortcut and close its editor | The list stays; no Done button; the editor opens and closes over the page |
| D-16 | H, LD | Checklists, Browsers, Secrets shown in turn | Look at each | Each section's content in a centred column; the Browsers page is titled "Browsers" |
| D-17 | H, LD | Settings shown | Look at the section list | No Checklists, Browsers or Secrets in it; Hosts is; "Keyboard shortcuts (Cmd+/)" below |
| D-18 | H, LD | Two saved computers, "Studio Mac" and "office-mini"; this computer shown | Look at the Computers group; press "Connect computer" from Secrets | "This computer" marked, spoken "This computer, shown", then "Studio Mac", "office-mini", "Connect computer", "Manage computers"; Connect computer shows Tasks with "Connect a computer" over it |
| D-19 | H | No saved computers | Look at the Computers group | "This computer" and "Connect computer" only |
| D-20 | H | 12 saved computers, window 760 px tall | Scroll the sidebar | The middle scrolls; Settings stays at the bottom |
| D-21 | H, LD | 820 px | Look at the sidebar | Icons only (52 px), each with its name as tooltip; saved computers as monograms "SM", "OM"; the Workspace and Computers headers become thin lines |
| D-22 | H | 820 px | Press Cmd+Ctrl+S, then choose Secrets | Names open over the content without moving it; choosing Secrets closes them and shows Secrets; clicking the content also closes them |
| D-23 | A | 1180 px | Press Cmd+Ctrl+S, quit and reopen | Names stay hidden (rail); Cmd+Ctrl+S shows them again |
| D-24 | H | 1180 px | Hover the names button | "Hide names (Cmd+Ctrl+S)"; in the rail "Show names (Cmd+Ctrl+S)" |
| D-25 | H | Any place other than Tasks | Press Cmd+N | Tasks shows and New task opens |
| D-26 | H | Any place | Press Cmd+, then Cmd+J then Cmd+P | Settings, then Shortcuts, then Tasks with the switcher |
| D-27 | H | Gecko hidden | Look at the sidebar footer | "Show the gecko" item; pressing it brings the gecko back and the item goes |
| D-28 | H, LD | 1180 px | Tab through the sidebar | Each item takes focus in order with a visible ring; Enter or Space chooses it; with another place shown, focus does not reach the board underneath |
| D-29 | H | Any | Read with VoiceOver's rotor or the accessibility tree | Items are buttons with their names; the current one is `aria-current="page"`; the count and dots have spoken names; no state is colour only |
| D-30 | H | Tasks and Manager | Switch places 10 times and record a performance trace | Each switch draws on the next frame; returning to Tasks does not re-read the conversation list (per `docs/performance.md`) |
| D-31 | H, LD | "Studio Mac" shown, connected | Look at the Computers group; press "This computer" | "Studio Mac" marked with a green dot, spoken "Studio Mac, connected"; one sidebar only; pressing This computer asks the workspace to switch back |

## Phone

| ID | Env | Precondition | Steps | Expected |
| --- | --- | --- | --- | --- |
| P-01 | H, LD | 390 x 844 | Open the app | No tab bar; Tasks with a Menu button (three lines) at the left of the bar, then the working count, Search, Say it, The host's screen, New task |
| P-02 | H, LD | Tasks | Press Menu | A 300 pt panel slides from the left over a dimmed screen: "Tasks" with the count, "Manager", "Questions"; "Workspace": "Team", "Shortcuts", "Checklists", "Browsers", "Secrets"; "Settings" at the bottom; Tasks marked |
| P-03 | H | Menu open | Tap the dimmed area | The menu closes; Tasks unchanged |
| P-04 | H, LD | Menu open | Choose each place in turn | The menu closes and the place shows with its own Menu button; pushed pages inside a place show Back with the name of the page they return to instead |
| P-05 | H | Settings shown, 1 conversation waits | Look at the Menu button | Amber dot; spoken name "Menu, a conversation is waiting for you" |
| P-06 | H | Tasks shown, a question has an unread answer | Look at the Menu button | Accent dot; "Menu, a question has an answer" |
| P-07 | H | Settings shown, both hold | Look at the Menu button | Amber dot (waiting first) |
| P-08 | H | Tasks shown, nothing waits | Look at the Menu button | No dot; "Menu" |
| P-09 | H, LD | Tasks | Press Search, type a word, press Back | The search page with Back "Tasks"; matches show; Back returns to the board as it was |
| P-10 | H | Manager on | Look at the board | No Manager row at the top of the list |
| P-11 | H, LD | Manager shown | Look | Title "Manager", a gear for Manager's settings, the chat |
| P-12 | H, LD | Settings shown | Look at the groups | No Team, Shortcuts or Web Browser; a "Channels" group with Telegram, Slack, Discord, each with its state and a switch; the note "Where Manager can be written to besides this app. Each thread shows on Manager." |
| P-13 | H | Telegram connected | Turn its switch off | The row says Off; Slack not set up shows "Set up on the computer" with the switch disabled |
| P-14 | P | Paired with the computer | Turn a channel off and on from the phone | The computer's Settings > Channels shows the same state |
| P-15 | H, LD | Secrets shown | Look, then remove one | The list of secrets with no value shown; removing asks first and then drops the row |
| P-16 | H | Secrets shown | Try to add a secret | "Manage secrets on the computer." |
| P-17 | H, LD | Team, Shortcuts, Checklists, Browsers shown in turn | Look at each | Each fills the screen with Menu in its bar and its own add button where it has one; the Browsers page is titled "Browsers" |
| P-18 | H | Menu open, reduced motion on | Open and close the menu | It appears and goes without sliding |
| P-19 | H | Any place | Quit and reopen the app | The same place shows |
| P-20 | H | Menu open | Swipe from the left edge on Tasks | Nothing extra happens (swipe-to-open is deliberately absent) |

## Out of scope for these cases

- Manager's threads list on the phone and a channel's own page (Set up, Allowed people): the UX document describes them, the implementation does not have them yet; P-11 and P-12 check what exists, and their absence is recorded as a gap, not a pass.
