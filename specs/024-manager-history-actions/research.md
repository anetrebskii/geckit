# Findings

Manager manager.json stores inbox/receipts/operations/decisions plus current/previous backing IDs per thread. Native provider transcript resides in Sessions storage. Existing restart preserves/reinjects durable work and is unsuitable as clear. ManagerChat History is keyed by backing session ID, so context rotation also invalidates old renderer reads.

Slack earlier() imports from seen watermark and startup restores persisted places; reset must advance cutoff/remove deleted place and invalidate queued posts. Telegram reply caches/questions/pending inputs and asynchronous notifications need reset generation. Deterministic channel:key thread IDs cannot safely identify a deleted incarnation; channel delivery must use retained key metadata, not parse identity. Existing Sessions.remove is reused for stop/provider cleanup. Preserve workers while retiring removed owner/follower routing, not deleting worker sessions.

Native operations already completed or remote HTTP accepted cannot be undone. External server history remains; application must not silently import pre-reset messages into new context. Prior worker-delete commit is retained as independent functionality.
