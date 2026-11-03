# Implementation Plan: Headless service

**Branch**: `main` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

## Summary
Separate desktop platform paths/integrations from reusable session bootstrap, settings, employees, Manager and scheduler. Build a Node entry and CLI operator client over a private local socket. Desktop forwards typed commands and consumes service snapshots/events.

## Technical Context
TypeScript strict, Node 22+, Vite build, existing Sessions/Manager/Employees classes and JSON stores, vitest recorded provider fixtures. Linux/macOS/Windows local endpoints. One owner per data folder, no new network API. [Design handoff](design.md), [UX](../../docs/ux/headless-service.md).

## Constitution Check
Own subscription and scrubbed environment retained. Existing contracts/types reused. Recorded fixture tests plus real service/CLI processes; no paid turns. UX before implementation; no visual design change. Platform names remain neutral. No credential downgrade. Shared core owns execution; desktop retains GUI integrations.

## Project Structure
`client/src/core/`: platform boundary, common factories, runtime and local transport/lifecycle.
`client/src/service/`: Node entry point.
`client/src/cli/`: operator command client alongside existing CLI.
`client/src/main/index.ts`: desktop service client and native adapter.
`client/service.vite.config.ts`: independent Node build.

## Implementation Phases
1. Platform boundary and shared session/bootstrap factories.
2. Node runtime and single-owner lifecycle.
3. Operator protocol/CLI with caller boundary and native answers.
4. Subprocess verification and desktop regression checks.

## Complexity Tracking
No new framework/database or second scheduling/execution engine. A local socket is reused rather than exposing unauthenticated TCP.

## Full extraction plan
1. Add authenticated typed persistent local RPC with binary framing and disconnect rejection; no mutation replay.
2. Expand core runtime to all existing non-visual workflows, events, named application API and bootstrap snapshot.
3. Replace desktop composition with service bootstrap, IPC proxies, native adapters and authoritative snapshots; keep renderer contract.
4. Include service in ordinary builds; test detached lifecycle, same-directory attach, reconnect and compatible protocol.
5. Verify CLI, native desktop boundary and real renderer interactions using isolated data and fixture provider; document integration limits.

Research: direct synchronous desktop reads are converted to snapshots; async commands retain domain validation. Native secure storage becomes a synchronous Node encryption port backed by an OS-managed wrapping key or explicit deployment secret; no plaintext fallback. Existing encrypted data migrates only after successful decryption and service sealing. Phone WebRTC/capture remains desktop-hosted because it requires browser/native APIs. This is the existing product boundary, not a new headless phone transport.
