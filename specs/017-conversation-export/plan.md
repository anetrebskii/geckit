# Implementation Plan: Conversation export and continuation

**Branch**: `feat/conversation-export` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

Use one provider-neutral Markdown snapshot for export and continuation, reusing main-owned session readers and send scheduling. Build the approved [design](design.md), [UX](../../docs/ux/conversation-export.md) and [interactive prototype](../../docs/design/conversation-export.html).

## Technical Context

Language: TypeScript 5.9 strict, React 19, Node 22+, Electron 38. Existing IPC/preload and phone relay only; no new dependencies. Main app-owned storage keeps snapshots. Existing hostUpload copies export to SSH destination when needed. Vitest recorded provider boundaries plus actual-component browser fixture. Desktop macOS/Windows/Linux and shared phone renderer. Format only on explicit action, not on streaming or per conversation row; no export length limit. No account/inference calls for the overview.

## Constitution Check

Own-plan drivers unchanged. Files/network stay in main behind shared contract and phone allowlist. Pure formatter tested against fixtures; running UI reviewed separately. UX and prototype precede implementation. Platform-neutral labels. Existing design tokens. Work on local branch; no release or deployment. File-size guideline: new modules remain under roughly 400 lines; existing large integration files get narrow additions. All gates pass before and after design.

## Project Structure

- `client/src/shared/conversation-export.ts`: portable snapshot types/formatter; `shared/api.ts`: typed interface.
- `client/src/main/conversation-export.ts`: file persistence, remote-readable reference and continuation prompt.
- `client/src/main/sessions/index.ts`: snapshot from complete provider/live history and source metadata.
- `client/src/main/index.ts`, `preload/index.ts`, `renderer/src/phone.ts`: main/preload/phone contract wiring.
- `client/src/renderer/src/chat/ConversationTransfer.tsx`, `Chat.tsx`, `PhoneNav.tsx`, `styles.css`: one dialog and entry points.
- `client/test/`: formatter/native-boundary regressions; `test/browser/conversation-export/`: real UI fixture.

## Phases

1. Establish snapshot/contract and pure formatting with representative item kinds.
2. Persist real snapshot and invoke existing send for selected provider/model; upload SSH file when required.
3. Wire desktop/phone dialog and errors, focus, pending/cancel.
4. Verify with focused integration tests, real component browser interactions, lint/typecheck/test/build and phone build; update feature evidence.

## Complexity Tracking

None. Existing large integration modules receive narrow wiring; export logic is separate.

## Follow-up: Copy without sending

Reuse existing durable dormant/unborn conversation support to persist a destination with selected provider/model and prepared initial context before any send. Share snapshot/file/prompt preparation with immediate continuation. Keep prepared work outside runnable queues; startup/list/open operations must not start provider inference. Reuse existing composer draft behavior when possible, with a durable main-side context fallback for another renderer/phone or restart. Only explicit user Send goes through normal guards and scheduling. Add focused tests for zero send/start/queue, persistence/reopen, model retention, edited draft first send and source preservation; distinguish prepared context from already-sent transcript. Keep app API/preload/phone in one typed contract.
