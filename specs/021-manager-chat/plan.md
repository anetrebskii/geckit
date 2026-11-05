# Implementation Plan: Manager chat in the app

**Branch**: Current main checkout (no delivery requested) | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

## Summary

Expose the existing durable Manager intake through a dedicated app API and turn the current inspection into a shared desktop/phone chat. Telegram becomes optional in setup. Preserve the current Manager, provider, queue, permission checks and workers. The approved [UX](../../docs/ux/manager-chat.md) and [design handoff](design.md) define behavior and entry points.

## Technical Context

**Language/Version**: TypeScript strict, React 19, Node 22+, ESM.
**Primary Dependencies**: Existing Electron IPC, headless core RPC, Capacitor paired-computer bridge, IndexedDB; no new dependencies.
**Storage**: Manager's existing manager.json plus durable compact acceptance receipts; per-device IndexedDB draft/pending-send record.
**Testing**: Vitest backend/public-boundary regression tests, typechecks/lint/build, real renderer preview with synthetic native boundary, GeckIt browser interaction review.
**Target Platform**: Desktop macOS/Windows/Linux and paired phone.
**Project Type**: Existing Electron and Capacitor application.
**Performance Goals**: No transcript render per composer key; memoized Transcript and retained item identities; existing virtualized/offscreen behavior, no polling per message.
**Constraints**: Existing subscriptions, provider availability, VPN and native permissions; no live worker restart. Stable request IDs reconcile accepted sends before retries. Host acceptance never claims provider consumption.
**Scale/Scope**: One configured Manager per host, shared across channels, one text-only composer per active surface.

## Constitution Check

All gates pass before and after design. I: existing provider runtime/subscription kept. II: main owns persistence and checks, dedicated shared ManagerApi, explicit phoneCalls allowlist. III: offline fixtures for state and guards. IV: approved UX and existing app-chat prototype layout, actual renderer review before completion. V: platform-neutral copy. VI: existing product tokens only. No exceptions or new runtime dependencies.

## Project Structure

```text
client/src/shared/manager.ts          # dedicated requests/receipts/answers
client/src/main/manager.ts            # durable intake and current-session guards
client/src/core/application.ts        # service RPC
client/src/main/index.ts              # desktop IPC/native bridge
client/src/preload/index.ts           # app Manager API
client/src/renderer/src/phone.ts      # paired phone Manager forwarding
client/src/renderer/src/chat/Manager*.tsx # shared chat, setup, inspection
client/src/renderer/src/chat/Phone*.tsx   # phone route and Tasks entry
client/src/renderer/src/employees/Team*.tsx # Team Open chat
client/src/renderer/src/styles.css    # token-only chat layout
client/src/renderer/src/manager-preview.tsx # real renderer synthetic boundary
client/test/manager*.test.ts          # state/contract regressions
```

## Execution

1. Complete contracts/research and read-only coverage analysis.
2. Add durable accepted-request receipts, scoped send/decision/native-card API, IPC/RPC/phone bridge and regression tests.
3. Implement shared chat/composer with IndexedDB draft retention and uncertain-send reconciliation, safe cards, existing transcript and scroll behavior.
4. Remove Telegram setup prerequisite and wire Team/desktop/phone entry points.
5. Update real renderer preview, exercise all changed states in both themes and required viewports; fix defects before completion. Native persistence/guards are checked separately through backend tests.
6. Run required checks and desktop/mobile build, record evidence and exact unverified live boundaries, update approved feature documentation and day-plan.

Independent backend and UI work is delegated after research with disjoint file ownership; shared API agreed before edits. No commit, push, release or live runtime restart is requested.
