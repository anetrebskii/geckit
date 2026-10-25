# Design: Manager task sources
**Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)
**Status**: Implementation requested explicitly by Alex; no additional scope.

## Scope
Desktop Settings > Manager, local intake and existing Telegram decisions. Phone uses existing Telegram interaction. Manual coordination remains unchanged.
## Artifacts
- [UX](../../docs/ux/manager-sources.md)
- [Original layout prototype, superseded by the automatic-connect revision](../../docs/design/manager-sources.html)
- Current interactive design surface: `client/test/browser/manager-sources/`, mounting actual Settings components.
## Decisions
Separate automatic intake from existing setup; source connection first, compact schedule second, durable outcomes in secondary disclosure. Use existing tokens/components. Details, exact copy, states and timing are defined by UX.
## Requirement Coverage
US1 FR001-006 source card/status and baseline; US2 FR007/009 paired decisions and notes; US3 FR003/008/010 schedule form/error states. Validate via offline source/clock fixtures and actual renderer harness.
## Review Evidence
Actual renderer reviewed in full Settings context, light/dark, 1280x900 and 760x700; tab focus, Save/error/retry, long paths, scrolling, expanded help and Enter validation. 35 browser fixture assertions passed. Evidence: `/private/tmp/geckit-intake-evidence/`. Native API boundary only is substituted. Real Voice Memos database access was denied; no private content read.
## Open Decisions
None.
## Planning Handoff
Preserve baseline, code authority, local STT and restricted classifier; no source tools before consent. Durable deterministic outbox and pairing/revision authority are mandatory.
