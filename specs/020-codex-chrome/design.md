# Design handoff

Approved scope: Alex explicitly requested built-in access for all GeckIt users on 2026-11-03. Implementation may proceed.

UX: [Codex Chrome access](../../docs/ux/codex-chrome.md). No renderer layout changes; an HTML prototype is not applicable. Chrome owns its native connection prompt. Existing conversation transcript carries tool results and setup guidance. No new app labels, focus behavior, scrolling, theme tokens or viewport behavior are introduced; renderer light/dark visual review is not applicable to this backend integration. Native Chrome permission and real tab reading still require live validation.

US1/FR-003/004: use only requested URL and explicit pageId, preserve foreground and profile. US2/FR-001/002/005: tools appear automatically in normal Codex threads, never text corrections. US3/FR-004/006: report setup/consent errors accurately; do not claim initialization is successful access. No unresolved design decisions.
