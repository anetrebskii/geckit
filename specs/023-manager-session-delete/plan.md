# Implementation Plan: Manager single-session deletion

**Branch**: `feat/manager-session-delete` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Expose `sessions delete --id` through existing ManagerOperations, authenticated CLI dispatch and bound approval. Reuse Sessions.remove and provider delete, correcting unconfirmed deletion visibility and teardown races. Keep capabilities and protocol consistent.

## Technical Context

TypeScript, Node 22+, Electron/React existing app. No new dependency. Storage: existing session notes/settings and Manager operation journal. Tests: Vitest, disposable transcripts and compiled CLI over private socket. Platforms: existing desktop service, SSH/provider deletion contract; no new renderer/platform API. Single exact-ID operation, no scan or background cleanup.

## Constitution Check

PASS before and after design: subscription/native authority unchanged; existing shared contract and host operations reused; deterministic fixtures; UX documented before implementation; platform-neutral copy; no CSS. No exceptions.

## Design Handoff

Read [design.md](design.md) and [UX](../../docs/ux/manager-session-delete.md). No layout/prototype required. Preserve exact target, product decision, stop/cancel, truthful result and files-kept boundaries. Review existing decision rendering only if changed; no new UI controls planned.

## Project Structure

- `client/src/main/manager-operations.ts`: shape/capability, confirmation and deletion receipt/favorites.
- `client/src/main/manager-protocol.ts`: Manager instructions.
- `client/src/main/sessions/index.ts`: existing removal lifecycle, queue and ownership cleanup, race protection.
- `client/test/manager*.test.ts`, `client/test/sessions.test.ts`: contract, approval, failure, concurrency and CLI fixture.
- `docs/ux/manager-session-delete.md`, this feature directory and evidence report.

## Phases

1. Research existing UI removal, provider adapters, Manager binding and cleanup operations.
2. Specify/design/plan/tasks/analyze; no cleanup assumption.
3. Implement deletion and corrected shared teardown with focused tests.
4. Compiled CLI/private host fixture plus typecheck/lint/full test/build; inspect any failures, record evidence, local commit and day-plan.

## Complexity Tracking

No extra abstraction or schema planned. In-flight identity checks and deletion guard are necessary because stopping a runtime awaits asynchronous provider teardown; without them queued sends can resurrect removed work.
