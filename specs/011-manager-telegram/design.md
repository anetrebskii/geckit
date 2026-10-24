# Design: Manager and Telegram

> Current direction: the [Telegram-only correction](#telegram-only-correction---2026-10-17) supersedes prior Desktop/phone conversation prototypes. Desktop retains Settings setup/status/recovery; actual implementation evidence is in verification.md.
**Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)
**Status**: First-version implementation authorized by Alex on 2026-10-17. First-version implementation and local verification are complete, including the Telegram-only correction; this is not released support.

## Scope

One place to give work, correct it, answer questions and receive results across all current and future GeckIt projects. One logical Manager delegates deep work to normal worker sessions and uses GeckIt CLI to perform requested application, project and file management. A personal Telegram bot is the Manager conversation. The original handoff defines the target behavior; the implementation plan narrows the first version and records acceptance evidence separately. No personal bot has been connected during development.

Current Desktop surface: Settings > Manager for setup, assistant/model/delegation, pairing/status and lifecycle recovery. No Desktop or phone Manager conversation, navigation or session inspector is exposed; ordinary workers remain accessible. Telegram surface: private bot chat with text and bound decisions. Board replacement, shared bot hosting, groups, attachments and always-on cloud execution are outside scope.

## Artifacts

- [Specification](spec.md), [quality checklist](checklists/requirements.md) and [research / existing foundations](research.md).
- [UX document](../../docs/ux/manager-telegram.md): states, transitions, exact wording, thresholds, cancellation, focus, keyboard, scrolling and quiet events.
- [Interactive UI prototype](../../docs/design/manager-telegram.html): standalone HTML, no external resources or real credentials required.
- Rendered state diagrams: [Manager](evidence/manager-states.svg), [Telegram](evidence/telegram-states.svg). Both Mermaid blocks rendered successfully using Mermaid CLI.

Open the HTML file in a browser. Start with Set up Manager. The review toolbar switches themes, Telegram presentation and fixture scenarios. A nonempty dummy token simulates successful bot checking; `invalid` simulates rejection. Open Telegram simulates candidate arrival locally. Reset prototype clears all fixture state. Do not enter a real token.

## Decisions

1. **Manager is a special GeckIt session with one logical identity.** It has a dedicated navigation entry rather than an ordinary task card. Board profile changes do not alter its project authorization. Persistent task ownership and decisions survive a replacement transcript.
2. **Manager uses the GeckIt CLI; workers handle deep execution.** The CLI must cover app management, sessions, queues/goals, projects/files, organization/schedules, assistants/models/libraries and hosts/settings. Requested mutations are allowed under existing permissions. This revises the initial draft's ban on direct file management. Arbitrary non-GeckIt shell execution and bypassing permissions remain outside the role.
3. **All projects are included automatically.** No project checkboxes. Current/future registered projects across profiles are included; zero projects does not block setup. Automatic delegation is the requested default, with Approve new sessions optional. Existing permissions and destructive-action rules still apply.
4. **One shared conversation, compact task reports.** Worker questions and decisions have task identity. Managed tasks is a disclosure within the conversation. Results include evidence; they remain In review until accepted. Tool traces stay in workers.
5. **Telegram is optional and local.** The draft uses a dedicated user-owned bot and one confirmed private account. A token check precedes a temporary pairing link; desktop confirmation chooses the account. Availability and Telegram message handling are explained in setup.
6. **Pause has a precise effect.** Workers continue; new manager dispatch waits. Disable also revokes remote controls and preserves history. Resume reconciles worker state before acting.
7. **Phone uses existing navigation.** The same conversation supports reading and answering; phone settings summarize scope and pause/resume. Credentials and project grants stay on desktop. No new bottom tab is proposed.
8. **Select assistant and model.** Use the selected assistant/account model list with Provider default and unavailable/error states. Saving during an active turn queues the change for its next turn. Workers keep their own settings. Example model names in the prototype do not represent the real catalog.
9. **Manager is an inspectable session.** Header shows assistant, model, All projects and state. Session info shows backing/logical IDs, known telemetry, worker/decision counts and CLI activity. Open session returns to the same conversation; restart confirms replacement of runtime while preserving task state.
10. **Use GeckIt's existing design system.** The prototype snapshots existing color, radius and typography tokens, with the same restrained sidebar, fields, green primary actions and quiet task states. Review controls are labeled outside product content. The standalone prototype is historical design evidence. Production implementation uses existing renderer components and scoped styles.
11. **Enabled providers and explicit worker routing.** Manager controls GeckIt only through its CLI and uses enabled providers. Proposed new-worker precedence is explicit task choice, saved project preference, then GeckIt default; validate before dispatch and block selected-provider failures without substitution. Existing workers retain their provider, independent of the manager's selection. Preferences are requested through the shared conversation; no new settings layout is introduced in this revision. See UX section 8 for exact replies and transitions.

See the UX document for the complete decisions, state machines and wording rather than treating the simplified fixture engine as the behavioral authority.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1; FR-001-004 | Dedicated entry, assistant/model, All projects and CLI role | Enable with a nondefault model; switch assistant; discover new project automatically; allow valid CLI mutations |
| US2; FR-005-008 | Managed workers, assignment summaries, policy controls and attach confirmation | Request work automatically; Start/Refuse under approval policy; confirm/cancel attach; route correction and stop to the correct real worker |
| US2; FR-009-012 | Event-driven summaries, task-bound questions, evidence and native permission handoff | Resolve one question; receive completion in In review; open native permission without manager proxy approval |
| US3; FR-013-014 | Dedicated bot, password entry, identity check, expiring pairing and desktop account confirmation | Empty/rejected token; replacement; accept/reject candidate; real expired/unpaired/group/conflict checks |
| US4; FR-015-018 | Shared conversation, Telegram attribution, compact choices and explicit delivery outcomes | Telegram text/Reply/button and desktop answer converge; duplicate/stale actions act once; local-only result has honest open guidance |
| US5; FR-019-022 | Durable ownership, pause/resume, disabled history, offline and late-work confirmation | Restart/compact ten tasks with two decisions; reconcile uncertain dispatch; confirm/discard old remote work |
| US6; FR-023-024 | Recovery, model/provider switch, project removal, disconnect and disable | Remove project using normal GeckIt flow; provider recovery; disconnect rejects old actions; re-enable reviews saved settings |
| FR-025-026 | Quiet events, scrollable conversation, stable composer, focus and phone summary | Long names/list; desktop keyboard; light/dark; 1280 x 800, 390 x 844 and 320 x 740 |
| FR-027-029 | Existing account/VPN/host limits, untrusted input and auditable decisions | Real queue/concurrency/provider limitations; malicious worker report cannot bypass permissions; historical decisions retain identity |
| FR-030-032; SC-009-010 | Visible session, provider model selection and full CLI management | Save next-turn model, inspect current runtime, Open session, restart without losing task/decision ownership |
| FR-033; SC-011 | Enabled-provider-only CLI routing and saved project preference | Explicit IDs follow override/preference/default; disabled or host-incompatible choice blocks; preference survives restart; existing workers retain provider |
| SC-001-008 | Setup time, realistic task trial, CLI management boundaries, deduplication, latency, recovery, authorization and viewport checks | Viewport/fixture presentation reviewed below; all service-backed success criteria require implementation acceptance evidence |

## Review Evidence

Reviewed interactively in Chrome on 2026-10-17. Desktop viewport: **1280 x 800**. Phone viewports: **390 x 844** and **320 x 740**. Both themes were visually inspected in full-screen context. The prototype uses local fixture state and no backend.

| Check | Observed result / evidence |
| --- | --- |
| Setup layout and settings scrolling | Assistant, scope and delegation use one scroll body; footer actions remain reachable. [Light setup](../../docs/design/manager-telegram-shots/setup-light.png), [dark setup](../../docs/design/manager-telegram-shots/setup-dark.png) |
| Revised all-project setup | No per-project checklist. Model selector and All projects explanation replace initial scope validation |
| Manager conversation and question | Task identity, compact messages, bound choices and composer are visible. [Light](../../docs/design/manager-telegram-shots/manager-light.png), [dark](../../docs/design/manager-telegram-shots/manager-dark.png) |
| Delegation policies | Automatic fixture work starts immediately. Approve new sessions offers Start/Refuse; Refuse creates no fixture task and Start creates one |
| Pause/resume | Worker question choices are disabled while paused and restored on resume. Incoming fixture messages receive the saved-until-resume explanation |
| Bot setup and account confirmation | Empty token focuses error; `invalid` reaches replacement; dummy token reaches verified fixture identity; reject returns to waiting; confirm connects. [Account confirmation](../../docs/design/manager-telegram-shots/pairing-light.png) |
| Telegram and recovery scenarios | Channel preview, late request Discard, native permission open guidance, reconnecting notice, provider failure and Try again exercised |
| Disabled history and re-enable | Confirmation disables controls while keeping the transcript and task disclosure; re-enable restores saved scope |
| Reading earlier updates | A new fixture completion preserves the earlier reading position and shows New updates; the action scrolls to the latest content |
| Completion | Fixture result appears as Ready for review and task becomes In review |
| Keyboard and focus | Composer Enter sends; settings initial focus reaches assistant; Escape cancels settings and restores Manager settings button. Dialog steps focus headings; native controls remain keyboard reachable |
| Phone conversation | Both themes inspected at both sizes; no page horizontal overflow; composer stays within viewport. [390 light](../../docs/design/manager-telegram-shots/phone-light.png), [390 dark](../../docs/design/manager-telegram-shots/phone-dark.png), [320 light](../../docs/design/manager-telegram-shots/phone-compact-light.png) |
| Phone settings | Read-only scope summary and pause control, with no token entry. [Dark phone settings](../../docs/design/manager-telegram-shots/phone-settings-dark.png) |
| Long list | Twenty-five representative tasks fit inside a scrolling conversation; the composer remains visible at 320 x 740; long names wrap. Task disclosure remains open across fixture updates |

Initial review fixes included valid scope actions (superseded by All projects in this revision), pause prevents decision dispatch, disabled history stays visible, task disclosure state survives redraw, and viewport sizing follows the actual review-toolbar height. New updates provides an action when messages arrive above the current reading position.

### Verification limits

This is a design prototype, not the production renderer. Its small fixture engine demonstrates presentation and primary transitions. It does not prove bot authentication, secure storage, account authorization, event transport, CLI management authorization, real worker control, persistence/restart recovery, deduplication or performance targets. No real Telegram token was entered, bot contacted, message sent or worker started.

Resume displays the reconciliation state but does not replay saved fixture requests. Only one current question is modeled. Full decision history, all delivery outcomes, pairing expiry/conflict/storage failure, complete task groupings/evidence navigation, board origin links and the phone Tasks entry are specified in UX but simplified or absent in the prototype. These states remain implementation acceptance work. The Telegram preview illustrates content and choices, not an exact native Telegram client. Native mobile keyboard and installed-app behavior were not tested. A complete keyboard-only setup journey and production screen-reader review remain acceptance checks.

Performance planning must preserve event-driven wakeups, bounded reports, a compact durable record, no idle model polling, no full worker-transcript mirroring and no indefinitely occupied manager slot. Long task history must not force full transcript/list rebuilds or move the user's reading position. The standalone prototype is not a production rendering strategy or performance benchmark.

## Revision review: model, all projects and visible session

Alex's corrections supersede the first draft's per-project enrollment, manager ban on file management and optional automatic-delegation default. FR-002-005 and FR-030-032 now define the revised behavior. Session info includes real-runtime identity requirements, not a hidden coordination proxy. The installed CLI was inspected again; missing management coverage is required future work.

Revised Chrome review used the same desktop and phone sizes in both themes. Existing Telegram fixture checks above remain presentation evidence; no integration is claimed.

| Revised check | Observed result |
| --- | --- |
| Model selection | Selecting an explicit model saves it. Changing assistant resets the picker to Provider default before save; unavailable-model fixture disables Save and explains recovery |
| Next-turn model | During Coordinating, Save retains the current model and displays Next turn in Session info. Confirmed runtime restart applies the pending selection; workers keep their existing settings |
| All projects | Per-project checklist removed. Fixture project/file creation raises registered-project count from three to four without enrollment; requested Twins-AI worker uses that project |
| Session information | Logical and backing IDs, configured model/state, worker/question counts, unavailable context telemetry and recent CLI outcomes visible. [Light session details](../../docs/design/manager-telegram-shots/session-light.png), [dark](../../docs/design/manager-telegram-shots/session-dark.png) |
| Same-session UI | Open session closes details, focuses the message composer and leaves exactly one manager conversation. Escape restores Session info focus |
| Restart | Cancel preserves the active turn. Confirm warns of interruption, changes fixture backing ID from 1 to 2 and retains worker ownership/history. Deep persistence and multi-question recovery remain unverified |
| Phone | Model/All projects header and Session info inspected at 390 x 844 and 320 x 740, both themes. At 320, dialog content/actions scroll into reach; document width equals 320 and composer bottom stays at 740. [Phone details](../../docs/design/manager-telegram-shots/session-phone-dark.png), [compact details/actions](../../docs/design/manager-telegram-shots/session-phone-compact-dark.png) |
| Lifecycle/recovery | Pause/resume from Session info changes current state; provider Try again restores the existing pending question without replacing the session |

Model names, IDs, timestamps, CLI file/project outcomes and restart are fixture data. Real model-list loading/refresh failure, effective model acknowledgement, permission enforcement, complete CLI operation inventory and file mutations have not been exercised. No assistant or Telegram integration was added. The prototype uses representative model options; implementation must use the actual assistant/account source.

## Open Decisions

Alex authorized first-version implementation on 2026-10-17 and subsequently requested support for every enabled provider. The existing layout direction is adopted with the V1 boundary documented in spec/UX: a special Manager session using its selected provider's normal runtime, Automatic or approval-based delegation, and discoverable limitations for advanced CLI domains. The implementation adds bound approval decisions for new sessions; acceptance evidence must verify that behavior before it is claimed complete. This authorization does not certify provider terms or approve publication.

Provider-routing revision is documented in spec and UX only. The existing prototype covers the shared conversation and task-bound choice layout, but has not exercised the new routing messages, persistence or enabled-provider validation. SC-011 needs implementation and real CLI verification; prior screenshot/fixture reviews do not establish those behaviors.

- **Bot ownership:** draft uses Alex's dedicated BotFather bot. A shared hosted bot would add service ownership, account routing, operating cost and availability scope (US3/FR-013-014/021).
- **Provider eligibility:** the [terms review](research.md#provider-terms-review-2026-10-17) withdraws the unconditional no-API-account assumption. Before release, establish permitted authentication and distribution for each assistant, including the custom UI and Telegram relay. CLI availability alone is insufficient; provider approval or API access may be required.
All-project access, automatic management and model selection were explicitly requested. Bot ownership uses the dedicated user-owned bot default. Provider eligibility and distribution terms remain a release consideration; installed command support is not a legal determination.

## Implementation Handoff

The plan, data model, CLI contracts and tasks in this feature directory define the authorized first version. Every enabled builtin or library provider can run the Manager role through its existing session runtime, with normal provider permissions and Manager instructions. Structured application requests pass through the validated CLI gateway. Project routing validates explicit task choice, saved project preference, then GeckIt default; failure blocks without substitution.

The CLI initially covers project and file management, provider discovery and managed worker operations. Advanced organization, schedules, library installation and host/settings mutations remain explicitly unsupported in capability discovery. Supported native provider permissions can also be answered through the paired Telegram account, as specified in the 2026-10-19 amendment; typed/URL/unsupported requests retain the native UI handoff. See [plan](plan.md) for boundaries and [tasks](tasks.md) for progress; actual test, CLI and rendered UI evidence will be recorded in verification.md.

Implementation is local on `feature/011-manager-telegram`. No commit, publication or bot connection is authorized by this delivery. Existing unrelated checkout edits are preserved. The implemented feature list requires Alex's approval of an exact entry; proposed or unverified capabilities must not be added as working support.


## Enabled-provider correction - 2026-10-17

Alex explicitly requests all enabled providers for Manager. The session role supplies instructions and dedicated UX on top of the existing builtin/library runtime. The initial Claude-only adapter gate is superseded. Follow [UX enabled-provider revision](../../docs/ux/manager-telegram.md#enabled-provider-revision---2026-10-17) for model discovery, saved disabled choices, confirmed assistant replacement, actual provider/model labels, and retained workers/decisions. This correction authorizes implementation. The earlier standalone prototype/restriction evidence is historical; updated actual-renderer/provider-boundary evidence belongs in verification.md.

## Telegram-only correction - 2026-10-17

Alex removed the Desktop/phone Manager conversation: Manager is useful only through Telegram when away from his computer. Follow [Telegram-only UX](../../docs/ux/manager-telegram.md#telegram-only-revision---2026-10-17). Desktop Settings retains setup, connection status and lifecycle recovery. No Manager chat, navigation pin, backing-session card/search result, phone Manager page or worker-origin link remains. All enabled providers, CLI coordination and ordinary worker UI remain. This explicit correction authorizes the UI/runtime update; historical conversation prototypes are superseded.

## Native approvals and guided setup - 2026-10-19

Alex authorized native Telegram approvals and message-spacing repair. The [UX amendment](../../docs/ux/manager-telegram.md#telegram-approvals-and-guided-setup---2026-10-19) supersedes native-permissions-in-GeckIt-only behavior. Reuse the actual Settings renderer for guided personal-bot setup and browser verification; no Desktop/phone Manager conversation returns. Shared hosted routing remains a separate service choice; no shared token is embedded in clients. T031-T034 track implementation and verification.

The amendment is locally implemented and verified. [Verification](verification.md#telegram-approvals-formatting-and-guided-setup---2026-10-19) records native-contract fixtures and actual renderer review. [Rendered approval states](evidence/telegram-approval-states.svg), [light setup](evidence/telegram-setup-guide-light.png), [compact dark setup](evidence/telegram-setup-guide-dark.png) and [token step](evidence/telegram-token-dark.png) are current evidence. Live Telegram/provider integration remains unverified.

## Desktop inspection correction - 2026-10-19

Alex now requests opening the Manager session from the bottom bar to inspect what is happening. Follow [Desktop inspection UX](../../docs/ux/manager-telegram.md#desktop-manager-inspection---2026-10-19). This supersedes the earlier complete removal of Desktop inspection, while preserving Telegram as the main task channel, hidden ordinary discovery and unchanged phone behavior. Use the production transcript in a deliberate read-only inspection dialog; opening it preserves the ordinary task selection and draft. Current identity, lifecycle/race handling and read-only effects need focused main-process and actual-renderer evidence. T035-T037 track this amendment.
