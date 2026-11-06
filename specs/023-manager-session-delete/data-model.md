# Data model

No new persistent schema. Reuse ChatSession ID/root/provider, SessionNote queue and Manager owner/thread/followers, Settings favorites and Manager operation/decision journal. Target must match a managed, non-Manager, non-question worker in a currently registered project. Deleting guard is runtime-only. Tombstone/audit records remain after transcript removal to prevent rediscovery/replay.
