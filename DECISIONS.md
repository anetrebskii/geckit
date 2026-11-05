# Important Technical Decisions

Records are ordered by layer. Proposed records are recommendations awaiting product review, not implemented or accepted constraints.

## ITD-001. Remote clients connect to a host-owned service (accepted, architecture)

**Problem**

Desktop and mobile must display the actual projects, conversations and Manager state of a selected GeckIt server, including a headless server behind NAT. Alex prefers P2P and a server CLI that issues a connection code. Existing desktop IPC is local; existing phone WebRTC depends on an Electron window. Data ownership, device trust and native permissions must remain on their respective hosts.

**Options**

- **Host-owned service, common mobile/desktop protocol over WebRTC DataChannel, direct connection preferred with TURN fallback**
- Direct authenticated service transport over SSH tunnel or VPN
- Custom P2P networking and NAT traversal
- Relay-first application transport

**Reasoning**

WebRTC preserves the existing phone transport direction while a maintained Node binding can remove the server's dependency on Electron. Server-issued, short-lived invitations enroll individual client identities; the invitation never contains a permanent server secret. The first increment exposes scoped observation of real host state. Explicit control is a separate increment.

SSH/VPN remains an operator option but does not deliver the requested code-based mobile/desktop experience by itself. Custom traversal duplicates mature ICE/STUN/TURN machinery. Relay-first moves all payload traffic through operated infrastructure even when a direct route works; retain relay as fallback and optional policy instead.

Use pinned `node-datachannel@0.33.6`/libdatachannel in headless service and native browser WebRTC on clients. Actual Node22, host Node26, Electron RunAsNode, browser and standalone-copy probes passed on macOS arm64; see [probe evidence](docs/reports/remote-transport-probe.md). Managed TURN/TLS, physical devices and other platform artifacts remain release gates; local direct ICE success does not prove them. `js-libp2p` remains a supported alternative if its broader identity/routing stack becomes necessary; Hyperswarm introduces a separate mobile transport and discovery network.

No earlier ledger existed when this proposal was written. Compatibility was checked against the current headless-service, SSH-host and phone architecture; none is replaced by this proposal. Evidence, alternatives, invitation flow, protocol and delivery gates are in [the research memo](docs/remote-clients.md).

Downward constraint: each server remains the sole authority for its data and execution, and every remote read or mutation must pass its device-scoped authorization independently of transport, without exporting local operator credentials or implicitly granting native OS permissions.

Implementation: [local first-stage evidence](docs/reports/remote-clients.md), [UX](docs/ux/remote-clients.md). Alex explicitly approved architecture and implementation on 2026-11-06. No remote publication or working-app restart is authorized.
