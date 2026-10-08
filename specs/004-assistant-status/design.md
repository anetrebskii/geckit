# Design: Assistant status

**Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)
**Status**: Implemented in the working tree; component fixture visually reviewed on 2026-10-08.

## Scope
Desktop footer and phone Tasks status entry; enabled assistant account/usage information. No composer switching or new provider metadata.

## Artifacts
- [UX document](../../docs/ux/assistant-status.md)
- [Live component prototype handoff](../../docs/design/assistant-status.md)

## Decisions
Own labeled summaries per assistant; compact horizontal desktop footer with persistent Assistants action; one phone disclosure; grouped details reuse GeckIt dialog/sheet and quota rows. Existing host/account usage stays accessible.

## Requirement Coverage
| Requirement | Decision | Validation |
| --- | --- | --- |
| FR-001/002 | Independent summaries and all details | Four assistants with different plans and limits |
| FR-003 | Phone row/sheet | 390 x 844, 320 x 568 |
| FR-004 | Explicit unavailable and login states | Loading, failed, unsigned, absent quotas |
| FR-005 | Claude host/account grouping | Multiple accounts and disconnected host |
| FR-006 | Focus and scroll handling | Light/dark, Tab, Escape, twenty quotas |
| FR-007 | Existing refresh/event protocol | No requests during typing; cleanup on disable |

## Review Evidence
Reviewed actual AssistantStatus, QuotaRows, dialog/sheet and stylesheet in full board fixtures through Chrome: desktop 1280 x 720 and phone 390 x 844, light/dark; narrow phone 320 x 568 with twenty quotas per assistant. Inspected hierarchy, spacing, alignment and adjacent navigation. Narrow quota rows originally clipped names/values; stacked label/reset above meter/value and inspected the corrected result. Scrolled to the last of eighty quotas with the header and Done action retained.

Verified independent values for four assistants, loading, unavailable, sign-in and missing-limit states, enabled-library removal, shared Local/Workstation account grouping, disconnected Devbox with last measurements, and fresh local plan precedence (17%/41% while tmux remains 24%/63%). Tab reaches the scrollable details list, focus stays in the dialog, Escape closes it and restores the opener. Missing limits have one explicit status per account.

Screenshots: [desktop light](../../docs/design/assistant-status-shots/desktop-light.jpg), [desktop dark](../../docs/design/assistant-status-shots/desktop-dark.jpg), [phone light](../../docs/design/assistant-status-shots/phone-light.jpg), [phone details light](../../docs/design/assistant-status-shots/phone-details-light.jpg), [phone details dark](../../docs/design/assistant-status-shots/phone-details-dark.jpg).

Fixture board markup supplies context; it does not validate real account transport, native Electron/iOS behavior or native safe areas. GeckIt was not running. Native-device inspection and passive live-app performance measurement were unavailable.

## Performance Review
Needs measuring: passive live-app input/render timing and unusually large quota lists. No broken checklist items found in static review of the status changes.

| Touched item | Verdict | Evidence |
| --- | --- | --- |
| Objects keep identity | Holds | Enabled providers memoized from chatProviders; snapshot requests do not run on each render |
| Formatter created once | Holds | Module-level measuredTime formatter |
| Typing redraws dependencies only | Holds statically | AssistantStatus memo compares only shown provider, settings fields, hosts and plans; ignores draft/stream |
| Long list avoids unnecessary paint | Needs measuring | Detail list scrolls; eighty-quota fixture visually inspected, no live profiling available |
| Measured in running app | Unavailable | GeckIt was not running; no timing claims |
| Phone rebuilt | Holds | Final mobile production build passed |

Seven other checklist items are untouched: conversation-row memo and callbacks, per-conversation calculations, conversation filtering, pointer selection and two animation items. No new animations or dependencies.

## Open Decisions
None.

## Planning Handoff
Preserve account ownership, host grouping and phone bridge. Implement uses existing React/TypeScript components and tokens, without new dependencies. Source is already dirty from unrelated work; preserve all existing edits. Authorization covers implementation, not commit or deployment.

## Final review correction
The phone assistant-name span changed sibling order; the first quota was briefly hidden by `nth-of-type`. Changed hiding to `.assistant-quota ~ .assistant-quota`, retaining exactly the first quota regardless of name/state spans. Re-inspected final light phone footer and sheet, dark phone sheet, light/dark desktop details, enabled-library changes, and local fresh-plan precedence. Final screenshots: [desktop overview](../../docs/design/assistant-status-desktop-light.jpg), [phone overview](../../docs/design/assistant-status-phone-light.jpg), [phone sheet](../../docs/design/assistant-status-phone-sheet-light.jpg). Horizontal desktop overflow was also reviewed at 800 x 600 with multiple host accounts and persistent Assistants access.

## Requested redesign - 2026-10-08

Authorized by Alex: cross icon instead of Done; improved page design. Reuse GeckIt tokens/components. Compact account sections, clear identity/plan hierarchy, two-column window cards with wide proportional meters, quiet CLI/installation/measurement footer. Desktop width around 640px; phone sheet respects narrow screens and fixed close control. Do not change status-bar behavior, provider polling or account attribution. Review real component fixtures at 1280 x 720, 390 x 844 and 320 x 568 in both themes; keep keyboard/focus and all previous missing/stale states. Revision implemented and reviewed; evidence below.


## Redesign verification

Reviewed rendered AssistantStatus in full desktop board and phone Tasks fixture context, using GeckIt styles. Desktop 1280 x 800 and phone 390 x 844 in light/dark; phone 320 x 568 with paired percentage cards and full-width long/count cards. Cross stays fixed while desktop eighty-quota list scrolls; metadata wraps and long names remain readable. Checked independent plans, grouped Local/Workstation and disconnected Devbox, unavailable and missing-limit desktop states, and phone sign-in instructions. Keyboard Tab cycles from close control to scroll region and back; Escape closes and restores opener. No visible Done dismissal remains.

Screenshots: [desktop light](../../docs/design/assistant-panel-desktop-light.jpg), [desktop dark](../../docs/design/assistant-panel-desktop-dark.jpg), [phone light](../../docs/design/assistant-panel-phone-light.jpg), [phone dark](../../docs/design/assistant-panel-phone-dark.jpg). Values are fixtures.

Typecheck and targeted lint passed; account/usage/plan tests 12/12 passed; desktop and mobile production builds passed. Mobile retains the existing large-chunk warning. Static performance review found no new broken checklist items: polling, memoization and module formatter unchanged; no new animation or dependency. Existing live-app timing/native Electron and iPhone verification limitations still apply. The earlier full-suite failures in unrelated dirty backend/provider work were not re-run for this layout-only revision.


## Density correction

Alex's screenshot showed one quota occupying half the row, with an unused column. Desktop width reduced from 640px to 520px. Single and final odd quota cards now span both columns; header, sections and cards use tighter spacing. Reviewed full-context desktop 1280 x 800 and phone 390 x 844 / 320 x 568, both themes, single and paired windows, keyboard/Escape and long-list scrolling. Close remains fixed and labels remain readable. [Desktop](../../docs/design/assistant-panel-compact-desktop.jpg), [phone](../../docs/design/assistant-panel-compact-phone.jpg). Added single-quotas fixture to reproduce the screenshot's layout.

Typecheck, targeted lint and desktop/mobile production builds pass. Performance review: spacing-only production CSS changes do not touch memoization, polling, formatters or animations; phone rebuilt. Live profiling and native verification limits remain as above.


## Main integration validation

Prepared an isolated checkout from feature/live-library-updates, excluding unrelated uncommitted provider/settings work and preserving the original index. Included existing committed provider-library prerequisites. Exact push tree passes typecheck, full source/test lint, all 683 tests (60 files), and desktop/mobile production builds. Full tests required local socket access; sandbox-only run was stopped after EPERM.
