# Implementation Plan: Assistant status

**Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

## Summary
Independent enabled-assistant account snapshots drive compact desktop summaries and phone disclosure, with shared full details. Reuse Claude place/account usage and generic quota adapters.

## Technical Context
TypeScript, React 19, existing CSS, Electron and Capacitor. Existing `chat.account(provider)` / `onAccount` bridge, existing five-minute visible refresh and focus events. No new runtime dependencies or settings.

## Constitution Check
Own-plan execution unchanged; shared IPC contract reused; fixtures only; UX and component prototype precede delivery; cross-platform labels and existing theme tokens. No new credential handling. Working tree has unrelated ongoing edits, so branch/commit changes are deferred and feature directory is scoped per command without changing active Spec Kit selection.

## Design Handoff
[Design](design.md), [UX](../../docs/ux/assistant-status.md), [prototype](../../docs/design/assistant-status.md). Preserve FR-001 through FR-007.

## Structure
- `chat/AssistantStatus.tsx`: shared overview, details and account refresh.
- `chat/Status.tsx`: desktop entry, preserve TalkStatus/git helpers.
- `chat/PhoneBoard.tsx`: replace footer prose with phone entry, preserve existing limit alerts.
- `styles.css`: tokens and scoped responsive status rules.
- Renderer preview: real components with fixture data.

## Validation
Node/web typecheck, lint, recorded tests, desktop/mobile builds; full-context light/dark review at 1280 x 720, 390 x 844 and 320 x 568, keyboard and overflow. Performance checklist, no account calls triggered by typing.
