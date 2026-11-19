# Research: Manager token economy

## Evidence from the incident

Source: EntechBot VM `entechbot-prod`, Claude Code 2.1.310, GeckIt v1.274.0, session files in `/var/lib/entechbot/home/.claude/projects`, 2026-11-12 to 2026-11-19, read on 2026-11-19.

| Measure | Value |
|---|---|
| Plan | Claude Max 5x (`rateLimitTier: default_claude_max_5x`) |
| Model of every call | `claude-opus-5-5` |
| Calls in 7 days | 5,362 |
| Cache reads in 7 days | 1.0B tokens; output 3.0M |
| Manager share of 2026-11-19 | 55% (63% in the five hours before the limit) |
| Largest Manager turn | about 760,000 tokens of context |
| After the 16:40 UTC reset | 19 Manager calls, 14.4M tokens, 16:40:05-16:40:54 |
| Messages Manager received then | about 14, each about 29,000 characters, each ending in a worker's background command text (`... sleep 20; done`) |

The worker that triggered them (`bb97c494`) was polling a contact search in a shell loop. Its resumption at 16:40 came from two sources: Manager's own automatic recovery after the limit, and a one-time task Manager had scheduled for the reset time.

## Decision 1: Which worker changes wake Manager

- **Decision**: Keep every current milestone trigger in `observeSessions` (`client/src/main/manager.ts:1036-1064`): asks without a pending card, failed, blocked, goal result changed, became unread, went idle after working. Narrow `taskEnded` to two cases: a task now `asks`, or a task ended while the worker itself is no longer `working`. A task that ends while the worker keeps working changes the stored signature but sends nothing; the worker's own idle/unread milestone later reports the final task states.
- **Rationale**: The background-task signal is the only one that fires repeatedly during a single worker turn. Every other signal fires at most once per turn.
- **Alternatives considered**: Debouncing all signals by time (rejected: delays questions and failures, which need fast answers); dropping task signals entirely (rejected: a background command that asks for a decision must reach Manager).

## Decision 2: What a worker update carries

- **Decision**: Replace `tasks: worker.tasks` in the update line with `tasks: [{ id, status, label }]`, `label` being the task's own description or the first 120 characters of its command on one line.
- **Rationale**: Manager decides from state, not from command text; it can read details with `sessions items` when it needs them. The measured lines were about 29,000 characters, mostly commands.
- **Alternatives considered**: Omitting tasks (rejected: Manager needs to know a background command is still running before calling a worker finished).

## Decision 3: Grouping updates

- **Decision**: In `#dispatch`, when the next queued message is `source: 'event'` and unaddressed to a person (no `request`), take every queued `event` message of the same thread that has no `request` (or the same `request`), in order, up to the first non-event message; deliver them as one turn whose text is their lines joined, keeping only the latest line per worker id. All taken messages move to `sending` and complete together. Messages from people, channels, schedules or CLI results are never taken into a group.
- **Rationale**: Grouping at dispatch catches bursts that queue while Manager is busy, which is exactly when they pile up. It needs no timer and does not delay a single update.
- **Alternatives considered**: A fixed 30 s collection window before sending (rejected: adds latency to every lone milestone and still sends one turn per window); grouping in `observeSessions` only (already done per call; misses updates from separate calls).

## Decision 4: When and how compaction starts

- **Decision**: After a Manager turn completes (`#output` finished, no queued message being sent, no command running, not paused, no limit), read the Manager session's `spend.used`. If it is at or above `compactAt` and the thread has not compacted since its last turn, call `sessions.compactManager(session)`. While compacting, `#dispatch` holds the thread (same as `awaitingOutput`). When compaction ends, mark the thread so the next delivered message is prefixed with the restart record (the same JSON `restart()` builds: last 30 operations, open decisions, tracked workers).
- **Rationale**: `spend.used` is already reported per turn by Claude (`result` usage) and Codex (`spend` signal) and drives Chat's status bar. Starting right after a turn means the compaction rides on a still-warm cache, and the next message is not delayed by it.
- **Alternatives considered**: Compacting just before the next turn (rejected: next message waits a minute, and a thread that is never used again would never need it, but the user asked for compaction at the threshold); replacing the session with `restart()` (rejected: loses the conversation's own memory of channel nuances; the user asked to compact, not reset).

## Decision 5: Assistant contract for compaction

- **Decision**: `LlmProvider` gains `readonly compacts: boolean`; `Driver` gains optional `compact?(): Promise<void>`, resolving when compaction has finished (Claude: the `compact_boundary` system line and the turn's `result`; Codex: `thread/compact/start` completes and the thread is idle again). Built-in Claude stream: `compacts: true`, `compact` sends `/compact` over stream-json input, the same input the Chat's Compact button sends today. Built-in Codex: `compacts: true`, `compact` calls `thread/compact/start` (already used by `codex.ts:563` for a typed `/compact`). Provider plugins: absent means `false`; the plugin documentation's capability table gains `compacts` and the Driver gains `compact`. `Sessions.compactManager(id)` refuses when the provider says `false` or the live driver lacks `compact`.
- **Rationale**: Mirrors the existing `inject` pattern (capability declared, operation on the live driver), so an older plugin is unaffected and the setting can say "not available" before any driver runs.
- **Alternatives considered**: Sending the literal text `/compact` through `send` for every provider (rejected: a plugin that does not understand it would send the words to the model as a message, costing a turn and confusing Manager).

## Decision 6: The threshold setting

- **Decision**: `ManagerConfig.compactAt: number`, tokens, `0` means off, default `240000`, valid range 50,000 to 2,000,000 or 0. Exposed in the Manager page's Setup section (desktop and phone) and in `geckit service manager configure {"compactAt": ...}`; added to `product-cli.ts` schema `manager.patch` and to configuration export/import (`shared/configuration.ts`).
- **Rationale**: One global value is what was asked; it applies to every thread including channel threads.
- **Alternatives considered**: A percentage of the model's context window (rejected: Opus 1M and Sonnet 200k windows make a single percentage meaningless; the user asked for an absolute number).

## Decision 7: Limit reset

- **Decision**: `#awaitLimit`'s timer no longer calls `#scheduleRecovery`. At `until + 5 s` it sets the thread's `limit` to `{ until, reset: true }` and emits. `#dispatch` treats a reset thread as follows: if a queued message with source `desktop`, `phone`, `channel`, `operator` or a person-made shortcut is waiting, it clears the limit and delivers it prefixed with the existing "Automatic recovery after the plan's usage limit reset..." reconciliation text, grouping any waiting worker updates after it; if only `event` messages wait, it delivers nothing. `retry`/`resume` behave as today. `managerStand` shows "Limit reset. Continues with the next message." for a reset thread. Manager instructions (`client/src/prompts/`) gain one rule: after a usage limit, do not schedule your own continuation; continue when a message arrives.
- **Rationale**: Keeps the promise made in the channel reply (`limitReply`: "Messages sent before then are kept and answered after the reset") while removing the unattended wake.
- **Alternatives considered**: Never resuming automatically, even for kept messages (rejected: breaks the reply's promise to channel users).

## Decision 8: Testing

- **Decision**: Pure unit tests in `client/test/manager.test.ts` with the existing fake `sessions` dependency: milestone filtering, update line shape, grouping, compaction trigger and hold, limit reset with and without waiting messages. Contract tests for the Claude and Codex drivers' `compact` against recorded output: `client/test/claude-read.test.ts` already reads a `compact_boundary` line inline; a Claude `/compact` turn and a Codex `thread/compact/start` exchange are each recorded once from a local CLI into `client/test/fixtures/`. No live calls.
- **Rationale**: Constitution III.
