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


## Full-control revision
- [x] T011 [US1] Implement connect-or-start and code-only pair alias in client/src/cli/remote.ts and service-start.ts.
- [x] T012 [US1] Implement full auto-enrollment and typed authenticated core calls/events in client/src/service/remote/access.ts and shared/remote/protocol.ts.
- [x] T013 [US2] Extract portable renderer API and mount actual remote Chat in isolated context in preload and renderer/src/remote/Workspace.tsx.
- [x] T014 [US2] Simplify Servers form and route new full grants to remote workspace in renderer/src/remote/Servers.tsx and client.ts.
- [x] T015 [US3] Verify full controls, legacy scoped denial, single use, reconnect/no replay, revoke and service auto-start in client/test/remote-*.test.ts and real fixture.
- [x] T016 Review actual desktop/mobile light/dark flows and performance; record evidence and remote deployment boundary in docs/reports/simple-remote-control.md.

Revision dependencies: T012 before T013/T014 integration; T011 independent of renderer extraction. T015 follows core implementation; T016 follows integrated renderer. Requirement coverage: FR001=T011; FR002=T012/T015; FR003=T013/T016; FR004/005=T012/T013/T014/T015; FR006=T014/T015/T016; FR007=T015/T016. Analysis: all7 revised requirements have tasks, no unresolved product choice; old observation-only clauses above describe historical completed stage, explicitly superseded by this revision.
