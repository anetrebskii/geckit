# Verification: Plugin logs

2026-10-09. Alex requested publication to main after implementation. Installed libraries have not been edited and the app has not been restarted; deployment status is verified separately from these source checks.

## Host

- `client`: `npm test` passes, 709 tests in 62 files.
- `npm run typecheck` passes node and web TypeScript checks.
- `npm run lint` passes (`eslint src test`), including the logging/API/loader/guide changes. A broader ad hoc scan previously reported two existing errors in the out-of-scope `scripts/dev-bundle.js`; the configured lint command and CI do not scan that directory.
- `client npm run build` and `mobile npm run build` pass. Mobile retains its existing large-chunk warning.
- Host logger and loader tests cover old/new factories, factory/load failures, scoped identity, load correlation, host limits request/outcome distinction, concurrent writes, rotation, malformed fields, secret/content filtering, IO failure and recovery.

## Libraries

- Claude tmux: all 8 tests pass with fake Claude and an isolated real tmux server under `/private/tmp/plugin-logs-tmux.oVsVWd/tmux-server`. The sandbox blocks socket creation, so the test run used approved access. Actual `/usage` command log count matches fake backend observations; skip reasons and in-flight generation preservation are asserted. Source and rebuilt entry copied to `/Users/alex/Projects/mine/geckit-claude-tmux` byte-for-byte.
- OpenCode + Ollama: all 32 tests pass, including logger-unavailable behavior, cached limits with zero extra backend requests, request/turn outcomes and exclusion of prompts/passwords/backend bodies. Source and rebuilt entry copied to `/Users/alex/Projects/mine/geckit-opencode-llama` byte-for-byte.
- Maintained Codex Mirror example: its built-entry fake-CLI integration test passes, including backend log counts matching actual rate-limit RPC counts and no prompt/attachment logging.
- Public Codex Mirror source was read into `/private/tmp/plugin-logs-codex-mirror`. Its runtime is older than the maintained independent example. A narrow logging patch preserves that checkout's existing legacy browser/instruction behavior, with a fourth optional runtime logger argument; its rebuilt-entry fake-CLI test also passes. These source edits were pushed to the public main branch; the maintained independent example remains the current-host implementation.
- `git diff --check` passes for GeckIt and all three external source checkouts. No paid model calls.

## UX and release limits

No renderer/components/styles or mobile entry points were changed by this task. Theme/focus/keyboard/scroll/viewport review is not applicable to local file logging. Tests do not claim installed-app logging; updated host and plugin binaries must be deployed before real logs appear at the documented userData paths. Logs have no upload/viewer, and rotation removes the oldest records once the current/previous files fill.

## Publication

Alex authorized pushing to main. Plugin commits are published before the host change:

- [Claude tmux bda1bae](https://github.com/anetrebskii/geckit-claude-tmux/commit/bda1bae): quiet-check fix and diagnostic events.
- [OpenCode + Ollama 704ba70](https://github.com/anetrebskii/geckit-opencode-llama/commit/704ba70): request, cached-limits and session events.
- [Codex Mirror a0323b5](https://github.com/anetrebskii/geckit-codex-mirror/commit/a0323b5): account/limits backend and session events.

[GeckIt cef8948](https://github.com/anetrebskii/geckit/commit/cef8948) is pushed to main. The [Development publish workflow](https://github.com/anetrebskii/geckit/actions/runs/37925462313) started; installer publication is still pending. A source push does not prove that installers are published or installed. Chat history is unchanged; only the oldest diagnostic log records rotate out.
