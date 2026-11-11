# Tasks
- [x] T001 Specify US1-US4, requirements and quality checklist.
- [x] T002 Design route lifecycle and UX in docs/ux/team-telegram-dms.md.
- [x] T003 Plan contracts and dependencies; analyze permission and crash coverage.
- [x] T004 [US1] Implement validated registry and local invitation/member controls in shared/telegram.ts and main/telegram-members.ts.
- [x] T005 [US1] Implement single-receiver route contexts and explicit runtime routing in main/telegram.ts and core/runtime.ts.
- [x] T006 [US2] Implement durable per-route preparation, quotas and native Manager/Sessions scheduling.
- [x] T007 [US3] Enforce project/ownership/approval/revocation in Manager tools and output paths.
- [x] T008 [US1] Add owner UI controls and real-component preview states.
- [x] T009 [US4] Test schema migration and legacy behavior with fake API/provider.
- [x] T010 Test crash, parallelism, all resource caps and unauthorized IDs; run repository checks and baseline comparisons.
- [x] T011 Review UI light/dark/narrow/keyboard and performance; document results outside repository, update product documentation.
Dependencies: T004 -> T005 -> T006/T007 -> T008/T009 -> T010/T011. Execute sequentially without agents.

Validation: 63 targeted team tests passed in the full run, including 37 new tests. Full run: 1853 passed/25 failed/20 skipped; baseline: 1816 passed/25 failed/20 skipped. Failure titles and four failed suite imports match. Lint and web types pass. Node types retain 15 existing diagnostics; desktop/mobile builds are blocked by existing missing dependencies. See the external work report for evidence and limitations. No live rollout performed. Feature-list proposal remains unanswered, so docs/features.md is unchanged.

Independent review found two Tier 2 defects (first-receipt freshness and recovery worker-link counting); both are fixed. All five independent reproduction tests pass on the corrected code. PR publication explicitly authorized after review.
