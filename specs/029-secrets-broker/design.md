# Design: Secrets through a link, used by a broker

**Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)
**Status**: Draft

## Scope

Alex gives a conversation a secret without pasting it, from any device, and the conversation uses it without holding it. Visible surfaces: the secret page (any browser, phone first), the request notice and the "entered" notice in a conversation, Settings > Secrets on desktop. The phone app shows the same Settings section through the existing Chat copy. Not in scope: the web client (GeckIt conversation 45b07e34), approval on the phone, a separate system account.

## Artifacts

- UX document: [docs/ux/secrets.md](../../docs/ux/secrets.md)
- Layout: no separate HTML prototype was made. The page and the Settings section were built from `docs/ux/secrets.md` with the existing tokens and the Browser profiles row pattern, then reviewed rendered. The review screenshots are in `docs/design/secrets/`: the page at 375 px light and dark, 1280 px filled and saved, Already used, Expired, Not valid, the SSH field and a focused lifetime chip; Settings in light and dark with History open, the Remove confirmation and the unavailable state. The Settings fixture is `client/test/browser/secrets`. Offline and 768 px were not captured.

## Decisions

- **No Add button in Settings.** Every secret comes from a request, so it always has a kind, places and a purpose. Adding by hand would create secrets with no places, which the broker would have to refuse.
- **This task is the default lifetime.** Matches Grok Bot's default and keeps secrets from piling up.
- **"Saved" on the page, "ready" in the conversation.** The page can only know the relay has the sealed value; only the computer knows it is stored. Two words for two facts.
- **"Do not forward" on the page rather than shorter links in groups.** GeckIt cannot yet tell reliably whether a channel thread is shared.
- **The page shows the requesting computer's name and the task title** so Alex can tell a real request from a phishing copy; the card is signed by the computer (contracts/relay.md).

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-002 to FR-005 | Page states Ready to Saved | quickstart 1 |
| FR-003 | Fixed title and preview text | quickstart 1 step 2 |
| FR-004, edge cases | Already used, Expired | quickstart 1 step 5 |
| FR-009 | "was entered" notice | quickstart 1 step 4 |
| US4, FR-026, FR-027 | Settings list, History, Remove | quickstart 5 |
| FR-014, FR-023 | Badges Given to a program, Not cleaned from output | Settings with a command secret and a 4-character secret |
| US5 | Settings footer names the store | quickstart 6 |

## Review Evidence

Reviewed on the implementation (see the screenshots above). Fixed in review: the Expired message said to change a secret that was never saved; the history table split host names and dates mid-word; history showed conversation ids instead of titles.

## Open Decisions

- Prototype and its review (above). Blocks the page and Settings implementation tasks, not the broker, CLI or browser masking tasks.

## Planning Handoff

- Keep the page's states and wording exactly as in the UX document.
- The page is a second entry of the existing viewer build; it must not load anything from outside `geckit-signal.web.app`.
- Settings > Secrets is a new section in `client/src/renderer/src/ui/SettingsDialog.tsx`, following `BrowserProfiles.tsx` and `Channels.tsx`, styled only with tokens from `styles.css`.
- Validation: quickstart.md sections 1 to 6.
- Approval: not yet given.
