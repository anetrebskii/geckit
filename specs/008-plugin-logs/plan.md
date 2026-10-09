# Implementation Plan: Plugin logs

**Branch**: Current checkout with concurrent work preserved | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Add an optional scoped logging context to library factories. Host writes ordered, sanitized, bounded per-plugin JSONL and distinguishes host limits requests from backend checks. Instrument Claude tmux and both maintained independent examples and their external repositories.

## Technical Context

Language: TypeScript and ESM JavaScript on Node 22+/Electron. Dependencies: Node filesystem, existing reporting redaction, existing test/build tooling. Storage: userData/provider-logs, current and one rotated file per normalized plugin. Testing: Vitest host tests, node:test fake tmux/Codex/OpenCode transports. Platforms: Windows/macOS/Linux host; tmux remains macOS/Linux. No renderer or mobile contract changes. Log writes are queued/nonblocking; records bounded; no new dependencies.

## Constitution Check

Subscription environments unchanged. Main process owns local storage. Recorded/fake backends avoid paid/live tests. UX is documented before implementation in [design.md](design.md) and [plugin logs](../../docs/ux/plugin-logs.md). No UI layout/token changes. Full host checks and desktop/mobile builds are required. No remote installation. Existing checkout used under the user's session instructions; no branch switching/commit/push during concurrent work.

## Project Structure

- client/src/main/sessions/plugin-logs.ts: logger/types/writer.
- client/src/main/sessions/plugin-api.ts: public type exports.
- client/src/main/sessions/plugins.ts: factory context and host load/limits events.
- client/test/plugin-logs.test.ts and plugins.test.ts: writer and compatibility tests.
- examples/codex-provider/src/provider.mjs: backend limits and session outcomes.
- examples/opencode-provider/src/{provider,transport,driver}.mjs: cached windows, server/request/turn outcomes.
- geckit-claude-tmux/src/provider.mjs: actual usage checks/skips and submitted messages.
- docs/provider-plugins.md and generated provider instructions: public logging contract and access.

## Research and Contracts

See [research.md](research.md), [data-model.md](data-model.md), [contracts/logging.md](contracts/logging.md), [quickstart.md](quickstart.md). Keep API v1 and optional factory argument. Logger path follows app userData, not immutable snapshot directory. Backup suffix is .1. No raw request data, content, credentials or backend response bodies.

## Dependencies and Execution

Host API implementation and plugin instrumentation follow agreed contract and design. Each plugin build precedes its tests. Update external source repositories only after staged artifacts pass; never edit installed immutable running copies. Finish documentation, feature list/audit and broad checks after host integration.
