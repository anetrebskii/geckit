# Design: Built-in agent VPN connection

**Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Status**: Implementation requested; saved servers added to handoff; native enforcement remains gated

## Scope

Self-hosted AmneziaWG, all agent and tool traffic, transparent operation with host-owned configuration. Settings supplies import, setup, status, enable/disable, and repair. Phone-started agents inherit the computer's policy. Agent prompts and proxy variables are not used to configure routing.

## Artifacts

- UX document: [agent-vpn.md](../../docs/ux/agent-vpn.md)
- Revised demonstration UX: [ux.md](ux.md), replacing the rejected separate-scene illustration with a continuous file transfer.
- Current traffic explanation UX: [routing-ux.md](routing-ux.md). The preceding file-transfer walkthrough is abandoned; current motion explains intended routing and disconnection only.

## Agent traffic explanation handoff - 2026-10-04

The supplied screenshot has import instructions but no purpose or traffic explanation. Follow [routing UX](routing-ux.md): purpose, accurate current build support, then compact agents/VPN/internet objects and wires like HostsMotion, followed by existing setup. Use GeckIt tokens/icons and HTML transform/opacity. One finite sequence ends disconnected, with static state controls, pause/replay, hidden/offscreen pause and reduced motion. Reuse on the phone sheet. Real runtime/footers remain independent; no native connection or capability approval is inferred. Review full desktop/sheet context in both themes at target sizes. The real component browser preview and [setup prototype](../../docs/design/agent-vpn-setup.html) are the layout artifacts.

## Apple UI demonstration revision

Alex rejected the first demo and explicitly requested apple-ui on2026-10-04. Its weak hierarchy and generic upward fades did not show export/import causality. Follow [the revised UX](ux.md): persistent Amnezia and GeckIt application surfaces, one configuration file travelling from export to a saved row, named step controls and one primary playback action. Reuse GeckIt tokens, radii, icons, font and motion curves; no Notula palette, gradients, glows or new UI dependency. The inline browser preview continues to mount the actual component, with both themes and reduced-motion fixtures. Native VPN routing remains outside this revision.
- Layout prototype: [agent-vpn.html](../../docs/design/agent-vpn.html)
- Configuration setup preview: [agent-vpn-setup.html](../../docs/design/agent-vpn-setup.html), mounting the real Settings component through the existing browser preview.

## Requested setup clarity update

Alex requested clearer, intuitive setup and motion on 2026-10-04 after the unavailable screen caused confusion. Implement the configuration-only section of [the UX handoff](../../docs/ux/agent-vpn.md#configuration-setup-and-demonstration): visible numbered export/import instructions, one primary Import .conf file action, a compact truthful unavailable notice and no disabled Connect dead end. Saved selection is explicitly for later connection support.

Add a separate, on-demand three-scene setup demonstration with finite playback, pause/replay/manual scene controls and reduced-motion support. It illustrates configuration export/import/storage only, never pretends routing is enabled and never invokes actual VPN configuration actions. Use compositor transforms/opacity, pause offscreen/hidden, clean up on unmount. This existing-feature improvement is authorized by Alex's explicit UI request; native routing gates stay unchanged. Review real components in Chrome light/dark and desktop/narrow sizes before calling it done.

## Decisions

- Protection is one policy for local agents, not a per-conversation preference.
- Import a dedicated native configuration rather than reuse the browsing client's connection identity.
- Native enforcement must remain active before startup and through tunnel/helper failure. UI status does not enforce routing.
- Uncovered remote agents, shared browsers, and delegated network tools are blocked when protection is required.
- Preserve native tools; do not silently move agents into a different operating system.
- Do not promise undetectability. Enforce ordinary networking without tunnel keys, VPN prompts, or agent-side configuration.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1 / FR-001 through FR-005, FR-017, FR-018 | Import and enabled connection | Import, enable, send requests, switch computer VPN, inspect actual outbound traffic and agent environment. |
| US2 / FR-006 through FR-008, FR-013, FR-019, FR-020 | Blocked failure states | Interrupt or crash enforcement/tunnel during direct TCP/UDP, DNS, and browser use; zero escape. |
| US3 / FR-009 through FR-012, FR-014 | Setup, OS consent, status, repair | Restart, invalid import, protected secret storage, subscription use, focus, keyboard, both themes. |
| FR-015, FR-021 | Explicit execution boundary | Attempt uncovered remote/shared-browser actions and verify rejection; verify native local tool behavior. |
| FR-016 | Physical connectivity and exit-IP limitation | Gateway transport blocked by computer VPN is a blocked state, never a direct fallback. |

## Review Evidence

Chrome review used desktop 1352 x 706 and narrow 390 x 844 viewports. All ten simulated states were selected in light and dark themes; no horizontal overflow was observed. Clicked import, enable, setup, system-approval check, failure, retry, connection-ready, disable, and remove transitions. Expanded export help, verified Escape closes it and returns focus to its summary, and verified action focus follows transitions. Narrow help content scrolls vertically. The temporary viewport override was reset after review.

The app stylesheet initially collided with generic prototype classes. Prefixed classes fixed the layout; a script syntax error introduced by that rename was corrected, syntax checked, and the interaction review was repeated. These findings concern the proposed standalone prototype only.

Performance review: one settings card, no per-conversation rendering, scanning, polling, formatters, or infinite animation. State changes are event-driven. Production app measurement and rebuilding the phone apply when shared app UI is implemented; this prototype changes neither runtime.

Prototype states are simulations, not evidence of network protection. Native networking, OS consent, real connection import, DNS, and routing were not validated.

## Open Decisions

Protocol and all-traffic scope are settled. Alex's literal request that an agent cannot discover VPN use is not achievable. Alex subsequently requested implementation, including multiple saved servers and a switcher. This authorizes the practical transparent interpretation; the UI must not claim absolute undetectability.

Engineering prerequisites remain: deployable native enforcement with DNS coverage, all descendant ownership, dedicated browser ownership, and fail-closed behavior when the service itself is absent or crashes.

## Planning Handoff

The architecture must satisfy all-traffic enforcement before integrating an Enable control. Configuration and server selection can be implemented independently with a disabled Connect control and an explicit statement that networking is unchanged. A userspace AmneziaWG engine compiling does not establish that arbitrary native sockets enter the tunnel. The prototype must not be shipped as a functional feature before the native feasibility gates pass. Review against `docs/performance.md`; use event-driven state, no per-card polling or perpetual animation. Alex has requested the feature and settled product scope; approval of this specific layout has not been requested or recorded.

## Server switcher handoff

Settings shows a labelled native select `Server`, name input, Import configuration, Save name, Check configuration, and Remove controls. Remove expands an inline Cancel/Remove server confirmation. Invalid import retains saved selection. Empty, selected, checking, invalid, storage-unavailable, and native-unavailable states require light/dark Chrome interaction review with the real app component. Connected/switching simulations in the proposed prototype remain future native-runtime behavior, not working support.

## Implementation review finding

At 390x844 the existing desktop two-column Settings layout left only 125 pixels for VPN content, splitting button labels mid-word. The VPN section will use a single-column body with horizontal section navigation below 600 pixels. Desktop layout and other sections retain their current behavior. This is a measured layout defect despite no horizontal document overflow; re-review the real component after the scoped fix.

## Final configuration UI review

Reviewed real SettingsDialog/AgentVpn with app stylesheet in Chrome, light/dark, at 1352x706 and390x844. Verified saved selection, name changes, offline check notices, empty/import, invalid import with retained selection, cancelled import, secure-storage/corrupt-store disabled states, failed writes with retained selection, removal confirmation/Cancel/Escape, no automatic selection after removal, export-help Escape/focus, and vertical/horizontal navigation scrolling. Narrow content now has311pixels rather than125; no document overflow. The name input follows theme tokens after adding its text type. Browser console showed no page errors. Early immediate-navigation clicks were retried after observing that the new page had not painted; final states were verified.

[Configuration-only screenshot](../../docs/design/agent-vpn-settings.jpg). Synthetic preview metadata never contacts a VPN. The real native OS picker, live server handshakes and routing enforcement were not validated in Chrome.

Performance review: typing recomputes a bounded server selection and native options only; no conversation scans, formatters, polling or animation. This one settings instance does not touch repeated conversation rendering, memo handlers or row identity. Narrow scrolling uses existing native scroll containers. No passive measurement was required for a per-conversation or animated change. Phone build is required because shared styles/settings changed.

## Setup clarity and motion review

Reviewed the final real SettingsDialog/AgentVpn/AgentVpnDemo preview in Chrome at 1352x706 and390x844 in light/dark. Export instructions are visible without disclosure. No Connect control exists. Verified fixture import, saved selection, rename, offline Check file, removal confirmation/cancel and focus, invalid import with retained selection, secure-storage disabled actions with usable demo, and failed write retaining selection. Import errors now sit beside Import; storage availability errors precede setup instructions.

Verified initially static demo, Play, Pause, Replay during playback, all3manual scenes, finite completion at Saved, not connected, Close/Escape focus returning to Watch setup demo, and no saved-profile changes from demonstration. Scrolling the demo out of view paused its timer and CSS animation. Computed CSS reported3s,1iteration,paused for the file movement. Reduced-motion preview used a fixture-only media preference: no animation, no playback controls, manual scenes remained usable. Narrow document width was390pixels with no horizontal overflow. Temporary viewport override reset.

[Setup screenshot](../../docs/design/agent-vpn-setup.jpg) and [demonstration screenshot](../../docs/design/agent-vpn-demo.jpg) contain synthetic metadata. An earlier preview HMR root warning did not recur after final reload. Full checks passed:688tests/61files, lint, typecheck, desktop build and mobile build.

Performance review found no source-level problems. Motion uses only transform/opacity on HTML elements, plays once on demand, pauses offscreen/hidden, and cleans timers/listeners/observer on unmount. No polling, per-frame React updates, conversation scans, formatters or repeated conversation components were added. Phone rebuilt. Hidden-tab pause and cleanup were reviewed in source; the browser automation activates its target tab, preventing an independent hidden-state observation. Native Electron UI/CPU measurement remains unverified because Computer Use denies GeckIt Local. This does not prove any native VPN routing.

| Performance item | Verdict | Evidence |
| --- | --- | --- |
| Animation uses the compositor | holds | HTML wrappers animate transform/opacity only; CSS timing inspected in Chrome. |
| Animation stops when unseen | holds in source and offscreen review | Finite playback; offscreen pause exercised; hidden listener and unmount cleanup reviewed. |
| Phone rebuilt after shared UI changes | holds | Final mobile production build passed. |

No repeated-row, formatter, conversation-filter, memo identity or pointer-tracking behavior changed. This demonstration appears once in Settings and only runs on demand; native CPU profiling was not performed.

## Apple UI walkthrough review

Alex rejected the initial separate-scene demo. The revision follows [ux.md](ux.md): both applications persist, one configuration file moves from Amnezia's export to GeckIt's import slot and saved row, and named Export/Import/Saved buttons replace numeric scenes. One primary playback action changes between Play, Pause and Replay; restart and close are quiet named icon buttons. Colours, type, icons, radii and motion use GeckIt's existing design authority rather than Notula's recipes.

Chrome interaction review used the real component and stylesheet at 1352x706 and 390x844, in light and dark. Verified initial static state, named steps, pause, restart during playback, finite completion, Close/Escape focus return and visible keyboard focus. Desktop opening now shows the entire walkthrough; narrow content scrolls vertically with readable application names, filename and captions, and no horizontal overflow. Fixture reduced motion in both themes removes animation/playback controls while retaining manual steps. The demo retained two synthetic profiles and their selected server.

Review caught two defects: the first layout exceeded the desktop Settings scroll region, and the running CSS selector lost to the more-specific paused rules. Compact gaps and caption reserves fixed the layout; equal-specificity running rules fixed motion. Rechecked actual animation-play-state=running, final file translateY=0 in the saved row, saved-status opacity=1 and finite paused completion. Offscreen playback retained its Export phase beyond a full playback duration. Hidden-tab handling and unmount cleanup are source-reviewed because browser observation activates its target; native Electron UI/CPU remain unverified.

Both Mermaid blocks in ux.md rendered successfully with temporary Mermaid CLI output. [Revised walkthrough screenshot](../../docs/design/agent-vpn-walkthrough.jpg). Final validation: 688 tests across 61 files, full lint/typecheck, focused checks after the CSS fix, desktop and phone builds, and diff check passed. No native routing or release-support claim.

No performance problems found in the revised walkthrough's source and browser review.

| Item | Verdict | Where | What |
| --- | --- | --- | --- |
| Long animation uses the compositor | holds | AgentVpnDemo.tsx and scoped styles.css | HTML wrappers animate transform/opacity only; 180ms movement uses existing settle/ease tokens, then caption dwell. No per-frame React state. |
| Animation stops when unseen | holds | AgentVpnDemo.tsx | Playback is finite and on demand. Offscreen pause exercised; document visibility and timer/listener/observer cleanup reviewed. |
| Phone rebuilt | holds | mobile build | Production build passed after final shared CSS change. |

Ten other checklist items are untouched. This is one optional Settings instance; no repeated-list work or passive native CPU measurement was added.

## Bottom-bar status handoff

**Status:** Implemented and reviewed in Chrome on 2026-10-04 under Alex's explicit request; working-tree support. Scope is FR-027 with FR-010/FR-023/FR-025 accuracy preserved. [Bottom-bar UX](../../docs/ux/agent-vpn.md#bottom-bar-status-and-direct-settings-entry) defines states and wording. The [real-component preview](../../client/src/renderer/agent-vpn-preview.html) and [layout entry](../../docs/design/agent-vpn-setup.html) mount real Status and Settings rather than a simulated settings screen.

One quiet leading footer control shows status and the existing settings glyph. It opens Agent VPN directly and returns focus on dismissal. Keep it visible during account overflow. Render in all desktop provider branches, absent on phone. Read the non-secret view once, update via broadcasts and refresh on focus. Isolate state in one status component; no per-row work or provider calls. Ordinary Settings continues to open General.

Current runtime is only unavailable. Loading/read errors are explicit; saved names belong in the tooltip, never a connected label. Native reconnect remains gated by T005/T007/T012/T016. No fabricated runtime states or new routing contract. Review themes, provider branches, read failure, profile updates, focus and overflow. Rebuild phone after Chat changes. Extend the shared checkout because this configuration feature is present here as uncommitted work; preserve unrelated edits.

### Bottom-bar review evidence

Chrome review covered light/dark, 1352x706 and 390x844, the real Claude and non-Claude Status branches (Codex and plugin fixtures), saved/empty/loading/read-error/storage-unavailable states, long profile names and overflowing quotas. Click, Enter and Space opened Agent VPN directly with its navigation button focused. Escape, Done and scrim dismissal returned focus to the footer. Ordinary Settings still opened General. Saved selection and rename broadcasts updated the tooltip without a connected claim. A mounted phone fixture showed zero VPN reads and no VPN control.

At 390px, quota scrolling reached scrollLeft=780 while the 119px VPN button remained at x=12; document width and scroll width both stayed 390px. Keyboard focus showed a 2px visible outline. Fixture typing kept view reads at 1 before/after. Source review confirms memoized isolated status, stable Chat callback, stale-read/event guards and listener cleanup. No native runtime or reconnect validation is inferred from these fixtures. Native Electron UI remains inaccessible through Computer Use; real Chat integration is source-reviewed and its real footer/settings components are browser-reviewed.

[Bottom-bar and direct-settings screenshot](../../docs/design/agent-vpn-footer.jpg). Validation passed: 688 tests/61 files, full lint/typecheck, desktop build, phone build and diff check. No runtime dependency or main-process API change.

Two development-preview createRoot warnings occurred while its entry file hot-reloaded at 16:23/16:26 UTC. Final navigation/review at 16:37 UTC produced no new console errors. The warnings come from the preview entry, which is not bundled into the production app.

No performance problems found in source and browser review.

| Item | Verdict | Where | What |
| --- | --- | --- | --- |
| Typing redraws only dependent expensive work | holds | AgentVpnStatus.tsx, Chat.tsx | Single memoized status with stable callback. No polling or extra reads from typing; bounded profile lookup only when its own view changes. |
| Phone rebuilt | holds | mobile build | Final production build passed after Chat/status changes; phone fixture makes no VPN calls. |

Eleven other checklist items are untouched. No new animation, repeated row or formatter. Native CPU profiling was not performed for this single static footer control.

## Mobile handoff

Requested by Alex on 2026-10-04. Implement the [mobile UX](../../docs/ux/agent-vpn.md#mobile-status-and-settings-entry) with GeckIt's existing PhoneKit grouped rows, Drawer and tokens. A quiet bottom status row opens the same Agent VPN sheet from home and conversation; a Host settings row provides another entry. Scope is read-only paired-computer metadata. Current native runtime is unavailable. No phone VPN, saved-server switching, or reconnect claim.

Bridge only `agentVpn.view` and `vpn:changed`; reject desktop configuration mutations on the phone. Report link loss immediately, refresh on reconnection/foreground, and never persist the view. Keep status independently memoized, mounted only where visible, and stop subscriptions on cleanup. Review real components in Chrome at phone sizes, both themes, with focus/scrolling/live-state fixtures. Rebuild phone and desktop; preserve the shared checkout's unrelated edits.

[Mobile layout entry](../../docs/design/agent-vpn-mobile.html) embeds the real-component browser preview with labelled synthetic metadata.

[Read-only phone contract](contracts/phone.md) extends metadata access while preserving the desktop-only configuration boundary.

### Mobile review evidence

Implemented and reviewed in Chrome on 2026-10-04. Real PhoneAgentVpn and PhoneKit components use synthetic host/profile metadata in the preview. Review covered both themes across 390x844 and 375x667, home/conversation placement, Settings Host entry, loading/error/offline/reconnect, empty/saved profiles and metadata update events. Long host/profile names wrapped without horizontal overflow; a smaller sheet scrolled to its remaining content. Footer button measured 44 pixels high; conversation footer occupied the bottom 44.5 pixels before safe-area inset. Keyboard fixture hid it and kept composer padding at 8 pixels. Typing retained one view read.

Click, Enter and Space opened the sheet with Done focused. Tab and Shift+Tab cycled only through sheet actions; focus was visible. Escape, Done and pointer swipe-back dismissed and restored opener focus. The first review found Done focus returning to body; moving background-inert restoration to layout cleanup fixed it, with the settled dismissal rechecked from footer and Settings row. Existing Drawer entrance/exit behavior is retained. Native touch gestures and iOS keyboard/safe-area values still require physical-device validation; the browser fixture verifies CSS and pointer behavior.

Three bridge tests cover read-only calls and subscription cleanup, immediate loss/offline rejection, old-link event/reply rejection, reconnection, send race and older-host errors. Source review confirms no persisted VPN view or phone mutation allowlist. Desktop direct entry/return focus passed in dark/light after this change. [Mobile footer evidence](../../docs/design/agent-vpn-mobile-footer.jpg), [mobile settings evidence](../../docs/design/agent-vpn-mobile-settings.jpg). Final checks passed: 691 tests/62 files, full lint/typecheck, desktop build, mobile build and diff check. No device installation, release, VPN routing or runtime reconnect claim.

No performance problems found in this slice. Review follows docs/performance.md; native Electron CPU is unmeasured.

| Item | Verdict | Where | Evidence |
| --- | --- | --- | --- |
| Typing redraws only dependent work | holds | PhoneAgentVpn / Chat | One memoized visible status with stable callbacks; typing fixture caused no extra read. |
| Animation runs on compositor | holds | Existing PhoneKit Drawer | Existing HTML transform/opacity transitions reused; no recurring motion added. |
| Running-app measurement | not required for this slice | No per-conversation addition | Single global status; browser interactions reviewed. Native app measurement remains unverified. |
| Phone rebuilt | holds | mobile production bundle | Build passed after final code/CSS edits. |

Nine other checklist items are untouched: no new per-row work, sorting, formatter creation, pointer selection or infinite animation. Native tasks T005/T006/T007/T012/T016 remain open.

## Required admission handoff

Alex explicitly changed configuration behavior on 2026-10-04: saved VPN requires a verified connection before agent work. Implement the [required-admission UX](../../docs/ux/agent-vpn.md#required-vpn-admission---2026-10-04). Current runtime remains unavailable, so saved configurations block new requests; no fake Reconnect. Initialize policy before queue recovery and backend work, retain queue/draft content on denial, block correction and provider requests, and enforce again at dispatch. Keep no-configuration behavior and offline local functions. Show required/blocked status on desktop and phone with its reason. Document application admission coverage separately from native packet enforcement.

Native signing identity is available; provisioning of a suitable Network Extension and packet-routing/crash/descendant qualification still needs resolution. An isolated Linux execution environment is an explicit runtime choice, not a silent substitute.

### Required-admission implementation review

Implemented the admission slice under FR-029. Real Chrome components reviewed in both themes at 1352x706 and390x844, plus long phone names at375x667. Required, no-profile, unreadable, insecure-storage, offline and unknown states are truthful; footer opens the correct destination, Refresh status cannot imply reconnect, removal of one profile stays required, final readable removal releases admission, demo ends at VPN required, focus and scrolling passed. [Desktop screenshot](../../docs/design/agent-vpn-required.jpg), [mobile screenshot](../../docs/design/agent-vpn-mobile-required.jpg).

705tests/63files, lint/typecheck, both builds and diff check passed. Performance review found no new repeated-row work, polling or continuous animation; typing caused no extra preview status reads. Native app performance and packet isolation remain unverified. The native Connect/Reconnect/backend tasks stay open. Global Codex AGENTS.md now requires Apple UX/UI for future UI work across projects, with each product's own design system.

### Footer visual-revision handoff

The supplied board screenshot rejects the outlined, cramped footer control. Follow [bottom-bar visual integration](../../docs/ux/agent-vpn.md#bottom-bar-visual-integration-revision---2026-10-04): borderless leading action, settings glyph before the label, one shared baseline and inset, separate scrolling provider group. Keep all state and admission behavior unchanged. Review full board context in Chrome, then click through direct Settings and focus return in both themes and viewport sizes. The preceding screenshot establishes settings behavior only and does not prove footer design quality.

### Footer visual self-review result

Reviewed the footer itself in Chrome beside the real Board and TopBar, using 6 and 36 synthetic sessions. Inspected dense dark board at 1394x1124 (supplied image dimensions), dense/sparse light/dark at 1352x706, supported minimum desktop 760x520 and independent footer stress 390x844. The outline inherited from quiet form buttons is removed; the settings glyph leads, the 32-pixel strip has a 24-pixel action, account values share its baseline, and provider details scroll separately. Hover and keyboard focus remain visible. [Dark evidence](../../docs/design/agent-vpn-footer-integrated.jpg), [light evidence](../../docs/design/agent-vpn-footer-integrated-light.jpg).

Clicked direct VPN Settings from the populated board; Enter/Space, Escape/Done and return focus passed. Required/unavailable/loading/unknown labels remain truthful; Codex/plugin quota overflow stays outside the fixed VPN action, with keyboard ArrowRight scrolling. Mobile retains 44-pixel touch target and its own footer; shared-CSS regression checked in both themes. At 390 pixels the desktop Board/header itself compresses beyond its supported 760-pixel minimum; this is not claimed as a supported mobile board or fixed by this footer revision. The independent 390-pixel footer had no document overflow.

Performance review: no new repeated-row production work, formatter creation, polling or animation; existing status memo/subscriptions remain. Typecheck, changed-file ESLint, desktop/mobile builds and diff check passed. No new tests were added for this cosmetic/layout revision; native Electron and physical iPhone verification remain unavailable. Global Codex instructions now require full-context visual self-review, correction of visible problems and recording verification limits before delivery.

### Demo removal handoff

Alex explicitly requested removal of the rejected setup demo. Follow [demo removal UX](../../docs/ux/agent-vpn.md#setup-demo-removal---2026-10-04). Delete its entry/control/component/styles and preserve real text instructions and configuration actions. The earlier demo screenshots and motion documents are historical evidence, not the current design.

### Demo removal review

Removed all demo code and controls while preserving setup/profile actions. Visually inspected the rendered screen in full context in Chrome light/dark at 1352x706 and 390x844, and at the supplied 1062x848 size. Reviewed readable hierarchy, aligned controls, spacing, page/nav scrolling, focus, empty/saved states, import, selection, rename/check, direct footer entry and Escape return focus. No overflow or visible removal defects found. [Screenshot](../../docs/design/agent-vpn-no-demo.jpg). Full typecheck, focused ESLint, both builds and diff check passed. Performance checklist found no new repeated work; demo animation/timer/observer work is deleted. Native Electron/iPhone interaction and native VPN runtime remain unverified/unimplemented.

### Routing explanation review - 2026-10-05

Implemented the latest request using [routing UX](routing-ux.md), the real HostsMotion pattern, GeckIt tokens and an inline figure. The former export/import demo remains deleted. The new figure explains intended agents/tools -> AmneziaWG -> internet protection; it explicitly says it is an illustration and not connection status. Actual status separately reports configured-VPN admission blocking and unfinished network-level blocking. SSH hosts need protection on the host; the phone sheet scopes status to its paired computer.

Reviewed real SettingsDialog/AgentVpn and PhoneAgentVpn in Chrome, with synthetic metadata: desktop light/dark at 1352x706 and supplied 1510x1060; narrow settings light/dark at 390x844; phone dark at 390x844 and light at 375x667. Inspected full-screen hierarchy, adjacent controls, spacing, page/nav scrolling, focus, saved/empty/loading/read-error copy, import, selection, rename, offline check and removal cancellation. Connected/Disconnected controls, finite completion, Pause/Resume/Replay and static reduced-motion fixture passed. Offscreen replay remained pending without the running class and resumed when scrolled back. Phone dismissal restored the entry focus; motion controls measured 44 pixels tall, with no document overflow. Fixed observed icon movement between states and reserved space for narrow wrapped labels. Hidden-tab pause and observer/listener cleanup were reviewed in source; browser observations activate the target tab, preventing independent hidden-tab timing proof.

No performance problems found in this slice. Checklist review covers typing (no text-dependent list or per-frame React work), compositor motion (HTML transform/opacity), visibility (one finite sequence, paused offscreen/hidden), and phone rebuild. Eight other items are untouched or not applicable to this single settings figure; native running-app CPU measurement remains unavailable. No timer, polling, provider call or backend mutation was added to the illustration.

Typecheck, focused ESLint, 11 existing admission/phone-boundary tests, desktop/mobile builds and diff check passed. These tests prove dispatch denial, not a native internet kill switch. Native Electron, physical iPhone, installed per-app routing and failure isolation remain unverified; native tasks remain open and provisioning permission is still pending.
