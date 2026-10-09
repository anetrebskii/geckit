# Data model

Reuse Queued/SessionMessage/SessionImage/Driver. Live holds optional injecting queued ID; ChatSession broadcasts optional injection capability and pending queue ID. Persisted Queued messages remain unmodified while pending. Success removes only matching entry and appends accepted user content; failure clears pending and retains entry. Stale request is ignored. No disk schema migration.
