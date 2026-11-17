# Feature Specification: One client interface for every GeckIt client

**Feature Branch**: `034-unified-client-interface`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "One client interface served by the GeckIt service for every client: local desktop, remote desktop and the mobile app. Today the mobile app's fast data protocol is served by a hidden peer window inside the desktop app, not by the service. The service's own remote interface, used by a desktop connected to another GeckIt server, sends whole conversations with pictures inline, the full conversation list on every change, live events for every conversation, uncompressed, and fetches the whole conversation again for Load earlier and opening a run of steps. Result: a desktop connected to a remote server is slow while the phone is fast even on a mobile network. Goal: move the phone's serving logic into the service as one client interface; every client attaches to it over its own transport. Remove the peer window relay, the old phone pairing path and the phone-versus-window branches. Order: service interface, remote desktop, local desktop, mobile off the old link."

## Background

Facts established from the code on 2026-11-17, for the reader who plans this work:

- **Three data paths exist today.** A local desktop window reads the service over a local connection and receives everything. The phone reaches the desktop app's hidden peer window (`client/src/renderer/src/peer/main.ts`), which serves a lean protocol. A desktop connected to another GeckIt server, and a phone paired to a server by invitation, use the service's remote access (`client/src/service/remote/access.ts`), which serves the full data the local window receives.
- **What the lean protocol does** (phone through the peer window): a conversation opens on its end and earlier parts are asked for; each run of steps arrives as one line and its steps are asked for when it is opened; pictures arrive as a reference and are sent at the width they are drawn, when they come into view; the conversation list is sent as changed rows only; live updates go only for the conversation the phone has open; messages are deflated; the list, settings and the end of recently opened conversations are kept on the phone between launches.
- **What the service remote access does**: whole conversations with pictures inlined as base64; the full list on every change; live events for every conversation; uncompressed text; Load earlier and opening a run of steps download the whole conversation again (`client/src/shared/renderer-api.ts`, `before` and `steps`). Since `d2de441a` events are batched every 50 ms, which reduces how many messages go out but not their size.
- **The peer window needs the desktop app.** A server running only the headless service cannot serve the lean protocol at all.

## Clarifications

### Session 2026-11-17

- Q: How do phones paired through the old link move to the new interface? -> A: Prompted re-pair. The old link stays read-only and shows a Pair again card until the person pairs with the server; it is removed in a later release. Chosen over re-pairing at once (a phone that updates would go blank without saying why) and a full transition period (two paths to maintain for a one-time step).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A desktop connected to another GeckIt server opens fast (Priority: P1)

A person opens GeckIt on their laptop and connects to the GeckIt server on another computer (a home desktop, a cloud machine). The board appears quickly, a long conversation opens on its latest messages, and the window stays responsive while agents on the server are working, including over a slow or mobile network.

**Why this priority**: This is the reported problem. A remote server is the main reason to use a desktop away from the server, and today it is the slowest way to use GeckIt.

**Independent Test**: Connect a desktop to a server that holds long conversations with pictures and several agents working, over a throttled network. Measure time to the board, time to open a long conversation, and data received in one minute while agents work. Compare with the phone on the same server and the same network.

**Acceptance Scenarios**:

1. **Given** a desktop connected to a remote server with a conversation of several thousand items, **When** the person opens it, **Then** its latest messages appear without the whole conversation being transferred, and earlier messages load when the person scrolls up or presses Load earlier.
2. **Given** an open conversation where a run of steps shows as one line, **When** the person opens the run, **Then** only that run's steps are transferred.
3. **Given** a conversation with pictures, **When** it opens, **Then** pictures that are not in view are not transferred, and a picture in view is transferred at the size it is drawn.
4. **Given** the person has one conversation open and five other conversations are working on the server, **When** a minute passes, **Then** the desktop receives live updates for the open conversation and only list row changes for the others.
5. **Given** a remote desktop on a network that drops for a few seconds, **When** the link comes back, **Then** the board and the open conversation catch up without reloading everything.

---

### User Story 2 - A local desktop works exactly as before on the same interface (Priority: P2)

A person uses GeckIt on the computer where the service runs. They browse the board, open conversations, use Find in a conversation, export, copy and continue conversations, open links and files, and answer permission cards. Everything works as it does today, and long conversations open at least as fast.

**Why this priority**: The local desktop is the main way people use GeckIt. Moving it to the shared interface is what makes the code simpler, and nothing it does today may be lost.

**Independent Test**: Run every conversation feature on a local desktop before and after the switch, against the same conversations, and compare results and timings.

**Acceptance Scenarios**:

1. **Given** a long conversation on a local desktop, **When** the person uses Find in conversation, **Then** matches in parts not yet shown are found and shown, as on the phone today.
2. **Given** a conversation partly loaded, **When** the person exports, copies or continues it, **Then** the result contains the whole conversation, not only what is loaded.
3. **Given** a conversation partly loaded, **When** a permission card, a link or a file named in an earlier part is needed, **Then** it is found and works.
4. **Given** any conversation feature that works locally today, **When** it is used after the switch, **Then** it gives the same result.

---

### User Story 3 - The phone works with any GeckIt server, desktop app or not (Priority: P3)

A person pairs their phone with a GeckIt server. The phone is as fast as it is today with a Mac running the desktop app, and it also works when the server runs only the headless service.

**Why this priority**: It removes the dependency on the desktop app's hidden window and the second pairing scheme. It comes last because the phone already works well with a Mac running the desktop app.

**Independent Test**: Pair a phone with a server running only the headless service, over a mobile network, and run the phone's existing flows: open the board, open a conversation, Load earlier, open a run of steps, view pictures, reopen the app offline.

**Acceptance Scenarios**:

1. **Given** a server running only the headless service, **When** a phone pairs with it, **Then** the board, conversations, steps and pictures load as fast as with a Mac running the desktop app today.
2. **Given** a phone that was used before, **When** it is opened without a connection, **Then** it shows the list, settings and the end of recently opened conversations it kept, and catches up once connected.
3. **Given** a phone paired through the old link, **When** the person updates the phone app and the server, **Then** the phone keeps showing what it can read over the old link, without sending anything, and a card asks the person to pair again with the server; once they do, the old link is forgotten.

---

### User Story 4 - One way to load data, for whoever maintains GeckIt (Priority: P3)

A developer changing how conversations load changes it in one place, and the local desktop, the remote desktop and the phone all get the change.

**Why this priority**: This is the reason to unify rather than speed up the remote path on its own. It follows from Stories 1 to 3 and needs no separate user flow.

**Independent Test**: After the work, the hidden peer window, the old pairing path and the branches that make the renderer behave differently on the phone and in a window no longer exist, and every client's tests run against the same interface.

**Acceptance Scenarios**:

1. **Given** the finished work, **When** the code is searched for the peer window's serving logic and the phone-versus-window branches in the renderer's data access, **Then** none remain.
2. **Given** a change to how a conversation page is served, **When** it is made in the service, **Then** local desktop, remote desktop and phone tests all exercise it.

---

### Edge Cases

- A client on an older version connects to a newer server, or a newer client to an older server: the client is told plainly which side to update, as today, and nothing is shown wrong or half loaded.
- A conversation is continued in a terminal on the server while a client has it open: the client receives the new part without loading the whole conversation again.
- The client's kept copy of a conversation differs from the server's (the conversation was rewritten, compacted or deleted): the server's version wins, the outdated part is replaced and nothing appears twice.
- A run of steps is still growing while the person has it open: new steps arrive live.
- A picture is pressed to fill the screen: it is transferred at the larger size once and kept.
- Several clients view the same conversation: each gets updates only for what it has open, and one client's view does not change what another receives.
- A client opens many conversations in a row: updates stop for the ones it left.
- A remote link is slow or its send buffer is full: updates for the open conversation are merged to the latest state rather than queued without limit.
- Find in conversation in a conversation with tens of thousands of items: it searches the whole conversation without first transferring all of it to the client.
- A headless server with no desktop app has the phone switch on: the phone still connects, because nothing depends on the desktop app's window any more.
- The link drops for a few seconds while the person sends a message or opens a conversation: the call waits and goes once the link is back. A call that had already gone out when the link dropped is never sent again.
- A remote client changes its theme or which projects it shows: only that client changes, not the server or other clients.

## Requirements *(mandatory)*

### Functional Requirements

**One interface**

- **FR-001**: The service MUST offer one client interface for conversation data that the local desktop, the remote desktop and the phone all use.
- **FR-002**: The interface MUST be served by the service itself and MUST NOT depend on the desktop app running on the server.
- **FR-003**: Each client MUST reach the interface through its own transport: a local connection for the local desktop, the existing encrypted peer-to-peer link for the remote desktop and the phone. Only the transport may differ between clients; what is asked for and what is answered MUST be the same.

**Conversations**

- **FR-004**: Opening a conversation MUST transfer its latest part first, and earlier parts only when the client asks for them (scrolling up, Load earlier, Find).
- **FR-005**: Each run of steps MUST be transferred as one line, and its steps only when the client opens it.
- **FR-006**: Pictures MUST be transferred as references; a picture's content MUST be transferred only when the client asks for it, at the size the client draws it.
- **FR-007**: Asking for an earlier part, a run's steps or a picture MUST transfer only what was asked for, never the whole conversation.
- **FR-008**: Operations that need the whole conversation (export, copy, continue, Find in conversation) MUST give complete results whatever part of the conversation the client has loaded. Find MUST search on the server and transfer only the matches and the parts needed to show them.

**Live updates and the list**

- **FR-009**: A client MUST receive live item updates only for the conversations it has open, and MUST be able to say which those are as it opens and leaves them.
- **FR-010**: The conversation list MUST be transferred whole once per connection and then as changed rows only.
- **FR-011**: Bursts of updates MUST be merged so a client receives the latest state of an item rather than every intermediate state, as the phone link does today.
- **FR-012**: After a dropped link reconnects, a client MUST catch up on the list and the open conversation from what it already has, without transferring everything again.

**Remote links**

- **FR-013**: On a remote link everything MUST be compressed in both directions once both sides have said they support it.
- **FR-014**: A remote client MUST keep the list, settings and the end of recently opened conversations between launches, open on them while connecting, and replace them with the server's version once connected.
- **FR-015**: The local desktop MUST NOT compress or keep a copy between launches, since it reads the service directly.

**Compatibility and migration**

- **FR-016**: Before the local desktop switches, every place that reads a whole conversation today MUST be identified and either moved to the paged interface or to a server-side operation that keeps its result complete (at least: the conversation view and its item lookups, Find, export, copy, continue, links, waiting permission cards).
- **FR-017**: A client and a server that cannot understand each other MUST say which one to update, and MUST NOT show partial or wrong data.
- **FR-018**: A phone paired through the old link MUST keep reading over it without sending (no messages, answers or settings changes) and MUST show a card asking the person to pair again with the server; after re-pairing the old link is forgotten. The old link is removed in a later release, once phones have moved.
- **FR-019**: When every client uses the interface, the hidden peer window's serving logic, the old phone pairing path and the renderer's phone-versus-window data branches MUST be removed.

**Reconnecting**

- **FR-021**: While a remote link is down, a call not yet sent MUST wait for the link for up to 60 seconds and then go, as the phone does today; after 60 seconds it MUST fail with a message saying the link is down. A call already sent when the link dropped MUST fail and MUST NOT be sent again.

**What belongs to the client**

- **FR-022**: Each remote client MUST keep its own appearance (theme), board choice (profile, projects shown) and its own answers about counting usage and sending errors, with errors held on the client, as the phone does today. Changing them MUST NOT change the server's settings or another client's.
- **FR-023**: Where the phone's pictures are scaled today (the desktop app running on the server), they MUST stay the same size and format as today.

**Access**

- **FR-020**: The interface MUST apply the same device permissions as today: a device limited to some projects or without Manager access MUST NOT receive conversations, list rows, pictures or updates outside them.

### Key Entities

- **Client**: a local desktop window, a remote desktop or a phone connected to one server. Has a transport, the conversations it has open and, on a remote link, a kept copy.
- **Conversation page**: a contiguous part of a conversation's items, ending at its latest item or before a given item, with runs of steps folded into one line each and pictures as references.
- **Run of steps**: the consecutive tool steps between two messages, shown as one line until opened.
- **Picture reference**: names a picture in a conversation without carrying it; resolved to the picture at a requested width.
- **List row**: one conversation in the list as the board shows it; changes are sent per row.
- **Viewed set**: the conversations a client currently has open; it decides which live updates the client receives.
- **Kept copy**: what a remote client stores between launches (list, settings, ends of recent conversations).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the same server, conversations and network, a remote desktop shows the board and opens a long conversation within 20% of the time the phone takes today.
- **SC-002**: Opening a conversation of 5,000 items on a remote desktop transfers at most 10% of the data it transfers today.
- **SC-003**: With one conversation open and five others working on the server, a remote desktop receives at most 20% of the data per minute it receives today.
- **SC-004**: Load earlier and opening a run of steps on a remote desktop complete in under 1 second on a typical home connection, whatever the conversation's length.
- **SC-005**: On a local desktop every conversation feature in `docs/features.md` gives the same result as before the switch, and a long conversation opens no slower than before.
- **SC-006**: A phone works with a server running only the headless service, with the same timings as with a Mac running the desktop app today.
- **SC-007**: After the work there is one data path for conversations instead of three: the peer window's serving logic, the old pairing path and the renderer's phone-versus-window data branches are gone.

## Assumptions

- The baseline for SC-001 to SC-004 is measured before any change, on one recorded set of conversations, with the network throttled to a typical mobile connection. Byte counts per message type are part of that baseline.
- The lean protocol's existing behaviour (page sizes, picture widths, how runs of steps fold, what the phone keeps) is the starting design; this work moves and generalises it rather than redesigning it.
- The phone's other calls that are not about loading conversation data (browser live view, screen control, recordings, local page fetches) stay as they are, apart from moving from the peer window to the service where they currently depend on it. Whether each of them can move is a planning question, not a scope question: anything that truly needs the desktop app keeps needing it and says so.
- The visible changes are limited to grey placeholders while a part loads, which the phone already has, and the Pair again card for phones on the old link. A UX document in `docs/ux/` covers those before implementation, per the constitution.
- Work lands in the stated order: interface in the service, remote desktop, local desktop, phone. Each step is releasable on its own.
- The remote desktop's batching and reconnect behaviour from `d2de441a` is kept and folded into the shared interface.
