# Secrets broker: evidence

Branch `spec/029-secrets-broker`, macOS 26 on Apple Silicon, 2026-11-13. Spec `specs/029-secrets-broker/`.

## Checked

| What | How | Result |
| --- | --- | --- |
| Broker unit tests | `go vet ./... && go test ./...` in `broker/`; `GOOS=windows` and `GOOS=linux` vet | Pass |
| Builds | `scripts/broker.sh` for mac arm64 and mac x64 (cgo cross-build) | Both build; x64 is Mach-O x86_64 |
| Link to saved secret, real broker and real Keychain | `GECKIT_BROKER_INTEGRATION=1 npx vitest run test/secrets-broker.integration.test.ts` with a fake relay | Pass: link format and key hash, page seal, collect, accept, notice without the value |
| Command secret | same test | Output has the value, its base64 and hex replaced; another program and another task refused |
| Website secret | same test | Wrong origin refused; sealed to the endpoint key and opened there; a one-use secret is gone after use |
| Task end and storage | same test | `taskEnded` removes the task's secrets; no broker file contains the canary |
| Page masking and sealed typing | `GECKIT_CAMOUFOX_INTEGRATION=1 npx vitest run test/browser-secrets.integration.test.ts` | Pass: read, type, eval and shot never show password or secret fields; `type-secret` types a sealed value once |
| Cleaning before text leaves | `test/secrets-clean.test.ts`, `test/channels.test.ts`, `test/conversation-export.test.ts` | Pass |
| Client | `npm run typecheck`; `npm test` (153 files, 1983 tests) | Pass. `product-rpc.test.ts` must run without the Claude Code session variables, which the CLI treats as a conversation |
| Secret page | GeckIt test browser against a local stub relay | Ready, filled with Show, Saved, Already used, Expired, Not valid, SSH field; 375 px light and dark, 1280 px; keyboard order Value, Show, lifetimes (arrows), Save; focus ring visible. Screenshots in `docs/design/secrets/` |
| Settings > Secrets | Renderer fixture `test/browser/secrets` | List, badges, History, Remove with confirmation and focus return, empty, broker unavailable; light and dark |

## Not checked

- The Keychain prompt a process other than the broker gets for a secret item (SC-002): it opens a system dialog.
- The live path through Chrome and the GeckIt Browser extension; only the Camoufox test driver was run.
- Signed and notarized builds, and CI on the Windows and Linux runners; Windows and Linux stores were not run.
- Deploying the `secret` function and the page to `geckit-signal`.
- The installed app end to end: a real conversation asking, Alex opening the link from Telegram or Slack.
- Offline state of the page and the 768 px width.
- T032, moving the service vault key behind the broker.

## Lint

Changed sources lint clean. `npm run lint` still reports the CommonJS build scripts in `client/scripts/` (`no-undef`, `no-require-imports`), as for the existing ones; the new `after-pack.cjs` has the same findings.
