# VPN IP guard verification

Reviewed 2026-10-11 in the requested main checkout. No app restart, model session, release, installation or publication was performed.

## Automated checks

Before-send checks all exited successfully before the periodic extension:

- `npm run typecheck`: Node and web TypeScript passed.
- `npm run lint`: whole client source/test ESLint passed.
- `npm test -- --reporter=dot`: 63 files, 792 tests passed (20.67 seconds).
- `npm run build` in client: main, preload and desktop renderers passed.
- `npm run build` in mobile: shared phone bundle passed; existing large-chunk advisory remains.
- `git diff --check`: passed.

Session/request guard coverage totals 213 tests in the affected suites. Tests cover blocked creation/context resume, permissions/automatic grants, mode/background/fork, native goals, task requests and delegation, restart/reattach/proceed, queue identity/edit/cancel, shell context, retained text/images, immediate cancellation with an unresolved verifier, and a ten-second total attempt deadline. Verifier/parser/store tests cover families, canonicalization, mismatches, malformed/empty configuration, changed settings, abortable timeout and failed atomic settings writes. Transcript tests cover Try again after failure/limit, Continue after Stop, held unanswered cards, duplicate-action suppression and checking/completed states.

Logs: `/private/tmp/geckit-vpn-{typecheck,lint,tests,desktop-build,mobile-build}.log`. Tests ran with local filesystem watcher/localhost fixture access; no external model was called.

## UI review

Actual components run in the renderer-only Vite preview, separate from the active Electron app:

- `settings-preview.html?section=vpn&theme=light&vpnSaved=1&vpnEnabled=1`; `theme=dark`, `vpnLong=1`, `vpnSaveDelay=1`, `vpnSaveFail=1`, `phone=1` cover variants.
- `vpn-chat-preview.html?state=blocked&theme=dark`; state supports checking, unavailable, cancelled, provider-error, stopped, success and long; add `phone=1` for the phone layout.

Chrome full-window review covered desktop 1440x900/1024x768, phone 390x844/320x844, both themes, hierarchy/alignment/spacing/density, selectable explanations, switch/textarea/buttons, focus, Tab, multiline Enter, Escape/discard/reopen, independently scrolling address field and dialog, and long transcript recovery. Save rejects invalid edits, failed writes retain the field, pending writes disable controls, and acknowledgement reports Addresses saved. General and VPN IP check are separate desktop tabs. Phone uses a dedicated paired-computer page.

Try again follows the error; Stop retains Continue. Checking offers Cancel and hides retry. Recovered preview retains unrelated text/image and removes the retry action. Narrow switch label now wraps. Duplicate per-message Send again is hidden for held operations. Phone Cancel was confirmed inside the message field at both widths; the field reserves space for its 82px-wide, 44px-high button. Try again is 44px high and the switch has a 45px hit area. Cancel produces held cancelled work with Try again; an unresolved probe cannot dispatch later.

Screenshots: `/private/tmp/geckit-vpn-review/settings-light.jpg`, `settings-dark.jpg`, `retry-desktop-dark.jpg`, `retry-phone-dark.jpg`. Screenshots use mock public addresses and conversation content.

## Performance review

No performance problems found in source review against docs/performance.md.

| Item | Verdict | Evidence |
| --- | --- | --- |
| Objects retain identity | Holds | sameAsBefore still compares complete ChatSession values, including new scalar guard state; unchanged rows retain identity |
| Callbacks read current state | Holds | retry/send/stop read shownRef and held refs; pending sends are keyed by originating view |
| Typing redraws dependencies only | Holds | Transcript remains memoized; retry/checking props are scalar/stable; no new board-wide sort/filter or per-row scan |
| Long list paint/layout | Holds | IP list is one fixed-height scrolling textarea; no new per-address rendered rows |
| Phone rebuilt | Holds | Final mobile build passed after shared-source changes |

No new repeated cards/rows, hover path or animation was added, so live-app profiling was not triggered. Existing user sessions were not driven or restarted. Eight other checklist items are untouched or require no new measurement.

## Verification boundaries

Deterministic verifier/provider fakes establish blocked dispatch and recovery without model calls. Public IP discovery is an HTTPS request to ipify per usable configured family, and cannot prove split-tunnel routing to every model destination. This feature checks the GeckIt computer, including phone submissions; SSH-host egress is not verified; when enabled, periodic monitoring interrupts supported owned work but cannot prevent traffic between checks or guarantee termination of unreachable remote work. Selected-text correction and account/usage lookups are outside session guarding.

New-form checking and full useChat state transitions were source-reviewed; component previews exercise the visible components with local mocks. Native iOS keyboard/device, installed Electron activation and a real configured VPN were not exercised. Backend changes load on Alex's normal next restart.

## Periodic extension review - 2026-10-11

Approved extension adds default-off vpnStopOnFailure in the existing dedicated tab and phone page. Full-window actual UI review covers desktop 1440x900/1024x768 and phone 390x844/320x844 in light/dark. Both switches on, dependent checked/disabled state with master off, Tab focus and Space activation, pending save acknowledgement, failed save retaining effective settings, scope-note scrolling, long fixed-height address list and narrow text wrapping were inspected. Prototype reviewed full-window in both themes with save, master/periodic toggle and Done/reopen. No visible hierarchy/alignment/density/spacing inconsistency found.

Paused recovery reviewed with one Try again, precise IP explanation, retained queue and unrelated draft/image. Keyboard retry enters checking; successful retry shows continuation, preserves queue/draft/image and removes recovery action. Component fixtures are deterministic mocks; actual lifecycle/dispatch behavior is verified by provider tests, not inferred from screenshots. Fixed a misleading 'Not sent.' prefix in paused-work copy and a preview fixture that initially hid queued work during recovery.

Artifacts: /private/tmp/geckit-vpn-review/monitor-settings-light.jpg, monitor-settings-dark.jpg, monitor-phone-light.jpg, monitor-paused-desktop-light.jpg, monitor-paused-phone-dark.jpg; updated rendered UX diagram /private/tmp/geckit-vpn-ip-guard-periodic.png. Repeatable previews add vpnStop=1 to settings URL and state=paused to conversation URL.

Performance review reads current docs/performance.md in full. Periodic settings add one scalar switch in a single view, no per-address rows, expensive formatter/filter/sort, pointer work or animation. Existing Transcript memo and stable callbacks remain; unchanged session objects retain identity through sameAsBefore. Silent successful probes do not broadcast session lists, so they add no ten-second renderer redraw. One main-owned active-work check has no overlap or per-session probe timers. Native app profiling is not triggered by this change's renderer scope; the active app was not restarted or driven. Desktop/mobile rebuild results follow final checks below.

### Final extension checks

All final commands passed after the last backend/renderer edit:

- Client npm run typecheck and npm run lint.
- Client npm test -- --reporter=dot: 64 files, 822 tests passed in 20.42 seconds.
- Client npm run build: main/preload/desktop renderer build passed.
- Mobile npm run build: shared phone bundle passed; existing large-chunk advisory remains.
- git diff --check.

Logs: /private/tmp/geckit-vpn-periodic-{typecheck,lint,tests,desktop-build,mobile-build}.log. The sessions/requests/codex/monitor suites total 289 passing tests. Periodic regressions cover shared/no-overlap/immediate/idle/ten-second scheduling, obsolete settings/activity/disposal, deadlines and timer cleanup, silent success, all existing queue holds, late finishes, exact unsent guidance, background/Remote Control interruption, paused restart, native pause/resume RPC and delayed acknowledgement/cancellation. Expired permission cards are removed on provider completion, manual termination and fallback. Previous driver's output/end events cannot change the resumed driver or release its queue; synchronous initial driver signals still work. Transcript20 tests include pending retry disabled state.

Pending retry was also visually inspected in light/dark phone context: Try again disabled, held queue/draft/image retained, zero Checking public IP status before the probe. Final performance review finds no problems in affected source; rebuilt desktop/phone satisfies build item. No native device, installed activation, real VPN routing or paid model calls were exercised. Native control uses the existing thirty-second RPC deadline; SSH/native control may fail and cannot guarantee immediate stop. No live sessions were restarted.


## Send again queue regression - 2026-10-11

Cause: the renderer sent current composer content with an `again` item ID, and the main process queued that content before resolving the saved transcript item. An empty composer therefore appeared as "0 pictures". Resending also cleared an unrelated draft and its attachments.

Main now resolves saved text/images before the first IP check, queue storage and held-operation retention. Renderer uses the saved message through its existing stable callback and item ref; resending neither clears nor restores unrelated draft/photos and does not wait for an unrelated upload. Missing/empty originals do not dispatch from the renderer. No queue is discarded or migrated.

Three regressions failed before the fix. Five added cases now cover text-only and picture retries while another turn works, exact single dispatch with the same unsent item ID, another guard refusal and deliberate recovery, restart from normalized queue data without the original transcript item, and legacy empty queued retry with a recoverable original item. Legacy empty rows remain unchanged until dispatch; data already lost before a restart cannot be reconstructed.

Validation: client typecheck/lint, all 64 test files/827 tests, desktop build, mobile build and diff check pass. The first sandboxed full test run failed opening its local test socket with EPERM and timed out in the loopback forwarding test; the full run with local socket access passed. Logs: /private/tmp/geckit-send-again-{typecheck,lint,tests-unrestricted,desktop-build,mobile-build}.log.

Full-window component review covered normal desktop viewport and 390x844 phone viewport, light/dark text contrast, row alignment/spacing, ellipsis/full-text editing, independently scrolling queues, Escape cancellation, Tab and visible focus on queued actions. Artifacts: /private/tmp/geckit-vpn-review/send-again-queue-{light,dark,phone-light,phone-dark}.jpg. Preview uses the actual Composer/Transcript with fixture queue data; it is visual evidence, not a live useChat retry test. Actual hook lifecycle/draft preservation was source-reviewed; provider dispatch was tested with fakes. No native keyboard/device, real VPN, model submission or live app restart was exercised. Temporary browser tab/server were closed and viewport reset.

No performance problems found in this correction:

| Checklist item | Verdict | Evidence |
| --- | --- | --- |
| Memoized callbacks read current state | holds | Send again reads existing itemsRef and held refs at click time; callback dependencies remain unchanged |
| Typing redraws only text-dependent work | holds | Saved-message lookup runs only on sending, not per render or per keystroke |
| Phone is rebuilt after Chat changes | holds | Mobile build passed |

Ten other checklist items are unchanged by this correction. No list, animation or render-time calculation was added; no new profiling requirement arose.


## Send again action remains after acceptance - 2026-10-11

Alex reported that the resend worked but the original Send again button stayed visible. Reproduced two backend failures and one rendered-action failure before correction: accepted queued retry still offered another resend (and duplicate IPC queued another copy); provider history assigned a different message ID, leaving an old retained unsent record that restored the flag on later reread.

QueuedMessage now exposes its existing retained `again` item ID. Transcript memoizes those IDs and suppresses only each matching message's action on all three Turn paths. Queued work remains unsent until dispatch; cancellation restores that action, other unsent messages remain retryable, and duplicate requests for an already queued item are ignored. Reconciliation preserves the saved unsent status while aligning retained/queued/held identities to provider history, so successful dispatch removes the correct retained record. It does not infer delivery from subsequent model output. Queue identity notification occurs after the item map is replaced; identity-only remapping does not invalidate queue cancellation guards. Fresh VPN explanation is removed when retry enters the queue.

Four additional tests cover these states, cancellation, actual dispatch, repeated reread before retry, successful resend followed by reopen, and queued identity/persistence reconciliation. Full suite: 64 files/831 tests pass. Client typecheck/lint, desktop/mobile builds and diff check pass. Logs: /private/tmp/geckit-send-again-state-{typecheck,lint,tests,desktop-build,mobile-build}.log.

Full-window isolated component review: normal desktop viewport and 390x844/320x844 phone, light/dark, original queued message has zero Send again buttons while a separate unsent message has one, draft/photo retained, queue action keyboard focus visible, and desktop cancellation restores the original action. Reviewed alignment, wrapping, density and scrolling in complete conversation context. Artifacts: /private/tmp/geckit-vpn-review/send-again-{accepted-light,accepted-dark,cancelled-dark,accepted-phone-light,accepted-phone-dark,accepted-phone-320-dark}.jpg. Fixture represents accepted/cancelled states through actual Transcript/Composer, with no-op resend; live hook/provider/VPN/device activation is not claimed. Backend regressions use fakes. Browser viewport restored, tab and preview server closed; active conversations were not restarted.

No performance problems found: Transcript/Turn remain memoized; queued IDs are computed once per queue change with O(1) lookup per item; callback identity and current-ref behavior remain intact; unchanged sessions retain their objects through existing sameAsBefore; no new render-time formatters, pointer tracking, animations or rows. Phone rebuilt. No new list or unbounded per-row work requires profiling; live-app timing was not measured.


## One VPN protection switch - 2026-10-11

Alex requested removal of the separate stopping option: enabling the main feature flag must enable active-work protection automatically. Updated the existing UX document before renderer edits, then the spec, handoff, contracts, data model, plan, prototype and approved feature entry. Earlier optional-setting evidence above describes the superseded design.

Settings now exposes only vpnIpCheck and vpnAllowedIps. Production monitoring depends on that master flag and saved list. Store removes the old vpnStopOnFailure preference from disk and incoming legacy updates; an old false cannot suppress monitoring. Master-off remains probe-free; before-send validation, atomic address saving, obsolete-result invalidation and deliberate recovery are preserved.

Full client suite: 64 files / 828 tests pass. Removed obsolete secondary-preference cases and replaced them with legacy-false master-on/master-off monitor integrations and legacy IPC-write coverage. Client typecheck/lint and desktop/mobile builds pass; diff check passes. Logs: /private/tmp/geckit-single-vpn-{tests,typecheck,lint,desktop-build,mobile-build}.log.

Full-window actual shared components reviewed in Chrome: normal desktop 1352x676 light/dark, phone 390x844 dark/light and 320x844 light. Reviewed one switch on/off, long saved list constrained within textarea, help hierarchy, narrow wrapping, no horizontal overflow, address validation, missing configuration focus, failed save preserving draft/rule, pending acknowledgement disabling controls, keyboard Space/Tab/Enter, saved state, Escape close and restored Settings focus. Phone focus and scroll remain reachable. No visible spacing/alignment/density inconsistency found. Screenshots: /private/tmp/geckit-vpn-review/single-{settings-light,settings-dark,phone-dark,phone-light,phone-light-error}.jpg. HTML prototype source-reviewed; direct local-file visual review was blocked by browser URL policy, so no bypass attempted. Actual production components were visually verified through the isolated HTTP preview.

Performance review: no performance problems found. Single-instance settings removes a control and introduces no lists, formatters, filtering, timers, pointer handlers or animation. Description forwarding adds no render work. Draft changes affect this local form only. Existing conversation memo/identity/queued retry behavior is unchanged. Phone rebuilt. No active desktop restart, real VPN change or model request was used for verification; native phone UI/paired-backend behavior remains a manual-device check.

Local phone update: signed 1.88.0/build 189 installed in place and native launch succeeded; all 22 bundled web assets verified. See deployment.md. Preview tab closed, temporary viewport reset and own preview server stopped.


## Bounded lookup recovery - 2026-10-14

User request: "Implement it too", following the Claude VPN plugin update. Updated the existing UX document before implementation and preserved concurrent unrelated checkout changes. The shared before-send/periodic verifier performs up to three fresh attempts per required family: ipify, independent Amazon HTTPS (IPv4) or icanhazip HTTPS (IPv6), then ipify. Each attempt has a three-second abort deadline within the unchanged ten-second overall budget. A valid stable-policy mismatch rejects immediately, cancels other in-flight families and cannot be overridden by fallback. Both usable families must still verify. Policy changes revalidate; disabling the guard discards recovery results.

Existing electron-log application diagnostics now record failed attempts, endpoint, address family, elapsed milliseconds, original network error code/message, recovery, mismatch and exhaustion. Logs exclude response bodies and conversation content; first-attempt successes stay silent, and logging failures cannot change verification. The desktop/phone service disclosure names the fallback services. Canonical feature entry and prototype updated without changing controls or styles.

Validation: 66 focused VPN cases, full 71-file/940-test suite, TypeScript checks, full npm lint and desktop/mobile production builds pass. Initial settings-file watcher timing failure passed separately and in the final full run; no unrelated watcher code changed. A condensed lint invocation reported unrelated dev-bundle.js errors; rerunning the actual npm lint command through rtk proxy verified eslint src test with exit 0.

Actual SettingsDialog and PhoneVpnSettings components were reviewed in Chrome with a fixture native settings bridge: 1440x900 light desktop, 1024x768 dark desktop, 390x844 light phone, 320x844 dark phone. Inspected full-screen hierarchy, contrast, alignment and disclosure wrapping; no horizontal overflow on the narrow phone. Tab/Enter saved valid fixture addresses, invalid input showed the existing error, Escape closed the dialog, and the saved fixture value survived reopening/navigation. No browser runtime errors observed. These checks establish renderer behavior, not native settings persistence or real phone pairing.

Performance review: no performance problems found. The renderer change is one static disclosure string in a single Settings instance. All list/memo, formatter, callback, pointer and animation checklist items are unaffected; no profiling threshold is triggered. Phone bundle rebuilt.

Live fallback verification remains pending explicit approval: automatic approval review rejected an isolated test that would disclose this Mac's public IP to Amazon, stating that the previous approval covered only the Claude plugin test. No bypass was attempted. IPv6 fallback is covered by deterministic tests; this Mac has no usable public IPv6 for a real IPv6 probe. Review tab closed, temporary viewport restored and own preview server stopped. No active application restart, package installation, commit, push or release performed.

Main integration verification: applied only the eight VPN implementation/documentation files on fresh origin/main, preserving unrelated remote work and the original shared checkout. All 941 tests across 71 files, typecheck, full npm lint and desktop/mobile production builds pass in the isolated worktree; upstream main adds one settings test to the earlier 940-case snapshot. The six exclusive task files match the reviewed source snapshot byte-for-byte before this delivery note.
