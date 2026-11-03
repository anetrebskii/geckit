# Verification: headless service

Date: 2026-11-03. Working checkout: `/Users/alex/Projects/mine/geckit`, branch `main`. Codex session: `01a1a089-0fe1-71a3-b6c0-6210c0a11fa9`. Unrelated preexisting changes were preserved. No commit, push, deployment or active app restart.

## First extraction evidence (superseded desktop scope)

- **FR-001 / SC-001: display-free startup.** Independent Vite service build rejects unexpected external runtime imports and Electron imports. The integration suite copies the full emitted bundle to an isolated temporary directory without node_modules, removes DISPLAY, then starts a real Node process and talks to it with separate real CLI processes. Node v26.9.0 on macOS was the actual host; Node 22 compatibility is the declared target, not a separately exercised runtime.
- **FR-002: task ownership and persistence.** A fixture provider launches actual Node child processes. A task completes after its submitting operator connection disconnects. Settings, employee catalog, Manager configuration, shortcut and history survive a clean service restart. An interrupted local task is retained without automatic replay; saved queue and SSH behavior use existing core code.
- **FR-003: operator commands.** Project registration, status, task start/items/list, settings edit/read, Manager configuration/read, employee creation/list, shortcut creation/manual execution/read and shutdown are exercised over the real local socket.
- **FR-004 / FR-006: explicit answers.** A native permission remains pending until an operator explicitly answers it. Stale cards are rejected. A program task proposal is declined explicitly, and an ordinary assistant employee-create request does not mutate the catalog before its team-request is allowed. Session replies report host acceptance rather than claiming success on a refused answer.
- **FR-005 / SC-004: shared desktop core.** Desktop composes sessions/providers and SSH routes through the extracted factories. Existing Sessions, Manager, Employees, scheduler, guide, CLI and storage tests pass. Desktop build passes; the running app was deliberately not restarted. There are no renderer/layout changes in this task; theme/focus/viewport visual checks do not apply to this extraction.
- **FR-007: ownership and shutdown.** A competing service fails without disturbing the first. A legacy listener with no ownership file remains connectable after rejection. Wrong operator tokens and assistant-identity operator calls fail. Unix socket/token permissions are 0600. Both CLI shutdown and SIGTERM exit cleanly, remove owned state files and terminate the fixture provider child. The shared Sessions.dispose also cancels its delayed queue glance. Desktop retains directory ownership until process exit.
- **FR-008: installation guide.** [Run guide](../../docs/headless-service.md) includes bundle copying, provider setup, VPN behavior, exact CLI JSON syntax, private-account limits, manual crash recovery and a systemd template. The template was not installed.

## First extraction commands and results

- `npx vitest run --maxWorkers 2 --reporter=json --outputFile=/tmp/geckit-tests-result.json`: **1487 passed, 0 failed**. This includes four real-process headless scenarios and the new headless-guide/shell-path checks.
- `npm run typecheck`: passed (Node, web, viewer and service-worker TypeScript projects).
- `npm run lint`: passed.
- `npm run build:service`: passed; emitted standalone Node service/CLI plus assets/package.json.
- `npm run build`: desktop main/preload/renderer build passed.
- `git diff --check`: passed.

The first unrestricted-worker full suite had one timeout waiting for fs.watch in store.test.ts; that test passed separately, and the complete suite passed with two workers. Socket and filesystem-observer checks required sandbox escalation because the sandbox denied Unix listen and delayed/missed filesystem events. Tests used disposable home/config/data directories; production app settings were not used for work.

## First extraction artifact analysis

Spec, design, UX, plan, contracts and tasks cover FR-001 through FR-008; no missing implementation task or unresolved design decision remains for this first extraction. Operator command documentation matches shared/service.ts. Single-owner behavior deliberately fails closed after an unclean crash and requires operator inspection; it is not automatic crash recovery.

## First extraction limits

The provider is a test fixture, not a live LLM account. No paid model turn, real Claude/Codex login, SSH-host reconnection, Windows named-pipe ACL check, Linux VM or systemd installation was verified. Manager configuration was exercised; live Manager reasoning/delegation was not. Slack, portable credential/configuration sharing, colleague access and GUI attachment to a standalone daemon are not implemented in this stage.


## Full service/client extraction

The latest request includes desktop as a real service client, superseding the initial embedded-desktop scope above. `main/index.ts` no longer constructs Sessions, Employees, Manager, Hosts or the scheduler. `core/runtime.ts` and `core/application.ts` own the application and expose named typed methods/events. CLI and desktop reach the same private service.

- **FR-009–011:** `desktop-core.test.ts` ran the built Electron main/preload in an isolated process with copied standalone service assets. Native preload settings writes were read through separate CLI processes; CLI writes generated desktop events. Service PID differed from desktop PID. Closing desktop during a slow provider task preserved the service PID; CLI read its completed output, and reopening desktop attached to the same owner and saw saved settings/history. This is a real Electron/service/CLI check, not a mocked connection. The provider child is controlled, not a model account. Run separately with `GECKIT_DESKTOP_INTEGRATION=1 npx vitest run test/desktop-core.test.ts` on macOS to avoid rebuilding shared output concurrently.
- **FR-011:** RPC tests cover real sockets, authentication/handshake, named-method restrictions, binary/undefined framing, events and pending rejection on disconnect. Desktop connector tests cover attach/spawn, compatible hello, fresh snapshot on reconnect, incompatible versions and no mutation replay. Connector update tests verify idle drain and refusal behavior; Electron updater itself is mocked.
- **FR-012:** Core application integration runs a real standalone service and provider child, testing settings, sessions/items/events, approvals, employees, shortcuts and restart state. Existing Manager, Telegram, SSH, scheduler, Plans, recording and provider tests guard reused workflows. Phone preserves the original allowlist and sanitized views. This does not establish live third-party integrations.
- **FR-013:** Vault tests exercise real crypto and filesystem with fake OS secret-store runners. Migration tests cover verified resealing, encrypted backup and failure preservation. No real Keychain, Secret Service or DPAPI account was changed. Migration errors are logged without payloads. Unsupported backends fail unavailable, never plaintext.
- **FR-010 / FR-014:** Normal build includes service then Electron main/preload/renderers. Native update installation waits for successful idle-only service shutdown; ordinary quit leaves the service alive and does not implicitly install an update.

### Rendered acceptance

Chrome native computer use inspected the actual Chat component, actual preload and product CSS at `/test/browser/headless-service/`, backed by authenticated RPC to an isolated real service. Real browser interactions created a task, read `fixture:complete`, submitted `wait`, inspected its pending command, clicked Allow once and read `approved:once`. Light board and conversation/permission states and dark board/settings were visually inspected in full context. Theme persisted after page reload, and a separate CLI read `theme: dark`. Settings scrolling and visible keyboard focus were checked. Docked DevTools provided a narrower approximately 932×711 CSS-pixel desktop viewport; no new layout was added. Full modal keyboard traversal and a physical phone were not verified.

The native connection notice was injected through the documented harness fixture while core RPC stayed live: it was nonnavigable, persisted until dismissed/cleared, and cleared on simulated reconnection. This is a renderer-state fixture check, distinct from actual connector disconnect/reconnect tests. Browser-only update, accessibility, pairing and voice-form adapters are explicit fixtures. Console failures were limited to initially unimplemented native voice-form fixture and favicon; these harness omissions were corrected.

### Full checks

- Full suite: **1515 passed, 0 failed** with two workers before the native test was moved to its explicit opt-in invocation.
- Built Electron acceptance: passed separately with isolated data, no microphone prompt and cleanup of test-owned processes.
- Final all-config `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check`: passed. Mobile `npm run build`: passed after shared Chat notice changes. Focused notices baseline test passed; rendered notice acceptance covers the changed interaction.

### Remaining platform/integration verification

No release was published. Active GeckIt data/processes were untouched. Live Claude/Codex authentication, paid turns, SSH-host reconnection, Telegram delivery, paired phone/native capture, OS key-store migration, Windows named-pipe ACLs, Linux VM/systemd installation and actual downloaded update installation were not exercised. Slack, colleague authorization and portable configuration sharing are separate unimplemented product features. Local IPC trusts the OS account and exposes no TCP listener.


### Performance review (scope: service notices only)

No performance problems found. Unrelated renderer changes from other sessions were excluded.

| Checklist item | Verdict | Evidence |
| --- | --- | --- |
| Filter/sort memoization | holds | Existing visible-notices useMemo retains its dependencies and adds only a constant-time global-notice condition. |
| Typing redraw cost | holds | No new session scans, per-row work, formatter or expensive derived state; existing small notice list remains unchanged. |
| Phone rebuilt for shared Chat | holds | Mobile production build passed. |

Ten other checklist items are untouched. No new repeated row, hover or animation warrants profiling; no passive measurements of the active user's app were taken. Visual review used only the isolated harness. Test-owned browser service and Vite listener were stopped after review; temporary evidence data was retained.


## Direct main delivery verification

The task was isolated from unrelated checkout edits in a temporary delivery worktree based on remote main `d8bc1dd`. The integrated tree passed all-config typecheck, full ESLint and service/desktop build. Default suite: **1514 passed, 0 failed, 1 intentionally skipped**; the opt-in macOS built Electron/service/CLI test then passed separately. The skip prevents concurrent rebuilds of service artifacts during the default suite. No active user app was restarted. The commit and remote delivery result are recorded in the day-plan task.
