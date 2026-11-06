# Implementation plan

## Technical context
TypeScript, React, Electron/Capacitor; Node22+ headless. node-datachannel0.33.6 pinned after real Node22/Node26/Electron/browser and standalone-copy probes. Native addon external to SSR with platform package copied into standalone service; browser uses existing WebRTC Link/framing and encrypted Firestore rendezvous. Local isolated mailbox for repeatable integration, no deployed rules changes.

## Constitution check
No provider credentials exported or changed. Native transport dependency necessary for headless WebRTC; built-in Node has no RTCDataChannel. Main service owns network and persistence. Shared DTO only. Tests use isolated recorded histories; real transport checks recorded separately. UX before UI: see design.md. Target stylesheet tokens, all platforms degrade clearly.

## Phases
1. Verify transport and native packaging.
2. Shared protocol/identity, scoped gateway, sealed perdevice trust, invitations and local admin CLI.
3. Node signaling/listener integrated into service; preserve browser legacy and share its framing/signaling.
4. Common remote viewer desktop/mobile with persistent device identity and reconnect.
5. Security tests, real service transport E2E, mobile regression, builds and rendered review.

## Design handoff
[UX](../../docs/ux/remote-clients.md), [design](design.md); review evidence in docs/reports/remote-clients.md. No separate state logic in prototype.

## Complexity tracking
Native dependency justified by WebRTC requirement. Local rendezvous exists only as an isolated integration fixture; production reuses existing encrypted Firebase offers/answers and managed TURN endpoint. No remote mutation gateway or durable event log in stage1.


## Full-control revision, 2026-11-06
Scope approved by Alex: one command and whole-server control. [UX](../../docs/ux/remote-clients.md), [handoff](design.md). Existing feature revision, not a second remote product.
Technical context: existing TS/React/Electron/Capacitor, native WebRTC, encrypted device trust; no new dependencies.
1. Add full-grant invitation and immediate atomic enrollment; retain old scoped grants without privilege escalation.
2. Typed core application requests/results/events over the authenticated channel. CoreMethods is the single contract; reject non-core/prototype methods. Mutation failures do not close the connection; uncertain sends are never replayed.
3. Portable renderer API factory shared with preload, isolated remote Chat workspace; no local native fallthrough for server paths.
4. CLI connects or starts detached existing service bundle with private logs and bounded readiness; does not delete stale ownership, restart active work or modify login persistence. `pair create` is an alias. Code only, no QR.
5. Unit/integration checks for zero projects, new projects, expired/reused/revoked trust, full controls and old-grant denial; actual browser review desktop/mobile both themes; distinguish local signaling fixture from live remote checks.
Constitution: no credentials changed, service owns work, recorded fixture provider, UX before implementation, existing tokens. Work on feat/simple-remote-control; no commit/push/release without requested delivery. Small pure transport extraction justified by reuse of actual UI rather than duplicate controls.
