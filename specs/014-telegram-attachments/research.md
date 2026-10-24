# Research decisions

- **Retrieval**: `llmdex catalog` inspected; no GeckIt index present. Current checkout and exact source reads used without auto-indexing.
- **Baseline**: fresh origin/main `18c580d`, includes reply-context `0538ffb`; PR #27 still OPEN at `f0b7b7d`. Shared source checkout has pending Telegram edits and is untouched.
- **Provider handoff**: reuse existing SessionMessage images, Claude image blocks and Codex image inputs; generic documents must be real readable local files, not Telegram IDs. Readable paths are useful only on the same host; worker handoff places actual bytes beneath its validated local root.
- **Explicit upload**: Manager selects a session/path through authenticated operation. Worker reports its intended path and asks Manager to deliver; prose links never upload automatically. Alternative direct worker socket endpoint rejected because it adds a new session authentication surface.
- **Limits**: current [Telegram file contract](https://core.telegram.org/bots/api#sending-files) checked 2026-10-20. Cloud download cap, multipart photo/document ceilings and caption constraints govern transport. App cache additionally needs both lifetime and capacity limits; no unbounded automatic archival.
- **Albums**: process independent updates, preserving group identity. Atomic batching rejected because partial update arrival/outages must not silently strand content; no atomic-album claim.
- **Verification**: controlled local boundaries first. No live private material, token or unsolicited paired-chat message is permitted. A live optional test must use prepared harmless fixtures and separate user authorization.
