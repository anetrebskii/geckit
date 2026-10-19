# Manager and Telegram V1 verification

Date: 2026-10-17. Local branch: `feature/011-manager-telegram`. This record covers source implementation, isolated runtime tests, compiled CLI transport and the actual renderer with a fixture native boundary. It does not establish released support or live account integration.

## Delivered scope

One special Manager session on any enabled builtin or library provider coordinates current and future registered projects across profiles. Manager instructions accompany normal provider messages; existing authentication, tools and permissions remain authoritative. The role is not claimed as a universal provider sandbox. Its role-defined application interface is the authenticated GeckIt CLI: provider/model discovery, project registration/preferences, confined local file operations, managed worker start/read/follow-up/stop/status and confirmed attachment/question handling. Worker routing is task override, saved project preference, then configured default; disabled or incompatible selections block without replacement. Automatic delegation is the default; approval for each new worker is optional.

Current direction is Telegram-only: Desktop Settings retains assistant/model/delegation, connection status and lifecycle recovery; no Desktop/phone Manager conversation or backing-session navigation is exposed. Ordinary managed workers remain accessible in existing GeckIt UI. Telegram uses a dedicated personal bot, temporary pairing plus exact desktop account confirmation, private sender checks, protected local credentials, task-bound actions and explicit delayed/uncertain delivery handling. Earlier conversation UI evidence below is historical and superseded by the Telegram-only follow-up.

Unsupported advanced CLI mutations and remote file management are returned by capability discovery. Claude, Codex and enabled libraries can run Manager through their normal session runtime. A confirmed provider change replaces the backing session with durable context while retaining workers, pending input and decisions; disabled/unavailable providers never trigger substitution.

## Automated and CLI evidence

Initial V1 integrated checks passed: `npm run typecheck`, `npm run lint`, `npm test` (1,025 tests across 76 files), Desktop `npm run build` and mobile `npm run build`. The mobile build retains its existing large-chunk warning. The full suite used approved local filesystem/socket access; an earlier sandboxed settings-watch test failed with native `EMFILE`, then passed in the final full run. Eight new persistence tests use real temporary files and fresh module loads, with only `fs.watch` replaced by an inert observer. They verify project preferences/profile membership, synchronous Manager role/ownership persistence and failure atomicity. Earlier implementation failures were fixed before rerunning: Manager role metadata was dropped by ordinary question-session handling, test temporary paths needed realpath normalization, and node-only test compilation initially imported a renderer hook. Those initial checks inspected retained-session restrictions; the later enabled-provider correction below supersedes the initial Claude-only tool-isolation design.

The built `client/out/main/cli.js` was executed with literal file-command arguments against a temporary local Unix socket. Exact argument/session/operation transport passed; shell metacharacters stayed data and the token did not appear in stdout. This used a fixture receiver, not a running personal GeckIt account. The sandbox initially blocked socket listening; the same isolated check passed with the supported local-socket permission. No real project/file mutation or external message was performed by that smoke check.

## Initial actual renderer review (superseded conversation surfaces)

Reviewed production Chat/Transcript/Composer/navigation/Settings components in Chrome using `manager-preview.html`. Only the Electron/provider/Telegram boundary was substituted. This differs from the earlier standalone design prototype. Both themes were visually inspected in full-screen context: Desktop 1280x800; phone 390x844 and compact 320x740. Temporary viewport overrides were reset.

| Interaction | Observed result |
| --- | --- |
| Desktop entry and setup | Manager sidebar/top-bar entry opens Settings. Explicit model selection and Enable open the actual backing fixture session. The initial review had Codex disabled by an execution-restriction gate. That gate is superseded by the enabled-provider review below. |
| Conversation | Existing transcript and dedicated text composer used; desktop Enter sends. Shell, file attachments, ordinary provider/mode/model/goal controls are absent from the manager composer. |
| Session info | Backing ID, actual model, counts, available telemetry and CLI activity visible. Escape closes and restores Session info focus. Restart confirmation replaces backing ID while retaining the managed worker. |
| Pause and queue | Pause keeps worker state. Phone Send accepts the message, clears the draft and displays the queued count. Resume clears the fixture receipt; real durable dispatch is covered separately in runtime tests. Phone Enter retains mobile text-entry behavior. |
| Recovery | Provider failure shows its reason and Try again. Successful fixture recovery clears the blocked notice. |
| Disable/history | Confirmation disables Manager; worker stays. Navigation reopens retained transcript, shows disabled status and prevents Send even with a nonempty draft. |
| Telegram setup | Empty token focuses validation; rejected fixture token shows recovery. Dummy token reaches pairing, Open Telegram simulates candidate arrival, exact account confirmation connects. Disconnect cancellation preserves the connection. No token was sent to Telegram. |
| Phone settings | A discovered Desktop two-column dialog defect was fixed by using the existing phone sheet. Read-only assistant/model/scope and pause are readable at 320px, with no credential entry. |
| Long lists | Thirty workers, twenty decisions and thirty transcript updates remain scrollable. At 320x740, document width stays 320px and composer bottom stays at 740px. Session dialog/actions fit inside viewport. |
| Worker origin | Managed task opens the worker and its origin control returns to Manager using the actual backing parent ID. After restart, the retained worker still points to the old ID; its durable Manager ownership routes back to the new current backing session. The dialog shows the replacement session ID and one retained worker. Pure helper regressions also preserve ordinary parent navigation. |

Screenshots: [Desktop dark](evidence/implementation/manager-desktop-dark.png), [phone light](evidence/implementation/phone-manager-light.png), [phone session dark](evidence/implementation/phone-session-dark.png), [compact long list light](evidence/implementation/phone-many-light.png), [compact settings dark](evidence/implementation/phone-settings-compact-dark.png), [Telegram connected dark](evidence/implementation/telegram-connected-dark.png), [worker origin after restart](evidence/implementation/worker-origin-restarted-dark.png).

## Enabled-provider follow-up (before Telegram-only correction)

Alex requested every enabled provider and clarified that Manager is a special GeckIt session. The Claude-only adapter gate and tool restrictions have been removed. Provider-qualified session creation, authentication, model discovery, permission mode and ordinary provider tools use the existing Sessions runtime. Manager instructions are prefixed to ordinary request text so libraries do not need a new optional context API; exact internal context is removed at native history ingress while the visible user message remains intact.

Final integrated checks pass: full node/web typecheck, source/test lint, **1,038 tests across 76 files**, Desktop production build and mobile production build. The mobile large-chunk warning remains. The 317 focused Manager/Sessions/Codex tests include the actual builtin Codex adapter against an RPC fixture and an injected library contract: first/resumed session IDs and models, ordinary permission mode, role context/history normalization, selected-provider failure/retry without fallback, worker/decision/inbox retention, and delayed create/send/model outcomes during switch or disable. No model inference call was made. The checked tmux library source accepts normal message text; no external library was modified. Nine Manager UI tests plus transcript/navigation checks pass (46 targeted tests).

Additional actual-renderer review used the same fixture native boundary, at Desktop 1280x800 and phone 390x844/320x740, in both themes:

| Interaction | Observed result |
| --- | --- |
| Enabled assistant selection | Claude, Codex and library fixture are selectable. Changing provider resets to Provider default; only that provider's models are listed. Initial Codex setup with an explicit GPT fixture model opens the Codex backing session. |
| Confirmed replacement | Save opens the assistant-change confirmation and warns that an active turn will stop. Escape cancels and restores Save focus; existing backing assistant remains. Confirmed Codex and library replacements preserve worker and pending decision. |
| Actual session identity | Header and Session info show actual Codex/library provider, model and qualified backing ID. Worker keeps its original provider. Phone library summary/settings and compact Codex session details remain readable. |
| Failed replacement | The selected Codex configuration remains saved, old session is archived, no active backing session remains, and Settings shows the failure over Tasks. Reopening Manager offers recovery without fallback; explicitly selecting Library creates the replacement and retains worker/decision state. |
| Empty/disabled choices | No enabled providers shows the Assistants recovery message and disables Enable. Disabled saved choices retain their name and cannot be saved until explicitly replaced or restored (component tests). |
| Initial model discovery | Browser review found a same-provider initialization effect clearing an already loaded catalog. The effect now preserves completed discovery. Rechecked initial Claude model menu, no-provider recovery, and initial saved Codex model menu/Enable; none remains stuck loading. |
| Compact layout | At 320x740 with thirty workers and twenty decisions, document width remains 320px. Session actions fit; lists scroll. Temporary viewport override was reset after review. |

Screenshots: [change confirmation dark](evidence/implementation/provider-change-confirm-dark.png), [Codex conversation dark](evidence/implementation/manager-codex-dark.png), [initial Codex setup result](evidence/implementation/manager-codex-initial-dark.png), [library conversation light](evidence/implementation/manager-library-light.png), [phone library light](evidence/implementation/phone-library-light.png), [compact phone Codex identity](evidence/implementation/phone-codex-session-dark.png). These establish rendered behavior with fixtures, not live provider/account or Telegram integration.

## Telegram-only follow-up

Alex removed the need for a Desktop or phone Manager conversation. Manager now exposes only Desktop Settings setup, assistant/model/delegation, Telegram connection and lifecycle recovery. Conversation and task-bound decisions stay in Telegram. Current and archived backing sessions are excluded from ordinary lists, search, hidden conversations, history and routes; public Manager open/send/answer APIs were removed. Ordinary managed workers retain their normal conversation UI. A Manager provider permission or elicitation request blocks with Settings recovery instead of exposing a native conversation or approving it automatically.

Final integrated checks pass: node/web typecheck, full lint, **1,041 tests across 76 files**, Desktop build and mobile build. The existing mobile large-chunk warning remains. Focused runtime coverage passes 319 Manager/Sessions/Codex tests; Telegram passes 17 fake Bot API tests; affected renderer coverage passes 73 tests. Fixtures exercise Codex RPC, injected Claude/library drivers and local CLI socket transport, without live inference. Hidden-role discovery, stale current/archived reads/sends, ordinary-worker access, native-request recovery and stale observer generation guards are covered.

Production renderer components were reviewed through the fixture native boundary in Chrome at Desktop 1280x800 light/dark and phone 390x844 light / 320x740 dark. Temporary viewport overrides were reset.

| Interaction | Observed result |
| --- | --- |
| Removed entry points | Desktop Board/navigation and phone Tasks/Settings contain no Manager chat destination. Ordinary workers remain visible and open normally, without a link to the hidden Manager parent. |
| Stale session route | An unseen archived Manager ID rejected with Electron IPC-prefixed Telegram guidance returns to the ordinary Board without transcript or composer. A legitimate unlisted worker still opens its history and sends/receives a fixture reply. |
| Setup and provider change | Enabled Claude/Codex/library choices remain. Save confirmation cancellation restores Save focus; confirming the provider/model change stays in Settings and updates current assistant/model. |
| Lifecycle and recovery | Pause/Resume preserve the worker. Restart cancellation restores focus; confirmation stays in Settings. Library fixture Try again clears the blocked state in Settings. Disable shows the disabled status and Enable control while the worker remains usable. |
| Telegram | Dummy-token pairing, exact fixture account confirmation and Connected state work; disconnect cancellation preserves the connection. Browser fixtures do not prove native access revocation; runtime tests cover that boundary. |
| Layout and keyboard | Full-context light/dark Settings, scrolling to Telegram/footer, modal focus and compact ordinary-worker layout reviewed. A dangling CSS selector discovered during review was fixed and rechecked. Compact worker document measures 321px at a 320px viewport with no visible control clipping; this existing ordinary composer was not redesigned. |

Screenshots: [Desktop Settings dark](evidence/implementation/telegram-only-settings-dark.png), [Desktop Settings light](evidence/implementation/telegram-only-settings-light.png), [ordinary worker on compact phone](evidence/implementation/telegram-only-worker-phone-dark.png). Browser evidence uses fixture account/provider data; no real Telegram token, external message or model call was used.

## Performance review

Existing Board/PhoneRow memoization is preserved. Manager is a singleton Settings surface; dedicated Manager transcript/header/worker-list UI has been removed. Public session filtering uses durable role metadata, while internal coordination retains its full session view. Worker changes wake Manager through events; there is no idle model polling. Model discovery runs on setup/provider change/retry. Activity/report payloads are bounded; the durable operation-ID/fingerprint ledger grows to preserve restart deduplication. The phone bundle is rebuilt. This is a code/renderer review, not a production CPU or latency benchmark; large-account performance targets remain unmeasured.

## Acceptance boundaries

- US1/US2: session-role, provider adapter/creation, CLI/routing/worker and UI evidence is isolated. No real Claude or Codex task was submitted, no subscription/account eligibility certified, and no two-project live worker trial was performed.
- US3/US4: fake Bot API plus temporary credential-store contracts exercise pairing, authorization, decisions, late input and uncertainty. No BotFather token, real Telegram sender, installed secure credential store or live bot was used.
- US5/US6: fresh-store restart, duplicate effects, uncertainty, revocation and routing are runtime acceptance checks. Model compaction and real provider/session recovery across a production restart remain unverified.
- SC-001/005 timing targets, full ten-task live recovery, real provider concurrency/VPN behavior, native permission interaction, physical phone keyboard/device and installed Electron behavior remain unverified.
- Full FR-032 coverage is deliberately deferred: profiles/favorites/schedules/libraries/hosts and other settings mutations require the existing UI. No full-spec or all-success-criteria completion is claimed.

No application restart, installation, real bot connection, commit, push or publication is part of this delivery. Unrelated working-tree changes are preserved. The feature list awaits Alex's response to the exact proposed entry.

## Telegram approvals, formatting and guided setup - 2026-10-19

This amendment supersedes the earlier native-approvals-in-GeckIt-only behavior. Supported pending cards from managed workers and the current hidden Manager session are projected into the paired private Telegram conversation. Permission/plan cards and listed question choices retain native answers; eligible empty elicitation supports Decline, Allow once and Allow for this session when the provider offers remembering. Unsupported typed/URL/error/oversized cards have no approval buttons and retain explicit native UI/recovery guidance. `/status` refreshes current decisions without asking the model. The model and GeckIt CLI cannot approve native permissions.

### Runtime acceptance

The focused suite passes **347 tests** (Manager 36, Telegram 21, Sessions 216, Codex 74). This includes a paired fake Bot API -> Manager -> real Sessions -> injected native-driver case proving the exact empty-content remembered elicitation payload. Existing Codex RPC tests prove identical-request auto-acceptance within the live remembered grant and its lifecycle reset. Request identity includes session, native request nonce/body hash and Manager lifecycle epoch. Tests cover same-object reissued requests, changed/answered cards, concurrent duplicate clicks, provider switch/restart/disable, unauthorized senders, ownership/provider eligibility, async guard refusal and authorization revocation during that guard. Refusal keeps the live request actionable and sends no success; consumed answers alone produce success. Live native callback state is not persisted as durable Manager history; stale saved Telegram tokens cannot resurrect it.

Formatting regressions reproduce actual Manager aggregation, removal of hidden CLI blocks, leading/trailing blank lines, excessive blank prose gaps, empty-only output, chunk-edge newlines and Unicode boundaries. Outgoing normalization retains meaningful paragraph separation, indentation and fenced-code whitespace. The screenshot's historical raw payload is unavailable, so its exact original cause is not established; old Telegram messages are not edited.

### Actual renderer acceptance

Production `ManagerTelegram` and Settings components were inspected in Chrome with the existing preview's native/Telegram boundary fixtures. Light and dark themes were visually reviewed in full-window context at 1280x800 and 900x700. The guide, masked input, account confirmation and replacement state remain inside the existing scrollable Settings pane with no horizontal overflow. Setup focus scrolls the current controls into view. Keyboard cancellation retains Settings and restores the initiating control. Temporary viewport overrides were reset.

| Interaction | Observed result |
| --- | --- |
| New bot | Connect Telegram opens compact numbered guide with official BotFather, `/newbot`, unique username ending in `bot`, then I have the token |
| Existing bot and token | Shortcut skips creation; password input masks the token, describes protected local storage, and keeps invalid token editable for retry |
| Cancellation | Escape cancels local setup and an in-flight slow check; restores Connect/shortcut/Replace token focus, without closing Settings or replacing the existing connection |
| Pairing | Open Telegram simulates Start and shows exact fixture name, username and account ID; Connect account reaches Connected |
| Wrong account / disconnect | This is not me returns to the prior connection; cancelling disconnect keeps it connected |
| Recovery | Revoked token and storage failure retain Replace token; conflict/offline show Try again and recover through fixture results |
| Layout | Full-context light/dark guide/token/confirmation reviewed; scrolling, footer, focus visibility and 900px/1280px document width checked |

Evidence: [light guide](evidence/telegram-setup-guide-light.png), [compact dark guide](evidence/telegram-setup-guide-dark.png), [desktop token](evidence/telegram-token-dark.png), [rendered approval states](evidence/telegram-approval-states.svg). A browser-extension prompt interrupted token review; a fresh state query and preview tab recovered it. No personal credential was entered or transmitted.

### Integrated checks and boundaries

**1,074 tests across 80 files pass**, plus node/web typecheck, package lint, Desktop production build, mobile production build and diff whitespace checks. The mobile build retains its existing chunk-size warning. Mermaid state diagram parsed, rendered and was visually inspected. Performance review found no added polling, timers or per-row work: requests use existing session events; setup is a singleton Settings surface; native hashing is confined to pending cards, and outgoing messages remain bounded. These are code/fixture observations, not production CPU or latency measurements.

A shared bot is technically possible but requires a hosted receiver with authenticated account-to-computer routing; no relay is implemented or deployed. This version guides personal-bot setup. Live Telegram callbacks/account pairing, real provider inference, Mail access, installed secure storage and installed Electron/device flows remain unverified. No app restart, installation, commit, push or release occurred. Existing unrelated changes remain intact. The feature-list entry is awaiting Alex's response.

Day-plan task was moved to `#inreview` with this evidence. Whole-file day-plan validation reports an unrelated concurrent task at line 576 using unsupported `#done` and missing a `Done` proof line; that other session's task was preserved. No validation error points to the GeckIt task.


## Desktop Manager session inspection - 2026-10-19

Alex requested deliberate access to the Manager session from the bottom bar. This supersedes the earlier blanket removal of Desktop inspection. Telegram remains the task/decision channel; the new Desktop dialog is read-only and uses the actual current provider-backed transcript rather than an activity-log imitation. It shows assistant, reported model, backing ID, status and queued/error state, with Manager Settings recovery. Opening it never enables or starts Manager. Retained disabled history remains inspectable; first setup opens Settings.

### Runtime and boundary checks

Manager tests exercise current-only reads, retained disabled/provider-disabled history without provider startup, ordinary/archive rejection, late-read replacement rejection, private current-session events, role-instruction and hidden CLI-block stripping. Old saved role-prefix versions remain redacted after instruction changes. Ordinary session discovery/send/read guards remain; dedicated IPC accepts only the current Desktop Chat webContents and sends item events only there. No phone peer handler or general tell channel exposes inspection. Transcript checks preserve request details while hiding answer/form, handoff, shell input/stop, resend/continue/retry, background and task mutation controls; ordinary worker controls remain.

All **1,079 tests across 80 files pass**, plus node/web typecheck, actual package ESLint, Desktop production build, mobile production build and diff whitespace checks. The mobile build retains its existing chunk-size warning. Tests use real Sessions with injected native drivers, temporary persistence and local IPC fixtures; no live model request was sent.

### Actual renderer acceptance

Production Chat, bottom status bar, ManagerInspection and Transcript were exercised in Chrome using the existing preview's native boundary fixtures. Full-context light/dark layouts were visually inspected at 1280x800 and 900x700; no horizontal overflow was observed. Temporary viewport override was reset.

| Interaction/state | Observed result |
| --- | --- |
| Bottom-bar entry | Manager plus current status opens the real read-only transcript with assistant/model/ID; setup has one Set up Manager label and opens Settings without creating a session |
| Worker preservation | First click overlays an open worker, close/Escape restores footer focus and preserves worker selection plus unsent draft; ordinary native permission and shell controls remain |
| Keyboard | Tab/Shift+Tab remain in the dialog; Meta+. is isolated so it cannot stop the underlying worker; Escape dismisses only the inspector |
| Read-only details | Tool folds expand into actual output; native request details and requested task summary remain readable, while all mutation controls are absent |
| Empty/error | Empty history has Telegram guidance; first-read error shows Try again and retry loads history |
| Live loading | Event arriving before a delayed initial read is retained after history resolves |
| Replacement | A new current ID replaces the displayed identity/history; the delayed old read cannot overwrite it |
| Disabled | Retained session opens with Manager disabled. History is kept.; opening does not enable it |
| Long history | 650-entry fixture initially renders 303 turns including pinned requests; Show earlier adds 300 with internal keyboard scrolling and no window overflow |
| Settings | The header gear closes inspection before opening the existing Settings section |
| Phone | Actual phone Board fixture contains no Manager footer or inspection entry; ordinary worker remains present |

The browser review found and fixed the first-click interception by the worker scrim, duplicate setup wording and missing disabled-history explanation; affected interactions were rerun successfully. Evidence: [dark inspector](evidence/manager-inspection-dark.png), [light inspector over retained worker](evidence/manager-inspection-light.png), [rendered state diagram](evidence/manager-inspection-states.svg). Mermaid parsed/rendered and was visually inspected.

Performance review: inspection is a singleton event-driven surface, uses existing bounded Transcript pagination/memoization, subscribes only while open, buffers initial-read events and rejects stale IDs/attempts. There is no polling or added per-row work. This is source/fixture evidence, not a production latency benchmark.

Live Telegram/provider inference, real account permissions, native installed Electron behavior and physical device flows remain unverified. No installed-app restart, installation, commit, push or release occurred. Existing unrelated edits remain preserved. Day-plan task is in review. Whole-file validation reports unrelated concurrent tasks at lines 576 and 578 using unsupported #done and missing Done proof; those tasks were preserved. No validation error points to this GeckIt task.

## Guided Manager setup - 2026-10-19

Settings > Manager now asks its four answers in order: choose the assistant, decide how work starts, connect Telegram, turn Manager on. A later step is locked until the earlier one is answered, and Manager cannot be enabled while Telegram is unconnected, which was previously possible and produced an enabled Manager with no way to reach it. Above the steps, a three-node picture of Telegram, Manager and workers lights the parts the open step is about and moves a mark along the direction that step adds, twice, and then rests; the sentence under it carries the same meaning when motion is off. UX description: [docs/ux/manager-telegram.md](../../docs/ux/manager-telegram.md#guided-manager-setup---2026-10-19), [rendered state diagram](evidence/manager-setup-states.svg).

`npm run typecheck`, `npm run lint` and `npm test` (1,081 tests across 80 files) pass. Two renderer tests were added: the first setup keeps steps 2-4 locked with their exact reasons, offers no Enable control, and shows the open step's explanation; an enabled Manager keeps "Manager is on" with its lifecycle controls and no locked Telegram line. One existing fixture worker title was renamed from "Worker" to "Add provider preferences" so the "no worker list in Settings" assertion is not satisfied by the picture's "Workers" label.

Reviewed in Chrome against the actual renderer through `manager-preview.html`, with only the Electron/provider/Telegram boundary substituted. No real bot token, Telegram account or provider was contacted; the token typed into the fixture was the literal string `fixture-token`.

| Interaction | Observed result |
| --- | --- |
| First setup, light | Step 1 open with Assistant and Model, Continue off while models load; steps 2-4 locked with "Choose the assistant first.", "Decide how work starts first." and "Connect Telegram first." |
| Continue through the steps | Each answered step collapses to its value with a check and a pencil; the next opens; the picture follows the open step and its sentence changes with it |
| Approve new sessions | All three nodes light and the travelling mark stops between Manager and workers for 0.8 s of its loop, matching "Manager asks you in Telegram before each new worker starts." |
| Telegram step | Existing bot setup inside the step; its three parts fill their rail as they pass. Fixture token reaches pairing, Open Telegram produces the candidate, confirming the account answers the step and opens the last one |
| Turn Manager on | Last step lists assistant, model, delegation, bot and account, and "All projects, current and future, across every profile."; Enable Manager turns it on and the step becomes "Manager is on" with Status, Current assistant, Current model, Projects and the existing Save changes, Pause, Restart session and Disable Manager |
| Reopening an answered step | Opens with Save changes and Done while the running panel stays open; the picture follows the reopened step |
| No enabled assistant | Step 1 open with "Enable an assistant in Assistants to set up Manager.", Continue off, every later step locked |
| Dark theme | Lit badges, step marks, checks and the running panel read correctly on the dark tokens |
| Reduced motion | With the mark and rings removed, the picture still reads as three connected parts and its sentence is unchanged |
| Narrow column | At a forced 430px dialog (about half the real width) the pane has no horizontal overflow: step titles wrap by word, values ellipsize, node names truncate under their icons |

Three defects Alex saw in the first build are fixed and re-reviewed. The explanation under the picture stretched the full width and wrapped to a one-word last line; it is now capped at 44ch, centred and set with `text-wrap: balance`, so every caption lands on two lines of similar length. The travelling mark painted over the node faces, because an absolutely positioned element paints above static siblings and the lit badge fill is translucent in the dark theme; the nodes now take their own stacking level and their lit fill is opaque, so the mark passes behind a node instead of across its icon. The node names were as large as the sentence under them and read as a fourth label; they are 11px, leaving the sentence as the thing to read.

Reviewed against `docs/performance.md`. The travelling mark first animated `inset-inline-start`, which is not composited; it now moves a rail-wide carrier with `transform` and `opacity` only, and the node rings already used those. The carrier's box leaves the stage when it slides, which added 139px of horizontal overflow to the settings pane; the stage clips it with `overflow: clip` and a 16px clip margin, measured to be wider than the rings at their largest, and the pane's scroll width then equals its client width. Every loop runs only while Settings is open on Manager, which is the only time the pane is mounted. `npm run build` passes.

A fourth defect Alex saw is fixed and re-reviewed: the Telegram step in the connected state. The status used the shared settings row, so a hairline ran through the middle of the step; the account was a loose full-size sentence; the step's Done landed below the privacy disclosure, giving button, disclosure, button. The state, the bot, the account and any reason the state carries are now one card at the top of the step, with a dot in the state's tone; the identity lines are 12px and quiet; Done shares the row with Disconnect; and the privacy note is an 11px disclosure in the house style, last in the step. Disconnect and Disable Manager now take the danger colour, which the Manager panel never opted into, because Done sitting beside Disconnect made two identical buttons. Re-checked in both themes for connected, not connected and a revoked token, and at a forced 420px dialog, where the pane's scroll width equals its client width and an unbreakable bot username wraps inside the card.

Screenshots: [first step, light](evidence/manager-setup-step-light.png), [locked steps, light](evidence/manager-setup-locked-light.png), [Manager on, dark](evidence/manager-setup-running-dark.png), [Telegram step connected, dark](evidence/manager-setup-telegram-dark.png).

A fifth defect Alex saw is fixed: the picture never stopped moving. All four animations were `infinite`, so a step being read always had movement above it, which `docs/performance.md` asks against even for an animation that is not seen. Each now plays twice and rests, and the replay is free because opening another step or changing an answer swaps which animation applies. The Manager ring no longer breathes on the last step, where it ran at 2.2 s against the mark's 4.8 s and the two drifted out of phase indefinitely. Measured in Chrome through the computed style and `document.getAnimations()` rather than by eye:

| Step | Measured |
| --- | --- |
| Choose the assistant | The Manager ring runs `manager-flow-boot` for 2.2 s, iteration count 2, and the mark has no animation |
| 5.2 s after that step opened | `document.getAnimations()` reports nothing running: the pane is still |
| Decide how work starts, Approve | The mark runs `manager-flow-ask` and the Telegram ring `manager-flow-boot`, both 3.2 s and both twice, so they stay in phase with each other |
| Connect Telegram | `manager-flow-ping`, 3 s, twice; nothing is running 6.4 s later |
| Turn Manager on | `manager-flow-loop`, 4.8 s, twice, and no ring animation on any node |

A sixth defect, found by measuring rather than by eye: two of the setup's own rules were losing to `.dialog p`, which sets the `margin` shorthand at a higher specificity and so dropped every margin they declared. The sentence under the picture had `margin-inline: auto` taken away and sat 79px left of centre under a centred picture, and its 14px gap above became 14px below. The locked step's reason had `margin-inline-start: 32px` taken away and sat under the step's number instead of under its title. Both rules are now named twice, `.manager-flow .manager-flow-say` and `.manager-step .manager-step-locked`, with a comment saying why, and both declare the margin as one shorthand so a future override is all-or-nothing rather than partial.

| Measured through CDP matched styles | Before | After |
| --- | --- | --- |
| Centre of the sentence against the centre of the picture | 708 against 790 | 790 against 790 |
| Computed `margin-inline` on the sentence | `0px` both sides | `82.45px` both sides, from `auto` |
| Locked reason's inline start | Flush with the step's number | 32px, aligned under the step's title |
| Every `p` in the dialog whose own rule declares a margin | Two clobbered by `.dialog p` | None |

Not covered: a real BotFather bot, a real Telegram account and a real provider session; the forced-narrow check used an inline width override, not a real window size; the last two steps were measured by setting the picture's step class directly, since reaching them for real needs a token and an account.

## Telegram messages and the Manager panel - 2026-10-19

What GeckIt sends to Telegram is now rendered as Telegram HTML instead of being handed over as raw markdown: bold, italic, strikethrough, inline code, fenced code with its language, links, quotes, bullets and checkboxes all arrive shaped, a markdown table arrives as a monospace block whose columns line up, and a quote over ten lines arrives folded. A question that has been answered keeps its words and loses its buttons, acknowledgements are replies to what they acknowledge, the bot fills Telegram's own command menu and profile line, and `/status` lists each worker with what it is doing. The Manager panel opened from the bottom bar replaces its three-row list with a state dot beside the title, one line of facts and a quiet session id, and centres its loading, empty and failed bodies instead of leaving a sentence in the corner of an empty window. UX description: [docs/ux/manager-telegram.md](../../docs/ux/manager-telegram.md#telegram-messages-and-the-manager-panel---2026-10-19), [rendered state diagram](evidence/telegram-send-states.svg).

`npm run typecheck`, `npm run lint`, `npm test` (1,092 tests across 81 files) and `npm run build` pass. The renderer is a new module, `client/src/main/telegram-render.ts`, with its own eight tests in `client/test/telegram-render.test.ts`; three tests were added to `client/test/telegram.test.ts`, driven by the existing fake Bot API.

| Checked through the fake Bot API | Observed result |
| --- | --- |
| A message with a heading, bold and inline code | `sendMessage` carries `parse_mode: HTML` and `<b>Done</b>\n\n<b>Shipped</b> the fix in <code>useChat.ts</code>.` |
| Telegram answers 400 to the formatted send | The same message is sent again without `parse_mode`, carrying the markdown as Alex's Manager wrote it, and is not refused twice |
| A fenced block with a language | `<pre><code class="language-ts">`, with the indentation inside it unchanged, which the existing whitespace test now asserts |
| The account is confirmed | `setMyCommands` carries status, pause, resume, settings and help, and `setMyShortDescription` follows |
| An instruction arrives | Its acknowledgement carries `reply_parameters` pointing at that message |
| A question is answered through its button | `editMessageReplyMarkup` empties that message's keyboard, and "Answer sent." replies to the question |
| A guard refuses the answer | Unchanged: the recovery line is sent, the decision is restored and its buttons stay (the existing native Computer Use test) |
| A tap on a question that is gone | Its keyboard is emptied and the existing explanation replies to it |
| A 7,000-character line, and a 4,000-character bold run | Each message stays within 3,500 characters of markup, no tag and no surrogate pair is split, and the parts join back to what was written |

The rendered output for a realistic Manager answer and for `/status` is recorded in [evidence/telegram-message-html.txt](evidence/telegram-message-html.txt), produced by running the module itself rather than written by hand.

The Manager panel was reviewed in Chrome against the actual renderer through `manager-preview.html`, with only the Electron and provider boundary substituted.

| Interaction | Observed result |
| --- | --- |
| Manager working with a decision waiting, light | Header reads Manager with an amber dot and "Needs your answer"; the facts line reads "Claude Code · sonnet · 1 worker · 2 queued"; the session id is 11px monospace below it |
| Nothing in the session yet, dark | One centred block in the body: the chat mark, "No activity yet.", "Send a task in Telegram and it shows up here." |
| The session is still loading, dark | The turning mark and "Loading the Manager session..." in the middle of the window |
| The history read failed, dark | A blocked mark, "Could not load the Manager session.", the reason and Try again, centred; the header dot is red beside "Unavailable" |
| Coordinating | The dot takes the accent colour and beats once every 1.8 s, on `opacity` alone; with reduced motion it is still |
| A 360px panel, below the real minimum width | The header stays on one line and neither it nor the facts row overflows |

Screenshots: [the panel, light](evidence/manager-panel-light.png), [nothing to show, dark](evidence/manager-panel-empty-dark.png).

### What GeckIt writes into the session

The three messages GeckIt writes into the Manager session itself, which the panel showed as the prefix line and the JSON below it, are now read and drawn as what they say: `client/src/renderer/src/chat/manager-said.ts` reads them, `client/src/renderer/src/chat/ManagerSaid.tsx` draws them, and `Transcript` uses them only when it is the Manager panel. Five tests were added to `client/test/manager-ui.test.ts`; `npm run typecheck`, `npm run lint`, `npm test` (1,097 tests across 81 files) and `npm run build` pass. The two lint errors reported in `client/scripts/dev-bundle.js` are older than this change and untouched by it.

| Interaction | Observed result |
| --- | --- |
| What came from Telegram | A filled bubble marked FROM TELEGRAM with the words Alex sent, and no JSON |
| A worker's news | WORKER UPDATE with "Waiting for you" and "Blocked" beside it, the worker's title, what it said, and its project in quiet monospace |
| The fold under it | "What the worker sent" opens the JSON the manager was handed, wrapped inside the card, with nothing running past the right edge |
| A GeckIt command that worked | GECKIT CLI, the operation, and `geckit sessions mark --id codex:01a153c4-7e52-7e83-a8ee-b0b747d7c59c --status blocked` as it would be typed |
| A GeckIt command that failed | The same card with a red border and "Failed", and the error under "What it answered" |
| Something that is not the expected shape | The text itself under the same mark, rather than an empty card or a thrown render |
| A 380px panel | Every card, the long command and the opened JSON wrap; no horizontal overflow anywhere |
| Manager's own words, and anything Alex typed | Unchanged |
| The header, after Alex asked for the Manager settings button to go | A gear beside the close, both marks only, labelled and titled Manager settings; at 380px "Needs your answer" now fits in full where the text button used to push it into an ellipsis |

Screenshots: [the transcript, dark](evidence/manager-said-dark.png), [light, with the JSON open](evidence/manager-said-light.png), [380px](evidence/manager-said-narrow-light.png).

Not covered: no message was sent to a real Telegram bot or account, so Telegram's own rendering of this HTML is argued from its Bot API documentation and the formatted/plain fallback, not observed; no real provider session, bot token or device was involved; the beat was observed in single frames and in the computed animation rather than measured over time.
