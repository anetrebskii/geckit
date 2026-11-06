# Compact task toolbar

Implemented in the working tree on `feat/simple-remote-control`. No commit, deployment or application/service restart was performed for this change.

- One Filters icon replaces the desktop folder picker, employee picker and separate column-options button. Its menu shows current selections; a dot marks a restriction.
- Existing folder and employee pickers retain search and selection behavior. Clear filters resets folders/employees while retaining the chosen board columns. Cmd/Ctrl+K opens folders directly.
- This computer is a 28 px display icon, with its name in the tooltip and accessible label. Remote computers retain their name and connection-state dot.
- Fixed reduced-motion CSS creating an unintended visibility transition that prevented menu autofocus. Reduced-motion transitions now have zero duration; existing animation completion behavior remains unchanged.

Behavior is specified in [the UX document](../ux/toolbar-filters.md). This refines existing filtering and computer switching; it does not introduce a separate feature-list entry.

## Verification

Used GeckIt's own browser CLI and task-owned localhost tabs. The renderer ran against an isolated real GeckIt service with a recorded fixture provider. Electron-only operations were replaced at the native boundary. Created one fixture employee through Team's actual UI and service. No real provider login, paid model call or remote connection was tested or claimed.

| Interaction | Observed result |
|---|---|
| Select Remote workspace | Two cards narrow to one; filter summary and dot update |
| Add Private project with the existing multiselect control | Both cards appear |
| Clear filters | Both folders and all employees return |
| Select Unassigned | Both unassigned fixture cards remain; selection is indicated |
| Select named employee | Zero cards and the existing explicit no-matches message |
| Hide Archived, then clear folder/employee filters | Three columns remain; column-layout preference is retained |
| Restore All columns | Four columns, two cards and no active filter dot |
| Switch Board/List | List menu omits Visible columns; folder/employee filtering remains available |
| Cmd+K DOM keyboard event | Folder picker opens directly with its search field focused |
| Browser ArrowDown and Enter | Filters navigates to Employees and focuses its search input, including reduced motion |
| Browser Escape | Menu closes and focus returns to Filters; submenu focus return checked after a rendered frame |
| Click outside | Menu dismisses without clearing selection |
| Open local computer menu | This computer and saved connections remain selectable; toolbar control remains 28 px even with saved connections |
| Long remote identity fixture, reconnecting | Name truncates, full tooltip and state dot remain; no toolbar overflow at 1000 px |
| Phone employee picker | Existing sheet opens, named employee applies and no-matches state appears |

Reviewed full rendered screens in light/dark themes at desktop 1460x860 and 1000x740, a scrollable menu at 1000x250, and phone 390x844. Checked hierarchy, spacing, focus outline, long names, filter indication, menu scrolling and adjacent New task control. Native macOS title-bar chrome was not exercised in this browser harness.

Concurrent source edits initially reloaded the development page during interactions. Verification continued from a temporary snapshot; all eight affected renderer files matched the final reviewed snapshot. The final light screenshots were captured after the reduced-motion fix. The other screenshots document the earlier visual review of the same controls.

The snapshot's initial Vite allow list blocked Inter font files, so those snapshot screenshots use the system fallback font. The temporary allow list was corrected, but GeckIt Browser stopped responding while awaiting font readiness; a subsequent navigation also remained pending. Commands then returned "The GeckIt Browser bridge did not answer within 70 seconds." A final pass with confirmed Inter loading is unverified. This limitation affects the browser fixture, not the successfully bundled production font assets. Both fixture servers were stopped; the original two review tabs were closed, but cleanup of final font-review tab 6608100016 could not be verified through the unavailable bridge.

Passed four TypeScript targets, ESLint on changed TSX files, `git diff --check`, desktop main/preload/renderer build, and mobile production build. Five focused test files passed, 41 tests total: board columns, employees, employee team/store and remote client. Mobile build retained its existing large-chunk advisory. Full repository suite was not rerun for this toolbar refinement.

The fixture's native account-status request reported a missing isolated CODEX_HOME; account authentication is outside this verification. The live local and remote services were left running unchanged.

## Performance review

No performance problems found in this toolbar change.

| Checklist item | Verdict | Evidence |
|---|---|---|
| Filtering/sorting memoized | Holds | Assigned employee IDs and available employees are memoized; existing picker search keeps its memo |
| Typing redraws only dependent work | Holds | No per-card or per-conversation render changes; menu search state remains local |
| Animation on compositor | Holds | No new animation; reduced-motion transitions are disabled instead of creating layout/visibility transitions |
| Phone rebuilt | Holds | Mobile production bundle rebuilt after final shared CSS change |

Nine other checklist items are untouched by this refinement. No new repeated row rendering or ongoing animation was introduced; no CPU/latency improvement is claimed.

## Reviewed evidence

- [Final toolbar, light](toolbar-filters-evidence/toolbar-final-light.png)
- [Final Filters menu, light](toolbar-filters-evidence/toolbar-final-menu-light.png)
- [Long employee selection](toolbar-filters-evidence/toolbar-menu-long-light.png)
- [Board menu, dark, narrow](toolbar-filters-evidence/toolbar-board-dark-narrow.png)
- [List menu, dark, narrow](toolbar-filters-evidence/toolbar-list-dark-narrow.png)
- [Local computer menu](toolbar-filters-evidence/toolbar-computer-dark.png)
- [Remote identity UI fixture](toolbar-filters-evidence/toolbar-remote-dark-narrow.png)
- [Short-window menu scrolling](toolbar-filters-evidence/toolbar-menu-short-dark.png)
- [Phone sheet, light](toolbar-filters-evidence/toolbar-phone-light.png)
- [Phone selection, dark](toolbar-filters-evidence/toolbar-phone-dark-selected.png)

Codex session: `01a1b0dd-e59c-7c03-a0d3-ba7b47aba10d`.
