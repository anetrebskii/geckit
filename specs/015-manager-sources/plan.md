# Implementation Plan: Manager task sources
**Branch**: feat/manager-source-intake | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

## Summary
Opt-in scheduled local discovery, stable persistent intake, restricted AI classification and paired Telegram authority. Existing Manager send/delegation owns only confirmed tasks.

## Technical Context
TypeScript strict, Electron/React, existing IPC and Telegram opaque decisions, Node filesystem/crypto/child_process and macOS sqlite3/afconvert plus installed Whisper. Atomic JSON state and deterministic Markdown notes in GeckIt userData. Vitest offline integration, browser actual renderer with native boundary fixtures. macOS adapter only; clear unsupported status elsewhere. One non-overlapping periodic scan, no per-row polling or unbounded UI list. No new package, account or credentials.

## Constitution Check
PASS: main owns files/settings/processes; renderer calls existing Manager configure; local subscriptions only, no API key; UX and prototype precede implementation. Sources private data never grants tool authority. Tests cover pure logic/recorded interfaces, checks before PR. Changes stay on task branch and no live restart.

## Project Structure
shared/manager-intake.ts contracts; main/manager-intake.ts persistence/scheduler; main/voice-memos.ts safe adapter; existing manager/index integration; renderer chat/ManagerSources.tsx in existing Settings; test source/schedule/lifecycle fixtures. Documents in this feature directory and linked design/UX.

## Implementation Order
Contracts + regression fixtures, then source/scheduler/persistence, restricted classifier and decision bridge, renderer settings, integrated verification, PR and safe cleanup. Backend and renderer may proceed independently after shared contract; parent owns documentation and integration review.

## Complexity
No new service or SDK. Generic cursor contract only, not speculative Linear implementation. Stable baseline and outbox required for crash safety.
