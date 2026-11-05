# Research

- Decision: one shared synchronous section store, read before every mutation. Rationale: Settings, Employees and Manager run in the same service event loop and must not overwrite sibling changes. Alternative: independent caches of the whole document would lose updates.
- Decision: retain flat Settings API, deriving section types from `Settings`, `Employee` and `ManagerConfig`. Rationale: desktop, phone and providers need no changes.
- Decision: atomic rename plus preserved legacy originals. Rationale: migration and write failure must not destroy working setup.
- Decision: separate local state and existing vault. Rationale: configuration transfer must not clone device pairing or queued work.
- No new dependencies or live provider research required. Personal library index read; no entry matches configuration storage.
