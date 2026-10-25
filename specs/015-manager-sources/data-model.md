# Data model
Configuration: enabled, IANA timezone, weekly windows (days 0..6, HH:mm start/end), sources stable ID/kind/enabled/directory.
Source checkpoint: fingerprint, baseline UUID set and creation cutoff, opaque cursor, status.
Item: source ID + source item UUID + revision identity, title/created time, state, summary/suggestion, pairing fingerprint, error and attempts.
States: waiting-sync -> transcribing -> classifying -> awaiting-user -> claiming -> claimed/note/ignored; failures recover only through safe bounded paths. New revision supersedes pending authority. Terminal item cannot claim twice.
Task outbox: deterministic Manager inbox ID, persisted approval before enqueue, retry same ID after crash. Note: deterministic Markdown filename in userData/manager-notes, outcome records actual path.
