# History mutation contract

User-facing host request selects exact thread + observed backing session + action clear/delete. It cannot answer native permissions. Stale identity fails; cleanup failure cannot report success. Durable reset fence precedes shutdown/provider purge. Success means selected Manager history and prior native contexts cannot be reused; global configuration and worker conversations are retained. Clear retains selected binding; external delete removes old incarnation and next inbound creates fresh empty identity after persisted cutoff. Retry operates on retained cleanup metadata, never resumes removed history.


Host entrypoint is `manager:history`, exposed as `ManagerApi.history` through desktop IPC/preload and phone host transport. A read-only remote client cannot call it. Request identity is exact; stale session/revision fails before selected history mutation. It is a user-initiated UI action with a named destructive confirmation and does not answer native permission cards.

Telegram raw inbound timestamps have one-second resolution; a never-observed same-second input may be accepted as new input after reset, with fresh context. Earlier raw events and cached references are rejected. This does not erase messages stored by Telegram/Slack servers.
