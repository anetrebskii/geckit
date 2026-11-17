# Implementation Plan: Shortcut result destinations

**Branch**: `feat/shortcut-destinations` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Optional saved destination plus durable per-run lifecycle. Channel modules own native destination semantics and publication; core owns run snapshots, genuine completion, receipt/uncertainty and scoped Manager continuation. Preserve legacy execution. UI follows [design.md](design.md) and [UX](../../docs/ux/shortcut-destinations.md); Alex explicitly approved that UX in the original Discord thread; the approval was relayed in this session on 2026-11-15.

## Technical Context

TypeScript/React/Electron/Node 22+, existing channel modules, Manager, Sessions, settings store, authenticated RPC and Vitest. No new runtime dependencies. Persist run records in the selected service data folder using existing atomic-write patterns. Desktop/phone reuse existing controls/tokens. Event-driven reconciliation avoids a new polling timer or transcript reads on every render. Scope is existing shortcuts of both targets plus optional channel hooks; no provider/runtime restart or real schedules changed.

## Constitution Check

Own provider and secrets rules retained. Single shared API propagates through all clients. Offline controlled tests precede any live evidence. UX is documented before behavior changes; UI/prototype follows the recorded approval. Platform-neutral wording and existing CSS tokens. Work is on task branch and lands through repository PR workflow after checks; do not merge or deploy. Existing unrelated iOS and .vitest changes are preserved. Backend and actual renderer gates have evidence in docs/reports/shortcut-destinations.md. The full-suite baseline exception is documented below.

## Project Structure

Shared destination/run types under client/src/shared. Service orchestration under client/src/main/shortcut-runs.ts and shortcuts.ts, runtime wiring in client/src/core/runtime.ts. Manager ownership/binding in manager.ts. Optional channel hooks and Discord/Slack adapters under client/src/main/channels. UI in existing desktop/phone shortcut editors and fixture. Contract propagation in shared/api.ts, core/application.ts, preload and service/native allowlists. CLI in core/product-shortcuts.ts, main/employees.ts and existing schema/help. Tests under client/test. Documentation in this directory and docs/reports/shortcut-destinations.md.

## Execution

Foundation: define optional types and channel publisher contract. US1: persist/validate/readback and CLI/schema, then UI after gate. US2: durable admission/completion, isolated Manager contexts, scoped native binding and Discord/Slack routes with real-module tests. US3: refusal/uncertainty/restart/legacy evidence, renderer review and full checks. Channel adapters and lifecycle can proceed in parallel once the shared contract is fixed. Final audit covers all FR/SC, mock/live boundaries and authorized delivery.

## Complexity Tracking

No new service or dependency. The durable run record is necessary because lastSession cannot retain separate executions and uncertain delivery. The scoped Manager binding is necessary because creating a fresh thread after completion discards the source context.


The constitution requires a passing full test suite before a PR. The unchanged base a0fc967d already fails recurrence.test.ts:76 with the identical finite-endpoint cache assertion (65 < 13). This task does not change recurrence behavior or that test. If the final suite retains only that reproduced baseline failure, delivery will be a draft PR with the failing gate explicitly disclosed, rather than a claim that the complete suite passed or that the branch is merge-ready. This exception preserves the unrelated code and still makes the completed feature reviewable; it does not authorize merge or release.
