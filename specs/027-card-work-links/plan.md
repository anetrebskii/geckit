# Plan

Read [design](design.md) and [UX](../../docs/ux/card-work-links.md). Existing TypeScript/Electron/React contract, Vitest, no dependencies or network calls.

## Constitution check

Subscription/settings flow unchanged; main owns metadata through shared/api.ts. Pure parsing with offline tests. Existing tokens and platform-neutral words. Branch only, no publication.

## Implementation

1. Canonical parser adds private/hosted GitLab and multiple links. ConversationItems indexes only changed sent messages; stable bounded output avoids board-history scans.
2. Codex list infers work from preview independent of title; Claude uses existing bounded head/tail reads. Session notes retain discovered links. Read replaces the index.
3. Optional workItems with legacy work fallback. Tags renders native buttons; metadata wraps at narrow widths.
4. Test list/send/stream/restore/read/clear. Run typecheck, lint, tests and desktop/phone builds. Chrome review real Tags and compare parsing/rendering under identical fixtures.

No restart of installed GeckIt. Current sessions remain read-only. Browser harness uses synthetic local data.
