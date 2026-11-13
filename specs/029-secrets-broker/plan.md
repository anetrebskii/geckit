# Implementation Plan: Secrets through a link, used by a broker

**Branch**: `029-secrets-broker` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-secrets-broker/spec.md`; design handoff [design.md](design.md) with [docs/ux/secrets.md](../../docs/ux/secrets.md).

## Summary

A conversation asks for a secret by name; GeckIt prints a link to a page on `geckit-signal.web.app` that encrypts the value in the browser for the requesting computer. A new Go program, the broker, shipped inside GeckIt, collects it, stores it in the OS credential store under its own access rules, and is the only thing that ever holds it in clear. The broker types it into pages (sealed end to end to the browser endpoint), injects it into HTTP requests for allowed hosts through a per-run proxy, gives it to one named program, or signs as an ssh-agent. Everything returned to the agent, and everything GeckIt stores, is cleaned of active values. Existing leaks in `geckit browser read` and `type` are fixed first, and the existing vault key moves under the broker's protection.

## Technical Context

**Language/Version**: TypeScript (ESM, Node 22+, Electron) for GeckIt; Go 1.23 for the broker (research R1).

**Primary Dependencies**: Broker: Go standard library (`net/http`, `crypto/tls`, `crypto/ecdh`), `golang.org/x/crypto/ssh/agent`, `github.com/awnumar/memguard`, `golang.org/x/sys`, `github.com/keybase/go-keychain` (macOS, cgo), `github.com/danieljoos/wincred` (Windows), `github.com/godbus/dbus/v5` (Linux). GeckIt: none new; WebCrypto in the page and Node `crypto` in the service.

**Storage**: OS credential store per secret (R2 to R4); metadata and history as JSON in the broker's folder (R12); Firestore `secretRequests` for at most 15 minutes plus an hour of cleanup (contracts/relay.md).

**Testing**: vitest for GeckIt against recorded fixtures (constitution III); `go test` for the broker with a fake store and recorded proxy/ssh exchanges; the canary procedure in quickstart.md on each OS.

**Target Platform**: macOS 12+ arm64/x64, Windows 10+ x64, Linux x64 (desktop and headless).

**Project Type**: desktop app plus bundled helper program plus Firebase functions and a static page.

**Performance Goals**: request to working secret under one minute end to end (SC-004); a broker use adds under 50 ms; output cleaning keeps up with 10 MB/s of command output.

**Constraints**: no administrator rights anywhere (SC-006); no value in the agent's process for website, HTTP and SSH secrets; broker works while the desktop is closed (headless service).

**Scale/Scope**: one person, tens of secrets, hundreds of uses a day.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. The Person's Own Plan | Pass, strengthened | Credentials go to the OS store; FR-031 fixes the vault key readable by any program today. |
| II. One Contract Between Main and Windows | Pass | Settings > Secrets reaches the service through new entries in `client/src/shared/api.ts` (`secrets:list`, `secrets:history`, `secrets:revoke`, `secrets:status`), listed in `phoneCalls()` for the phone. |
| III. Recorded Output, Not Live Calls | Pass | Cleaning, request parsing, lifetime rules and protocol framing are pure functions with fixtures; broker spawning stays thin. |
| IV. UX Before Pixels | Partial | UX document written; the prototype is an open item in design.md and gates the page and Settings tasks only. |
| V. Every System, One Word | Pass | Same wording on all systems except the store's name; Windows and Linux degrade (no per-program store access) rather than break. |
| VI. Tokens Only | Pass | Settings section uses `styles.css` tokens; the page uses the viewer's stylesheet tokens. |
| Constraint: Electron/TypeScript stack | **Exception** | A Go program is added. See Complexity Tracking. |
| Constraint: no new runtime dependency | **Exception** | Go modules inside the broker. See Complexity Tracking. |
| Constraint: files under ~400 lines | Pass | Broker split by responsibility (layout below). |

Re-checked after Phase 1 (contracts, data model): no new violations.

## Project Structure

### Documentation (this feature)

```text
specs/029-secrets-broker/
├── spec.md
├── checklists/requirements.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── cli.md
    ├── broker-protocol.md
    └── relay.md
docs/ux/secrets.md
```

### Source Code (repository root)

```text
broker/                                  # new Go module, org.anetrebskii.geckit.broker
├── go.mod
├── main.go                              # start, token handshake, dumpable/WER off
├── protocol/                            # JSON-lines framing, ops from contracts/broker-protocol.md
├── store/
│   ├── store.go                         # Store interface, sealed payload (R10)
│   ├── keychain_darwin.go               # R2
│   ├── dpapi_windows.go                 # R3 (as built: DPAPI-sealed files)
│   ├── secretservice_linux.go           # R4
│   └── file_linux.go                    # R4 fallback, systemd-creds
├── secrets/                             # lifetime, places, field, use counting, history
├── accept/                              # request key pairs, ECDH + AES-GCM open (R8)
├── fill/                                # seal to browser endpoint key
├── proxy/                               # per-run CA, placeholder replacement (R5)
├── sshagent/                            # per-run agent socket (R6)
├── run/                                 # spawn command, env, stream cleaned output
└── clean/                               # streaming matcher (R7)

client/
├── scripts/broker.sh                    # go build per os-arch into broker/bin/
├── assets/entitlements.broker.plist     # empty entitlements
├── package.json                         # extraResources broker/bin/${os}-${arch} -> broker
├── extension/background.js              # masking in pageRead/pageText/pageType, type-secret cmd
├── src/
│   ├── cli/
│   │   ├── index.ts                     # register `secrets`, HELP, SECRETS_HELP
│   │   ├── secrets.ts                   # new: request/list/show/status/revoke/run over the browser folder
│   │   ├── browser.ts                   # `type --secret`, output formatter masking (line ~630)
│   │   └── testing.ts                   # type-secret, eval/shot guards for test browsers
│   ├── service/
│   │   ├── index.ts                     # start, verify, supervise broker (R14)
│   │   └── broker-client.ts             # new: socket/pipe client, handshake, ops
│   ├── core/
│   │   ├── vault.ts                     # key moved to broker-owned item (FR-031)
│   │   ├── secrets.ts                   # new: request lifecycle, relay calls, notices, taskEnded hook
│   │   └── clean.ts                     # new: calls broker `clean` for transcripts, exports, errors
│   ├── main/
│   │   ├── sessions/claude.ts           # --settings with permissions.deny for the broker folder
│   │   ├── guide.ts                     # skill text: request by name, never ask in chat
│   │   └── errors.ts                    # route through clean before redact
│   ├── prompts/browser/*.md             # secrets section of the built-in skill
│   ├── shared/api.ts                    # secrets:* entries
│   ├── viewer/                          # new entry: secret page
│   └── renderer/src/ui/
│       ├── SettingsDialog.tsx           # Secrets section
│       └── Secrets.tsx                  # new
signal/
├── functions/secrets.js                 # secret (open, card, save, collect), secretCleanup
├── firestore.rules                      # deny client access to secretRequests
└── firebase.json                        # /s rewrite to the secret page, /api/secret to the function
.github/workflows/
├── whisper.yml                          # + broker job per runner (setup-go, broker.sh, artifact)
└── publish.yml                          # download broker artifact, sign with its entitlements
docs/cli.md, docs/cli-coverage.md        # secrets commands
```

**Structure Decision**: the broker is a separate Go module at the repository root, beside `client/`, `mobile/` and `signal/`, because it is a separate program with its own toolchain. GeckIt code changes stay in their existing layers: CLI in `cli/`, broker supervision in `service/`, request lifecycle in `core/`, session flags in `main/sessions/`, UI in `renderer/`.

## Increments

Each increment is shippable on its own and closes part of the spec.

1. **Stop today's leaks** (FR-024 part, R13): mask password fields and `data-geckit-secret` elements in `read`, `text`, `find`; `type` stops echoing password fields; `eval` and `shot` guard. TypeScript and extension only. No broker.
2. **Broker skeleton on macOS** (FR-010, FR-011, FR-017, FR-018, FR-022, FR-029, FR-030): Go module, Keychain store, handshake, `list`/`revoke`/`status`/`clean`, packaging, signing with own entitlements, CI artifact, service supervision. Resolves the signing check in R11 first.
3. **Link and page** (US1, FR-001 to FR-009): relay functions and rules, page entry in the viewer (after the prototype is approved), `secrets request`, `prepare`/`accept`, notices, `--replace`.
4. **Using secrets** (US2): `type --secret` with endpoint sealing; `secrets run` with proxy, command and ssh-agent modes.
5. **Cleaning everywhere** (US3, FR-023 to FR-025): streaming matcher in `run` and proxy responses; `clean` applied to `chat:items` before channels, conversation export, notes, and error reports.
6. **Lifetime and management** (US4, FR-026 to FR-028): sweep, `taskEnded` from the board's Done/delete, history, Settings > Secrets, built-in skill text, Claude `--settings` read-deny.
7. **Windows and Linux** (US5, FR-021): wincred and Secret Service stores, Linux file fallback, WER exclusion, `PR_SET_DUMPABLE`, named pipe, CI runners.
8. **Vault key migration** (FR-031): `core/vault.ts` asks the broker for the sealing key item; one-time migration from the `/usr/bin/security` item, which is then deleted.

## Validation

- Unit: vitest for `cli/secrets.ts` parsing and messages, `core/secrets.ts` lifecycle, masking in page functions (fixtures of pages with password fields), `clean` integration; `go test` for store fakes, lifetime rules, proxy placeholder rules with recorded requests, matcher encodings and chunk boundaries.
- End to end: [quickstart.md](quickstart.md) sections 1 to 6 on macOS (increments 1 to 6), then on Windows and Linux (increment 7).
- UI: `build-product-ui` review of the page and Settings in light and dark, at 375, 768 and 1280 px, keyboard and focus, against the prototype; `performance-review` for Settings.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A Go program beside the TypeScript app | The broker must be a separately signed executable that runs only its own code (FR-010, SC-002). GeckIt's service runs as Electron with `ELECTRON_RUN_AS_NODE=1` and a script path, so any OS access rule that trusts it also trusts any script an agent runs with the same binary. | A Node broker inside the service fails FR-010 and SC-002 for that reason, and cannot wipe values from memory. A second Electron binary has the same problem. |
| New Go modules (go-keychain, wincred, dbus, memguard, x/crypto) | Each is the established binding for one OS store, the ssh-agent protocol, or locked memory. | Hand-written cgo and D-Bus bindings would be more code to review in the most security-sensitive part. |
