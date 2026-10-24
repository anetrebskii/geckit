# Design: Telegram attachments

**Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)
**Status**: Implementation authorized by task request; manual review pending

## Scope

US1-US3 extend the existing paired private Telegram chat and Manager command surface. No desktop/phone component, stylesheet, focus order or layout changes are needed. Telegram owns photo/document layout and native composer interactions.

## Artifacts

- UX document: [ux.md](ux.md), linked from [Manager Telegram UX](../../docs/ux/manager-telegram.md).
- Layout prototype: not applicable; existing Telegram UI is used without restyling.

## Decisions

Native image content, real readable file bytes, explicit handoff into managed local worker roots, deliberate result selection and no automatic upload of prose links. Existing paired-account, reply-origin, native approval, delayed-input and uncertain-delivery rules remain authoritative. See UX for states, transitions, limits and wording. Generic remote file transfer is rejected explicitly.

## Requirement Coverage

| Story / Requirement | Design decision | Validation |
|---|---|---|
| US1 / FR-001–003 | Existing picker, native content and file handoff | Photo/document fixtures through provider input |
| US2 / FR-004–005 | Exact session and relative deliverable path | Multipart byte equality, ownership/path rejection |
| US3 / FR-006–008 | Bounded retention and fail/uncertain recovery | Restart/cap/cleanup/permission fixtures |
| FR-009–010 | Controlled evidence and isolated worktree | Verification report and integration overlap |

## Review Evidence

No GeckIt renderer changes planned, so light/dark/viewport/focus/scrolling review is not applicable to this extension. Telegram client appearance and live account behavior remain unverified. Mermaid transitions rendered successfully with headless Chrome: [states.svg](evidence/states.svg).

## Open Decisions

None blocking implementation. Retention and exact failure wording must be reconciled with final implementation before review.

## Planning Handoff

Preserve real supported provider content channels, revalidate account/session ownership after awaits, never use a remote path locally, bound downloads by observed bytes, keep tokens out of errors/context, persist outgoing message origins and throw failed uploads to the coordinating operation. Tests must substitute network/provider boundaries explicitly and never send live Telegram messages.
