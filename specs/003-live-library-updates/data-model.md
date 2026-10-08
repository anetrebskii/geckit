# Data Model

No persisted schema change. Existing `Settings.providerUpdatesReady` remains the source of ready IDs. `Live` gains a pinned provider implementation and an optional pending implementation for sessions waiting to finish their current turn. The loaded provider map points to the active version for new sessions.
