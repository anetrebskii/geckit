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
