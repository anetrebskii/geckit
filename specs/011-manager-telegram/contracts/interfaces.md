# Interfaces: Manager V1

The implementation's authoritative compile-time definitions are `client/src/shared/manager.ts` and `client/src/shared/telegram.ts`. New types compose existing session/provider/settings types.

## Renderer/native and phone

- Desktop Manager view/configure/pause/resume/retry/restart and change subscription support Settings only. No public Manager open/send/answer API remains. Ordinary chat reads/sends and discovery exclude current/archived backing sessions; internal Telegram coordination retains normal provider runtime and durable inbox handling.
- Telegram view/action and change subscription support desktop setup. Credential connect/confirm/cancel/disconnect stay desktop-only. Phone has no Manager conversation or settings destination.
- Lifecycle errors reject or return a blocked state; renderers never show an optimistic completed result after native failure.

## CLI

Manager discovers supported commands and registered projects/providers through GeckIt CLI. Mutations retain manager identity/authority and existing permissions. Start resolves and passes an explicit enabled compatible provider. CLI execution uses a fixed executable, an argv array and no shell. JSON argument protocol is validated before execution; unknown commands/arguments and credential operations are rejected. Shell metacharacters inside legitimate argument values remain literal data and are never evaluated. File operations are confined to requested registered projects and cannot escape through traversal/symlinks. Unsupported domains/remote operations return explicit limitations.

Every enabled builtin/library provider can run the Manager session through its existing create/hold/send contract. Manager instructions accompany every turn in a marked prefix to the normal provider message, so older libraries do not need to implement an optional context input. Only that exact internal prefix is removed when provider history returns to the visible conversation. Provider-native tools, MCP, authentication and permissions retain normal provider behavior; no universal sandbox is claimed. Host routes validated structured requests to CLI and feeds outcomes to the same session, sending natural-language replies through Telegram and retaining CLI activity internally. An assistant change replaces only the backing session after UI confirmation and preserves logical ownership, pending input and decisions.

## Telegram

HTTPS Bot API getMe verifies bot before connection, getUpdates longpoll has one local receiver, no automatic webhook deletion. Temporary private deep link pairs only after exact candidate confirmation on desktop. Every inbound message/callback rechecks account and private chat. Telegram and internal events submit to one serialized manager inbox; stale incoming work gets Run now/Discard. Supported native requests expose opaque, exact-current-request-bound actions for the paired user. GeckIt dispatches the same native answer/remember semantics through existing guards; the manager model/CLI has no approval authority. Current/changed/resolved requests, ownership, enabled providers and account authorization are revalidated. Unsupported typed/URL forms remain in ordinary worker UI. Native request callbacks are not fabricated from durable history after restart.

Delivery records distinguish received/queued/completed/failed/uncertain. A timeout is not a success. No token, credential URL or raw network error may enter model context, transcript, UI or ordinary settings.

Outgoing text removes blank transport edges and empty chunks while preserving paragraph/code meaning. Personal-bot setup is guided locally; a future shared bot needs hosted authenticated account-to-computer routing, not a shared client token.

## Desktop inspection amendment - 2026-10-19

A dedicated desktop-only current Manager inspection snapshot/event surface may expose actual redacted session items and current backing identity. It is separate from ordinary session discovery/read/send and from the phone RPC allowlist. Opening inspection has no runtime start/send/answer effect. Reject archived/stale identities; reset to the replacement session when current identity changes. No mutating transcript action is available in inspection. Telegram permission callbacks continue using the existing authenticated live-request authority.
