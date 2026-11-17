# Design: Shortcut result destinations

**Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Status**: UX approved by Alex in the original Discord thread, relayed in this session on 2026-11-15; UI implementation authorized

## Scope

US1-US3, FR-001 through FR-012. Existing desktop ShortcutList and phone ShortcutSheet gain a dependent result destination group; lists show the saved place and delivery problems. Settings > Channels remains the connection entry point. No real channel or schedule is modified by development.

## Artifacts

- UX document: [canonical behavior](../../docs/ux/shortcut-destinations.md).
- Layout prototype: reuse the real-component [shortcut browser fixture](../../client/test/browser/shortcut-employees/README.md) as the interactive prototype after UX approval; it mounts actual desktop and phone editors with app CSS. No separately drawn editor.
- Existing visual vocabulary: ShortcutList/PhoneShortcuts and application styles; existing Picker, shortcut-setting, shortcut-next and check controls.

## Decisions

Keep the editor's current hierarchy. Send result follows target/assistant settings; Destination appears only for an enabled supported transport. Default is Only in GeckIt. The transport describes native semantics; unsupported modules cannot promise threads. Per-run state and errors remain separate from execution success. See UX for exact wording and transitions.

## Requirement Coverage

| Story / Requirement | Design decision | Validation scenario |
|---|---|---|
| US1, FR-001/002/007/009 | Dependent result controls, explicit local default | Save/reopen/cancel; legacy and unsupported host |
| US2, FR-003/004/005/006 | One source/Manager/native route per run | Two completions and authorized replies |
| US3, FR-008/010/011/012 | Honest error/uncertainty and verification boundary | Deleted destination, refusal, restart, cleaned text, browser review |

## Review Evidence

UX state diagram rendered to /private/tmp/geckit-shortcut-destinations.svg with local Mermaid CLI on 2026-11-15. Actual Shortcuts and Team components reviewed at desktop 1280x900 and phone 390x844 in light/dark, with editor/list/loading/empty/error/long labels, keyboard/focus, scroll, save/reopen/cancel and native refusal. Concrete keyboard Picker and wrapping defects were fixed and rechecked. See [verification report](../../docs/reports/shortcut-destinations.md) for the state matrix, screenshots and performance review. No live delivery evidence is claimed.

## Open Decisions

UX approval is recorded in the canonical document. No unresolved transport facts: Discord supports native threads; Slack supports root/reply threads; Telegram module is a paired-chat/topic route without a fresh per-run thread contract, so is unavailable for this feature until supported.

## Planning Handoff

Backend changes may proceed independently of prototype approval. Preserve stable destination IDs, immutable per-run snapshots, real completion instead of acknowledgment, durable receipts and conservative uncertainty. Reuse the current ownership and Manager reply contracts. UI implementation uses the approved UX and existing real-component prototype. No runtime restart or live post is authorized by this handoff.
