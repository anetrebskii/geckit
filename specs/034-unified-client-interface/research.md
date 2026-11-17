# Research: One client interface for every GeckIt client

Each entry: Decision, Rationale, Alternatives considered. Code references are to the tree at `d2de441a`.

## R1. Where the interface lives

**Decision**: A per-client view in the service, `client/src/core/client-view.ts`, created once per connected client (each remote channel in `service/remote/access.ts`, and the local desktop's RPC connection). It holds the client's viewed set, the rows last sent of the list and of each viewed conversation, and the folded copy of conversations being viewed. It subscribes to `runtime.subscribe` once and emits only what that client should get. Its methods are core methods (contract in [contracts/client-interface.md](contracts/client-interface.md)) so every transport reaches them the same way.

**Rationale**: The phone's logic is already written and works in `renderer/src/peer/main.ts`, but in a renderer window, which a headless service does not have (spec Background). The service is the only process present for every client. Per-client state is unavoidable because what each client gets depends on what it has open (FR-009) and what it was already sent (FR-010).

**Alternatives considered**: Keep the logic in the peer window and route remote desktops through it: still needs the desktop app, fails FR-002. Make the logic stateless (client sends what it has with each call): moves diffing to every client and multiplies upload on mobile links.

## R2. What moves from the peer window, and what stays

**Decision**: Move the conversation serving: `wholeOf`, `gather`/`sendItems` (row diff per viewed conversation), `sendList` (list row changes), `chat.tail`/`chat.before`/`chat.turns`/`chat.turnsBefore`/`chat.steps`/`chat.picture`/`chat.queuedPicture`, `chat.watching`, and the `link.can` capability handling. These become pure functions in `core/client-view.ts` over recorded fixtures (constitution III), with a thin stateful shell.

Stays in the peer window, because it needs a renderer: screen capture for phones (`screen.start`/`screen.stop`), shared-link rooms (`share.*`). Push presence (`push.away`/`push.here`) moves with the phone's connection to the service in US3.

**Rationale**: FR-019 asks to remove the serving logic, not every use of a renderer. Screen capture needs `getUserMedia`, which Node lacks.

**Alternatives considered**: Moving screen capture to an Electron utility process: unrelated to this spec's goal and adds risk.

## R3. Whole-conversation consumers (FR-016 audit)

Every place that reads a whole conversation on the client today:

| Place | Need | Resolution |
|---|---|---|
| `useChat.ts` open (`chat.items`, line ~534) | Show the conversation | `chat:turns` (end first) |
| `useChat.ts` `loadEarlier` / `loadSteps` | Earlier part, run's steps | `chat:turnsBefore`, `chat:steps`; renderer-api fallbacks that fetch everything are removed |
| `Transcript.tsx` Find | Matches over everything | New `chat:find` (R7) |
| `Chat.tsx` `shortcutFrom` (line ~241) | First message of a conversation | Existing `chat:firstAsked` |
| `Chat.tsx` line ~428 (last live lasting step) | Latest items only | Works on the end |
| Export, copy, continue, links, waiting card | Whole conversation | Already server operations (`chat:exportConversation`, `chat:copyConversation`, `chat:continueConversation`, `chat:links`, `chat:waiting`); unchanged |
| `main/index.ts` `applySnapshot` re-reads `chat:items` for `watched` | Catch-up after service restart | `chat:turns` for the viewed conversation |
| `core/product-sessions.ts` CLI `.slice(-last)` | CLI output | Server side, not a client; unchanged |

**Rationale**: The audit is what makes switching the local desktop safe (spec US2 risk). The list is from searching `chat.items(`, `chat.before(`, `chat.steps(`, and `items.find/filter/findLast` in `renderer/src/chat/`. Implementation re-runs that search before switching (task in US2).

## R4. Picture scaling without the desktop app

**Decision**: The service scales pictures through the attached desktop app when one is connected. The service asks main over the existing native-callback channel (`desktop:completeNative` precedent in `service/application.ts`); main hands the picture to the peer window, which scales it with `createImageBitmap` and `OffscreenCanvas` and encodes WebP at quality 0.82, the same `scaledTo` code as today. With no desktop app or no peer window, `chat:picture` returns the original. Scaled results are cached per (picture, width), 60 entries, as today (FR-023).

**Rationale**: The service runs with `ELECTRON_RUN_AS_NODE` (`cli/service-start.ts`), so neither `nativeImage` nor `OffscreenCanvas` exists there. Node has no image decoder. Phones today only work with the desktop app present, so this keeps today's behaviour exactly where it exists and adds headless support with full-size pictures (UX section 4). Pictures still go only when in view, which is the main saving.

**Alternatives considered**: Electron's `nativeImage` in main: it can resize but encodes only PNG and JPEG, so pictures would be larger than today and screenshots would lose transparency as JPEG; rejected by FR-023. `sharp` in the service: native module, packaging for three systems and two architectures through electron-builder, and a new runtime dependency where the constitution asks for none unless needed; revisit only if the baseline (R9) shows headless picture bytes matter. Scaling on the client: saves nothing on the link.

## R5. Compression on remote links

**Decision**: Remote channels (`shared/remote/channel.ts`) negotiate deflate in the `hello`/`challenge` exchange (`can: ['deflate']`) and then send deflate-raw binary frames, reusing `shared/pairing.ts` framing (`framesOf` deflated variant, `assembler`). Node 22 and every client have `CompressionStream`. Local RPC is not compressed (FR-015).

Also: the remote channel drops the link on any message over 8,000,000 characters (`channel.ts`, `send`). Today a whole conversation with pictures can exceed that and end the connection. Paging removes the cause; the limit stays as a guard.

**Rationale**: Proven on the phone link. Negotiation keeps old clients working (FR-017) without bumping `REMOTE_PROTOCOL`.

**Alternatives considered**: Bump `REMOTE_PROTOCOL` to 3: forces both sides to update at once with no gain. Compress per message as base64 text: 33% overhead and the transport already ends the link on binary data only because nothing sent binary; the receiving side is changed anyway.

## R6. Kept copy for remote clients

**Decision**: Move `renderer/src/kept.ts` and the keep logic in `phone.ts` (`keptFirst`, `keepShown`, `remembered`) into the shared client adapter (R8). Keys are prefixed with the server id, as the phone prefixes with the Mac id. The remote desktop's workspace iframe already scopes storage by server (`remote/workspace-entry.ts`); IndexedDB is per origin, so the prefix is what separates servers. Local desktop does not keep (FR-015).

**Rationale**: Same code, same behaviour, explains SC-001's "board appears quickly" on a remote desktop.

## R7. Find on the server

**Decision**: New core method `chat:find(id, words)` returning the matching item ids in conversation order, each with the id of the run of steps that contains it when it is inside one, plus the total. The text each item is matched on comes from the function Transcript's Find uses today, moved to `shared/` so both sides match the same text. Moving to a match outside what is loaded asks `chat:turnsBefore` until the match is loaded (pages of 200), then opens its run if needed.

**Rationale**: FR-008; without it the local desktop's Find regresses once it gets only the end (design decision 2).

**Alternatives considered**: Load everything when Find opens: brings back the cost on remote links. Search on the client in what is loaded: today's phone behaviour, rejected in design.

## R8. One client adapter in the renderer

**Decision**: Extract the data half of `renderer/src/phone.ts` (tail, before, steps, picture, rows, kept copy, reconnect catch-up via `bringUp`) into `renderer/src/client-data.ts`, parameterised by `call`, `listen` and `keeps: boolean`. `phone.ts`, the remote desktop's `remote/workspace-api.tsx` and the local `shared/renderer-api.ts` all build `window.geckit.chat`'s data methods from it. The phone-versus-window branches in `renderer-api.ts` (`before`, `steps`, `picture` stubs) are deleted (FR-019).

**Rationale**: One code path on the client as well as the server (US4).

**Alternatives considered**: Keep three adapters with the same contract: the contract would match but behaviour would drift, which is today's problem.

## R9. Baseline measurement

**Decision**: Before any change, add a byte counter per message type to the remote channel (development builds only, logged per minute) and record the baseline for SC-001 to SC-004 on one recorded set of conversations: a 5,000-item conversation with 20 pictures, five working conversations driven from recorded `claude` output, network throttled to 1.5 Mbit/s down, 750 kbit/s up, 150 ms latency. Recorded in `specs/034-unified-client-interface/baseline.md`.

**Rationale**: The spec's targets are relative to today; without a baseline they cannot be checked.

## R10. Local desktop event routing

**Decision**: The local desktop's RPC connection gets a client view like a remote one. Main applies list row changes to its own snapshot (it still needs every row for the tray, badge and gecko, `main/index.ts` `listChanged`) and forwards item updates for the viewed conversation to the Chat window. The existing `chat:watching` IPC becomes the client view's `chat:watch`.

**Rationale**: FR-001. Main already tracks the watched conversation, so the change is small.

**Alternatives considered**: Leave the local desktop on broadcast events: keeps two paths in the service and in main, which US4 exists to remove.

## R11. Old phone pairing

**Decision** (spec Clarifications): The peer window keeps answering old-paired phones with read calls only (`chat.list`, `chat.turns`, `chat.turnsBefore`, `chat.steps`, `chat.picture`, `settings.get` and their events), now served by the client view through `peer.call`, and refuses every other call with a fixed error the phone recognises to show the Pair again card. A later release removes it.

**Rationale**: No phone goes blank; only one path keeps write access.

## R13. Calls while the link is down

**Decision**: Keep the phone's rule for every remote client (FR-021): a call made while the link is down is held, not sent, and goes when the link is back, within 60 s (`HOLD` in `phone.ts`); after that it fails with the link-down message. A call already sent when the link dropped fails at once with the link-down message and is never resent. Moved from `installGeckit` in `phone.ts` into the shared client link module so the remote desktop and the phone's server connection both get it. This replaces "Reconnecting: writes disabled" in `docs/ux/remote-clients.md` for remote desktops; see UX section 5.

**Rationale**: On a mobile network the link drops often for a few seconds; failing every call during a drop shows errors for nothing. Holding a call that was never sent cannot duplicate it, so the no-replay rule in `remote-clients.md` still holds for what matters: nothing that may have reached the server is sent twice.

**Alternatives considered**: Hold reads only and keep writes disabled: a message typed during a two-second drop would fail, which the phone does not do today. Resend in-flight writes: risks sending a message twice.

## R14. What belongs to the client

**Decision**: Move the phone's own-settings layer (`OWN` in `renderer/src/phone-calls.ts`: `theme`, `profile`, `chatProjects`, `chatAll`, `analytics`, `analyticsAsked`, `sendErrors`, `client`), its error holding (`renderer/src/phone-errors.ts`) and its usage counting into the shared client link module, kept per server in the client's storage. Every remote client uses it (FR-022). Push presence moves to a new core method `push:here` the service answers, since the phone no longer goes through the peer window; `push:token` is already a core method. The decision to push (no phone here, nobody at the computer for a minute, `main/index.ts`) moves to the service, which asks main for the idle state and treats a computer without the desktop app as idle.

**Rationale**: Without it, the phone moving to the server connection loses these, and a remote desktop already changes the server's theme and board choice today (`remote/workspace-api.tsx` passes `settings:set` straight through).

## R12. Manager threads

**Decision**: Out of scope for paging in this feature. `manager:items` keeps its current path and batching. Manager threads are short-lived and already viewed one at a time.

**Rationale**: Keeps the change bounded; revisit with the baseline if Manager traffic shows up.
