# Manager command contract

`geckit sessions delete --id <full-managed-worker-id>` in authenticated Manager context. CLI arguments are literal, bound to one operation ID. Supports no prefix, title, wildcard or bulk flags. Always requires existing user decision, revalidated at execution.

Success includes `id`, `deleted: true`, `stopped: true`, `queueCleared: true`, `projectFilesKept: true`. Provider false/throw yields a machine-readable `deleted: false` with an explicit notice that work stopped, queued messages were canceled and conversation remains visible. Authentication/invalid target errors perform no deletion. No deletion-success claim from command transport acceptance alone.

Use existing operation ID to reconcile uncertain response. No blind new-operation retry. Existing native provider permissions remain user-controlled.

Runtime shutdown failure errors before provider deletion. A provider-confirmed deletion followed by local notes-save failure errors explicitly that deletion was confirmed and must not be repeated. A favorite-save failure preserves `deleted: true` and adds a settings-specific notice. Provider false/throw retains a visible host record; it does not guarantee rollback of partial provider-side effects.
