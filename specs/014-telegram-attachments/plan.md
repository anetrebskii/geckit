# Implementation Plan: Telegram attachments

**Branch**: `feature/telegram-attachments` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Extend the current Bot API transport, Manager durable inbox and authenticated coordination commands. Download only authorized photos/documents into bounded owned storage. Reuse native SessionMessage image payloads; expose real document bytes to local provider file tools and explicitly selected managed workers. Add an authenticated explicit file-send bridge from a managed worker's local project to the paired chat, preserving returned message origins.

## Technical Context

**Language/Version**: Existing strict TypeScript, Node 22+, Electron ESM.
**Primary Dependencies**: Existing fetch/FormData/Blob, Node filesystem/crypto, Manager, Sessions and provider drivers; no new runtime dependency.
**Storage**: Private app-data attachment cache, durable Manager inbox/origin mappings, explicit worker input copies.
**Testing**: Vitest controlled fetch/provider fixtures, byte equality, focused regressions, typecheck/lint/build.
**Target Platform**: Desktop macOS/Windows/Linux; reject unsupported remote transfer explicitly.
**Project Type**: Desktop transport and authenticated CLI extension.
**Performance Goals**: Sequential bounded network IO, no filesystem scan, no idle provider polling or renderer work.
**Constraints**: Paired account/session ownership, actual-byte caps, 24h input retention and total capacity, no secret URLs in diagnostics, no blind replay or implicit upload.
**Scale/Scope**: One bot and paired private account per installation; existing Manager/worker ownership.

## Constitution Check

Own subscription/provider runtime unchanged; no API-key model calls. Main owns network/files; no renderer contract is needed. Tests use fixtures with no live account/network dependency. [Design](design.md) and [UX](ux.md) precede changed behavior; no layout or styling changes. Platform-neutral errors and explicit remote degradation. No runtime dependency added. Existing large Manager/Telegram modules receive narrow integration changes; attachment storage is isolated by responsibility. Required checks before review: typecheck, lint, tests and build; live limits stated separately. No constitutional exception is planned.

## Project Structure

Documentation: spec.md, ux.md, design.md, research.md, data-model.md, contracts/commands.md, quickstart.md, tasks.md and verification.md in this directory.

Source: `client/src/main/telegram-bot.ts`, `telegram.ts`, attachment storage module, `manager.ts`, `manager-operations.ts`, `manager-protocol.ts`, `sessions/index.ts`, `shared/manager.ts`, `cli/manage.ts` and main wiring; tests in `client/test/`.

## Implementation sequence

1. Establish design/contracts and storage representation.
2. Parse/download/store authorized inputs; hand off native images/readable documents through real Manager/Sessions paths.
3. Add explicit attachment-to-worker and deliverable-to-Telegram commands; validate root/session before bytes are read or sent.
4. Exercise negative/lifecycle/uncertain paths, reconcile UX and produce review evidence.

## Complexity Tracking

No new infrastructure, provider API or trust boundary is required. Workers request a selected delivery through Manager rather than receiving a new unauthenticated upload endpoint. Open sharing PR #27 and formatting branch are not prerequisites; integration overlap must be reviewed before any later merge.
