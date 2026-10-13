# Design: VPN public IP guard and error retry

**Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)
**Status**: Implemented and verified in the working tree; approved periodic extension complete.

## Scope

US1/US2 add a computer-wide approved-IP setting and gate GeckIt session submissions before content or context can reach a provider. US3 adds Try again after errors at the existing Continue position. Desktop settings, new-task/question forms, transcripts, queues and phone settings/error display are affected. Scope checks the computer running GeckIt, not SSH host egress. The approved periodic extension interrupts supported active work and pauses queues on verification failure. Selected-text correction is outside this session feature.

## Artifacts

- UX document: [VPN IP guard](../../docs/ux/vpn-ip-guard.md).
- Layout prototype: [VPN IP guard](../../docs/design/vpn-ip-guard.html), prepared using GeckIt stylesheet/tokens after user approval.
- Specification quality: [requirements checklist](checklists/requirements.md).

## Decisions

Use Settings > VPN IP check on desktop and a paired-computer page on phone. Save the address list explicitly so incomplete typing never becomes effective policy. Fail closed on mismatches and verification failures. Preserve the attempted operation for deliberate retry. Continue after Stop remains; Try again after an already-started turn means continuation, while a known unsent operation retries the saved content. Do not automatically restart held work when the network recovers.

The UX document owns exact labels, state transitions, thresholds, cancellation, keyboard/focus and scrolling. User approval: "Prepare UI and implement it" on 2026-10-10, following the concrete proposal.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1 / FR-003/004/005 | Fresh check before actual dispatch, including before provider creation/resume that can send context | Fake providers observe zero starts/resumes/sends when verification fails; queue rechecks at dispatch |
| US2 / FR-001/002 | Disabled default; persistent exact-address list; explicit Save | Invalid edit leaves saved rule intact; restart retains rule; off retains list and performs no lookup |
| US1/US3 / FR-006/007/009 | Retained operation, no automatic retry, one active submission | Mismatch followed by successful Try again sends once; unrelated draft and queue order survive |
| US3 / FR-008 | End-of-transcript Try again after error, Continue after Stop | Known unsent message retries; started turn continues without repeating original prompt |
| FR-010/011 | Phone checks paired computer; explicit SSH/active-work limits | Phone displays actual guard error; scope wording remains visible in Settings |
| FR-012 | Lookup service disclosure without conversation payload | Inspect request for no text, goal, attachment or approved list |
| FR-013 | Answer/goal operations use gate; cancellation does not | Block a question answer without clearing its card; allow Stop and denial while blocked |
| FR-014/015/016 | Shared active-work monitor governed by the main VPN flag; silent success, failure interrupts and holds, manual recovery | Fake-timer interval/no-overlap/idle/stale tests; native goal pause and queue retention through late finishes and restart |

## Review Evidence

Read current SettingsDialog.tsx, PhoneSettings.tsx, Composer.tsx, Transcript.tsx, useChat.ts, main/sessions/index.ts, main/index.ts, styles.css, docs/performance.md and existing restart/settings UX documents. Current Transcript.tsx offers Continue only for a final stopped note; failed/limit notes do not receive that control. Current useChat.ts replaces rejected phone sends with a generic host error and moves the next queued message to the draft after a failure. Both must be accounted for in implementation.

The state diagram rendered successfully with cached Mermaid CLI and Chrome to `/private/tmp/geckit-vpn-ip-guard.png`; rendered diagram was inspected. The initial sandboxed browser launch failed; the approved local render succeeded. Documentation references and specification checklist were checked; no application tests were run because no application code changed.

Full-window implementation review on 2026-10-11 used actual SettingsDialog, VpnIpSettings, PhoneVpnSettings, Sidebar, Transcript, Composer and TalkStatus in an isolated Chrome preview. Desktop 1440x900/1024x768 and phone 390x844/320x844 were reviewed in light and dark themes. The dedicated VPN IP check tab was added after Alex's explicit request on 2026-10-11; General no longer contains these controls.

Settings: off/on/saved/empty/invalid, pending acknowledgement, failed save with retained edits, long list and scrolling, multiline Enter, Tab focus, Escape discard/reopen and focus return were checked. Error/recovery: mismatch, provider failure, checking, cancellation, recovered retry, Stop/Continue, unrelated draft/image, long transcript and phone wrapping were reviewed. Narrow switch-label truncation and duplicate Send again were fixed. A phone Cancel initially fell outside the scrolling toolbar; final positioning verification is recorded in verification.md.

The isolated preview uses deterministic local mocks and never changes Alex's settings or calls a model. New-form checking and useChat rekeying/cancellation are also source-reviewed; the preview mounts the affected components rather than the entire live useChat hook. Native iOS keyboard/device and installed Electron behavior were not exercised. Screenshot artifacts are under /private/tmp/geckit-vpn-review; code and repeatable preview URLs are listed in verification.md.

## Open Decisions

1. Resolved: user approved the proposed UX and requested UI/implementation.
2. Resolved through approval: check before GeckIt-controlled sends/continuations and every 10 seconds during active work whenever enabled; interrupt on mismatch or unverifiable IP.
3. Resolved: ipify family-specific probes for locally configured public-capable IPv4/IPv6; incomplete verification blocks. Probes do not establish every destination route.

## Planning Handoff

UX approved, initial prototype review complete; plan/tasks/analyze prepared before implementation. Preserve the fresh-check, fail-closed and retained-operation rules across session creation/resume, direct sends, queue/Send now, scheduled starts, goals and answers. An IPC-only or renderer-only check is insufficient because automatic sends originate in main too. Recheck effective policy before dispatch if settings changed during a lookup.

Reuse existing Settings and pending-message contracts through client/src/shared/api.ts, main/store.ts and phoneCalls. Inspect all actual dispatch points before choosing gate placement. Retain a structured error so phone requests keep the guard explanation. Avoid provider or renderer restart merely to load backend changes during active user conversations.

Run deterministic no-network/no-model tests proving zero content dispatch on failure and exactly-once retry on success, plus typecheck, lint, affected suites and desktop/mobile builds. Complete full-window visual review and performance-review after implementation. The canonical feature list remains unchanged while the feature is only proposed; the user's explicit request already authorizes its entry once implemented.

Initial prototype review 2026-10-10: Chrome 1352x620 full-window light/dark. Empty enabled-list error focused address field; saved 8.8.8.8/1.1.1.1 and enabled; Escape closed and focus returned to Settings. Visual hierarchy/alignment/spacing consistent with surrounding settings. Actual components and phone/constrained sizes remain to be verified after implementation.

Final checks and scope boundaries: [verification.md](verification.md). The implementation remains uncommitted source work; no installed/released app or native-device verification is claimed.

Updated standalone prototype also reviewed full-window light/dark on 2026-10-11: General hides the VPN group, VPN IP check restores it, and Done/reopen retain effective settings. This confirms the prototype follows the separate-tab handoff.

## Approved extension - 2026-10-11

Alex initially approved a separate periodic-stop option with "implement it", then superseded that choice on 2026-10-11 by requesting removal of the option and automatic stopping when the main feature flag is enabled. Use one master switch in the existing VPN IP check tab/phone page, with exact monitoring help and scope copy from the UX document. The master remains default off. Legacy periodic-stop=false cannot override it. Successful periodic checks stay silent; failures use retained VPN explanation and Try again in existing transcript placement. Shared timer, active work only, ten seconds and no overlap; interrupt active work, pause queued work and await deliberate retry. Existing prototype is updated, not duplicated. Required visual review: both themes, desktop and phone, the single switch on/off/pending/error and stopped-work recovery.

Periodic state diagram updated, rendered with cached Mermaid CLI and installed Chrome, and inspected on 2026-10-11: /private/tmp/geckit-vpn-ip-guard-periodic.png. Compact diagram omits completion/dismiss/cancel-to-ready edges described in the transition table to keep recovery paths readable.

Final lifecycle review requires disabling Try again for the whole pending recovery, including stop/pause acknowledgement, and removing expired permission cards when the interrupted process closes. Existing unanswered-card preservation still applies to before-send failures that do not stop the live request.

Periodic final review: full client types/lint, 64 test files/822 tests, desktop/mobile builds and diff check passed. Pending retry disabled state inspected in light/dark phone full context, with no premature IP checking status. Source review fixed native pause ordering, expired cards and stale old-driver events. See verification.md for evidence and limits.
