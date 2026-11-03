# Design: Headless service

**Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)
**Status**: Implementation authorized by Alex's "Сделай это, выдели"; no separate visual design approval claimed.

## Scope
Independent service owns the application core; desktop and CLI are clients. Desktop retains native adapters. Existing renderer layout is preserved.

## Artifacts
- UX: [headless-service](../../docs/ux/headless-service.md)
- Layout prototype: not applicable; no screen/layout changes.

## Decisions
One data owner, foreground service managed by systemd/launchd, local protected socket, explicit operator commands separated from agent proposal commands, provider-native approvals retained. Existing default VPN protection remains in force.

## Requirement Coverage
| Requirement | Design | Validation |
| --- | --- | --- |
| FR-001, FR-002 | Startup/ownership | Display-free child process and duplicate start |
| FR-003, FR-004 | Independent operator calls | Submit, disconnect, inspect result |
| FR-005, FR-006 | Shared service API, bound permissions | Existing tests and denied caller checks |
| FR-007, FR-008 | Shutdown/restart and run guide | Restart persistence and documented commands |

## Review Evidence
CLI subprocess, built Electron/service and real renderer checks are recorded in verification.md. Review existing light/dark states and keyboard/scroll behavior across the new service boundary.

## Open Decisions
None for this extraction.

## Planning Handoff
Preserve unrelated checkout edits; do not restart active GeckIt. All verification uses isolated service data/provider directories. No plaintext credential fallback or API-key substitution.

## Expanded handoff: full extraction
Latest authorization supersedes embedded-desktop scope. Read updated FR-009–014 and UX supplement. One service owns runtime; persistent authenticated local RPC carries typed calls, binary payloads and events. Desktop owns only native capabilities and a read-only authoritative settings/session snapshot. No visual layout is added. Preserve phone call allowlist and its restrictions. Native vault migrates through authenticated desktop adapter; Node service keeps encrypted state. Build and lifecycle verification must include desktop attachment, CLI cross-client visibility, and survival after desktop disconnect.
