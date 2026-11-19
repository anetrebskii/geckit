# Data model: Manager token economy

All records live in the existing Manager store (`manager.json` in the service data directory) or in settings. Every new field is optional when read, so state saved by earlier versions loads unchanged (FR-018).

## ManagerConfig (shared/manager.ts)

| Field | Type | Default | Rule |
|---|---|---|---|
| `compactAt` | number (tokens) | `240000` | `0` = off; otherwise an integer from 50,000 to 2,000,000. Values outside are refused with "Choose 0 (off) or a number from 50,000 to 2,000,000." |

Read through `DEFAULT_MANAGER_CONFIG`; written by `Manager.configure`, the CLI `manager configure`, and configuration import. Exported with the Manager configuration.

## ThreadState (client/src/main/manager.ts)

| Field | Type | Meaning |
|---|---|---|
| `limit` | `{ until?: number; reset?: true }` | Existing; gains `reset: true` once `until` has passed and nothing has been delivered since. |
| `compaction` | `{ state: 'running' \| 'done' \| 'failed'; at: number; turn: number }` | Last compaction of this thread. `turn` is the thread's completed-turn counter when it started, so a second compaction waits for a later turn (FR-011). |
| `turns` | number | Completed Manager turns in this thread, counted in `#output`. |
| `restore` | `true` | Set when a compaction finishes; the next delivered message is prefixed with the durable record (FR-010), then cleared. |

Transient (not saved): `live.compacting: boolean`, which holds `#dispatch` like `awaitingOutput`. On load, a stored `compaction.state === 'running'` becomes `'failed'`.

### Thread state transitions

```text
idle --turn ends, used >= compactAt, turn > compaction.turn--> compacting
compacting --driver.compact resolves--> idle (compaction done, restore = true)
compacting --driver.compact rejects--> idle (compaction failed; no retry until next turn)

working --turn ends at limit--> limited(until)
limited(until) --until + 5 s--> limited(reset)
limited(reset) --person/channel/schedule message queued, or Retry/Resume--> working (reconciliation prefixed)
limited(reset) --worker update queued--> limited(reset) (update waits)
```

## Message (inbox entry)

Unchanged shape. Grouping (FR-004) sets `state: 'sending'` on every grouped `event` message and completes them together. A grouped turn's text is the grouped lines, latest per worker id, oldest first.

## WorkerEvent line

The JSON line in a worker update:

| Field | Source |
|---|---|
| `observedAt`, `id`, `title`, `root`, `state`, `status`, `summary`, `delivery` | as today |
| `tasks` | `[{ id, status, label }]`; `label` = task description, else command's first line, at most 120 characters |

## Assistant contract (client/src/main/sessions)

| Where | Field | Meaning |
|---|---|---|
| `LlmProvider` (`provider.ts`) | `compacts: boolean` | The assistant can compact a conversation when GeckIt asks. Plugins that omit it: `false`. |
| `Driver` (`heard.ts`) | `compact?(): Promise<void>` | Starts compaction of the held conversation; resolves when it has finished, rejects when refused or failed. Never starts a model turn of its own. |
| `Sessions` (`sessions/index.ts`) | `compactManager(id): Promise<void>` | Manager-only entry; refuses for a non-Manager session, a busy session, or an assistant without `compacts` / `compact`. |
