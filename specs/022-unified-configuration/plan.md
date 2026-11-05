# Implementation Plan: Unified configuration

**Branch**: Original shared main; UI follow-up `feat/configuration-transfer-ui` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

## Summary

One versioned settings.json groups preferences, employees and Manager configuration. A shared synchronous store preserves sibling sections and performs atomic writes. Device/work state remains in local-state.json, sessions.json and the Manager runtime record; vault storage stays unchanged.

## Technical Context

TypeScript 5.9, Node 22+, existing Electron/service filesystem APIs. No dependencies. Local JSON storage; vitest temporary filesystem fixtures. macOS/Windows/Linux. One service owns mutations; no parallel writer support is claimed. Avoid rewriting configuration for Manager queue updates. Existing Settings IPC/phone shape stays unchanged. Types derive from Settings, Employee and ManagerConfig. [Design](design.md), [data model](data-model.md), [contract](contracts/configuration.md), [research](research.md), [validation](quickstart.md).

## Constitution Check

Credentials remain in vault/local pairing storage. No provider backend changes. Main/service owns persistence. Tests use filesystem fixtures without live model calls. No renderer behavior/layout changes, so prototype and theme review are inapplicable as documented in design.md. Cross-platform paths use Node APIs. No styling or dependency changes. Checks pass before and after design; no exceptions required.

## Project Structure

- client/src/shared/configuration.ts: section schema derived from domain types.
- client/src/core/configuration.ts: migration/read/write boundary.
- client/src/main/{store,employees,manager,local-data,session-migration}.ts: existing owners and adapters.
- client/src/cli/index.ts: standalone read-only configuration access.
- client/test/configuration.test.ts: filesystem migration/transfer/failure checks.
- docs/configuration.md: file, sections, copying and rollback instructions.

## Complexity Tracking

No constitution violations. Keep existing contracts and service lifecycle; do not restart the active app or deploy.

## Configuration UI follow-up

Use a validated portable JSON boundary and service-owned pending import. Desktop will choose and confirm the file, request import over authenticated RPC, wait for the old service to release ownership, then relaunch. The owned startup applies the replacement before constructing any runtime owner, retaining local state and private backups. Do not hot-reload a subset of configuration owners. Block active turns, approvals, background work and queued messages, but not unread completed conversations. Prototype/renderer/native dialogs await the UX review.
