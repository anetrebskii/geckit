# Data model

Reuse Settings, SessionMessage, ChatSession, SessionItem, RequestChoice, TeamChoice, CardAnswer and ManagerConfig. No second persisted task model. Service status reports pid, directory and working session IDs. Ownership metadata records pid plus process identity and is removed only by its owner. Socket permissions and private data directory restrict local clients; operator CLI rejects agent identity variables. Processes with the same OS user and credential-file access remain trusted; this is not a sandbox.

CoreMethods and CoreEvents reuse domain method parameters/results. ServiceSnapshot carries authoritative sessions, settings, employees, Manager/Telegram/host state and native bootstrap metadata. Native settings adapters cache snapshots without writing core files. Vault envelopes and a key fingerprint protect saved secrets; legacy ciphertext backups remain encrypted.
