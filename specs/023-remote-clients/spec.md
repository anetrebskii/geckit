# Feature Specification: Remote clients

**Feature Branch**: `feat/remote-clients`
**Created**: 2026-11-06
**Status**: Approved architecture; implementation authorized
**Input**: Alex approved ITD-001; on 2026-11-06 explicitly replaced the initial observation-only scope with one-command full server control.

## User Scenarios & Testing

### US1 - Connect this server (P1)
The operator runs `geckit pair`. It starts the service if necessary, enables access and prints a copyable connection code. Entering it connects directly to the whole server, including an empty installation, with no project registration or second approval.
Acceptance: one confirmed device enrolls; an expired code or another device reusing it receives no data. Cancelling leaves no trust. Existing phone pairing still works.

### US2 - Observe work (P1)
The user chooses one saved server and uses the normal GeckIt workspace: projects, new and existing conversations, tasks, approvals, Manager and settings operate on that server.
Acceptance: two hosts with identical local IDs stay separate; events update the display; reconnect refreshes state. Sends, stops and approval answers change the remote server. Client-native actions must not apply remote paths to the local server.

### US3 - Retain and revoke trust (P1)
A trusted device reconnects after restart without another code. The operator revokes just that device.
Acceptance: trust survives restart, revoked connections close and cannot reconnect, other devices remain authorized.

## Requirements
- FR-001: `geckit pair` (also `pair create`) starts an absent service, enables access, and prints a five-minute single-use copyable code without required flags or QR.
- FR-002: Code possession and device proof enroll immediately with full server access. Persist individual encrypted trust and support reconnect/revocation. Existing scoped grants remain scoped until paired again.
- FR-003: Share the connection protocol between mobile and desktop; run the server without desktop dependencies; preserve legacy phone connections.
- FR-004: Show actual authorized projects, sessions, paged history and Manager status, including ongoing updates, scoped to server identity.
- FR-005: New full grants can invoke the same core application methods as the local workspace. No project scope or registration prerequisite; newly added projects are available. Native desktop-only operations report their actual availability. Existing observation grants cannot invoke control methods.
- FR-006: Show disconnected, connecting, pending, expired, revoked, incompatible and error states. Reconnect must replace stale state atomically.
- FR-007: Prefer direct encrypted connections and allow managed relay fallback; explicitly report unavailable relay verification.

### Key Entities
Server identity, invitation, enrollment request, trusted device, saved server, scoped project/session/history, snapshot epoch and sequence.

## Success Criteria
- SC-001: CLI code pairs both client surfaces to an isolated headless instance and displays its real recorded data.
- SC-002: Expiry, reuse, cancellation, reconnect, device revocation and cross-host collisions pass repeatable checks.
- SC-003: Existing phone regression checks and affected builds pass; rendered client interactions are checked in light/dark desktop and phone sizes.

## Assumptions
Multiple saved servers, one active source. Operator can access server CLI. Code possession authorizes full server control by Alex's explicit request. External infrastructure deployment and physical-device/NAT validation require available resources; unavailable checks remain explicit. Pending/approve remain only for compatibility with existing scoped invitations; the normal pairing flow never enters pending.
