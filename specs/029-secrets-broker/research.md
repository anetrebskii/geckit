# Research: Secrets through a link, used by a broker

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-13

## R1. The broker's language

- **Decision**: Go, one module in `broker/` at the repository root, built per platform into `client/broker/bin/<os>-<arch>/`.
- **Rationale**:
  - The broker must be its own signed executable that runs only its own code (FR-010). GeckIt's service runs as `Electron` with `ELECTRON_RUN_AS_NODE=1` and a script path (`~/.geckit/bin/geckit-local`), so any access rule that trusts the Electron binary also trusts any script an agent runs with it. A Node broker inside GeckIt cannot satisfy FR-010 or SC-002.
  - The standard library has an HTTP(S) proxy and TLS; `golang.org/x/crypto/ssh/agent` is a complete ssh-agent server. One static binary per platform, no runtime to ship.
  - Memory: values are kept in `[]byte` inside `github.com/awnumar/memguard` enclaves (mlock, guard pages, wipe on destroy), never in Go `string`, which cannot be wiped.
- **Alternatives considered**:
  - *Node inside the service*: fails FR-010 and SC-002 as above; strings cannot be wiped.
  - *Rust*: stronger memory control, but no ready ssh-agent server and HTTP MITM proxy of the same maturity, and a slower path to a first version. The threat model (accidental exposure) does not need the extra control.
  - *Swift/C# per platform*: three codebases for one protocol.

## R2. macOS store

- **Decision**: one Keychain generic password per secret, created by the broker itself with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` and an access list trusting only the broker's designated requirement (`anchor apple generic and certificate leaf[subject.OU] = "MQKD7Z7V2L" and identifier "org.anetrebskii.geckit.broker"`). Access through the Security framework via cgo (`github.com/keybase/go-keychain` or a small cgo file).
- **Rationale**: Keychain items created by `/usr/bin/security` trust `/usr/bin/security`, which is why the current vault key (`client/src/core/vault.ts`) is readable from any shell. Items created by the broker trust only the broker; another program reading them gets a system prompt (SC-002). Trusting the designated requirement rather than the build's hash keeps access across updates (FR-029). `ThisDeviceOnly` keeps items out of iCloud Keychain and other computers' restores (FR-017).
- **Hardening**: hardened runtime, no `get-task-allow`, and the broker's own empty entitlements, not the app's inherited `allow-jit` and `allow-unsigned-executable-memory`. That blocks attaching a debugger from the same user (FR-018).
- **Alternatives considered**: the data-protection keychain with `kSecUseDataProtectionKeychain` needs an application identifier and a provisioning profile for a command-line helper; Secure Enclave keys wrapping a file store add a second mechanism without changing who can ask the broker. Both can come later.

## R3. Windows store

- **Decision**: Credential Manager generic credentials (`CredWriteW`, `CRED_PERSIST_LOCAL_MACHINE`), whose blob is DPAPI-protected for the current user and machine, through `golang.org/x/sys/windows` or `github.com/danieljoos/wincred`.
- **As built**: one DPAPI-sealed file per secret (`CryptProtectData`, current user) in the broker folder instead of Credential Manager entries: the same protection, without Credential Manager's blob size limit, and any process of the user that calls `CryptUnprotectData` on a file could open it, as with Credential Manager. Status reports the store as `dpapi`.
- **Rationale**: no administrator rights (FR-029, SC-006); values do not roam and do not open on another computer (FR-017).
- **Known limit**: Windows has no per-program access to a user's credentials and lets a user's processes read each other's memory. The broker cannot stop a deliberate agent there; the spec's threat model accepts this. The broker excludes itself from Windows Error Reporting dumps (`WerAddExcludedApplication`) and never writes values elsewhere (FR-020, FR-022).
- **Alternatives considered**: a Windows service under its own account would separate the agent from the store but needs administrator rights and a separate update path for the service binary (Squirrel and NSIS install per user into a folder the user can write). Deferred with the spec's "separate system account" option.

## R4. Linux store

- **Decision**: Secret Service over D-Bus (`github.com/godbus/dbus` or `github.com/zalando/go-keyring`), one item per secret with attributes `application=geckit-broker`, `name=<secret>`. Where no Secret Service answers (servers, minimal desktops), a file store: `0600` files under the broker's folder, AES-256-GCM, key sealed with `systemd-creds encrypt --user` (TPM2 where present, otherwise the host key); where `systemd-creds` is unavailable, a `0600` key file with a status warning (FR-021).
- **Hardening**: `prctl(PR_SET_DUMPABLE, 0)` at start, which forbids core dumps and makes `/proc/<pid>/mem` and `ptrace` refuse other processes of the same user (FR-018, FR-022).
- **Known limit**: Secret Service gives any process in the user's session an unlocked item. Same threat-model note as Windows.

## R5. Using HTTP API secrets: placeholder proxy

- **Decision**: a per-run HTTPS proxy inside the broker. A command started through the broker gets `HTTPS_PROXY`/`HTTP_PROXY` pointing to it and a per-run certificate authority through `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`, `GIT_SSL_CAINFO`. Environment values the agent asked for hold `{{secret:<name>}}`. The proxy replaces placeholders in headers, URL and body only when the request's host is on that secret's list; a placeholder bound for any other host fails the request with 403 and the reason. Responses pass through the output cleaning (R7) before the agent sees any of them.
- **Rationale**: the broker need not know any API; it knows only placeholder-to-host rules (FR-013). The certificate authority is created per run, held in memory, and trusted only by that command, never installed system-wide.
- **Known limit**: programs that ignore these variables (for example Go programs on macOS reading only the system trust store) fail with a TLS error; the placeholder never reaches the server (spec edge case). Such programs use command secrets instead (FR-014).
- **Prior art**: Fly.io's `tokenizer` proxy (secret injection by destination host).

## R6. Using SSH secrets

- **Decision**: the broker serves an ssh-agent socket per run (`SSH_AUTH_SOCK` for the command), backed by keys loaded from the store into memguard, with `golang.org/x/crypto/ssh/agent`. Signing requests are checked against the secret's allowed hosts where the client sends session binding (`session-bind@openssh.com`); otherwise the key is limited to commands started for that secret.
- **Rationale**: `ssh` and `git` already speak the agent protocol; the private key never leaves the broker (FR-015).

## R7. Output cleaning

- **Decision**: one matcher built from all active values of 8 characters or more and their standard and URL-safe base64, URL-encoded and lowercase/uppercase hex forms, run over every byte stream the broker returns (stdout, stderr, HTTP responses) and, in GeckIt, over browser command answers, stored conversations and error reports. A streaming matcher keeps a tail of the longest pattern's length so values split across chunks are caught.
- **Rationale**: the most likely accidental leak is a program printing the value (verbose HTTP, token status, SSH debug) (FR-023, FR-025).
- **Shape**: the broker exposes the matcher's patterns to GeckIt as salted hashes plus lengths, not values: GeckIt sends text to the broker's `clean` call instead of holding values itself.

## R8. The link and the form

- **Decision**: a static page served from the existing Firebase Hosting of `geckit-signal` at `https://geckit-signal.web.app/s/#<request id>.<link key>.<key hash>` (the fragment never reaches a server or a link preview). It is a second entry of the existing viewer build (`client/src/viewer/`, `client/viewer.vite.config.ts`, `npm run viewer` into `signal/public`), which already serves share links as `https://geckit-signal.web.app/#<key>.<expiry>` with no-referrer and a CSP. The page fetches the request card from a callable function, verifies the card's signature with the computer's pairing identity key it carries, encrypts with WebCrypto ECDH P-256 to the broker's public key plus AES-GCM, and posts the ciphertext. The card in Firestore holds name, note, kind, places, computer name and task title; the function returns it only to holders of the link key (its hash is stored, not the key).
- **Why not the viewer's WebRTC path**: share links dial the computer over WebRTC, answered by the desktop's hidden peer window (`client/src/renderer/src/peer/main.ts`). That needs the computer awake and the desktop running; a headless service cannot answer it today. A relay holding ciphertext for 15 minutes works while the computer sleeps (US1 scenario 6) and from a headless service. The `signal` functions today are only `ice` and `push`; this adds four (contracts/relay.md).
- **Rationale**: FR-002 (plain web page in any browser), FR-003 (the fragment means previews fetch only a neutral shell; the one-time token is spent only by the save call), FR-006 and FR-007 (the relay holds only ciphertext and cannot swap the key without breaking the signature).
- **Key pinning caveat**: the page and the pinning key both come from the same hosting; a compromised hosting could serve a page that skips the check. Mitigations: CSP `default-src 'self'`, Subresource Integrity on the page's script, and the computer showing each submission (FR-009). A page bundled inside GeckIt's phone app removes the caveat for paired phones; this is the web client task's concern.
- **P-256 rather than X25519**: WebCrypto's ECDH is universally available for P-256 in Slack's and Telegram's in-app browsers (WKWebView, Android WebView); X25519 is not yet everywhere.

## R9. Delivery of the link

- **Decision**: as `geckit browser signin` does today, `geckit secrets request` prints the link and the agent puts it in its reply, which reaches the conversation's origin through the existing path (Manager `onResponse` to the owner thread for Telegram, Slack and Discord, `client/src/main/channels/channels.ts`; the chat itself otherwise). The service also emits a `chat:notice` for the session so the request shows in GeckIt even when the reply is delayed. The page says "Do not forward this link" under the title.
- **Rationale**: FR-001. GeckIt has no general "post to origin" API; adding one is unnecessary when the reply already travels there. The link is not a secret: holding it lets someone supply a value, not read one, and every submission is shown on the computer (FR-009).
- **Alternatives considered**: a new post-to-origin API through `#ownerThread` (more code, same result); shorter links in group chats (needs reliable group detection per channel; deferred).

## R10. Lifetime enforcement

- **Decision**: each stored item's payload is `{ value, expiresAt, taskId, usesLeft, kind, places }`, sealed together. The readable metadata file is a cache for listing only; every use decrypts the item and checks the sealed fields (FR-016, FR-019). This task secrets are deleted by the service on the Done/delete transition and, as a fallback, by the broker when the task no longer exists. A sweep runs at broker start and every minute.

## R11. Packaging, signing and CI

- **Decision**: `client/scripts/broker.sh` runs `go build -trimpath -ldflags "-s -w"` per `<os>-<arch>` into `client/broker/bin/`, picked up by `extraResources` like whisper and llama. macOS: built natively for arm64 and x64 (cgo), signed in electron-builder's `afterSign` (or `binaries`) with the Developer ID, hardened runtime and `assets/entitlements.broker.plist` (empty dict), so it does not inherit the app's entitlements, and notarized with the app. Windows: signed with the app's certificate when one exists; the service checks the Authenticode signature, or a SHA-256 written into the app at build time when unsigned. Linux: SHA-256 recorded at build time (FR-030).
- **CI**: today `whisper.yml` builds whisper and llama per runner as artifacts and `publish.yml` (lines 49-126) downloads them into place. The broker joins that workflow: `actions/setup-go` and `broker.sh` per runner, uploaded as an artifact, downloaded by `publish.yml`.
- **Signing (T001, checked in app-builder-lib 26.18.0)**: `MacTargetHelper.getOptionsForFile` gives every nested file `entitlementsInherit`; there is no per-file override. So `client/scripts/after-pack.cjs` signs `Contents/Resources/broker/geckit-broker` itself (`codesign --options runtime --timestamp --identifier org.anetrebskii.geckit.broker --entitlements assets/entitlements.broker.plist`, ad hoc when the build is unsigned) and `build.mac.signIgnore` keeps electron-builder from signing it again. Notarization runs after signing the app and covers the already-signed broker. Unverified until a signed CI build: that notarization accepts it and that `codesign --verify --deep --strict` passes on the app.

## R12. Keeping agents out of the broker's folder

- **Decision**: the broker's folder lives outside GeckIt's data folder (`~/Library/Application Support/GeckIt Broker/`, `%LOCALAPPDATA%\GeckIt Broker\`, `$XDG_DATA_HOME/geckit-broker/`). Claude Code sessions get a `--settings` JSON with `permissions.deny` for `Read(<folder>/**)` and the matching `Bash` patterns; `claudeArgs` (`client/src/main/sessions/claude.ts:81`) passes no `--settings` today, so this is new. The folder holds only metadata and the history, never values (FR-020).
- **Known limit**: Codex's `workspaceWrite` sandbox (`client/src/main/sessions/codex.ts:566`) has no read-deny; Codex sessions can read the metadata. They still cannot read values, which live only in the OS store.

## R13. Existing leaks in `geckit browser` (found 2026-11-13)

- `pageRead` (`client/extension/background.js:602`) prints `value="..."` for every textbox, password inputs included (line 655).
- `pageType` (line 701) answers with up to 100 characters of what the field now holds (lines 719, 726), printed by `client/src/cli/browser.ts:643`.
- Both are shared by Chrome profiles and test browsers (`client/src/cli/testing.ts` evaluates the same page functions). Any password a person or the agent typed into a page is therefore readable by `read`, and echoed by `type`, today.
- **Decision**: fix in the first increment, before the broker: never print values of `type=password` inputs or elements marked `data-geckit-secret`; `type` answers `typed` without echoing password fields; `eval` and `shot` refuse or mask while such an element holds a value (FR-024).

## R14. Service supervision

- The service starts detached and has no crash recovery by design (`docs/headless-service.md`). The only supervised child today is `llama-server` (`client/src/cli/find-model.ts`), started on demand and stopped after idle.
- **Decision**: the service starts the broker in `client/src/service/index.ts` after runtime creation, verifies it (FR-030), restarts it on exit with backoff (1 s, 5 s, 30 s, then stop and report in `geckit secrets status`), and stops it in `stop()`. The broker is not stopped when idle: requests in flight hold keys in its memory.
