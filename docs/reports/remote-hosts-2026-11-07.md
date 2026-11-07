# Remote host delivery, 2026-11-07

Request: fix the error on connecting to another server, improve the host list with a name on addition, editing and removal, and push directly to main.

Current main already contains `645332b0` (local saved names, edit/remove and older-server diagnostics) and `f48f235b` (compact Computers dialog over the existing board, Manage computers entry). These were verified in fetched `origin/main`; their changes were not duplicated. The server emits `Unknown GeckIt method.` when a requested method is absent. The existing main fix keeps the optional `chat:listStatus` failure quiet and explains unsupported required methods as an older server needing an update. The exact method from Alex's screenshot and the actual remote server version were not observed; no claim of real remote reconnection is made.

Found an additional defect in the naming flow: `connect` depended on `label`, and the initialization effect depended on `connect`, with cleanup closing the connection. Resetting a nonempty name after a successful pairing therefore reran cleanup and closed the new connection. The submit handler now passes its name to a stable `connect` callback. Typing and clearing the name no longer change that callback's identity. The existing UX document records this behavior. No layout, trust or server permission behavior changed in this follow-up.

Validation in `/private/tmp/geckit-hosts-01a1b1ed`, branch `fix/remote-hosts-20261107`, base `afea795b`: four TypeScript targets passed; ESLint for Servers passed; 10 tests passed in remote-access and remote-client; desktop/service production build passed; diff-check passed. Mobile production build passed (existing large-chunk advisory). These tests cover adjacent protocol behavior, not an actual browser naming flow.

UI check unavailable: the owned test-tab open through `/Users/alex/.geckit/bin/geckit-local browser` failed with `The GeckIt Browser bridge did not answer within 70 seconds.` No alternative browser tool or direct CDP was used. Light/dark, keyboard, name persistence and connect/edit/remove interactions remain unverified in this session. The actual renderer harness and isolated service fixture were started, then stopped after the failure; user app and service were not restarted. The timed-out tab's creation/cleanup could not be confirmed.

Performance checklist reviewed: stabilizing the connection callback removes effect churn on name keystrokes; no repeated rows, sorting, formatting, animation or layout changes were introduced. Live measurement unavailable with the browser bridge.

Direct-main commit verification and task-worktree cleanup are recorded in the day plan. Original checkout and other sessions' work were preserved. No remote server update or user-app restart was performed.
