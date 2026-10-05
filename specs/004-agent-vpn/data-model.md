# Agent VPN data model

Server profile: stable random id, user-visible name, supported AmneziaWG version label; private native configuration is retained encrypted by main only. Selected id refers to one saved profile or none. There is no active id until real native enforcement and tunnel admission succeed.

Stored document: schema version, saved metadata plus sealed configuration, selected id. Atomic write before emitting changes. Import validates before persisting and preserves prior data on any error. Missing/malformed storage is an error, not an empty overwrite. Removing the selected server clears selection; no automatic failover. Renaming and selection do not decrypt secrets. Cancellation returns current unchanged view.

Configuration view: servers, selected id, runtime capability and unavailable explanation, secure-storage capability. Runtime is unavailable until native qualification; no Connected or enabled state. Result is a discriminated success/current-view or sanitized failure/current-view. Offline validation returns no config or keys.

Required/blocked admission flags are non-secret view metadata. A saved server or unreadable retained encrypted configuration requires VPN; current unavailable runtime blocks dispatch. Removing one selected server while others remain does not release admission. The initial admission policy is closed until encrypted storage has been initialized. These flags describe application dispatch, not verified OS-level network protection.
