# Work paused

Alex requested stopping on 2026-10-05. Preserve unfinished task states; do not resume implementation without his request. Branch and full findings: [findings-and-handoff.md](findings-and-handoff.md).

# Tasks: Built-in agent VPN

Input: spec.md, plan.md, design.md, research.md, data-model.md, contracts/desktop.md, quickstart.md.

## Phase 1 - Setup

- [x] T001 Settle server-selection behavior and configuration-only native gate in specs/004-agent-vpn/design.md and docs/ux/agent-vpn.md.
- [x] T002 Define non-secret VPN domain and desktop bridge contract in client/src/shared/vpn.ts and specs/004-agent-vpn/contracts/desktop.md.

## Phase 2 - Configuration foundations

- [x] T003 Validate supported native configuration, reject hooks and unsupported fields without leaking values in client/src/main/vpn/config.ts.
- [x] T004 Retain atomic encrypted profiles and persisted selected server, reject insecure storage, and preserve previous data on failure in client/src/main/vpn/store.ts.

## Phase 3 - US1 native runtime gate

Goal: all native agent traffic through selected tunnel. Independent test: packet capture of direct TCP/UDP/DNS/helpers/browser while switching PC VPN.

- [ ] T005 [US1] Qualify signed native per-process enforcement, DNS and descendant/browser ownership before implementing runtime admission in client/src/main/vpn/ and recording proof in specs/004-agent-vpn/research.md.
- [ ] T006 [US1] Integrate protected launches and shared-socket rejection in client/src/main/sessions/, correction, provider metadata paths, browser helpers and remote/delegated controls only after T005; adapt the Claude tmux plugin to a dedicated protected server/socket rather than reuse a default server, with bounded hook control.

## Phase 4 - US2 failure enforcement

Goal: zero fallback and preserved messages. Independent test: gateway/service crash and startup failure, no direct packets or duplicate sends.

- [ ] T007 [US2] Prove native failure blocking independent of GeckIt and safe pending-message behavior in client/src/main/vpn/ and client/src/main/sessions/ after T005.

## Phase 5 - US3 configuration

Independent test: import/check/rename/remove in desktop, secure storage failure keeps existing data, Connect unavailable until native gate passes.

- [x] T008 [US3] Implement bounded native picker and safe configuration service/events in client/src/main/vpn/index.ts.
- [x] T009 [US3] Wire desktop-only non-secret API in client/src/shared/api.ts, client/src/preload/index.ts and client/src/main/index.ts.
- [x] T010 [US3] Add Agent VPN section with import/check/name/remove and truthful unavailable connection state in client/src/renderer/src/ui/AgentVpn.tsx, SettingsDialog.tsx and styles.css.

## Phase 6 - US4 multiple servers

Independent test: two saved profiles, selection survives restart, no active claim while runtime unavailable.

- [x] T011 [US4] Implement persistent selector, rename and selected removal with no automatic failover in client/src/main/vpn/store.ts and client/src/renderer/src/ui/AgentVpn.tsx.
- [ ] T012 [US4] Implement safe runtime switch and busy-agent boundary only after T005/T007 in client/src/main/vpn/.

## Phase 7 - Validation

- [x] T013 Exercise malformed/unsupported config, encryption refusal, atomic write failure, retained selection and no-key payloads in client/test/vpn-*.test.ts.
- [x] T014 Review real settings interactions, themes, keyboard and viewports with client/src/renderer/agent-vpn-preview.html and client/src/renderer/src/agent-vpn-preview.tsx; performance review docs/performance.md.
- [x] T015 Run client lint/typecheck/tests/build and mobile build, update configuration-only evidence in docs/feature-audit.md and approved configuration entry in docs/features.md.
- [ ] T016 Execute all native routing scenarios in specs/004-agent-vpn/quickstart.md; keep unchecked without runtime proof.
- [x] T017 Implement clearer configuration-only setup and finite on-demand demonstration from the updated UX handoff in AgentVpn.tsx, AgentVpnDemo.tsx and scoped styles.css; preserve the existing profile API and error behavior.
- [x] T018 Review T017 in Chrome at desktop/narrow sizes in both themes, including playback, pause/replay/manual scenes, reduced motion and hidden/offscreen lifecycle; run checks/builds and update working-tree evidence. Offscreen pause was exercised; hidden-tab cleanup/pause was reviewed in source because the browser observer activates its target tab. Native app UI and CPU remain unverified due Computer Use access.
- [x] T019 Replace the rejected separate-scene demonstration with the continuous Amnezia-to-GeckIt file transfer in ux.md, using the Apple UI skill and GeckIt's own design language.
- [x] T020 Review T019 in Chrome in both themes and at desktop/narrow sizes; verify named steps, finite playback, pause/restart, reduced motion and focus, then run checks/builds and record evidence. Fixed observed layout and CSS specificity defects; limitations recorded in design.md.
- [x] T021 Implement FR-027 bottom-bar status and direct Agent VPN settings entry from the updated UX/design/plan, preserving provider and phone behavior.
- [x] T022 Review footer loading/error/unavailable states, profile updates, settings focus and usage overflow in Chrome light/dark at both viewports; run checks/builds and record configuration-only evidence. Real Status/Settings preview and source integration reviewed; native Electron access and reconnect remain unverified/unimplemented.

## Dependencies and implementation strategy

T001 -> T002 -> T003/T004 -> T008/T009/T010/T011 -> T013/T014/T015 is configuration-only work authorized independently of the native gate. Configuration does not complete US1/US2 or runtime switching. T005 blocks T006/T007/T012/T016; no native Enable may be added before it passes. T003 and storage skeleton can be developed independently once shared contracts are set, but interface integration is sequential. UI preview and parser/storage verification can run independently. Runtime/native work can run independently from configuration; never call the whole VPN done while its tasks remain unchecked.

- [x] T023 Add read-only paired-computer VPN bridge, mobile footer and status/settings sheet under FR-028.
- [x] T024 Review mobile states in Chrome in both themes, verify bridge boundary and desktop regression, rebuild both apps and record evidence.

- [x] T025 Enforce configured-VPN admission before agent/provider/correction work, including SSH handoffs, preserve queued messages and no-profile behavior, and show truthful blocked state.
- [x] T026 Prove T025 with meaningful dispatch/launch tests and Chrome desktop/phone state review; rebuild and record limits.
- [ ] T027 Implement real native tunnel reconnect with continuous packet-level blocking after native qualification; do not substitute metadata refresh.

- [x] T028 Replace rejected outlined desktop VPN footer control with integrated utility-strip styling, isolate provider overflow, and self-review full board context in both themes and desktop/narrow viewports.

- [x] T029 Remove rejected setup demo and all dedicated state/component/styles; preserve text instructions and import/profile controls; review real settings in Chrome both themes and target sizes, rebuild desktop/mobile and record evidence.

- [x] T030 Implement and test host-owned framed packet transport using pinned AmneziaWG, with secret-free error/status output and reproducible platform builds.
- [ ] T031 Qualify the selected native macOS execution boundary; wire capture, continuous blocking and protected launch/plugin/remote behavior. Provisioned notarized version 14 is activated with macOS approval. Changed runner executable identities lost capture at the original path; a byte-identical runner at a fresh path recovered IP capture. DNS counters remained zero and the default-DNS matching control also failed. LaunchServices capture passes TCP/UDP/ICMP for IPv4 and generated /120 IPv6. Runner, detached child and dedicated private tmux server pass local IPv4 TCP/UDP failure checks through gateway loss/disconnect, including an open TCP socket and ordinary-network controls. DNS still fails; provider crashes, browser/daemon ownership, full failure matrix and secret boundary remain unverified. Direct executable launch is uncovered.
- [ ] T032 Integrate truthful Connect/Reconnect/switch states only after T031; validate live imported-server traffic and failure recovery on desktop/phone.

- [x] T033 Build the native macOS qualification bundle and offline route/DNS/framing and provisioning-capability checks; keep it separate from GeckIt admission and production agents. Compile and ad-hoc bundle verification are not installed routing proof.

- [x] T034 Explain intended agent VPN routing with SSH-style connected/disconnected motion and accurate admission-only status on desktop/phone; review themes, motion lifecycle, keyboard and scrolling, rebuild both clients and document limits. Chrome review and checks passed; native/physical-device execution and hidden-tab timing remain unverified. T031/T032 are still open.

- [ ] T035 Notarize and staple the provisioned qualification bundle, reactivate it from /Applications with actual local macOS approval, then complete T031 installed capture/failure qualification. Versions 5 and 7-14 notarization, stapling, Gatekeeper assessment and activation succeeded on 2026-10-05. Alex subsequently authorized the updated uploads, so that approval blocker is resolved. Version 14 is installed with IPv6 prefix correction, synchronized transport-padding initialization and secret-free DNS counters. DNS, update-safe capture and full installed failure qualification remain incomplete, so this task stays open. Work is paused; see findings-and-handoff.md.
- [ ] T036 After T031, implement FR-030 automatic installation/activation and same-server recovery from automatic-setup-ux.md, package signed/notarized components for both Mac architectures, and test fresh install, denied/revoked approvals, app updates, retry/reconnect and phone status. End users never perform developer provisioning; no silent approval, server substitution or direct fallback.
