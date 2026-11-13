# Tasks: Secrets through a link, used by a broker

**Input**: [plan.md](plan.md), [spec.md](spec.md), [design.md](design.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

`[P]` = can run in parallel (different files). `[USn]` = user story.

## Phase 1: Setup

- [x] T001 Verify how electron-builder signs a binary in `extraResources` with its own entitlements under `-c.mac.notarize=true`; record the result in research.md R11
- [x] T002 [P] Create Go module `broker/` (`go.mod`, `main.go`) with identifier `org.anetrebskii.geckit.broker`
- [x] T003 [P] Add `client/scripts/broker.sh` building into `client/broker/bin/<os>-<arch>/`, `client/assets/entitlements.broker.plist`, `extraResources` entry in `client/package.json`, `client/broker/` in `.gitignore`

## Phase 2: Foundational (blocks all stories)

- [x] T004 [US3] Mask password fields and `data-geckit-secret` elements in `pageRead`, `pageText`, `pageType` in `client/extension/background.js`; `type` stops echoing password fields
- [x] T005 [US3] Guard `eval` and `shot` while a masked element holds a value, for Chrome profiles (`background.js`) and test browsers (`client/src/cli/testing.ts`)
- [x] T006 [P] [US3] Fixtures and vitest for masking (page with password field, filled secret field)
- [x] T007 Broker protocol framing and handshake in `broker/protocol/` per contracts/broker-protocol.md, with `go test`
- [x] T008 Store interface and sealed payload in `broker/store/store.go`; fake store for tests
- [x] T009 macOS Keychain store `broker/store/keychain_darwin.go` (ThisDeviceOnly, access list for the broker only)
- [x] T010 Secrets rules in `broker/secrets/` (lifetime, places, field, program, use count, history) with `go test`
- [x] T011 Ops `list`, `history`, `revoke`, `taskEnded`, `status` in the broker
- [x] T012 Broker client `client/src/service/broker-client.ts` (socket, token, handshake, ops) and supervision in `client/src/service/index.ts` (verify, restart with backoff, stop)
- [x] T013 Locate the broker binary (packaged `resourcesPath/broker`, dev `client/broker/bin/<os>-<arch>`) as whisper and llama are

## Phase 3: US1 Request and enter a secret (P1)

- [x] T014 [P] [US1] Relay functions `secretOpen`, `secretCard`, `secretSave`, `secretCollect`, cleanup in `signal/functions/index.js`; rules deny `secretRequests`
- [x] T015 [US1] Broker ops `prepare` and `accept` (`broker/accept/`): ephemeral P-256, ECDH + HKDF + AES-GCM open
- [x] T016 [US1] Request lifecycle `client/src/core/secrets.ts`: create request, sign card with the pairing identity, call relay, listen for saved, collect, `accept`, notices
- [x] T017 [US1] CLI `geckit secrets request|list|show|status|revoke` in `client/src/cli/secrets.ts`, registered in `client/src/cli/index.ts` with help
- [x] T018 [US1] Secret page entry in `client/src/viewer/` per docs/ux/secrets.md, after the prototype `docs/design/secrets.html`
- [x] T019 [US1] `firebase.json` rewrite `/s/` to the page

## Phase 4: US2 Use without giving (P1)

- [x] T020 [US2] `fill` op sealing to the browser endpoint key (`broker/fill/`); `type-secret` cmd in `background.js` and `testing.ts`; `geckit browser type --secret`
- [x] T021 [P] [US2] Per-run proxy with placeholder replacement and per-run CA (`broker/proxy/`), with recorded-request tests
- [x] T022 [P] [US2] Per-run ssh-agent (`broker/sshagent/`)
- [x] T023 [US2] `run` op (`broker/run/`): spawn, env, proxy and agent wiring, stream cleaned output; `geckit secrets run`

## Phase 5: US3 Cleaning everywhere (P1)

- [x] T024 [US3] Streaming matcher with encodings and chunk boundaries (`broker/clean/`), `clean` op
- [x] T025 [US3] `client/src/core/clean.ts`; apply to `chat:items` before channels, conversation export, notes, error reports

## Phase 6: US4 Lifetime and management (P2)

- [x] T026 [US4] Sweep at start and every minute; `taskEnded` from the board's Done/delete transition
- [x] T027 [US4] `secrets:*` in `client/src/shared/api.ts` and `phoneCalls()`; Settings > Secrets (`Secrets.tsx`, `SettingsDialog.tsx`) after the prototype
- [x] T028 [US4] Built-in skill text in `client/src/prompts/browser/`; Claude `--settings` read-deny for the broker folder in `client/src/main/sessions/claude.ts`

## Phase 7: US5 Windows and Linux (P2)

- [x] T029 [P] [US5] `wincred_windows.go`, named pipe, WER exclusion
- [x] T030 [P] [US5] `secretservice_linux.go`, `file_linux.go` with systemd-creds, `PR_SET_DUMPABLE`
- [x] T031 [US5] CI: broker job per runner in `.github/workflows/whisper.yml`, download and sign in `publish.yml`

## Phase 8: Existing vault and polish

- [ ] T032 (not done: needs a startup reorder and a migration of the live vault, left for Alex's decision) Move the vault key in `client/src/core/vault.ts` to a broker-owned item; migrate and delete the `/usr/bin/security` item (FR-031)
- [x] T033 [P] `docs/cli.md`, `docs/cli-coverage.md`, CLAUDE.md architecture paragraph
- [ ] T034 (partly: see `docs/reports/secrets-broker.md`) Run quickstart.md on macOS; record evidence in `docs/reports/secrets-broker.md`
