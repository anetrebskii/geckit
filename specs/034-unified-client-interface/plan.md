# Implementation Plan: One client interface for every GeckIt client

**Branch**: `034-unified-client-interface` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/034-unified-client-interface/spec.md`

## Summary

Move the phone's lean conversation protocol out of the desktop app's hidden peer window and into the service, as a per-client view that every client uses: the local desktop over local RPC, the remote desktop and the phone over the remote channel. On the client, extract the phone's data adapter so all three build `window.geckit.chat`'s data methods from one module. Add deflate to the remote channel, server-side Find, and picture scaling through the attached desktop app with today's code. The phone's link behaviour (calls held through short drops, its own settings, errors and counting) is shared with the remote desktop. Land in four releasable steps: interface in the service plus baseline, remote desktop, local desktop, phone; then remove the old paths. Details: [research.md](research.md).

Design handoff: [design.md](design.md), UX [docs/ux/unified-client-interface.md](../../docs/ux/unified-client-interface.md). Constraints carried from it: reuse the existing skeleton, `picture-waiting`, Load earlier row, Find count and notice card; 150 ms placeholder delay on the local desktop only; Find over the whole conversation; Pair again card on old-paired phones.

## Technical Context

**Language/Version**: TypeScript (ESM), Node 22 for the service (run as `ELECTRON_RUN_AS_NODE`), Electron renderer and main, Capacitor for the phone

**Primary Dependencies**: Existing only: Electron, React 19, electron-vite, vitest. `CompressionStream` (Node 22 and browsers). No new runtime dependency (research R4)

**Storage**: Service memory for client views and the conversation cache; IndexedDB `kept` store on remote clients

**Testing**: vitest against recorded `claude` output in `client/test/fixtures/`; running-app checks per [quickstart.md](quickstart.md)

**Target Platform**: macOS, Windows, Linux desktop and service; iOS and Android phone

**Project Type**: Desktop app with a background service and a mobile app

**Performance Goals**: SC-001 to SC-004 in the spec, measured against the baseline (research R9)

**Constraints**: Old clients and servers keep working or say which side to update (FR-017); local desktop never regresses (SC-005); remote channel message limit of 8,000,000 characters stays as a guard

**Scale/Scope**: Conversations up to tens of thousands of items; up to 6 working conversations by default (`workingAtOnce`); a few clients per server

## Constitution Check

| Principle | Status |
|---|---|
| I. The person's own plan | Pass. No change to how `claude` is started or to credentials. |
| II. One contract between main and windows | Pass. New abilities are new entries in `shared/api.ts` and `CoreMethods`; the phone's calls stay listed in `phoneCalls()`. The contract becomes the same for every client, which strengthens this principle. |
| III. Recorded output, not live calls | Pass. Folding, paging, list changes, Find and filtering are pure functions in `core/client-view.ts` tested on fixtures; the stateful shell is thin. |
| IV. UX before pixels | Pass. UX document and design handoff exist; no layout change, so no prototype (design.md, Artifacts). |
| V. Every system, one word | Pass. Wording uses "computer"; scaling degrades to full-size pictures where no desktop app is attached. |
| VI. Tokens only | Pass. Any style for the new labels uses existing tokens. |
| Constraint: no new runtime dependency | Pass. `sharp` considered and rejected (R4). |
| Constraint: files under ~400 lines | Watch. `phone.ts` (903 lines) shrinks; `core/client-view.ts` and `renderer/src/client-data.ts` are split by responsibility if they pass 400. |

Re-checked after Phase 1 design: no change.

## Project Structure

### Documentation (this feature)

```text
specs/034-unified-client-interface/
├── spec.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/client-interface.md
├── checklists/requirements.md
└── tasks.md
docs/ux/unified-client-interface.md
```

### Source Code

```text
client/src/
├── core/
│   ├── client-view.ts         # new: per-client view, pure folding/paging/diff/find + thin shell
│   ├── application.ts         # new core methods: link:can, chat:watch, chat:turns, chat:turnsBefore, chat:steps, chat:picture, chat:find
│   └── events.ts              # chat:sessionsChanged
├── service/
│   ├── application.ts         # client view for the local RPC connection; picture scaling via desktop native callback
│   └── remote/access.ts       # client view per remote channel instead of raw runtime.subscribe
├── shared/
│   ├── steps.ts               # unchanged helpers, used by the service now
│   ├── find-text.ts           # new: text an item is matched on, from Transcript
│   ├── remote/channel.ts      # deflate negotiation and binary frames
│   └── renderer-api.ts        # data methods from client-data; fallbacks removed
├── main/
│   ├── index.ts               # list row changes into snapshot; chat:watching -> chat:watch; scale pictures for the service
│   └── service-client.ts      # unchanged transport
└── renderer/src/
    ├── client-data.ts         # new: tail, before, steps, picture, rows, kept copy, catch-up
    ├── client-link.ts         # new: calls held while the link is down, own settings, errors, counting (from phone.ts)
    ├── kept.ts                # unchanged, used by client-data
    ├── phone.ts               # data half moved to client-data
    ├── peer/main.ts           # conversation serving removed; old-pairing read-only relay, then removed
    ├── remote/workspace-api.tsx  # uses client-data with keeping
    └── chat/                  # Transcript Find via chat:find; placeholders; shortcutFrom via chat:firstAsked
client/test/
├── client-view.test.ts
├── client-data.test.ts
└── find.test.ts
mobile/src/main.ts             # Pair again card path for old-paired phones
```

**Structure Decision**: Existing layout. The service owns the interface in `core/`, transports stay where they are, and the renderer gets one adapter used by all three clients.

## Phases and order

1. **Foundation**: baseline measurement, `core/client-view.ts` with tests, new core methods, find text in `shared/`.
2. **US1 remote desktop**: client view per remote channel, deflate, `client-data.ts` with keeping in the remote workspace, placeholders, scaling callback.
3. **US2 local desktop**: re-run the FR-016 audit, client view on local RPC, main applies list changes, renderer-api uses `client-data.ts`, Find via `chat:find`.
4. **US3 phone**: phone connects through the service and keeps everything it does today: the link half of `phone.ts` (held calls, own settings, errors, counting) becomes `client-link.ts`, shared with the remote desktop; push presence moves to the service; pictures are scaled by today's code in a desktop app window; old link read-only with Pair again card.
5. **US4 removal**: peer window conversation serving and renderer branches deleted; `docs/features.md` entry proposed to Alex if any visible behaviour is new (Find over the whole conversation).

## Risks

- **Local desktop regression** (US2). Mitigation: the FR-016 audit in research R3 is re-run right before the switch; Scenario 3 in quickstart compares every feature before and after.
- **Ordering bugs in row diffs** (a reply moved to the end under its own id). Mitigation: the existing logic from `sendItems` moves unchanged and its cases become fixture tests first.
- **Old servers or clients**. Mitigation: capabilities are negotiated; an old peer gets today's behaviour.

## Complexity Tracking

None.
