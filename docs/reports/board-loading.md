# Task loading and provider refresh

Implemented in the working tree on `feat/simple-remote-control`, 2026-11-06. UX: [board-loading.md](../ux/board-loading.md).

Opening Board, List or phone Tasks now shows "Loading tasks…". Zero counts and empty messages wait for the initial response. Background reads show "Updating {providers}…" while existing cards remain usable. A provider failure names the provider, keeps its last successful tasks and offers Retry. A failed first read says "Some tasks may be missing." instead of claiming the board is empty.

The disappearing cards had a concrete cause: Claude refresh cleared cached rows belonging to other providers, and plugin refresh cleared its cache before the asynchronous read succeeded. Each provider now replaces only its own requested roots after success. Failed reads preserve the cache; a successful empty response still removes genuinely deleted history. Concurrent identical reads share a pending request. Codex list failures are reported rather than converted to an empty successful result.

## Verification

- Full sequential suite: 129 files passed, 2 skipped; 1,751 tests passed, 2 skipped. After the final overlapping-failure cleanup adjustment, focused sessions/Codex tests passed again: 349 tests.
- All four TypeScript targets and `eslint src test` passed. `git diff --check` passed.
- Production service, Electron main/preload/renderer and phone builds passed. Phone build reports the existing Vite plugin deprecation and chunk-size warnings.
- Actual shared Board/List/phone renderers exercised through the real isolated headless service and RPC. The provider uses recorded fixture history with controlled delay, rejection and successful empty results; Electron native operations are a test boundary. This verifies list state and cache behavior, not live provider account authentication or a paid model request.
- Reviewed full screens in light/dark themes: desktop 1565×900 and 1200×800, phone 390×844 and short 390×500. Checked initial loading, refresh with retained cards, provider failure, Retry recovery, authoritative empty results and failure with no cached tasks. Initial phone loading no longer places skeletons beside already received cards.
- Retry was reached with Tab, displayed a visible focus outline and activated with Enter. The existing refresh handler was exercised using a DOM keyboard event; no physical Cmd+R claim. Phone list scrolling reached its end; no horizontal overflow. Reduced-motion state reviewed.
- Performance checklist: one shared status per visible list; existing per-card memoization and object identity handling preserved. No new polling or per-card animation. Spinner uses the existing composited HTML wrapper and unmounts when work ends. No large-board benchmark or native-app CPU profile was performed.

## Screens reviewed

| State | Evidence |
|---|---|
| Initial Board | [Light](board-loading-evidence/board-loading-light.png), [dark](board-loading-evidence/board-loading-dark.png) |
| Initial List | [Light](board-loading-evidence/list-loading-light.png), [dark](board-loading-evidence/list-loading-dark.png) |
| Updating with retained tasks | [List](board-loading-evidence/list-updating-light.png) |
| Failure with retained tasks | [List light](board-loading-evidence/list-failed-light.png), [Board dark](board-loading-evidence/board-failed-dark.png) |
| Phone failure | [Light](board-loading-evidence/phone-failed-light.png), [dark](board-loading-evidence/phone-failed-dark.png) |
| Phone loading with cached tasks | [Light](board-loading-evidence/phone-loading-light.png), [dark](board-loading-evidence/phone-loading-dark.png) |
| Keyboard focus / short viewport scrolling | [Retry focus](board-loading-evidence/board-failure-focus.png), [phone scrolling](board-loading-evidence/phone-loading-short-scroll.png) |

## Delivery boundary

Source and build outputs are ready. The active local GUI/service were preserved; the service is executing ongoing conversations, including this one. These loading changes have not been applied to the running local service or redeployed to `alex@192.168.1.97`. Full provider status requires the newly built service after restart. The whole-list transport failure branch was typechecked but was not forced in browser acceptance. Native GeckIt inspection was unavailable; renderer review used owned browser test tabs. Live phone/WebRTC delivery was not exercised for this change.

Assigned engineer memory pagination reached its end. One unrelated older source was unavailable from its provider, so that history remains incomplete; no decision from it was inferred.

Both owned acceptance tabs were closed and the isolated Vite server/service stopped. No commit, push, PR or worktree cleanup was requested; the original checkout and unrelated edits remain intact.
