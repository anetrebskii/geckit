# Feature Specification: Remote clients

**Feature Branch**: `feat/remote-clients`
**Created**: 2026-11-06
**Status**: Approved architecture; implementation authorized
**Input**: Alex approved ITD-001 and requested its first read-only stage.

## User Scenarios & Testing

### US1 - Connect this server (P1)
The operator issues a temporary code on a particular server. A mobile or desktop user enters it or scans its QR, verifies the device with the operator and sees that server's actual projects and conversations.
Acceptance: one confirmed device enrolls; an expired code or another device reusing it receives no data. Cancelling leaves no trust. Existing phone pairing still works.

### US2 - Observe work (P1)
The user chooses one saved server, opens conversations and Manager and sees updates without changing server state.
Acceptance: two hosts with identical local IDs stay separate; new server events update the display; reconnect refreshes a consistent snapshot. Remote actions cannot change tasks or approve requests.

### US3 - Retain and revoke trust (P1)
A trusted device reconnects after restart without another code. The operator revokes just that device.
Acceptance: trust survives restart, revoked connections close and cannot reconnect, other devices remain authorized.

## Requirements
- FR-001: Issue five-minute single-use invitations from the server CLI, with QR carrying the same invitation, never a permanent secret.
- FR-002: Authenticate server and device, require operator approval, persist individual trust, support reconnect and per-device revocation.
- FR-003: Share the connection protocol between mobile and desktop; run the server without desktop dependencies; preserve legacy phone connections.
- FR-004: Show actual authorized projects, sessions, paged history and Manager status, including ongoing updates, scoped to server identity.
- FR-005: Enforce observation at the server boundary, excluding configuration, task mutations, approval answers, filesystem/native operations and credentials.
- FR-006: Show disconnected, connecting, pending, expired, revoked, incompatible and error states. Reconnect must replace stale state atomically.
- FR-007: Prefer direct encrypted connections and allow managed relay fallback; explicitly report unavailable relay verification.

### Key Entities
Server identity, invitation, enrollment request, trusted device, saved server, scoped project/session/history, snapshot epoch and sequence.

## Success Criteria
- SC-001: CLI code pairs both client surfaces to an isolated headless instance and displays its real recorded data.
- SC-002: Expiry, reuse, cancellation, reconnect, device revocation and cross-host collisions pass repeatable checks.
- SC-003: Existing phone regression checks and affected builds pass; rendered client interactions are checked in light/dark desktop and phone sizes.

## Assumptions
Read-only means no task control or approvals. Multiple saved servers, one active source. Operator can access server CLI. External infrastructure deployment and physical-device/NAT validation require available resources; unavailable checks remain explicit.
