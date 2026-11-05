# Remote clients: local implementation and evidence

Date: 2026-11-06. Branch: `feat/remote-clients`. Worktree: `/private/tmp/geckit-remote-clients`. Base: `a2318afdba8d6cc74f8a5c2d7ba0940ce8af6113`. This is an isolated local implementation of the approved first stage in [ITD-001](../../DECISIONS.md) and [remote-clients](../remote-clients.md), not a deployed release. No production application restart, remote publication, credential changes or external infrastructure changes were performed. The main checkout and the parallel status/audit session's changes were preserved.

## Delivered behavior

- Headless service owns its stable server identity, encrypted per-device grants and source data. It runs under Node without Electron imports. Browser desktop and mobile share WebRTC protocol 2 and the same read-only viewer. `node-datachannel@0.33.6` provides native ICE/DTLS/SCTP; existing mobile encrypted signaling, framing and managed ICE credentials are reused.
- Server CLI issues a random 256-bit temporary invitation and optional terminal QR/deep-link. Default TTL is five minutes, maximum five minutes. A code enrolls one device only after the operator compares and approves the displayed verification phrase. Code possession alone does not authorize reads. The QR contains the same temporary invitation, never a persistent server secret.
- ECDSA server/client proofs bind identity, challenge, nonce, client key and negotiated SDP. Signed trust includes the complete project/Manager grant and endpoint. Device private keys are nonextractable browser CryptoKeys; saved trust is wrapped in IndexedDB. Server records are sealed in its existing vault. Reconnection proves the individual device key and checks revocation before serving data.
- Desktop Servers reads actual authorized projects, session summaries, paged conversation history and Manager from the service runtime. Service events invalidate a scoped snapshot; reconnect obtains a fresh epoch/snapshot. IDs are server-scoped; displayed server paths never become client filesystem actions. Multiple servers can be saved; one is viewed at a time.
- Read operations are explicitly allowlisted. Remote task control, approvals, generic RPC, files/terminal and native permissions are absent. Manager transcript/threads require an explicit `--manager` grant covering all configured projects, including profiles; a restricted grant receives summary state only.
- Desktop enters through the actual Chat top bar. Mobile supports code, server QR/deep-link and the existing legacy phone flow. The Hosts list gains a server entry while retaining its legacy host actions. Leaving a legacy mobile connection for Servers reloads its WebView to stop the legacy reconnect loop without deleting pairing; Local returns to the previous entry.

## Actual CLI (implemented)

Run these on the target GeckIt server using its built/distributed CLI. `geckit service run` is foreground; supervise it with the host's normal process manager if desired. This change does not install a daemon.

```sh
geckit service run --data /srv/geckit
geckit access enable --data /srv/geckit
geckit pair create --data /srv/geckit --project /srv/project --qr
geckit pair pending --data /srv/geckit
geckit pair approve REQUEST --phrase PHRASE --data /srv/geckit
geckit devices list --data /srv/geckit
geckit devices revoke DEVICE --data /srv/geckit
geckit pair cancel INVITE --data /srv/geckit
geckit access disable --data /srv/geckit
```

Repeat `--project` for additional authorized projects. Add `--manager` only with all configured project scopes to authorize Manager history. `--expires 60s` selects a shorter invitation lifetime. The viewer supplies add/connect/disconnect/forget; proposed `geckit servers ...` commands in the research are not implemented. Operator commands refuse conversation/Manager invocation. Existing local operator RPC remains private to the data directory.

Implementation: [CLI](../../client/src/cli/remote.ts), [foreground service launcher](../../client/src/cli/service.ts), [access/trust](../../client/src/service/remote/access.ts), [scoped gateway](../../client/src/service/remote/gateway.ts), [native transport](../../client/src/service/remote/transport.ts), [shared protocol](../../client/src/shared/remote/protocol.ts), [signaling](../../client/src/shared/remote/signaling.ts), [viewer](../../client/src/renderer/src/remote/Servers.tsx), [client lifecycle](../../client/src/renderer/src/remote/client.ts), [mobile entry](../../mobile/src/main.ts).

## Evidence matrix

| Check | Actual boundary exercised | Observed result |
|---|---|---|
| Native compatibility | Real Node22.23.4/26.9.0, macOS arm64, native libdatachannel0.24.6 | Ordered reliable channel echoed 9,500 bytes exactly; host/prflx UDP candidates. |
| Browser interoperability | Real Chrome131 RTCPeerConnection to native Node peer | Exact 7,500-byte echo, connected, server and browser both reported pass. |
| Packaged runtime strategy | Standalone copied service dependencies outside source checkout; Electron38.8.6 RunAsNode22.22.0 | Native loading and 9,500-byte exchange passed. No Electron window was launched. Target-addon guard accepts arm64 and rejects absent x64 addon. Full signed Electron artifact remains untested. |
| CLI/code/approval | Real built CLI and standalone headless service in isolated HOME/data/vault, local encrypted signaling mailbox | CLI created code/QR, pending phrase matched viewer, CLI approve released data. No user account was involved. |
| Mobile + desktop | Actual mobile entry on5214 and actual desktop Chat entry on5215, different browser origins/device identities, real WebRTC | Both enrolled and read the same running service. Desktop local/native boundary uses the existing browser acceptance harness. |
| Data and scope | Actual service/provider history, projects/settings and Manager runtime | Authorized project appeared; private fixture project absent with restricted grant. Explicit all-project + Manager grant exposed both projects legitimately. History loaded100 +25 items, first message0. Stored Manager transcript opened. |
| Events | Actual operator CLI `chat:rename`, service event, WebRTC and rendered desktop DOM | Title updated to “Updated by the real service event”. One local dev-build observation was1,537ms including CLI/snapshot coalescing, with no browser long task >=50ms during that sample; not a production performance benchmark. |
| Restart/reconnect | Real CLI foreground service stopped and restarted with unchanged isolated vault | Both enrolled clients reconnected without new code/approval and loaded a fresh snapshot. Final shutdown/restart did not retain45-second native timers; shutdown observed about0.3s. |
| Expiry/reuse/revoke | Real service, CLI and browser clients | One-second invitation expired; another identity using consumed code got reused. Revoking desktop produced explicit revoked while mobile remained connected. Saved mobile trust survived Local -> legacy pairing entry -> Servers and reconnected. |
| Authorization edge cases | Nine focused tests: seven access +two gateway, simulated channels/runtime/signaling, real WebCrypto/vault | Deny reads before approval; forged/SDP-mismatched/incompatible proofs; control/native RPC rejection; in-flight history suppression on revoke; restart trust/revocation; profiles/Manager primary thread; scope and host-ID isolation. These are not network E2E results. |
| Existing mobile | Full existing regression suite, mobile build, real new mobile entry and legacy Hosts UI boundary | Tests/build pass. Legacy host actions remain. Legacy phone transport/control was not exercised on a physical phone. |

The fixture provider is an explicit test plugin with an actual stored125-message conversation and Manager record. The UI does not receive a fake snapshot: it asks the real service runtime over real WebRTC. This proves transport/application integration with recorded provider data, not a live model account. Local mailbox replaces Firebase only for isolated E2E; it carries the same encrypted signaling payloads. Native permission/Electron bridges in the desktop acceptance harness are mocked, not physical OS integration.

Reproduction: [fixture README](../../client/test/browser/remote-clients/README.md), [setup](../../client/test/browser/remote-clients/setup.mjs), [transport probe](remote-transport-probe.md), [access tests](../../client/test/remote-access.test.ts), [gateway tests](../../client/test/remote-gateway.test.ts).

## Checks and UI review

Passed in the isolated worktree:

```sh
cd client
npm run typecheck
npm run lint
ELECTRON_OVERRIDE_DIST_PATH=/Users/alex/Projects/mine/geckit/client/node_modules/electron/dist npm test -- --reporter=dot
npm run build
cd ../mobile
npm run build
```

Full suite:125 files passed,2 skipped;1,687 tests passed,2 skipped. Tests borrowed the existing Electron binary read-only because this worktree's install omitted its download. No production app was launched. Builds retain chunk-size warnings; they pass. Final lint initially found an effect-boundary error in the standalone Hosts preview; it was fixed and rerun. `git diff --check` also passed.

The actual implementation was visually inspected in full viewport context, desktop1440x900 and mobile390x844, light/dark: setup, connected project/history, Manager and revoked. Pending phrase, expired/reused feedback, scrolling/pagination and reconnect were observed through real browser interactions. Connected content uses GeckIt tokens; controls are32px desktop/44px mobile, with visible focus. Escape returned the actual desktop to Local without sending task mutations (instrumented native method boundary). Synthetic Enter did not establish native keyboard submission behavior, so that specific physical-key interaction remains unverified. Browser screenshots were inspected, not merely captured.

- [Desktop light](remote-clients-evidence/desktop-light.png), [desktop dark](remote-clients-evidence/desktop-dark.png): actual Chat Servers entry and real service history. The “PRIVATE” fixture row is visible only because this desktop was explicitly granted both projects.
- [Mobile light](remote-clients-evidence/mobile-light.png), [mobile dark](remote-clients-evidence/mobile-dark.png): actual mobile entry, scoped history with all125 items loaded; horizontal project navigation and vertical history scrolling.
- [Mobile Manager](remote-clients-evidence/mobile-manager-dark.png): real service Manager transcript with explicit grant.
- [Desktop revoked](remote-clients-evidence/desktop-revoked.png): real CLI revocation, saved server retained, data cleared.
- [Legacy Hosts light](remote-clients-evidence/legacy-hosts-light.png), [dark](remote-clients-evidence/legacy-hosts-dark.png): actual MacList component, mocked host navigation boundary; old Add a host and new Connect to a server entries coexist. This screenshot does not prove a legacy phone connection.

[UX states](../ux/remote-clients.md), [rendered state diagram](../design/remote-clients-states.svg) and [implementation preview](../design/remote-clients.html) are linked from the Spec Kit handoff. Invitation values, QR images and vault keys are intentionally excluded from evidence.

## Remaining verification and operating limits

- Managed production Firebase rules/queries, `/ice` credential issuance, real TURN allocation, forced UDP-blocked TCP/TLS fallback, Internet NAT transitions and physical iOS/Android devices were not exercised. No external credentials or infrastructure were available within the authorized isolated test setup. TURN fallback is wired through the existing supported ICE endpoint/native options, not claimed proven by local direct ICE.
- Linux/Windows/x64 native loading, full signed/notarized Electron packaging, Capacitor camera scan and native deep-link dispatch remain release checks. Current target-addon guard fails clearly when a requested build architecture is absent instead of shipping the build host's addon silently. Build/install the target package on the target platform before release.
- This stage uses existing managed signaling, not arbitrary self-hosted HTTPS rendezvous. Local HTTP mailbox support exists only for tests. Persistent device rooms currently poll every2s and renew presence every30s: approximately43,200 signaling queries and2,880 presence writes per listening room/day before reconnect/client traffic. Measure/budget this before public rollout; no billing or dollar-cost result was measured. Switching this adapter to a persistent supported listener can reduce that cost without changing device trust or read protocol.
- Invitations are in-memory and disappear on server restart. Expired listeners retain a60-second denial tombstone; an old raw code after that window, or after restart, can report unavailable/error rather than distinguish expired. Persisted devices retain explicit revoked denial across restart. Saved trust has no background offline data cache; hidden disconnected content is not represented as live.
- Snapshots replace current state after reconnect; there is no durable event replay log. Large text is bounded, history is paged100 items, snapshot invalidations are coalesced300ms. A fresh snapshot may reset expanded older history to the latest page. Remote editing/control/approvals remain the next stage.
- Feature-list wording was submitted to Alex for approval; no unapproved entry was added to the canonical product feature list. This report describes working-tree support, not release availability.

## Acceptance review

The local code/CLI, common browser mobile/desktop enrollment, scoped real-runtime reads/events, reconnect/expiry/reuse/revoke, tests/builds and rendered review are complete at the verified boundaries above. Cross-network TURN/NAT, physical devices and complete distributed artifacts remain explicitly unverified release gates. Task-owned isolated service/preview processes were stopped and six owned browser tabs closed after saving evidence; process inspection found no remaining task service/preview process. Keep this branch/worktree for Alex's review; do not infer publication or production restart authorization.
