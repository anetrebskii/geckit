# Telegram reply context verification - 2026-10-20

Working tree: `/private/tmp/geckit-telegram-replies`, branch `feature/telegram-reply-context`, baseline `fe8f5c8`. Parent session: `01a158e6-d099-7e71-85cc-ecb71de2c98c`. Implementation worker configured as GPT-6.1-Sol; no separate runtime model identifier was queried.

## Implemented behavior

Actual successful Telegram sends retain message ID, paired chat ID, exact sent text chunk, originating Manager session and causal managed-worker candidates in existing encrypted local storage. Keep the latest 2,048 mapped chunks. Ordinary Manager output and acknowledgements with a known origin are mapped. Setup, status, errors and operational output without reliable origin deliberately use explicit fallback. Open decisions retain their separate existing decision identity and answer path; retired decision replies cannot become ordinary instructions.

Worker state events carry structured worker IDs through the durable Manager inbox into the response emitted for that exact turn. Successful `sessions` CLI results with a validated managed `--id` carry that target. Mixed event turns retain all candidates. Worker IDs are never inferred from model text, quoted Telegram text or arbitrary CLI result prose. Fresh ordinary instructions have no inferred task. No direct worker send, manual-session attachment or permission acceptance is introduced.

Known replies carry saved message identity/text and candidate workers to the current Manager as explicitly untrusted quoted context. Manager refreshes its owned sessions and rejects origins it does not own or tasks it no longer manages. Connection authority is checked before/after refresh and after asynchronous session open; ownership is rechecked after open. Archived owned Manager origins remain context for the current coordinator rather than being resumed.

Unknown/unmapped/ambiguous IDs, explicit wrong bot author, wrong chat, external replies and quote-only references do not dispatch. Telegram custom quote text cannot replace the original saved text. Other senders/chats are ignored. Ordinary commands and the existing ten-minute late-message confirmation remain; delayed replies retain their saved context through confirmation and reload. Message deletion is not detected by the Bot API: if Telegram still supplies a known ID, its retained mapping can provide context. Missing/inaccessible references use fallback; deleted/unowned task origins fail ownership checks.

## Observable harness checks

`client/test/telegram.test.ts` exercises the production Bot API parser, polling ingestion, pairing, sealed-state persistence and ManagerTelegram dispatch. The combined routing test connects production `Manager.onResponse -> notify` and `ManagerTelegram.reply -> Manager.reply`, backed by real `Sessions` with injected provider drivers:

- Complete first and second managed workers, produce distinct Manager responses, then reply to the earlier first report.
- Reload both Manager's actual `manager.json` and Telegram's sealed file from temporary disk before ingestion. In-memory NotesStore and Sessions remain; this is adapter reload persistence proof, not a complete process or provider restart.
- Feed the real same-chat bot reply shape and inspect both the durable Manager inbox and actual Manager driver input. Both contain the original first worker, saved report and message ID; concurrent second worker receives no follow-up.
- Preserve each split-message chunk and all mixed-task candidates. Duplicate persisted identities trigger explicit fallback.
- Unknown ID, foreign sender/chat/bot, explicit nonbot author, external and quote-only references never submit. A forged custom quote on a known valid ID uses the saved original.
- Delayed reply confirmation retains origin across sealed-state reload; stale ordinary `/resume` remains held. Ordinary text/commands still dispatch. Retired native decisions cannot enter generic reply routing.

`client/test/manager.test.ts` establishes two actual worker-event turns and their corresponding response origins, multiple-candidate preservation, original-task context in Manager input, rejection of manual/detached workers and foreign Manager sessions, and authority revocation during refresh/open. Existing native-approval tests continue to exercise exact current requests, ownership, VPN/native guard refusals, stale requests and native remembering; the combined reply fixture alone does not establish native permission approval behavior.

## Commands and outcomes

Run from `client/` unless specified:

| Check | Result |
|---|---|
| `npm test -- test/telegram.test.ts` | 30 tests passed |
| `npm test -- test/telegram.test.ts test/manager.test.ts -t 'reply\|provenance\|native\|decision\|delayed'` | 15 passed, 54 skipped before final split/ambiguity test; final full run covers that addition |
| `npm run typecheck` | Passed node and web TypeScript configurations |
| `rtk proxy npm run lint` / `rtk proxy npm --prefix client run lint` from repository root | Passed actual `eslint src test`; proxy used after unusable condensed output incorrectly named `dev-bundle.js` |
| `npm test` | Final run: 1,104 tests passed across 81 files |
| `npm run build` | Passed Electron main, preload and renderer production builds |
| `git diff --check` | Passed |
| Cached Mermaid CLI with isolated headless Chrome | Rendered [reply states](evidence/telegram-reply-states.svg) successfully |

Initial focused test run had existing Unix socket `EPERM` under sandbox. Initial full run had 1 settings file-watcher timeout (1,102 passed / 1 failed); sandboxed isolated rerun exposed `EMFILE: watch`. Authorized unsandboxed isolated settings run passed all 16; authorized final full run passed all 1,104. No unrelated code was changed to conceal environment failures.

Mermaid's cached default browser version was absent, then sandbox prevented installed Chrome launch. Rendering passed with explicitly configured installed Chrome in an isolated headless process outside sandbox. No running user browser/session was controlled.

## Boundaries and handoff

Telegram transport and provider drivers are fixtures. Temporary on-disk Manager/Telegram persistence is real; OS credential-store encryption is represented by the existing test vault. No live Telegram account/message, actual provider work, native Mail/app access, production account restart or installed GeckIt restart was performed. No renderer UI was changed, so desktop/phone visual review and phone build are outside this backend-only change. No commit, merge, push, deployment or release was performed.

The independent localhost/file-sharing worker owns `/Users/alex/Projects/mine/geckit-telegram-links`. Likely overlap: `client/src/main/index.ts`, `client/src/main/telegram.ts`, `client/test/telegram.test.ts`, `docs/ux/manager-telegram.md`, and potentially feature/audit documents. This branch changes `shared/manager.ts`, not `shared/telegram.ts`. Integrate manually after reviewing both diffs: preserve response origin arguments, successful-send mapping, connection authorization and decision precedence when combining the other worker's richer media/output logic. Neither worktree was merged or controlled here.

## Current checkout integration - 2026-10-20

After Alex's follow-up "Implement it", the isolated reply patch was applied to `/Users/alex/Projects/mine/geckit`, branch `feature/011-manager-telegram`. Current targeted files matched the original baseline before application; unrelated VPN verification edits and untracked marketing files were preserved. The localhost/file-sharing worker's separate committed branch was not merged or modified.

In the current checkout, `npm test -- test/telegram.test.ts` passed all 30 tests, `npm run typecheck` passed both configurations, and `npm run build` passed main, preload and renderers. The earlier full-suite result applies to the identical isolated implementation; the full suite was not repeated for this patch application. No installed app or active conversation was restarted. The current checkout contains the implementation and built output; loading the backend into an already running app still requires its normal next launch. No live Telegram message, commit, branch merge, push or deployment occurred. Both task worktrees remain available for review.
