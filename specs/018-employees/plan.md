# Implementation Plan: Employees and assigned-session memory

**Branch**: `feat/employees` | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

## Summary

A main-owned employee catalog and durable session assignment connect a named role to source conversation history. Existing global GeckIt instructions teach read-only employee lookup; role/history are never appended to task messages. Manager chooses an employee through validated CLI operations. Existing React settings, menus, board, list, header and phone surfaces gain assignment/filter/inspection controls.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node 22+, Electron 38, ESM.
**Primary Dependencies**: existing Electron/React/Vite; no new runtime dependency. Bundled generated DiceBear Avataaars SVG portraits with source/license record.
**Storage**: atomic main-owned `employees.json`; SessionNote.employeeId and persisted source root for assignment; shared Settings.employeeFilter (`''`, `unassigned`, employee ID).
**Testing**: Vitest recorded/fixture-based logic, temporary-file catalog/guide/session integration, CLI transport, typecheck/lint/build, mobile build; actual renderer through browser when available.
**Target Platform**: macOS, Windows, Linux desktop and existing paired Capacitor phone; remote history uses available provider/host copies with explicit partial state.
**Project Type**: Electron desktop plus shared mobile renderer.
**Performance Goals**: memoized filtered lists, one catalog subscription per app hook, stable employee object/map lookup per row, bounded 20k-character memory pages and at most ten sources per page.
**Constraints**: no task-message injection, no provider/permissions changes, no fetching avatars at runtime, no source app overwrite of installed provider guides, no history reads that activate or mark a session read.
**Scale/Scope**: existing board scale (~800 sessions); catalog small, source history potentially larger than model context, traversed by explicit cursor including long individual messages.

## Constitution Check

All six principles preserved: subscription/env behavior untouched; one typed shared main/renderer/preload/phone contract; pure/fixture tests and temporary native file checks; approved UX and interactive prototype precede implementation, browser review limitation documented; platform-neutral copy; existing app tokens for chrome. New portrait artwork retains artwork colors. No new runtime dependency or remote install. No governance exception required. Checks required before PR remain mandatory; no PR or release requested.

## Design Handoff

- [design.md](design.md), [UX](../../docs/ux/employees.md), [prototype](../../docs/design/employees.html).
- Alex approved 2026-11-01: "делай". Desktop/phone assignment and filters share state. Catalog editing desktop only. Archive preserves IDs/history. Current assignment determines memory; hidden and archived sources remain readable without changing their state.
- Browser host is unavailable through both supported Chrome and in-app browser; do not claim visual acceptance. Complete independent checks; retain the exact unverified UI states in verification.md.

## Project Structure

- `client/src/shared/employees.ts`: catalog/draft/view/memory/CLI and API contracts; existing api.ts derives assignment fields.
- `client/src/main/employees.ts`: atomic catalog validation/save/archive/restore and guide-sync state.
- `client/src/main/sessions/index.ts`: persisted assignment before dispatch and non-activating provider history enumeration.
- `client/src/main/guide.ts`, `client/src/main/index.ts`, `client/src/preload/index.ts`: guide integration, IPC and phone transport.
- `client/src/cli/`: worker read-only employee catalog/current assignment/memory access.
- `client/src/main/manager-operations.ts`, `manager-protocol.ts`: advertised validated commands and employee delegation.
- `client/src/renderer/src/employees/`, `ui/EmployeesSettings.tsx`: shared catalog hook, settings, avatar/selection/filter/inspection; existing board/header/phone wiring.
- `client/test/`: pure and temporary native fixture tests; renderer harness retained for later CUA review.
- `specs/018-employees/`: research, data model, contracts, quickstart, tasks, verification and evidence.

## Delivery and Validation

Implement catalog/contracts, then assignment, memory/guides, UI filter/inspection and Manager routing; run focused tests as components land, then full typecheck/lint/test/desktop build/mobile build. Inspect generated instructions in isolated temporary provider configs; preserve user content and source isolation. Use a real CLI/native integration against isolated data, distinguish fixture provider history from actual live model use. Check each acceptance criterion and record unavailable provider/browser/phone/SSH boundaries. No commit, deployment or worktree cleanup is implied by implementation.

## Complexity Tracking

No constitution violations. Paging memory by source/message/character offsets is required to retain access to huge source messages without unbounded model context. Revision checking prevents stale form overwrite; atomic write failures surface rather than reporting false success.
