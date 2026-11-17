# Quickstart: validating the client interface

How to prove each story works. Contract: [contracts/client-interface.md](contracts/client-interface.md). Visible states: [design.md](design.md) and [docs/ux/unified-client-interface.md](../../docs/ux/unified-client-interface.md).

## Prerequisites

- Two computers, or one computer with a second GeckIt data folder: the server runs the service (`geckit-local` from the source, or headless with `--app-home` on a scratch folder; see memory note on isolated services overwriting `~/.geckit/bin`, snapshot first).
- A recorded fixture set in `client/test/fixtures/` holding a 5,000-item conversation with 20 pictures (research R9). Load it into the server's project folder so it shows on the board.
- Chrome DevTools network throttling, or macOS Network Link Conditioner, at 1.5 Mbit/s down, 750 kbit/s up, 150 ms latency.
- An iPhone with the development build (memory: Deploy to iPhone).

## Automated checks

From `client/`:

```bash
npm run lint
npm run typecheck
npm test
```

Must include, against recorded fixtures only (constitution III):
- `client-view.test.ts`: folding, pages, steps, list changes, viewed-set filtering, scope filtering, catch-up after a dropped link.
- `client-data.test.ts`: the renderer adapter for local (no keeping) and remote (keeping) transports.
- `client-link.test.ts`: holding calls while down, no resend of calls in flight, own settings per server.
- `remote-channel` deflate negotiation, including an old client without `link:can`.
- `find.test.ts`: `chat:find` matches what Transcript's Find matched on the same fixture.

## Scenario 1 - Baseline (before any change)

1. Connect a desktop to the server over the throttled network.
2. Record with the development byte counter: time to board, time to open the 5,000-item conversation, bytes to open it, bytes per minute with that conversation open and five others replaying recorded output.
3. Do the same on the phone.
4. Write the numbers into `specs/034-unified-client-interface/baseline.md`.

## Scenario 2 - Remote desktop (US1, SC-001 to SC-004)

1. Repeat Scenario 1 on the remote desktop after the change.
2. Expected: board and open within 20% of the phone's times; open uses at most 10% of baseline bytes; per-minute bytes at most 20% of baseline.
3. Scroll to the top: "Loading earlier", then earlier messages, under 1 s.
4. Open a run of steps: one placeholder line, then the steps, under 1 s.
5. Scroll a picture into view: grey box, then the picture.
6. Turn the network off for 10 s, then on: board and conversation catch up; no duplicate lines.

## Scenario 3 - Local desktop parity (US2, SC-005)

1. On a local desktop, run each conversation feature in `docs/features.md` on the fixture conversation before and after the change. Note any difference.
2. Find a word that appears only near the start: count includes it; moving to it loads that part and scrolls there.
3. Export, copy and continue the conversation with only its end loaded: result contains the whole conversation.
4. Make a shortcut from a conversation: it uses the first message.
5. Open a long conversation: no skeleton flash.
6. Review light and dark, Find with keyboard (Enter, Shift+Enter, Escape), scrolling while parts load.

## Scenario 4 - Phone with a headless server (US3, SC-006)

1. Run the server with the service only, no desktop app.
2. Pair the phone with `geckit pair`. Repeat Scenario 2 steps 3 to 6 on the phone over the mobile network.
3. Close the app, turn on airplane mode, open it: list and recent conversations show from what was kept.
4. Pictures arrive at full size; with the desktop app started on the server, they arrive scaled.

## Scenario 5 - Old phone pairing (US3, FR-018)

1. With a phone paired by the Settings QR before the change, update both apps.
2. Board and conversations are readable; the Pair this phone again card shows; the composer is disabled.
3. Press Scan code and scan `geckit pair`'s code: card gone, sending works, the old pairing is no longer listed.

## Scenario 7 - Short drops and own settings (FR-021, FR-022, FR-023)

1. On a remote desktop and on the phone, turn the network off, send a message and open a conversation within 60 s, turn it back on: both happen once, after reconnecting.
2. Leave it off for more than 60 s after sending: "The link to the computer is down. Try again when it is back."
3. Drop the link right after pressing Send (throttle to a stall): "Connection lost. Check the computer before retrying this action."; the message appears on the computer at most once.
4. Change theme and the projects shown on the remote desktop: the computer's own window and the phone keep theirs.
5. With the desktop app running on the server, open a picture on the phone: its size and format match the baseline.

## Scenario 6 - Removal (US4, SC-007)

After the last story: no conversation serving remains in `renderer/src/peer/main.ts`; `shared/renderer-api.ts` has no `before`/`steps`/`picture` fallbacks; local, remote and phone tests exercise `core/client-view.ts`.
