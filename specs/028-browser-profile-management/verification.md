# Verification: Browser profile management

Status: implemented in the working tree. Codex session `01a1cfc9-730a-79f2-9338-01d850ff59a9`, shared `main` checkout, 2026-11-12. Unrelated working-tree changes preserved. No active-service restart, commit, push or deployment.

## Acceptance checks

| Surface | Result and evidence |
| --- | --- |
| Web Browser navigation/hierarchy | Actual Settings renderer shows Web Browser in navigation and title, Browser profiles first and browser connection setup below. Existing internal section keys remain compatible. |
| Creation | Checked labelled form, initial name focus, invalid name and duplicate refusal, disabled submit, required note, retained inputs after injected failure, retry, pending guard against repeated Enter, created row and focus on Open browser. Cancel and Escape restore New profile without closing Settings. Native creation was simulated. |
| Open and row errors | Checked separate name/note/status, injected startup failure, visible row error and successful fixture retry. Native handler now propagates unsuccessful startup results. Real Chrome startup through the new handler was not checked. |
| Live sign-in | Synthetic live view rendered; initial focus lands on Done, Escape closes only the live view and restores Sign in focus. Escape from the remote keyboard target reaches the fixture input receiver and leaves live view open. Injected start failure shows the real reason and Try again. No account or login endpoint was contacted. |
| Delete | Keyboard Cancel/Escape preserves the row and restores Delete focus. Injected deletion failure retains the row and error; confirmed fixture retry removes only the selected row. Real account profile deletion was not performed. |
| Disabled connection | Profiles remain visible, creation and deletion remain available, Open browser and Sign in are disabled with the explanatory hint. |
| Layout/access | Visually inspected full Settings context in light at 1440x1000, dark at 760x900 and both themes at 560x800. Checked disclosed form, empty state, long names/notes, keyboard focus and 12-profile scrolling. At 560px, document width was 560px and dialog width 524px with no horizontal overflow. Connection actions wrap cleanly after fixing their overlap. Footer remains accessible while the settings content scrolls. |
| Export/import | Real temporary-file tests preserve a 190KB multi-chunk binary file, bookmarks, empty files/directories and the account note across separate stores. Checked private output permissions, legacy profiles without notes, cache omission, output collisions and failed-output cleanup. |
| Lifecycle and isolation | Tests cover live host, starting launch record, singleton indications including dangling symlinks, lifecycle lock, existing destination and metadata collisions, concurrent creation/import and rollback. Unrelated profile data is preserved. |
| Archive validation | Tests reject invalid records/metadata, traversal and reserved paths, duplicates/conflicts, malformed base64, truncation, wrong totals, missing/end-followed-by-data records, symlinks and unsupported source entries. Import stages privately and publishes only after validation. |
| Public commands | CLI help exposes export/import, explicit new-name restore, manual transfer, executing-computer paths, sensitive data and authentication limits. Focused command tests cover exact syntax and truthful success/failure; the built CLI help was inspected. |

## Repository checks

- Typecheck passed after the final product changes.
- Full source/test lint passed after the final product changes.
- Focused archive, browser routing and remote profile suites passed: 50 tests.
- Desktop and mobile builds passed after the final product changes. Mobile emitted the existing non-blocking chunk-size warning.
- Full suite passed with `npm test -- --no-file-parallelism`: 142 files passed, 2 skipped; 1,891 tests passed, 2 skipped. Parallel runs exposed a shared service-output collision between `headless-service.test.ts` and `core-application.test.ts`; both invoke a build into `out/service`, while one copies that directory. The observed failures were a disappearing native-dependency file and a service exiting during startup. The core application test also passed alone. No test source was changed to hide these failures.
- Focused harness TypeScript and ESLint checks passed after making its property descriptors configurable for hot reload; product files were unchanged by that fix.
- `git diff --check` passed.

## Performance review

Reviewed affected paths against `docs/performance.md`. Profile rows are memoized with primitive identity/status props and stable callbacks. The list uses content visibility with an intrinsic row estimate. Input edits do not introduce per-row derived work; no new polling loop, animation, startup work or dependency was added. Existing Settings refresh polling is retained. Archive work runs only on explicit commands and streams bounded chunks and records with entry/byte limits. Actual long-list scrolling and narrow layout were reviewed; no production CPU or memory benchmark was performed.

## Boundaries

The browser harness mounts the actual Settings renderer, components, CSS and handlers, replacing native calls with a synthetic boundary and recorded receipts. These checks establish renderer interactions and presentation, not real Chrome launch, native live-view streaming, login, account persistence or paired-machine behavior. Archive tests perform real filesystem operations on synthetic browser files in temporary stores, never real account cookies or passwords. Cross-machine authentication and OS credential portability are not tested and are not promised. Manual transfer of an archive is supported; a destination may require sign-in again.

The installed active service was not restarted to load the native handler changes. The working-tree implementation and builds are distinct from the running copy and any released version. The canonical feature-list expansion was proposed to Alex separately and remains unchanged unless approved.

## Visual evidence and cleanup

Reviewed screenshots are retained locally: `/private/tmp/geckit-profiles-ui-light.png` (desktop), `/private/tmp/geckit-profiles-ui-dark-narrow.png`, `/private/tmp/geckit-profiles-form-dark-narrow.png`, `/private/tmp/geckit-profiles-long-dark-560.png`, `/private/tmp/geckit-profiles-connection-narrow-fixed.png`, `/private/tmp/geckit-profiles-empty-dark.png`, `/private/tmp/geckit-profiles-form-light-560.png` and `/private/tmp/geckit-profiles-live-light.png` (synthetic live view). The UX state diagram is `/private/tmp/geckit-profile-flow.png`.

Only owned prototype and renderer tabs were reset and closed, and their temporary localhost servers were stopped. The shared project test browser and unrelated tabs were preserved. No real account profile was exported, imported, opened or deleted for these checks. No branch or temporary worktree was created.
