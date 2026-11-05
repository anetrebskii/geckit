# Data model

- Manager: reuse ManagerConfig/ManagerView/ChatSession; no second coordinator or new board card.
- App request: stable id, text and expected current Manager session (omitted only before first creation); source is app. Reject empty/over-100000 text, mismatched session and same id with different text.
- Receipt: id, owning session and accepted disposition. Persist compact identity/text digest separately from trimmed inbox; accepted id remains reconcilable after completed work and restart. Queue status is host state, never model acknowledgement.
- Pending requests: derived from the Manager inbox, with text and state; render accepted pending input once, retain it through blocked dispatch.
- Decision: current Manager session plus existing decision id and exact choice; resolve only current pending identity. Native cards additionally bind card identity/fingerprint and use existing answer value shape.
- Draft: per device IndexedDB unsent text and optional uncertain request identity. Clear text only after durable host acceptance; retain across close/restart. Read accepted receipt before resending uncertain input. Reconnect never silently sends a new draft.

State transitions follow [UX](../../docs/ux/manager-chat.md); no TTL-based duplicate acceptance or new work scheduler.
