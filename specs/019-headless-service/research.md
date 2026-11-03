# Research

## Decisions
- Use Node entry: Electron hidden windows still depend on desktop runtime; unsuitable for a VM without graphical session.
- Extract platform paths and injected integrations: session/Manager/employee classes already own execution logic; avoid rewriting them.
- Independent GUI client: desktop connects to the service through typed authenticated RPC; the service alone composes shared factories and execution state.
- Acquire per-data-directory ownership before store initialization/socket cleanup. Existing Electron lock does not protect Node.
- Operator protocol is separate from `start` and Manager's authenticated commands. Preserve proposals and prevent assistant tools from bypassing user approval.
- Stop scheduler explicitly; current powerMonitor hook/timer has no disposer.
- Provider authentication remains the service account's own subscription; no copied personal tokens or implicit key fallback.

Read-only research delegated as required by speckit-plan; runtime paths, guide imports, plugin logs, stale socket ownership, approval and disposal boundaries reviewed.

- Persistent RPC preserves bytes/events, bounds frames/authentication and rejects pending calls on disconnect without replay. Reconnect refreshes snapshots; initial desktop launch alone can spawn a missing owner.
- Node vault uses an OS-wrapped key or explicit deployment secret; desktop decrypts legacy ciphertext only for authenticated resealing. No plaintext fallback.
- Update installation waits for idle service shutdown and endpoint release. Plain desktop quit leaves service tasks alive.
