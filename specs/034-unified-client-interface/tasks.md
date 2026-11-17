# Tasks: One client interface for every GeckIt client

**Input**: Design documents from `specs/034-unified-client-interface/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [design.md](design.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/client-interface.md](contracts/client-interface.md), [quickstart.md](quickstart.md)

**Tests**: Included. The constitution (III) requires pure logic to be covered by vitest against recorded fixtures, and quickstart names the test files.

All paths are relative to the repository root. Commands run from `client/`.

## Phase 1: Setup

- [ ] T001 Add a recorded fixture set for this feature: a 5,000-item conversation with 20 pictures, runs of steps, pending cards and a reply that moves to the end under its own id, in `client/test/fixtures/client-view/` (build it from existing fixtures in `client/test/fixtures/`, no live `claude` calls)
- [ ] T002 [P] Add a development-only byte counter per message type to the remote channel, logged once a minute, in `client/src/shared/remote/channel.ts` (guard with `import.meta.env.DEV` on the client and a `GECKIT_COUNT_BYTES` variable in the service)
- [ ] T003 Measure and record the baseline for SC-001 to SC-004 per quickstart Scenario 1 (remote desktop and phone, throttled network) in `specs/034-unified-client-interface/baseline.md`

## Phase 2: Foundational (blocks every story)

Goal: the client view exists in the service with every contract method, tested on fixtures, but no client uses it yet.

- [ ] T004 [P] Move the text an item is matched on by Find from `client/src/renderer/src/chat/Transcript.tsx` into `client/src/shared/find-text.ts` and make Transcript import it (no behaviour change)
- [x] T005 [P] Write fixture tests for folding, pages (`turns` with pending items always included, `turnsBefore`, unknown `before`), steps with picture references and picture refs, ported from the cases `peer/main.ts` handles today, in `client/test/client-view.test.ts`
- [x] T006 [P] Write fixture tests for row diffs of a viewed conversation (append, update in place, reply moved to the end, item gone), list row changes, viewed-set filtering and scope filtering (FR-020) in `client/test/client-view.test.ts`
- [x] T007 [P] Write fixture tests for `chat:find` matching the same items as Transcript's Find on the fixture, including matches inside runs of steps, in `client/test/find.test.ts`
- [x] T008 Implement the pure part of the client view in `client/src/core/client-view.ts`: `foldFor(can, id, items)`, `page(folded, before, count)`, `diffRows(sent, folded)`, `diffList(sent, rows)`, `find(items, words)`, `inScope(scope, session)`, moving the logic from `rowsOf`, `forPhone`, `sendItems` and `sendList` in `client/src/renderer/src/peer/main.ts` without changing it; make T005 to T007 pass
- [x] T009 Implement the stateful shell in `client/src/core/client-view.ts` (split into `client-view-state.ts` if over 400 lines): per-client `can`, `viewed`, `sentList`, `sentRows`, `scope`; the shared conversation cache of 8 with read-then-apply-events as `wholeOf` does; 100 ms item and 300 ms list gathering; one `runtime.subscribe` per client; `dispose()`
- [x] T010 Add the core methods `link:can`, `chat:watch`, `chat:turns`, `chat:turnsBefore`, `chat:steps`, `chat:picture`, `chat:find` per the contract, bound to the calling client's view, in `client/src/core/application.ts`, and the `chat:sessionsChanged` event in `client/src/core/events.ts`
- [x] T011 Add the picture sizer seam: `chat:picture` and `chat:queuedPicture` ask an injected `scale(image, width)`; default returns the original; results cached per (ref, width), 60 entries, in `client/src/core/client-view.ts`
- [x] T012 Add the matching entries to the main/renderer contract and the phone call list in `client/src/shared/api.ts` and `client/src/renderer/src/phone-calls.ts`

**Checkpoint**: `npm run lint && npm run typecheck && npm test` pass; no client behaviour changed.

## Phase 3: User Story 1 - A desktop connected to another GeckIt server opens fast (P1) - MVP

Goal: a remote desktop loads like the phone. Independent test: quickstart Scenario 2.

- [x] T013 [P] [US1] Write tests for deflate negotiation on the remote channel, including an old peer that never calls `link:can` and still gets plain frames, in `client/test/remote-client.test.ts`
- [x] T014 [P] [US1] Write tests for the renderer adapter with a fake transport: open gives the end, before and steps ask only for their part, list changes applied, catch-up after a drop leaves no duplicates, kept copy read first then replaced, in `client/test/client-data.test.ts`
- [x] T015 [US1] Negotiate deflate and send deflate-raw binary frames after the `link:can` reply, reusing the deflated framing in `client/src/shared/pairing.ts`, in `client/src/shared/remote/channel.ts`; accept binary on both ends in `client/src/renderer/src/remote/transport.ts` and `client/src/service/remote/transport.ts`
- [x] T016 [US1] Give each full remote channel a client view instead of forwarding every `runtime.subscribe` event; scope it by the device; keep the 50 ms coalescing for events the view does not own, in `client/src/service/remote/access.ts`
- [x] T017 [US1] Extract the data half of `client/src/renderer/src/phone.ts` (`tail`, `stepsOf`, `filled`, `tellItems`, `bringUp`, `keptFirst`, `keepShown`, `remembered`, list row merging, `items`/`before`/`steps`/`picture`/`onEarlier`) into `client/src/renderer/src/client-data.ts`, parameterised by `call`, `listen`, `keeps` and a key prefix; make `phone.ts` use it with no behaviour change; make T014 pass
- [x] T018 [US1] Build the remote workspace's `window.geckit.chat` data methods from `client-data.ts` with keeping on and the server id as prefix, call `link:can` first and `chat:watch` on open, in `client/src/renderer/src/remote/workspace-api.tsx`
- [x] T019 [US1] Show the loading states from UX section 1 on a remote client without delay: "Loading earlier" in the Load earlier row, one placeholder line under an opened run, "Could not load. Try again" on failure, in `client/src/renderer/src/chat/Transcript.tsx` (reuse `skeleton-line`, `picture-waiting`; any new rule uses tokens in `client/src/renderer/src/styles.css`)
- [x] T020 [US1] Scale pictures through the attached desktop app with today's code and output: the service asks main over the native-callback channel, main hands the picture to the peer window, which runs the existing `scaledTo` (`createImageBitmap`, `OffscreenCanvas`, WebP at quality 0.82); originals when no desktop app or peer window is there (research R4, FR-023). Files: `client/src/service/application.ts`, `client/src/main/index.ts`, `client/src/renderer/src/peer/main.ts`; inject it as the sizer from T011. Do not use `nativeImage`: it cannot encode WebP
- [ ] T021 [US1] Run quickstart Scenario 2 against the baseline, record results in `specs/034-unified-client-interface/baseline.md`, and check UX section 1 states in the running app in light and dark at desktop size; run the `performance-review` skill against `docs/performance.md`

**Checkpoint**: remote desktop meets SC-001 to SC-004; local desktop and phone unchanged.

## Phase 4: User Story 2 - A local desktop works exactly as before on the same interface (P2)

Goal: the local desktop uses the client view. Independent test: quickstart Scenario 3.

- [x] T022 [US2] Re-run the whole-conversation audit (search `chat.items(`, `chat.before(`, `chat.steps(` and `items.find/filter/findLast` in `client/src/renderer/src/` and `client/src/main/`) and update the table in `specs/034-unified-client-interface/research.md` R3 with anything new
- [x] T023 [US2] Give the local desktop's RPC connection a client view; in main apply `chat:sessionsChanged` to the snapshot so `listChanged` keeps every row for tray, badge and gecko; replace the `chat:watching` handling with `chat:watch`; in `applySnapshot` ask `chat:turns` for the watched conversation instead of `chat:items`, in `client/src/service/application.ts` and `client/src/main/index.ts`
- [x] T024 [US2] Build `window.geckit.chat`'s data methods from `client-data.ts` with keeping off; delete the `before`, `steps` and `picture` fallbacks, in `client/src/shared/renderer-api.ts`
- [x] T025 [US2] Delay the loading placeholders by 150 ms on the local desktop only (UX section 1 thresholds), in `client/src/renderer/src/chat/Transcript.tsx` and `client/src/renderer/src/chat/Chat.tsx`
- [x] T026 [US2] Make Find use `chat:find`: count over the whole conversation, "Searching" while it answers, load parts with `chat:turnsBefore` until a match is loaded then open its run; remove the Find strip's Load earlier button and tooltip (UX section 2), in `client/src/renderer/src/chat/Transcript.tsx` and `client/src/renderer/src/chat/useChat.ts`
- [x] T027 [US2] Make `shortcutFrom` read the first message with `chat:firstAsked` (extend it to return the item if the shortcut needs more than its text) instead of `chat.items`, in `client/src/renderer/src/chat/Chat.tsx` and `client/src/core/application.ts`
- [ ] T028 [US2] Run quickstart Scenario 3: every conversation feature in `docs/features.md` before and after, Find, export/copy/continue with only the end loaded, shortcuts, no skeleton flash; light and dark, Find keyboard, scrolling; `performance-review` skill

**Checkpoint**: local desktop matches SC-005; remote desktop still meets US1.

## Phase 5: User Story 3 - The phone works with any GeckIt server (P3)

Goal: the phone uses the service's client view and keeps everything it does today; old pairings are read-only. Independent test: quickstart Scenarios 4, 5 and 7. T030 to T033 also change the remote desktop, which shares the module.

- [x] T029 [US3] Make the phone's server connection (`serverView` in `mobile/src/main.ts`) use `client-data.ts` with keeping on through the remote workspace path, in `mobile/src/main.ts` and `client/src/renderer/src/remote/workspace-api.tsx`
- [ ] T030 [P] [US3] Write tests for the client link module with a fake link: a call made while down is held and sent once on reconnect; held calls fail with the link-down error after 60 s; a call in flight when the link drops fails and is never resent; own settings (`OWN`) read and written per server and never sent to `settings:set`, in `client/test/client-link.test.ts`
- [ ] T031 [US3] Extract the link half of `client/src/renderer/src/phone.ts` (`call` with `held` and `HOLD`, `LINK_DOWN`, the `own`/`mine` settings layer over `OWN`, `phoneErrors`, `counting`) into `client/src/renderer/src/client-link.ts`, parameterised by a send function, a storage key prefix and the client's name for counting; make `phone.ts` use it with no behaviour change; make T030 pass
- [ ] T032 [US3] Build the remote workspace's call path on `client-link.ts`: holding during reconnect, own settings, errors held on the client under its own consent, usage counting; remove the code that disables writes while reconnecting (search `reconnecting` in `client/src/renderer/src/remote/`) and use the waiting and failure texts from UX section 5, in `client/src/renderer/src/remote/workspace-api.tsx` and `client/src/renderer/src/remote/Computer.tsx`
- [ ] T033 [US3] Add the core method `push:here(away)`, count phones not away per client view, and move the push decision from `main/index.ts` (`phonesHere`, the idle check) into the service, which asks main for the idle state over the native-callback channel and treats a computer without the desktop app as idle; the phone calls `push:here` and the existing `push:token` over the server connection. Files: `client/src/core/application.ts`, `client/src/service/application.ts`, `client/src/main/index.ts`, `client/src/renderer/src/remote/workspace-api.tsx`
- [ ] T034 [US3] Serve old-paired phones read-only: the peer window answers only `chat.list`, `chat.turns`, `chat.turnsBefore`, `chat.steps`, `chat.picture`, `settings.get` and their events through the client view via `peer.call`, and every other call with the error `Pair this phone again.`, in `client/src/renderer/src/peer/main.ts` and `client/src/main/index.ts`
- [ ] T035 [US3] Show the Pair again card on the phone when that error is seen: title, body and actions from UX section 3 in the existing notice card, composer and answer buttons disabled, "Not now" hides it until next launch, "Scan code" opens the scanner; forget the old pairing after a new one, in `client/src/renderer/src/chat/Notices.tsx`, `client/src/renderer/src/phone.ts` and `mobile/src/main.ts`
- [ ] T036 [US3] Run quickstart Scenarios 4, 5 and 7 on an iPhone with a headless server and with the desktop app; check UX sections 3, 4 and 5 at 390 x 844 and at desktop size in light and dark; compare picture sizes and format with the baseline (FR-023); record results in `specs/034-unified-client-interface/baseline.md`

**Checkpoint**: SC-006 met; the phone keeps every behaviour it has today; old-paired phones read and see the card.

## Phase 6: User Story 4 - One way to load data (P3)

Goal: remove what the other stories made unused. Independent test: quickstart Scenario 6.

- [ ] T037 [US4] Delete the conversation serving from `client/src/renderer/src/peer/main.ts` (`whole`, `gather`, `sendItems`, `sendList`, `pictureFor`, the `chat.*` branches, `push.away`), keeping screen capture, shares, `scaledTo` for the service's sizer and the read-only old-pairing relay until its removal release
- [ ] T038 [US4] Remove from `client/src/renderer/src/phone.ts` what moved to `client-data.ts` and `client-link.ts`, and the `orAsBefore` fallbacks to `chat.items` that only served older Macs
- [ ] T039 [US4] Remove the observation-only `snapshot`/`history` path for full devices if unused, in `client/src/service/remote/gateway.ts` and `client/src/service/remote/access.ts` (keep it for scoped observation devices)
- [ ] T040 [US4] Confirm quickstart Scenario 6 and that local, remote and phone tests all exercise `client/src/core/client-view.ts` and `client/src/renderer/src/client-link.ts`

## Phase 7: Polish and cross-cutting

- [ ] T041 [P] Update the architecture notes for sessions, the phone and remote clients in `CLAUDE.md` and `docs/headless-service.md` to describe the client view and the client link module
- [ ] T042 [P] Update `docs/ux/remote-clients.md` (reconnecting no longer disables writes; FR-003 "preserved legacy phone entry" now read-only with Pair again) and `docs/ux/phone.md` (Find over the whole conversation)
- [ ] T043 Propose to Alex the `docs/features.md` entry for Find over the whole conversation and for phones with a headless server; add it after approval and the evidence to `docs/feature-audit.md`
- [ ] T044 Remove the development byte counter from T002 or keep it behind its flag, and run `npm run lint`, `npm run typecheck`, `npm test`

## Dependencies

- Phase 1 -> Phase 2 -> US1 -> US2 -> US3 -> US4 -> Polish.
- US1 needs T008 to T012. US2 needs US1's `client-data.ts` (T017). US3 needs US1's remote path (T015, T016, T018). US4 needs US2 and US3 done.
- Each story is releasable on its own; US4 is cleanup only.

## Parallel opportunities

- Phase 1: T002 alongside T001.
- Phase 2: T004, T005, T006, T007 together (different files); then T008 -> T009 -> T010 -> T011; T012 after T010.
- US1: T013 and T014 together; T015 and T016 alongside T017 (service versus renderer); T019 and T020 after T018.
- US3: T030 alongside T029; T033 alongside T031 and T032 (service versus renderer).
- Polish: T041 and T042 together.

## Implementation strategy

MVP is Phase 1, Phase 2 and US1: the reported problem is fixed and nothing else changes. Release, watch the byte counter on real use, then US2 (the highest-risk step, gated by T022 and T028), then US3 (the phone keeps every optimization and behaviour it has, now through the service), then the removals.

## Implementation status (2026-11-17)

Written, typechecked, linted and covered by unit tests (`client-view.test.ts`, `client-data.test.ts`, `remote-channel.test.ts`, `remote-client.test.ts`); not yet run against a real remote server, the running desktop app or an iPhone.

Deviations from the tasks as written:

- T004: not needed. `chat:find` matches the text of `mine` and `theirs` items exactly as Transcript's Find does, so `findIn` in `client/src/core/client-view.ts` holds the rule and no `find-text.ts` was made.
- T007: Find tests live in `client-view.test.ts`, not `find.test.ts`.
- T010: the view methods are not core methods. Local RPC only broadcasts events, so each client's view lives at its link: one per full remote channel in `service/remote/access.ts`, and one for the local Chat window in `main/index.ts` (IPC handlers for `VIEW_METHODS`). `VIEW_METHODS` in `client-view.ts` is the contract list.
- T017: the data half is `client/src/shared/client-data.ts` (shared because the preload builds the local API from it). `phone.ts` still has its own copy; it serves only the old pairing and goes with T038.
- T019: the Load earlier row says "Loading earlier" and "Could not load. Try again" on every client; the opened-run placeholder line is not added.
- T023: the local view offers `steps` and `find` only, so pictures and the list go whole over IPC as before.
- T030 and T032 are partly done: calls made while the link is down are held for `HOLD` (60 s) and sent once on reconnect, in-flight calls are never resent (tests in `remote-client.test.ts`), and client-own settings (`OWN`) are kept per server in `workspace-api.tsx`. `client-link.ts` was not extracted, and errors and counting are not yet held on a remote desktop client.

Open:

- T001 to T003, T021, T028, T036: baseline and quickstart runs need the running apps and a device.
- T033: push to a phone connected through a server needs a push key per device and changes to the Notification Service Extension; not started.
- T034, T035, T037 to T039: wait for T033. Making the old pairing read-only before push works through the service would cost those phones their notifications.
- T040 to T044: after the above.

