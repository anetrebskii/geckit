# Shortcut result destinations verification

Status: implemented and locally verified on `feat/shortcut-destinations`. UX explicitly approved by Alex in the original Discord thread, relayed in this session on 2026-11-15. Actual renderer review is complete. Delivery is a draft PR because the full suite has a confirmed baseline failure and real-channel delivery remains unverified. This report distinguishes executable evidence from checks that have not run. Session: Codex `01a1df85-447e-76f1-9e7c-daab118e1132`.

## Scope and safety

The requested path is saved shortcut destination -> completed run -> fresh native thread -> authorized reply -> the same Manager run and source worker. Every admission snapshots the configuration. Later admissions must have separate identities. Legacy shortcuts remain local. The common channel contract owns optional destination discovery and publication; Discord uses a public thread in a server text channel, Slack a root message and replies, and Telegram currently has no isolated per-run destination implementation.

No real schedule was changed, no external result was posted, and the active GeckIt service was not restarted. Existing unrelated iOS `Package.resolved` and `client/.vitest/` changes are excluded from this task. A localhost renderer fixture replaces native API boundaries only; it cannot establish provider execution, disk persistence or live delivery.

## Checks recorded during implementation

- Channel-focused suite: 50 tests passed across `shortcut-channel-destinations.test.ts`, `shortcut-destination-hub.test.ts` and the existing Discord/Slack suites. Real channel adapters use fake native transports and a typed Manager boundary. Native creation/receipts, two distinct runs, unmentioned replies, duplicate suppression, route restoration, authorization refusal, unavailable destinations, stale generation and uncertain writes are exercised. This does not establish real Manager ownership or live transport access.
- Expanded runtime-focused suite: 61 tests passed across `shortcut-product`, `employees-team`, `shortcut-runs`, `shortcut-save`, `shortcut-persistence` and `shortcuts`; four additional real Manager cases passed. Provider execution and transport publication are controlled fixtures. Actual `sessions send --id original-worker` reaches the same controlled worker; another run's worker is refused.
- Final full suite: `npm test -- --reporter=verbose` after all UI fixes finished with 2020 passed, 1 failed and 23 skipped tests (153 passed, 1 failed and 5 skipped files). Failure: `recurrence.test.ts:76`, finite endpoint cache assertion, `expected 65 to be less than 13`. Reproduced the identical failure against an unmodified `git archive HEAD client` at base `a0fc967d`, in `/private/tmp/geckit-destinations-baseline-a0fc967d/client`, with shared installed dependencies. This is a confirmed baseline failure, not a passing full suite. Latest run started 11:24:04 America/New_York and finished in 26.42s. Latest UI/event full-suite log: `/private/tmp/geckit-destinations-ui-tests.log`; original backend log: `/private/tmp/geckit-destinations-final-tests.log` and `/private/tmp/geckit-destinations-original-recurrence.log`.
- Final `npm run typecheck` passed all four configurations, fixture TypeScript check passed, `npm run lint` and `git diff --check` passed. Logs: `/private/tmp/geckit-destinations-ui-typecheck.log` and `/private/tmp/geckit-destinations-ui-lint.log`. A focused 16-test journal/save run also passed after the run event was added, including event state matching already-persisted disk state.
- Electron main/preload/renderer, headless service and phone production builds passed to separate scratch output directories using `electron-vite build --outDir`, `vite build --config service.vite.config.ts --outDir` and `npm run build -- --outDir`. Outputs are `/private/tmp/geckit-destinations-{electron,service,mobile}`. Desktop and phone were rebuilt again after the final long-label fix; service was built after the event wiring. Logs: `/private/tmp/geckit-destinations-ui-{electron,service,mobile}-build.log`. These builds did not replace the running service. Existing bundle-size warnings remain; no new dependency was added.
- An early full-suite baseline attempt was interrupted with exit 130 after it stopped making progress without an aggregate report. Its partial dot output is not a successful check or evidence of which failures existed before this task. The later complete suite above supersedes that attempt.
- UX state diagram rendered successfully with Mermaid CLI to `/private/tmp/geckit-shortcut-destinations.svg`.

## Acceptance evidence

| Requirement | Required observation | Evidence/status |
|---|---|---|
| Save and readback | Destination survives validation, persistence, reopen and CLI readback; clearing removes it | Actual main store/disk reload: `shortcut-persistence.test.ts`, stable IDs without retiming. CLI validation/expected conflict: `shortcut-product.test.ts`. Employee preserve/remove: `employees-team.test.ts`. Older host/field loss: `shortcut-save.test.ts`. Actual desktop saved Slack ID/label and reopened them; phone saved the long Discord ID/label and reopened them through normal controls. Fixture save is UI proof only, separate from the actual disk test. |
| Admission | Immutable destination and original source identity saved before dispatch | `shortcut-runs.test.ts`, snapshots before callback, Manager unavailable starts no worker, interrupted admission does not replay. |
| Completion | Intermediate acknowledgement, approvals, worker execution and active goal do not publish a completed result | `manager.test.ts`, four scheduled-run cases use real Manager/Sessions with controlled provider. Goal, queue, asks and background work keep context unsettled. |
| Fresh thread | Two completed admissions produce distinct native identities with their own full results | `shortcut-channel-destinations.test.ts`, real Discord/Slack adapters and fake HTTP; `shortcut-runs.test.ts`, immutable snapshots and full cleaned source history. Native server existence unverified. |
| Continuation | Authorized unmentioned native reply reaches the original Manager context and can resume the original worker | Adapter tests prove native inbound -> channel Manager boundary and answer -> HTTP. Real Manager test proves bound session unchanged, incoming continuation -> same Manager -> `sessions send` original worker. These are compositional fixtures, not a single live end-to-end run. |
| Isolation | A reply in run A cannot reach run B or unrelated work | Real Manager scoped worker refusal, hub scoped bind/receipt matching, native distinct routes, unauthorized Discord/cross-workspace Slack refusals. Host-only persisted `shortcutRun` scope survives native binding without changing ordinary answer/watch delivery. |
| Failure | Missing destination, disabled connection, authorization refusal and uncertain writes preserve truthful status and local result | Adapter/hub tests exercise 403/API refusal, 5xx/lost/mismatched receipts, stale generation and per-chunk authorization; journal tests retain result and truthful failed/uncertain status. Ownership loss refuses publication; unavailable source reports recovery guidance. |
| Recovery | Duplicate events and restart do not blindly create a second thread | Journal waiting/sent/sending restart cases, duplicate events; adapters restore durable routes and accept later authorized replies. Sending at interruption becomes uncertain, without automatic repost. |
| Legacy | Jobs without destination retain previous dispatch and schedule timing | Existing shortcuts tests and persistence tests pass; legacy omission stays omitted, destination editing preserves `since` and random start timing. |
| UI | Actual desktop/phone editor save/reopen/cancel/error and keyboard/scroll in light/dark | Complete in actual-component browser fixture, matrix below; no real account used. |
| CLI/schema/interfaces | Destination discovery/save/removal/readback/run status share existing handlers and reject unsupported older hosts | Product CLI/schema, employee CLI, native bridge, service/phone methods and runtime capability wired; focused tests and full typecheck pass. Desktop/phone controls and Team summaries use the same setting and event journal. |

## Actual renderer review

UX source: [shortcut-destinations.md](../ux/shortcut-destinations.md), approval recorded before UI implementation. Product design system: existing Picker/Menu, desktop shortcut settings, phone Cell/FullSheet, existing accent/text tokens. No separate visual implementation was introduced for the test. Real-component fixture: `client/test/browser/shortcut-employees/`; only native API boundaries are replaced. Reviewed through the GeckIt automation-owned browser tab, then closed that tab and stopped only its own Vite process. No personal browser tab or running GeckIt window was driven.

| Surface / viewport | Theme | Observed interaction and result |
|---|---|---|
| Desktop Shortcuts, 1280x900 | Light | Opened actual editor; keyboard Enter/ArrowDown/Enter selected Slack, Tab/Enter selected its destination, visible focus ring and restored trigger focus. Save persisted `channel:slack` / `slack-general` / label in fixture; list summary updated; keyboard reopen retained it. Failed save kept renamed draft and enabled retry; Cancel discarded it and returned focus to original row. |
| Desktop Shortcuts, 1280x900 | Dark | Discord duplicate channel labels include stable IDs; long selected channel wraps without horizontal overflow. Editor scroll region remains usable. Empty places disable Destination and Save after transport selection. Loading disables destination choice. Failed delivery displayed independently; synthetic run event replaced it with a thread link without reload. Uncertain delivery remained explicit. |
| Desktop older host and discovery | Light | Missing capability shows exact host-update text and disables saving the external setting. Clearing to Only in GeckIt saves without destination. Discovery rejection preserves the saved label and exposes Try again; retry returns the fixture refusal without losing draft. |
| Phone Shortcuts, 390x844 | Light | Actual phone menu selected long Discord destination; label wraps without horizontal overflow. Sticky Save remains reachable after scrolling. Save/reopen retained stable ID and label in fixture. |
| Phone Shortcuts, 390x844 | Dark | Removed saved destination remains recognizable; Only in GeckIt plus Save removed it. Discovery error/retry stays readable while scrolling, with sticky Cancel/Save. |
| Desktop Team, 1280x900 | Light / dark | Saved summary plus uncertain status in light and result link in dark fit beside reachable Run. Shortcut opens the actual editor; Escape closes it. |
| Phone Team, 390x844 | Light / dark | Uncertain and failed statuses wrap beside reachable Run. Shortcut opens actual phone editor. Native save refusal retains renamed draft; Cancel discards it, closes sheet and preserves original shortcut. Telegram choice shows unsupported wording and disables Save. |

During review, keyboard-activated Picker opened in pointer mode and arrow navigation failed. The existing Picker now recognizes keyboard click detail, and Enter/ArrowDown/Enter plus focus restoration were rechecked. A long desktop destination initially overflowed the real Picker label; its actual label node now wraps within the control, and full-screen dark review confirmed no horizontal overflow. These were observable failures fixed before delivery, not inferred passing states.

Inspected screenshots in full screen context, including adjacent controls, hierarchy, alignment, density, spacing, scroll position and focus. Screenshot pixels reflect browser device scale; CSS viewports are listed above. Images contain only synthetic data. Native result links were not followed and are not real delivery receipts.

- Editors: [desktop light](shortcut-destinations/desktop-light.png), [desktop dark long label](shortcut-destinations/desktop-dark.png), [phone light long label](shortcut-destinations/phone-light.png), [phone dark unavailable](shortcut-destinations/phone-dark.png).
- Error states: [desktop discovery error](shortcut-destinations/desktop-error.png), [desktop empty](shortcut-destinations/desktop-empty.png), [phone discovery error](shortcut-destinations/phone-error.png).
- Team: [desktop light uncertainty](shortcut-destinations/team-light.png), [desktop dark delivered](shortcut-destinations/team-dark.png), [phone light uncertainty](shortcut-destinations/phone-team-light.png), [phone dark failure](shortcut-destinations/phone-team-dark.png).

## Performance review

No new performance problems found by source review. This is not an installed-app benchmark. Reviewed the full `docs/performance.md` checklist against renderer/shared changes and their surrounding code. Existing shortcut-row rendering and its existing broad chat prop were not restructured; no claim is made that this feature fixes that older render pattern. No new conversation card, hover, long animation or per-token journal work was added, so no before/after installed-app trace was required for a new repeated animation/list. The active installed app was not restarted or instrumented.

| Touched item | Verdict | Where / evidence |
|---|---|---|
| Row data and stable identity | Holds for added run prop | Latest-run map retains unchanged run object references. Existing EmployeeShortcut memo receives just its run entry, rather than the whole journal; ordinary chat updates do not trigger journal reads. Existing chat prop behavior is unchanged. |
| Work once per list, not once per row | Holds | `useShortcutRuns` computes latest entries once with useMemo; parents pass map entries. Duplicate destination name counts use one linear map. No journal lookup scan is added inside a row. |
| Filters/sorts per render | Holds | Destination choices and latest-run derivation use useMemo keyed on their inputs. Discovery runs only when editor mounts or retry is requested. |
| Typing work / subscriptions | Holds for added work | One run subscription per mounted list, no chat.sessions/everyone dependency and no new polling. Buffered events cannot be overwritten by the initial journal response. Draft typing does not refetch destinations or run history. |
| Phone rebuilt | Holds | Production phone build passed after final shared renderer/CSS changes, to scratch output. |

Eight other checklist items are untouched: memo callback policy (no new memo callback), source identity reconciliation, out-of-view list rendering, formatters, pointer-follow selection, compositor animation, stopping infinite animation and installed-app comparison for a newly repeated list/card/hover/animation. No new timer, formatter, animation or dependency was introduced. Browser fixture review proves interactions/layout, not production performance under a large real account.

## Real-channel verification

### Authorized follow-up on 2026-11-15

Alex explicitly answered "Да, создавай" to permission to create test threads in Discord #general and reply in them. That authorization is now recorded and is not being requested again. It applies only to the #general parent of the originating thread, not a namesake on another server. Host attribution supplied by the user: `channel:discord:1571525680355606641`, Manager session `codex:01a1df83-d3d4-7691-8fc8-8a5b8446c695`. These identify a source thread/session, not its guild or parent destination. No guild ID or parent channel ID was inferred from the snowflake.

Read-only discovery through the installed `/Users/alex/.geckit/bin/geckit-local` was attempted at about 11:49 America/New_York. Sandbox initially blocked the local socket; the same supported CLI was then run with approved socket access. This is distinct from GeckIt's own authority refusals below.

| Supported operation | Observed result |
|---|---|
| `employees current` | Current source session and unchanged assigned engineer confirmed. |
| `capabilities` | `Operator access denied. Use authenticated Manager commands for product changes; native permissions remain user-controlled.` |
| `shortcuts destinations` | Same operator-access refusal; no destination list returned. |
| `channels list` | Same operator-access refusal; no connected-channel metadata returned. |
| `manager view` | Same operator-access refusal; native source link and thread metadata unavailable. |
| `service methods` | `Operator access denied. Use the conversation commands to request changes.` |
| `show codex:01a1df83-d3d4-7691-8fc8-8a5b8446c695 --last 12 --json` | `No conversation starts with codex:01a1df83-d3d4-7691-8fc8-8a5b8446c695.` The supported ordinary conversation reader cannot expose that Manager session here. |

No attempt was made to remove assistant identity, borrow Manager credentials, read provider transcripts/channel state files, extract tokens, call Discord directly or bypass native approvals. The denied product operations were not retried through another access path.

### Exact blockers and remaining live procedure

Destination is unresolved: need the originating thread's verified `guild_id` plus `parent_id` for #general, or the exact parent link `https://discord.com/channels/<guild_id>/<general_channel_id>`. The supplied `1571525680355606641` is the source thread ID, not an established parent channel ID. An authenticated Manager or the person can provide that attribution through an authorized native surface. A name-only #general match is insufficient.

The repository has an isolated headless test runtime (`client/test/headless-service.test.ts`) and the staged service build, but its fixture uses a controlled provider, synthetic vault and fake channel transport. It is not provisioned with the connected Discord channel or real provider account and is not a live verification path. Installed `service help` advertises standalone `service run --data`, but supported runtime/capability inspection was denied to this worker, so the active host's loaded feature version and an authorized separate live-connected runtime remain unknown. Launching another gateway consumer against the working bot, copying its settings/vault or stripping identity would not establish a safe runtime. None was done. The concrete runtime blocker is an operator-provisioned isolated runtime for this branch, with an authenticated provider and Discord/broker connection, or an authenticated Manager exposing an already available safe runtime. Provisioning must preserve the running service and its active work; no restart is authorized.

After both blockers are resolved, use a new manual-only test shortcut with harmless unique run markers, without editing existing schedules. Complete it twice, preserve each native receipt and thread URL, then send Alex the first real thread link and ask him to reply without a bot mention, for example: "Продолжи этот запуск: добавь строку CONTINUED-A к результату." Request a distinct `CONTINUED-B` reply in the second thread. Verify human author identity through the existing allow list, unchanged source worker/Manager backing session and no cross-run routing; a bot self-message is never human continuation evidence. Remove only the test shortcut if authorized. Controlled permission/deletion tests remain fixture evidence unless separately safe to perform; authorization to publish test threads does not authorize changing real channel permissions or deleting #general.

Live result of this attempt: zero test shortcuts created, zero runs started, zero Discord threads/messages sent, zero native receipts/links and zero human continuation observations. Native Discord/Slack delivery and two-run isolation remain unverified. Existing mock, store and renderer evidence is unchanged. The feature is delivered for review, but the requested live task is blocked and is not claimed complete.

## Delivery

Delivered for review in draft [PR #87](https://github.com/anetrebskii/geckit/pull/87), implementation commit `b3b4cea64f3e4c4d98973776c2e50f2b71d027b8`. The PR head also contains the final delivery record. Branch `feat/shortcut-destinations` retains the implementation in the permanent checkout; the PR is draft and not merge-ready while the documented baseline/live limitations remain. No release, merge or deployment is claimed. No task-owned temporary worktree was created or removed; the permanent checkout is preserved. The scratch baseline directory is a Git archive, not a worktree. The repository-wide recurrence baseline failure must be reported with any later delivery.

Changed implementation files are grouped below; unrelated `Package.resolved` and `client/.vitest/` are excluded:

- Run/configuration: `client/src/main/shortcut-runs.ts`, `shortcuts.ts`, `store.ts`, `manager.ts`, `manager-operations.ts`; `client/src/shared/shortcut-runs.ts`, `shortcut-destinations.ts`, `shortcut-destination-validation.ts`, `shortcut-save.ts`, `api.ts`, `configuration.ts`.
- Channel contract/adapters: `client/src/main/channels/channel-api.ts`, `channels.ts`, `discord.ts`, `slack.ts`; `docs/channel-libraries.md`.
- Renderer: `client/src/renderer/src/chat/ShortcutDestinations.tsx`, `ShortcutList.tsx`, `PhoneShortcuts.tsx`; `employees/Team.tsx`, `PhoneTeam.tsx`, `shortcuts.tsx`; `ui/Menu.tsx`, `styles.css`; actual-component fixture and README.
- Interfaces: `client/src/core/application.ts`, `events.ts`, `product-cli.ts`, `product-shortcuts.ts`, `runtime.ts`; `client/src/main/index.ts`, `employees.ts`; `client/src/cli/index.ts`; `client/src/shared/product-cli.ts`, `renderer-api.ts`; `client/src/renderer/src/phone.ts`, `recurrence-preview.tsx` (compatibility methods only).
- Tests: new `shortcut-channel-destinations.test.ts`, `shortcut-destination-hub.test.ts`, `shortcut-product.test.ts`, `shortcut-runs.test.ts`; existing `employees-team.test.ts`, `manager.test.ts`, `shortcut-persistence.test.ts`, `shortcut-save.test.ts`.
- Handoff: `docs/ux/shortcut-destinations.md`, this report and `specs/031-shortcut-destinations/`.

UX approval is recorded in the canonical document. FR-001 through FR-012 and SC-001 through SC-004 are mapped above: saved configuration, contract parity, immutable admission, fresh native identity, Manager continuation, true completion, transport semantics, recovery, legacy, cleaning, live safety and renderer evidence. SC-002 has controlled compositional proof; live-native proof is explicitly outstanding. The exact live procedure and remaining attribution/runtime blockers are above; publication authorization is recorded but live acceptance is still open. Compilation, a fake receipt and a screenshot are not counted as live delivery.

The proposed canonical `docs/features.md` addition was presented to Alex separately and has not been approved; that file remains unchanged. The day-plan validator has an unrelated pre-existing `Done:` format violation; no other session's record was rewritten to repair it. No matching audience-production type standard applies to this internal engineering change.
