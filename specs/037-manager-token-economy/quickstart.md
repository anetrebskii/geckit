# Quickstart: validating Manager token economy

## Prerequisites

- `client/` dependencies installed; Node 22+.
- For the live checks: GeckIt from source (`npm run dev`, data in `geckit-local`), Manager enabled, signed in to Claude Code. Live checks spend real plan usage; keep them short.

## Automated

From `client/`:

```sh
npm run typecheck
npm run lint
npx vitest run test/manager.test.ts test/claude-read.test.ts test/codex*.test.ts
npm test
```

Expected: all pass. The Manager tests cover:

| Scenario | Spec |
|---|---|
| Background task ends while the worker works: no Manager message | US1-1, FR-002 |
| Worker idle, failed, asks, blocked, goal changed: one message each | US1-2, FR-001 |
| Update line has `tasks[].label` of at most 120 characters and no command text | US1-3, FR-003 |
| Five queued updates: one `sendManager` call; latest per worker | US2, FR-004 |
| Person's message between updates: separate turn, order kept | US2-2, FR-005 |
| `spend.used` >= `compactAt` after a turn: one `compactManager`; message during it waits | US3-1/2, FR-008/009 |
| Compaction fails: no thread error, no second attempt before the next turn | US3-6, FR-011 |
| `compactAt: 0` or assistant without `compacts`: no compaction | US3-4/5, FR-013 |
| Next turn after compaction carries the durable record | US3-7, FR-010 |
| Reset with only worker updates waiting: no turn; state "Limit reset" | US4-1/4, FR-014/017 |
| Reset with a channel message waiting: one turn with reconciliation | US4-6, FR-014 |
| Old `manager.json` without new fields loads with defaults | FR-018 |

## Live, local

1. Set `compactAt` to 50,000: `~/.geckit/bin/geckit-local service manager configure '{"compactAt":50000}'`.
2. Ask Manager in the app for a small task in a test project that runs a background command for a minute (for example `sleep 60` started in the background, then a summary).
3. Watch Manager's conversation: no Manager turn while the worker's background command runs; one Worker update when the worker finishes.
4. Keep talking to Manager until Chat's status bar shows its context above 50,000; after the turn, the state shows "Compacting", then the next turn's context is below 50,000 and Manager still names the worker from step 2.
5. Restore: `configure '{"compactAt":240000}'`.

## Live, EntechBot (after release and deploy)

Measure with the usage script from this incident over 24 h of normal Slack use: Manager share under 20% (SC-005), no Manager turn above about 300,000 context tokens (SC-003), zero turns between a limit reset and the next real message (SC-004).
