# Research: Manager chat

## Durable intake

Decision: reuse Manager.send and the durable inbox; add dedicated app wrappers with stable request identity and durable compact receipts independent of inbox trimming.
Rationale: existing Manager.send already accepts desktop source internally, but generic chat send is deliberately rejected. Permanent identity receipts prevent an uncertain retry after restart from replaying accepted work.
Alternatives: generic chat.send rejected because it bypasses Manager intake; a second Manager rejected because it splits state.

## Answers

Decision: current-session-bound decision answers and native card answers go through existing pending fingerprints, host policy and Sessions answerForManager. Ordinary chat text cannot approve a card.
Rationale: Telegram supports simple choices while app-native typed forms need their established UI. Unsupported requests retain explicit desktop guidance.

## UI and drafts

Decision: shared ManagerChat body inside existing desktop inspection and a phone Page; isolated composer retains draft/pending identity in IndexedDB using readKept/keep.
Rationale: existing Transcript is memoized and already streams; composer isolation avoids long-history work per keystroke. Existing per-device persistence avoids storing renderer settings in localStorage.

## Setup and compatibility

Decision: only the renderer setup required Telegram; backend configure already supports it disconnected. Keep assistant/delegation/enable as three steps, Telegram as optional group.
Rationale: smallest change preserving existing connected accounts and sessions. Existing Telegram notifications remain unchanged; no new app-message cross-posting.

## Acceptance boundary

Decision: initial known paused/blocked states reject app send and preserve draft. Once saved to the host inbox, the message is accepted even if later VPN/provider dispatch blocks. It stays visible in pending requests; receipt does not claim delivery or model consumption.
Rationale: host persistence and runtime delivery are separate boundaries. No eager bypass or second VPN path.

Research was performed by the backend, shared-chat and entrypoint agents against their owned code, with API coordination before implementation. No unresolved technical clarifications remain.
