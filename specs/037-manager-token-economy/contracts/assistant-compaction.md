# Contract: assistant compaction

Applies to the built-in assistants and to provider plugins (`docs/provider-plugins.md`, `client/src/main/sessions/plugin-api.ts`).

## Declaration

```ts
interface LlmProvider {
  // existing capabilities ...
  readonly compacts: boolean
}
```

- `true`: a held conversation's driver implements `compact()`.
- `false` or absent (older plugins): GeckIt never asks this assistant to compact.

## Operation

```ts
interface Driver {
  // existing methods ...
  compact?(): Promise<void>
}
```

- Called only while the conversation is idle (no turn running, no question pending).
- Summarises the conversation in place and keeps the same conversation id; GeckIt keeps addressing it by that id.
- Resolves after compaction has finished and the conversation is idle again. Rejects with a short reason when the assistant refused or failed; the conversation stays usable.
- Emits no `begun`/`ended` turn signals of its own and does not send a model message on GeckIt's behalf beyond what compaction itself needs.
- Afterwards, the next turn's `spend.used` reports the smaller context.

## Built-in implementations

| Assistant | `compacts` | `compact()` |
|---|---|---|
| Claude Code (stream) | `true` | Writes the stream-json user message `/compact`; resolves at the `result` line that follows the `compact_boundary` system line; rejects on an error `result`. |
| Codex | `true` | `thread/compact/start { threadId }`; resolves when the thread reports idle again; rejects on an RPC error. |

## Plugin documentation change

`docs/provider-plugins.md`:

- Capabilities row: add `compacts`.
- New subsection "Compaction": the rules above, and that a library that does not implement it keeps working unchanged.
