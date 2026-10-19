# Data model: Manager V1

- **ManagerConfig** derives provider and model from existing SessionMessage/Settings types; enabled flag plus optional user instructions. Instructions define the Manager role on every enabled provider; normal provider permissions remain authoritative. V1 defaults to automatic delegation; an optional approval policy requires a bound decision before starting each worker.
- **ManagerView** exposes config, lifecycle state, actual ChatSession, managed worker ChatSession rows, bounded CLI activity, all enabled providers, pending decisions, a durable queued-message count and actionable error. Private reasoning and credentials are excluded.
- **Manager record** keeps one logical identity/current backing session, managed worker IDs, pending serialized inputs and activity independently of model context. Runtime replacement must preserve ownership and explicitly interrupt active work.
- **ProjectAssistant** stores exact host-qualified root and provider ID. User-approved preference only, no guess from history. Task override -> project preference -> GeckIt configured default; reject a selected disabled or incompatible provider instead of falling through. Existing workers retain provider.
- **CLI activity** has id/time/argument list/state/result, redacted and bounded. It represents confirmed execution outcome, never an invented success.
- **TelegramView** contains connection state, verified bot identity, temporary pairing link/candidate, confirmed private account, actionable detail and pending-late count. No token.
- **Telegram record** stores encrypted credential separately, confirmed sender/chat, update position, uncertain in-flight receipt, late decisions and callback bindings. Pairing expires after ten minutes. Decisions do not expire merely because pairing lifetime elapsed. Disconnect invalidates all callback authority.

Persistent changes must survive a fresh store instance; a failed write cannot produce a success acknowledgement. Duplicate input/decision cannot create a second effect. An uncertain external effect requires reconciliation or explicit user recovery, not blind replay.

## Telegram-only surface correction

The durable Manager, backing session and worker identity remain unchanged. Telegram is the sole user conversation; Desktop exposes Settings configuration/status/recovery. Current/archived backing sessions remain stored but are excluded from ordinary Desktop/phone discovery and chat access. Internal event/Telegram inbox handling remains; no user Desktop message channel is exposed.
