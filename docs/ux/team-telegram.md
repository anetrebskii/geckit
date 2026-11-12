# Team Telegram topic

Settings > Channels > Telegram adds a Mode selector: Private account (default), Team topic. The token form warns: “People in this topic can assign work on this computer using its access.” Choosing Team topic shows “Approver IDs” (comma separated, empty by default) and “Allow approvals from all verified group members” (off).

Continue verifies the bot and shows “Send this one-time command in the topic”, the exact addressed command, expiry and Cancel. It never changes bot privacy. Help explains: use addressed commands or replies to this bot; standalone messages may not arrive with privacy enabled. Commands are scoped to the group, while GeckIt filters the topic.

A candidate shows bot username, group title and ID, topic ID and command sender name/ID. “Connect topic” is the owner confirmation; Cancel leaves the previous connection intact. Code expires after ten minutes, is single use, and is forgotten after restart. A new connection always has a new generation and a new team thread, even for the same topic.

Named humans may submit work in the selected topic. Anonymous senders, sender_chat and bots are silently ignored before downloads. Other places stay silent. “Queue full (100 requests). Wait for work to finish, then send again.” rejects new work without dropping accepted work. Status/help continue when history is unavailable. Source deletion never changes the destination.

Approvals require current group membership checked with Telegram, an allowed actor, current exact callback message and choice, and unchanged connection/history/decision after the asynchronous check. If membership cannot be verified: “Cannot verify group membership. Ask the owner to answer in GeckIt or give the bot administrator rights.” Bot administrator rights are optional for task submission. Duplicate and stale buttons use existing unavailable wording. The bounded audit stores actor, decision and selected choice.

Any member can ask to cancel a worker belonging to this shared team thread, including another member's work. Global Manager pause/resume, clearing Manager history, changing channels and personal work are owner-only from GeckIt. Team tool calls enforce these restrictions, independently of model instructions. Team /links is unavailable: personal shared links never leak into the topic.

One supported image per message is accepted as photo or image document, with or without caption. Albums say “Send images one at a time.” Unsupported bytes/formats, unsupported image providers, size and cache exhaustion are explicit errors. The image reaches native model input; a local path alone is insufficient.

Connected, Manager paused, queued, waiting for approval, delivery uncertain, bot access lost and receiver conflict use existing state/status surfaces. Work status edits one existing topic message. Unknown delivery is never blindly retried. No webhook deletion or contest with another receiver.

Keyboard follows existing form order. Token receives focus on entry; Escape cancels setup and returns focus to the opener or connection entry. Labels are native form labels. Long group names wrap and the containing settings scrolls; narrow windows use existing stacked form layout. Light/dark use existing styles/tokens. Desktop manages connection; paired phone remains read-only for setup.

Limits: 100 pending requests, 16384 input characters, 20 MiB downloads, 256 files/200 MiB cache, 24h expiry for inactive unpinned files; 2048 reply links, 256 callback choices, 128 open question messages, 512 audit records. Full active storage rejects new files, never evicts pinned input. Missing old links/buttons request fresh instructions. Uncertain upload identities are bounded by refusing new uploads at capacity, never forgetting an unknown outcome.

Offline UI evidence: the actual component/styles in `client/test/browser/team-telegram` passed setup, candidate confirmation, Escape cancellation, token focus and reverse-Tab navigation at 1280x900 and 390x844 in light/dark, without page errors or horizontal overflow. This is browser fixture evidence, not packaged Electron or live Telegram acceptance. Static performance review: settings only, no row rendering, new polling, animations or frame loops. See [transition and limits](team-telegram-transition.md).

Team replies are saved with completion before delivery. The durable outbox holds at most 256 queued or uncertain replies; at capacity new team work is refused until history is cleared. A crash before sending preserves a queued reply. A crash during sending marks its outcome uncertain and never automatically repeats it; other queued replies continue. A saved reply survives replacement of the Manager backing session only through its exact delivery identity within the same thread and connection generation. Worker ownership and request provenance are persisted before provider execution, including approved operations.
