# Design: Team Telegram topic
**Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)
**Status**: Implementation authorized by user; offline browser review complete; live acceptance pending

## Scope
US1 owner setup, US2 shared task/image input, US3 scoped approvals. Desktop settings changes; phone setup stays read-only.
## Artifacts
- [UX contract](../../docs/ux/team-telegram.md)
- Existing layout: [Manager Telegram](../../docs/design/manager-telegram.html). Reuse its form, steps, candidate and error blocks; add native mode/approver fields in the token step.
## Decisions
Follow UX contract. No global controls for team. New generation isolates queue, workers and output on every successful pairing. Membership failure denies approval without denying ordinary tasks.
## Requirement Coverage
US1/FR001-002: token -> command -> candidate -> confirmed, or cancel/expire retaining old connection.
US2/FR003-004,008-012: named member -> durable request -> native queue -> original topic reply; reject wrong scopes before download.
US3/FR005-007: verify actor and exact decision before executing; tools reject foreign resources.
## Review Evidence
Repository performance checklist read. Existing settings rendered once, no per-board-row changes, timers or new animations. Isolated Chromium fixture checked actual component/styles in light/dark at 1280x900 and 390x844: setup, confirmation, Escape, token focus, reverse Tab and no horizontal overflow. Packaged Electron and live Telegram remain unverified.
## Open Decisions
None; user delegated technical choices and requested no questions.
## Planning Handoff
Use native Telegram, Manager inbox and attachment pinning. Shared contract carries optional team metadata; absence preserves private behavior. Test with fake API and provider. No live bot, install or cutover.