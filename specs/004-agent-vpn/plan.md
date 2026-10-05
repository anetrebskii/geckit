# Implementation Plan: Built-in agent VPN

**Checkout**: existing main checkout | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

## Summary

Follow-up UI scope requested on 2026-10-04: implement visible export/import guidance and an on-demand finite animated setup demonstration from the updated design handoff. Keep native routing unavailable, remove the disabled Connect dead end, and preserve the encrypted profile API unchanged. Use existing React/CSS tokens, compositor transforms/opacity, static reduced-motion scenes and cleaned-up timer/visibility/offscreen lifecycle. Validate actual components in the Chrome preview and rebuild both clients. No new runtime dependency.

Implement saved self-hosted AmneziaWG configurations and a persistent server selector in desktop Settings. No proxy environment variables or prompt changes. Native all-traffic enforcement is a separate, mandatory runtime gate. Configuration-only support must explicitly say agent networking is unchanged and disable Connect. Do not fabricate a functioning native service or claim Connected merely from a userspace tunnel.

## Technical Context

TypeScript 5.9, Electron 38, React 19, existing safeStorage, Node filesystem APIs and vitest. No additional JS runtime dependency. Configuration is main-owned and encrypted with OS encryption, separate from ordinary settings; plaintext/basic_text fallback is rejected. Renderer/phone receives non-secret server metadata only. No raw config in errors or logs. Multiple profiles are imported through a native file picker, checked offline, renamed, removed, and selected persistently.

Target macOS, Windows, Linux; current all-traffic runtime capability is unavailable. Alex selected native macOS execution. Per-app eligibility, crash-safe enforcement, and DNS attribution require signed runtime qualification; see research.md. Do not substitute a VM.

One settings section, event-driven updates, no per-conversation polling, traffic counters, or permanent animation. Bound configuration size and reject executable hooks/unsupported parameters rather than ignore them.

## Constitution Check

Subscription authentication unchanged. Main/renderer contract in shared/api.ts, with domain types composed from shared/vpn.ts. No secrets in renderer/ordinary settings. Offline parsing/state tests. UX and prototype precede implementation. Same cross-platform language, existing CSS tokens, small focused files. Existing checkout retained as requested by the session; no commit or publishing authorized here.

Configuration stage passes. Full routing stage is BLOCKED on native enforcement qualification or an explicit isolated-runtime decision. This gate cannot be bypassed by displaying a disabled configuration UI as a completed VPN feature.

## Project Structure

- client/src/shared/vpn.ts: non-secret profiles, view and operation result
- client/src/main/vpn/config.ts: strict native AmneziaWG configuration validation
- client/src/main/vpn/store.ts: atomic encrypted profile storage and persisted selection
- client/src/main/vpn/index.ts: safe configuration service, IPC file import, event publication and truthful unavailable capability
- client/src/shared/api.ts, client/src/preload/index.ts, client/src/main/index.ts: desktop-only bridge
- client/src/renderer/src/ui/AgentVpn.tsx: saved servers and unavailable runtime state
- client/src/renderer/src/ui/SettingsDialog.tsx, client/src/renderer/src/styles.css: integration
- client/test/vpn-*.test.ts: parser, encrypted storage, selection/error invariants
- client/src/renderer/agent-vpn-preview.html, client/src/renderer/src/agent-vpn-preview.tsx: real component browser qualification

## Design Handoff

Read [design.md](design.md), [UX](../../docs/ux/agent-vpn.md) and [prototype](../../docs/design/agent-vpn.html). Preserve explicit selected versus active semantics, encrypted import with previous selection retained on failure, keyboard/focus, disabled Connect with limitation, offline Check configuration, empty and error states. Review real component in Chrome light/dark at desktop 1352x706 and narrow 390x844. Performance review against docs/performance.md. Phone configuration controls remain unavailable.

## Native Runtime Qualification

Before enabling Connect, deploy compatible signed enforcement, secure privileged secret boundary, protected process ownership including detached helpers and dedicated browsers, DNS/IPv6 and custom UDP coverage, and fail-closed behavior during startup, gateway loss, service crash, server switch and computer VPN changes. Integration must cover shared Codex control socket, Claude transport including a dedicated protected tmux server/socket and its loopback hooks, provider plugins, account/usage/models/correction and remote/delegated boundaries. All routing acceptance criteria remain incomplete until packet observation proves them.

## Complexity Tracking

No new runtime dependency or generic service abstraction. Current safeStorage encrypted retention prepares configuration; it is not proof of agent-inaccessible management. A native privileged boundary must be implemented before protection can be offered.

## Bottom-bar implementation slice

FR-027 uses existing AgentVpnView/API for a single desktop status component with initial read, broadcast subscription and focus refresh. Integrate it in each Status provider branch. Chat passes a stable direct-settings callback; Settings accepts its existing first section and focuses Agent VPN for this entry. Preserve ordinary General entry and return focus on close. Extend the real-component preview with footer/provider/read-error fixtures; no runtime or main-process contract changes. Validate interactions in Chrome, run client checks/tests/build and mobile build. Reconnect remains blocked by native qualification.

### Mobile status slice

Use the existing phone transport for read-only AgentVpnView and broadcasts. Add connection-loss invalidation and reconnect refresh without polling or disk cache. Mount one independently memoized footer and a PhoneKit sheet from home/conversation and Host settings. Preserve desktop APIs and native routing gates. Follow the mobile design handoff and rebuild the mobile bundle.

### Required VPN admission slice

FR-029 supersedes configuration-only permission to continue direct requests after import. Initialize a pure fail-closed admission policy from retained encrypted storage before provider construction and queue recovery. Inject it into Sessions and guard dispatch after asynchronous work, retaining queued messages. Block correction and provider entry points; request cancellation for owned active work when a configuration first requires VPN. Expose non-secret required status to desktop/phone and update setup/demo copy. Prove entry denial with spies and policy-transition/queue tests. This is application admission, not native packet enforcement. T027 real reconnect still depends on T005/T007 and provisioned signed runtime.

## Tunnel transport implementation - 2026-10-04

Implement a pinned AmneziaWG host transport in client/native/agent-vpn while the required native-versus-Linux execution decision is pending. This component accepts a native configuration through an inherited pipe, then exchanges framed raw IPv4/IPv6 packets through that pipe. It creates no computer-wide routes, proxy listener, control socket, agent environment changes or global VPN. The transport is suitable for a future native packet-capture or isolated guest adapter; it must not release application admission until capture and crash-safe isolation are qualified.

Validate encrypted TCP/UDP/IPv6 traffic against generated local peers, wrong-key refusal, closed/invalid packet pipe handling, fresh transport reconnection and cross-platform compilation. Configurations and UAPI error contents never reach logs. Build outputs stay ignored; source and reproducible pinned dependencies are reviewable. Native isolation/integration and live imported-server verification remain required before the feature is called working.

## Native macOS implementation decision - 2026-10-04

Alex explicitly selected native macOS. The private Linux execution question is settled; do not create or use a VM as a fallback. Preserve native tool OS and existing project paths.

Build a native qualification host, packet-tunnel system extension and dedicated agent runner. Use NETunnelProviderManager.forPerAppVPN with a designated-requirement rule matching the signed runner; matchTools=nil is documented in the SDK to include its spawned helper tools. Keep excluded domains empty. The tunnel consumes packetFlow and the pinned AmneziaWG transport through private inherited pipes; never install a global default route as a substitute. Resolve and test provisioned direct-distribution signing and installed per-app eligibility, DNS/IPv6, helper ownership and disconnected/provider-crash behavior before connecting real agents or releasing admission. Qualification is not a user-visible Connected state.

A dedicated local test host is necessary to establish OS behavior without modifying the running GeckIt app or using imported credentials. Compile and prepare the complete reviewable test bundle first. Developer account provisioning and native extension activation require their actual capability/OS permissions; report a concrete rejection or absent capability rather than claiming a compile test proves routing.
