# Implementation Plan: Manager and Telegram, first version

**Branch**: `feature/011-manager-telegram` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

Implement a usable vertical version of the single Manager conversation: a special Manager session on any enabled builtin or library provider, host-validated requests executed only through GeckIt CLI, workers on enabled compatible providers, persistent project-provider preferences and task ownership, Desktop Settings setup/status and a locally received Telegram bot as the sole conversation. Use existing Sessions/provider adapters and subscription authentication; no separate inference backend.

The full 33-requirement spec remains the product direction. V1 deliberately offers automatic delegation by default, with optional approval for new workers and supports every enabled provider through its normal session adapter, model discovery and authentication. Advanced management commands not implemented in V1 must be discoverable as unsupported, never simulated. Desktop trusted permissions and credentials are preserved. This is a local implementation, not publication or a provider permission certification.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22+, React 19, ESM.
**Primary Dependencies**: Existing Electron 38, electron-vite 5, Node process/fs/net/fetch, Electron safeStorage; no new runtime dependencies.
**Storage**: Existing settings for enabled providers/project preferences; atomic local manager record for lifecycle, current runtime ID, ownership, pending input and activity; separate encrypted Telegram credential and delivery/pairing record.
**Testing**: Vitest with recorded/fake provider and Bot API boundaries, real temporary disk state, compiled CLI execution; browser review of actual renderer/components with explicit native-boundary fixtures.
**Target Platform**: Desktop macOS/Windows/Linux, shared phone renderer. Secure storage absence disables bot connection with an explanation.
**Performance Goals**: No idle model turns, event-based worker notifications, bounded manager history/activity and no full worker transcript mirror. Preserve existing queue budget and memoized board rows.
**Constraints**: Manager instructions require CLI administration and delegated deep work. Provider-native tools retain normal permission behavior. Structured requests use a fixed CLI executable, shell:false, validated argument list and host-side authority checks; prompt instructions are not claimed as a universal sandbox. Tokens never enter model/settings/transcript. External instructions cannot widen permissions.
**Scale/Scope**: One logical manager, one active provider-backed Manager session, all registered projects, one bot/private account.

## Constitution Check

- Own plan: reuse existing builtin and library session adapters; no API key or new inference service. Token uses protected OS encryption.
- Shared contract: typed shared manager/telegram contracts, preload bridge and phone allowlist; main owns processes/network/files.
- Offline tests: provider and Telegram fixtures, no paid inference in test suite. Account/real bot verification reported separately.
- UX before pixels: [design](design.md), [UX](../../docs/ux/manager-telegram.md), [prototype](../../docs/design/manager-telegram.html). User requested implementation on 2026-10-17, authorizing the established direction. V1 restrictions documented before implementation.
- Platform-neutral wording and explicit unsupported hosts/storage/providers.
- Existing GeckIt tokens/components; browser light/dark and desktop/phone review required.
- Branch created in requested checkout; preserve unrelated edits. No commit, PR, merge or release until implementation is reviewable and requested.

Post-contract check: same constraints hold. No constitution amendments or new runtime dependencies.

## Project Structure

- `client/src/shared/manager.ts`, `telegram.ts`: composed shared types.
- `client/src/main/manager*.ts`: lifecycle, durable record, validated CLI gateway.
- `client/src/main/telegram*.ts`: Bot API receiver, protected storage and pairing/delivery state.
- `client/src/main/sessions/`: provider-independent manager instructions using existing drivers, events and queue.
- `client/src/cli/`: discoverable management commands with explicit provider routing.
- `client/src/main/index.ts`, `asked.ts`, `store.ts`, `client/src/preload/index.ts`: native wiring and persistence.
- `client/src/renderer/src/chat/`, `ui/`, `styles.css`: Desktop Manager settings and ordinary shared worker UI.
- `client/test/`: focused manager/routing/restriction/Telegram and renderer tests.

## Implementation Phases

1. Freeze shared contracts and route manager sessions to every enabled provider through existing session drivers; preserve normal unavailable-provider recovery.
2. Add durable Manager and CLI gateway/provider resolution, then integrate existing session lifecycle.
3. Add Desktop Manager setup/status/recovery and Telegram protected receiver in independent modules.
4. Wire typed Settings/native interfaces, event wakeups and Telegram message delivery; hide internal Manager sessions from ordinary Desktop/phone chat.
5. Run focused behavioral tests, required checks, real CLI boundary checks and rendered UI interaction review. Record actual account/bot limitations and V1 gaps explicitly.

## Complexity Tracking

No new dependency or backend. The validated CLI output protocol remains the common application-control path. Alex's enabled-provider correction supersedes the initial Claude-only restriction: Manager is a session role, with instructions and dedicated UX. Existing provider permissions remain authoritative; the host validates structured CLI operations, while role instructions do not guarantee universal tool isolation.

## Telegram-only correction

Follow the latest [UX revision](../../docs/ux/manager-telegram.md#telegram-only-revision---2026-10-17): Telegram is the sole Manager conversation. Desktop retains Settings setup, connection status and lifecycle recovery; remove Desktop/phone chat/navigation and public chat entry APIs. Hide current/archived Manager backing sessions from ordinary discovery/history without changing worker runtime or ordinary session navigation. T028-030 track implementation and verification.

## Telegram native approvals and setup follow-up - 2026-10-19

Follow the [UX amendment](../../docs/ux/manager-telegram.md#telegram-approvals-and-guided-setup---2026-10-19). Sessions exposes only live pending-request snapshots internally; paired-user actions revalidate native identity after asynchronous guards and use existing native answer/grant paths. Manager projects these separately from model/CLI authority; Telegram retains sender/chat checks and delivery uncertainty. Preserve ordinary worker UI and hidden Manager history. Normalize only proven text/chunk whitespace cases. Extend existing Settings with guided personal-bot steps; no hosted shared routing is introduced without a service decision. Backend and renderer owners are disjoint; integrated checks follow both.

## Desktop inspection amendment - 2026-10-19

Add a current-session inspection read/event channel restricted to the desktop Chat renderer. It must use the existing native provider history and Manager redaction boundary, without exposing archived sessions through ordinary APIs or the phone bridge. The singleton bottom-bar control opens a large dialog containing the actual bounded Transcript with explicit read-only behavior. Do not create a second Manager runtime, compose prompts, synthesize native answers or poll history. Existing session events drive updates; current-ID and async-generation checks prevent stale history after replacement/closure. Main tests establish sender/lifecycle/read boundaries; production renderer fixtures establish entry, focus, scrolling, error/empty/replacement and theme behavior separately from installed app verification.
