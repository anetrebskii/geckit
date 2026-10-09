# Implementation Plan: Send queued messages now

**Branch**: `feat/send-queued-now` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary
Add an optional acknowledged injection method to the live Driver contract. Session coordinator submits selected queued entry atomically and retains it on failure. Built-in Codex uses turn/steer; Claude writes next-priority stream input without interruption. Updated tmux library uses the native terminal queue's immediate-processing action.

## Technical Context
TypeScript 5.9 / Node 22, Electron 38, React 19; existing IPC and phone link. Persisted notes hold queued messages, transient pending delivery stays in Live. Vitest and fake transport Node tests. macOS/Windows/Linux desktop, iPhone bridge; tmux remains local macOS/Linux. No runtime dependencies or new polling. One in-flight delivery per conversation.

## Constitution Check
Own subscription and existing scrubbing preserved. Contract flows through shared api, preload and phoneCalls. Tests are deterministic with fake CLIs. UX exists before pixels. Platform-neutral wording and existing tokens. Checks pass before and after design. No new architectural layer; existing large coordinator modified at responsible queue boundary.

## Project Structure
- client/src/main/sessions/{heard,codex-protocol,codex,claude,index}.ts: capability, transports, atomic delivery.
- client/src/shared/api.ts, preload/index.ts, main/index.ts, renderer/src/phone.ts: IPC contract.
- renderer/src/chat/{useChat,Composer}.tsx: existing queue action and focus/pending behavior.
- client/test/{sessions,codex,plugins}.test.ts and Claude fake-stream tests.
- examples/codex-provider: copied runtime export and independent library tests.
- External repository: /private/tmp/geckit-claude-tmux-steer.

## Design Handoff
Read [design.md](design.md), [UX](../../docs/ux/send-queued-now.md) and [queue layout](../../docs/design/conversation-queue.html). Review actual queue component, both themes at 1440x900 and 390x844, including disabled actions, failure, focus and scrolling. No new queue scheduling delay. No stop/restart fallback or provider setting changes.

## Validation
Targeted transport and coordinator race tests, legacy library tests, typecheck/lint/full tests, desktop/mobile builds, independent Codex example build/test and isolated tmux tests. Record live-account limits; do not consume account for routine checks.

## Complexity Tracking
No exceptions.
