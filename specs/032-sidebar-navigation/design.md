# Design: Sidebar navigation

**Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Status**: Approved by Alex on 2026-11-16 (UX document, desktop prototype, then the phone section and phone prototype)

## Scope

US1 through US4, FR-001 through FR-017. Desktop: the Chat window gains a left sidebar; Manager, Team, Shortcuts, Checklists, Browsers, Secrets and Settings become pages, and the computer selector becomes the Computers group; the board's bar and the status bar lose what moved. Phone: the tab bar becomes a left menu with the same places except computers; Search moves into the Tasks bar; Settings gains Channels. Out of scope: the Panel and Voice windows, a conversation's own view.

## Artifacts

- UX document: [docs/ux/sidebar-navigation.md](../../docs/ux/sidebar-navigation.md), including its "Phone" section and "Implementation notes".
- Layout prototype, desktop: [docs/design/sidebar-navigation.html](../../docs/design/sidebar-navigation.html).
- Layout prototype, phone: [docs/design/sidebar-navigation-phone.html](../../docs/design/sidebar-navigation-phone.html).
- Visual vocabulary: the existing tokens in `client/src/renderer/src/styles.css`; phone parts in `chat/PhoneKit.tsx` and `chat/phone-home.css`.

## Decisions

- One level of navigation in four groups ordered by how often each place is used; Settings apart at the bottom (UX section 1, "Shape of the path").
- Browsers and Secrets in Workspace, not Settings, after Alex looked for them in the sidebar twice (UX section 10).
- A place other than Tasks lies over the board, which stays drawn underneath, so returning restores it exactly (FR-003).
- Fold to icons below 884 px: sidebar 200 + list sidebar 264 + narrowest conversation 420 (UX thresholds).
- Phone: a left menu chosen by Alex over a tab bar on 2026-11-16, with the concerns recorded in the UX document; a dot on the Menu button replaces the tab badges.

## Requirement Coverage

| Story / Requirement | Design decision or state | Validation scenario |
| --- | --- | --- |
| US1, FR-001 to FR-006, FR-009 | Sidebar groups, current item, kept place, waiting count, pages | Choose each place; return to Tasks with a draft; reopen the window |
| US2, FR-007, FR-008 | Board bar with board controls only; Settings without the moved sections | Inspect the bar and the Settings section list |
| US3, FR-010, FR-011 | Rail below 884 px, names over the content, kept choice, monograms | Window at 820 and 1180 px; Cmd+Ctrl+S; reopen |
| US4, FR-012 to FR-016 | Left menu, Menu dot, Search in Tasks bar, Channels group, phone Secrets | Phone at 390 x 844 in light and dark; waiting conversation on Settings; channel switch |
| FR-017 | Wording verbatim from the UX document | Compare copy with UX section 7 |

## Review Evidence

- Both prototypes were reviewed in Chrome in light and dark themes; desktop at 1180 and 820 px with the sidebar folded and expanded; phone at 390 x 844 with the menu open and closed and the Menu dot in both states.
- The implemented UI has not yet been reviewed rendered: the dev app is shared with Alex and other sessions. This is required before the feature is called done (quickstart scenarios Q1 to Q6).

## Open Decisions

- Decided by Alex on 2026-11-16: the Computers group holds the GeckIt computers from the board bar's selector; SSH hosts stay in Settings. The desktop prototype still draws hosts in that group and is outdated there.

## Planning Handoff

Preserve the wording, the 884 px fold and the order of the groups. Shared contracts touched: the settings type (two new fields) and the phone's call list (secrets and channel switch). Required validation: unit tests for the pure place logic, and the rendered review in quickstart.md.
