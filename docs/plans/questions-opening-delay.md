# Open questions without scanning every conversation

- Request: Clicking a chat in Questions takes several seconds before it opens.
- Checkout: /Users/alex/Projects/mine/geckit, feat/sidebar-navigation, permanent checkout with existing unrelated edits preserved.
- Started: 2026-11-16

## Acceptance conditions

- Click a loaded question or press Enter on its row -> select it and open its conversation immediately without awaiting another full conversation listing.
- Switch between loaded questions while a full listing is pending -> the selected question opens and the other question's content is cleared.
- Receive a newer question snapshot -> opening it uses its latest metadata.
- Navigate to an unknown conversation -> retain the existing list lookup fallback and Manager exclusion.
- Assumption: Preserve the approved split layout, loading skeleton, wording, draft behavior and keyboard behavior.
- Unknown: Live backend transcript-read latency; the unnecessary pre-open listing is independently identifiable in the renderer.
- Follow-up 2026-11-16: Leaving an open question for Tasks must close the question pane, including during history loading and via another place. Returning to Questions starts with the empty pane. Keep the question and its draft; preserve ordinary Tasks conversation navigation.

## Progress

### 1. Prepare the UX document

- [x] Done
- Skill: define-ux-behavior
- Evidence: Existing approved Questions split layout in docs/ux/sidebar-navigation.md; this is a latency regression fix within that flow. Document immediate selection and the existing loading state before editing code; no new design or prototype approval is required by this request.

### 2. Prepare the UI and test it

- [x] Done
- Skill: build-product-ui
- Evidence: Preserved the real Chat, Questions rows and existing skeleton. Reproduced with the full listing held at the synthetic native boundary; before the fix, seven of nine regression checks failed.

### 3. Write the feature code

- [x] Done
- Skill: write-feature-code, write-strict-typescript
- Evidence: useChat.goTo only checked everyoneRef, which explicitly excludes questions. It now checks a current questionsRef first and retains the fallback for unknown IDs. No layout, controls or provider behavior changed.

### 4. Update the related distributed skills

- [x] Done
- Not applicable: No commands, flags, names or agent-facing workflows change.

### 5. Update the feature list

- [x] Done
- Evidence: docs/features.md read. This fixes opening latency without adding a product feature; pending sidebar feature additions belong to their existing task.

### 6. Write unit tests

- [x] Done
- Skill: verify-change
- Evidence: Added test/browser/board-performance/questions-regression.ts at the real renderer boundary; all nine checks pass. Full suite: 156 files passed, five skipped; 2,054 tests passed, 23 skipped. All application typechecks and the fixture typecheck pass. Desktop and mobile production builds pass. ESLint passes on the changed TypeScript files. Repository-wide lint still reports 43 existing errors in five unchanged build scripts: prepare-mac-service-addons.cjs, after-pack.cjs, check-asar-native.cjs, check-service-native.cjs and dev-bundle.js. Socket-based tests passed when rerun with local socket permission after sandbox EPERM failures.

### 7. Test the feature through UI tools

- [x] Done
- Skill: verify-change, geckit-use-browser
- Evidence: Actual renderer in a task-owned GeckIt Camoufox tab, with 800 synthetic tasks and a deliberately delayed list response. After the fix, a real mouse click opened the pane in 86 ms with zero full-list requests. Real Enter selection opened the second question with its own history. Escape restored the empty pane. Before the fix the held listing prevented loaded questions from opening; no comparable live latency measurement is claimed. No provider requests or active app restart.

### 8. Test the final UI

- [x] Done
- Skill: build-product-ui, performance-review
- Evidence: Visually reviewed the full Questions screen at 1440x900 dark and 820x640 light, including open, empty and loading states, selected rows, composer focus, pointer and Enter selection, switching and Escape. No page horizontal overflow. Existing narrow composer clipping is outside this navigation-only fix. The performance change eliminates a full listing; no row props, memoization, formatting or animations changed. Apple design standard applied; no audience type standard matched.

## Result

- Follow-up completed: Chat.tsx's shared page-navigation handler closes a page-owned conversation before clearing its placement. Tasks no longer inherits the open question as a popup; returning to Questions starts empty. Ordinary conversations opened from Tasks remain selected across page visits.
- Follow-up verification: All 13 actual-renderer checks pass with a synthetic native boundary, including navigation during loading and through Shortcuts, and preservation of ordinary Tasks conversations. Real mouse and Enter navigation were checked at 1440x900 dark and 820x640 light; both reached Tasks with no visible conversation or scrim. An unsent question draft survived leaving and reopening. Keyboard focus stayed on Tasks and Tab continued to Manager with visible focus. Full-screen screenshots of open Questions and Tasks in both themes were visually reviewed; no layout changes or page overflow. Application and fixture typechecks, changed-code ESLint, desktop build and mobile build pass. The active desktop app and real backend were not restarted or exercised.
- Follow-up full suite: 156 test files and 2,054 tests passed, five files and 23 tests skipped; no failures. Only the page-navigation guard, regression cases and related documentation changed for this follow-up. Existing unrelated edits were preserved.

- Delivery: Alex subsequently requested direct main integration and push of the complete redesign, including these fixes. The permanent checkout is used; no temporary worktree was created. No active app restart is requested.
- Remaining limitations: Native transcript-read and real account/provider latency remain unmeasured. The browser result uses the actual renderer and a synthetic native boundary, not the running desktop app. No implementation blocker remains.
- Fixture limitation: Its existing native adapter logged unsupported chat:search calls when the switcher mounted; Questions navigation and all nine targeted checks completed successfully. Search integration was not verified.
- Cleanup: Closed the task-owned test tab and stopped its Vite server. User app and unrelated tabs were preserved.
- Session: Codex 01a1e5d2-ed63-7b63-9dee-f2a35a7a336f.
