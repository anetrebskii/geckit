# Implementation Plan: Team Telegram topic
## Summary
Extend native Telegram and Manager on main b0786efe69b8c62cc76107c257e9e343e4e3a1e5. No Python adapter or parallel execution queue.
## Technical Context
TypeScript, Node 22+, Electron/React, existing sealed Telegram state, Manager atomic JSON and attachments. No runtime dependencies.
## Design handoff
Read [design.md](design.md), [UX](../../docs/ux/team-telegram.md), existing Telegram prototype. Preserve private mode by optional metadata.
## Constitution Check
Own subscription unchanged; shared IPC types; offline fixtures; UX before code; platform-neutral copy; existing CSS tokens. Existing large telegram.ts is extended for integration only; scope rules extracted into telegram-team.ts.
## Phase 0
Research resolved: durable Telegram update saved before offset; Manager send uses stable identity for deduplication; team thread key includes generation; tools fail closed on non-team resources and global controls. Membership after async waits is revalidated immediately before synchronous authorization callback.
## Phase 1
Types -> parsing/scope -> pairing -> durable intake -> scoped runtime/tools -> UI -> offline tests and docs. See data-model and contracts.
## Validation
npm run typecheck, npm run lint, npm test, npm run build. Fake Telegram checks negative scopes, wrong/expired codes, exact approval binding, asynchronous revocation, receipt loss and restarts. Test provider compares image bytes. Live acceptance and adapter transition remain separate.