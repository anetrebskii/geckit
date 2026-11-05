# Design: Manager chat in the app

**Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)
**Status**: Implemented locally; renderer review partially complete, with the remaining browser tooling limitation in [verification.md](verification.md)

## Scope

Text chat with the existing Manager on desktop and the paired phone, common history and decisions with Telegram, and first setup without Telegram. No new app attachments or independent phone runtime.

## Artifacts

- UX document: [docs/ux/manager-chat.md](../../docs/ux/manager-chat.md)
- Layout prototype: [existing Manager desktop/phone layout](../../docs/design/manager-telegram.html), whose original app chat layout is reused; implemented prototype is the real renderer mounted by `client/src/renderer/manager-preview.html` with explicit synthetic native boundaries.
- State diagram: [message-states.svg](evidence/message-states.svg)

## Decisions

- Extend Manager inspection into a chat; retain Team as the setup and lifecycle surface.
- Make Telegram an optional channel rather than an enablement prerequisite.
- Reuse the configured Manager, durable ordered inbox and current host-bound decisions.
- Show host acceptance separately from queueing, model consumption and completion; reconcile uncertain sends before retrying.
- Keep draft text on close and restart. Preserve current provider, VPN and permission boundaries.
- Phone uses the paired computer, with a Tasks entry and Team > Manager action.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-001–003 | Entry points and optional Telegram | Configure and chat without a bot |
| US2, FR-004–006 | Common Manager, attributed messages, valid decision cards | Continue a Telegram request in app; answer once across channels |
| FR-007–008 | Paused/off/blocked states and acceptance reconciliation | Failed send retains text; uncertain retry never duplicates |
| FR-009–010 | Composer, keyboard, focus, scroll, retained draft | Close/reopen/restart, IME, multiline input and long transcript |
| FR-011 | Existing Telegram and shortcut compatibility | Existing channel and schedule regression paths |
| US3, FR-012 | Paired-computer Manager | Phone send, disconnect and reconnect |

## Review Evidence

Actual desktop and phone components were reviewed and exercised with synthetic native boundaries in light/dark. Setup without Telegram, text send, receipt reconciliation, decisions, drafts and phone navigation were checked. [Verification](verification.md) distinguishes those checks from real persistence/guard tests and lists the remaining browser and live integration limits. Full-screen evidence is linked there; the older Telegram-only prototype is historical.

## Open Decisions

None. Alex authorized the documented desktop and phone scope by saying "Реализуй". No new approval gate applies.

## Planning Handoff

Proceed through the repository's design → plan → tasks → analyze → implement workflow under the existing implementation authorization. Read this document and its linked UX. Do not use the older Telegram-only design as authority for app entry points.

Inspect ManagerApi, service/desktop IPC and phone allowlists before exposing sends and answers. Use the existing Manager inbox rather than routing around its checks through ordinary chat send. Review stable request identity and accepted-message reconciliation, draft persistence, renderer event attribution, native approval forms and cross-channel invalidation. Existing sessions must not be restarted to apply this feature during development.

Required verification after implementation: offline regression fixtures; typecheck/lint/tests and desktop/mobile builds; actual desktop/phone renderer interactions in light/dark at SC-005 sizes, focus/IME/scrolling/keyboard checks and performance review. Record fixture boundaries separately from real provider, Telegram and physical phone verification. Keep docs/features.md unchanged until implementation exists; the user's explicit feature request authorizes its eventual feature entry, not a claim that this proposal already works.
