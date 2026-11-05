# Tasks: remote clients

## Setup
- [x] T001 Verify native Node WebRTC and packaged loading in client/test/remote-transport-probe*.
- [x] T002 Record approved scope and UX in specs/023-remote-clients and docs/ux/remote-clients.md.
## Foundation
- [x] T003 Add shared validated protocol/types and scoped gateway in client/src/shared/remote* and client/src/service/remote*; test deny-by-default and filtering.
## US1
- [x] T004 [US1] Add invitation/approval/trust and Node listener in client/src/service/remote* with CLI commands in client/src/cli/remote.ts.
- [x] T005 [US1] Add common viewer and entrypoints in client/src/renderer/src/remote and mobile/src/main.ts; preserve legacy mobile.
## US2
- [x] T006 [US2] Connect real snapshots/history/Manager/events in client/src/service/remote* and viewer, test host collisions.
## US3
- [x] T007 [US3] Persist device trust, reconnect, expiry/reuse/revoke in service/client; verify restart and other-device isolation.
## Verification
- [x] T008 Run real isolated service/CLI/mobile/desktop transport E2E and save evidence in docs/reports/remote-clients.md.
- [x] T009 Run typecheck/lint/tests/builds and light/dark desktop/mobile UI review; record limits.
- [x] T010 Commit intended implementation locally; update day-plan; no push/restart.

Dependencies: T001 precedes transport integration; T003 precedes US1; US1 precedes US2/US3. Independent checks can run concurrently with documentation, no overlapping production writes. Deliver entire requested first stage; no task control.

Verification boundaries and release checks: [evidence](../../docs/reports/remote-clients.md). Functional scope matches FR-001 through FR-007; no remote control or approvals were added. Real WebRTC is verified locally; external NAT/TURN and physical devices remain release gates.
