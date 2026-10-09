# Implementation Plan: OpenCode Llama

**Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary
Deliver examples/opencode-provider as a standalone ESM library using authenticated loopback OpenCode server HTTP/SSE. Read [design.md](design.md) and [UX](../../docs/ux/opencode-llama.md); existing controls carry all behavior.

## Technical Context
JavaScript ESM, Node 22+, Node builtins and fetch. esbuild is a build-only dependency, matching the independent Codex example. Native OpenCode history owns persistence. Deterministic Node tests use fake fetch streams and a fake CLI. Platforms: desktop macOS/Windows/Linux; existing phone relay. No host contract or renderer changes.

## Constitution Check
Own Claude subscription unaffected; no credentials stored. Main-only provider contract. Offline parser/lifecycle tests without model calls. Existing UX and tokens reused. No runtime dependency. Files split by transport/transcript/driver/provider, each below roughly 400 lines. Native OpenCode protocol is independently implemented, no copied third-party implementation. No PR publication in this task.

## Project Structure
examples/opencode-provider/{geckit-plugin.json,index.mjs,package.json,package-lock.json,build.mjs,README.md,LICENSE,src/{provider,transport,transcript,driver}.mjs,test/}

## Validation
Manifest/namespace, catalog metadata, project-scoped native history, incremental SSE, permissions/questions, stop during startup, repeated idle, transport disconnect, failed prompt and owned cleanup. Build entry and import without side effects. Native inference and visual validation unavailable without OpenCode and model setup; report explicitly.

## Complexity Tracking
OpenCode 2 update: detect v1/v2 from the native startup banner and retain the v1 path. Add a separate v2 adapter for `/api/*`, its authenticated username, paginated snapshots, model/agent selection, session-owned instruction entries, asynchronous prompt admission followed by wait, interrupt, and typed event envelopes. Normalize native content to stable transcript IDs and preserve conversation-scoped grants. Test installed 2.0.25 and pinned 1.18.35 with an isolated local mock model, including history, cards and cancellation. No global data migration or configuration edits. Rollback uses the previous bundle while native stores remain untouched.

Node's test runner is used in the standalone example instead of host vitest, matching the existing example. Pure parser tests exercise recorded protocol data without network. Current feature selection is scoped per script to preserve concurrent work's selector.

## Ollama correction
Use the existing models contract and native OpenCode catalog. Filter by connected provider ID ollama, not model family. Retain namespaced IDs, inert factory, native history and owned transport. Wait for asynchronous v2 Ollama discovery with the existing 15-second budget; configured models that never load fail explicitly. Reuse the existing New task Model picker; remove the cancelled library configuration surface. Validate non-Llama selection/defaults, first discovery, empty catalogs and native OpenCode 1/2 before publishing version 1.2.0.
