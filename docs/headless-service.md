# Headless GeckIt

The working tree runs the application core in an independent Node service. Desktop and the local operator CLI connect to that service. Electron, a display server and a desktop login are not required for the service. This is not yet a release artifact.

The service owns conversations, providers, queues, settings, employees, Manager, Telegram, SSH, Plans, schedules, recordings and transcription. Desktop keeps native capture, windows, dialogs, notifications, clipboard and the phone WebRTC bridge. Slack, portable configuration import/export and shared access for colleagues remain separate features.

## Run desktop from the current checkout

The extraction has not been published in a release. Use a checkout containing these changes. Quit an older GeckIt copy using the same data directory before the first launch, so its embedded runtime releases the local socket.

From the repository root:

```sh
cd client
npm ci
npm run build
npm start
```

`npm run build` includes both the service and desktop. `npm start` opens that build. For hot reload, use `npm run dev` from `client/`. Source builds use `geckit-local` by default, separately from the installed app's data. Desktop starts a missing service and attaches to an existing compatible service for the same data directory. Closing desktop leaves the service and accepted tasks running.

To use a specific local data directory:

```sh
GECKIT_DATA=/absolute/private/geckit-data npm start
```

Use the same directory when calling the CLI:

```sh
GECKIT_DATA=/absolute/private/geckit-data node out/service/cli.js service status
```

Without an explicit override, source desktop on macOS uses `~/Library/Application Support/geckit-local`:

```sh
GECKIT_DATA="$HOME/Library/Application Support/geckit-local" node out/service/cli.js service status
```

These commands run under the service's OS account. Desktop attachment uses local IPC; a desktop on another machine cannot connect directly to the VM over the network.

## Build a desktop installer

From `client/`, run `npm run package`. It builds the service and desktop, then creates the current platform's installer in `client/release/build/` without publishing. This is separate from the source launch above. Provider installation, authentication and native OS permissions are still required on the target machine.

## Install the headless bundle

Build with the repository's dependencies installed:

```sh
cd client
npm ci
npm run build:service
```

Copy the **entire** `client/out/service/` directory to the target machine, including `assets/` and `package.json`. The bundle runs with Node 22 or newer and needs no `node_modules` directory. Provider libraries may have their own dependencies. Install and sign in to Claude Code, Codex or another supported provider separately, as the service's OS user. Provider/platform restrictions remain the same as desktop: builtin Codex is local; builtin remote execution uses Claude Code over SSH.

```sh
node /opt/geckit/service/service.js --data /var/lib/geckit
```

The paths above are examples: create `/opt/geckit/service/`, copy the bundle there, and create `/var/lib/geckit` with mode 0700 owned by the service user before running the command. You can instead place the bundle and private data directory under that user's home; use those same paths in every CLI and service-manager command. Keep provider executables on that user's PATH.

The service prints `GeckIt service ready.` and its data directory only after the local listener and runtime start. `--data` selects the data directory; otherwise `GECKIT_DATA` or the normal platform directory is used. Desktop attaches to the service for its own data directory, or starts a detached service when none exists. Set `GECKIT_DATA` explicitly to select a private directory. The normal `npm run dev`, `npm run build` and `npm run package` commands include the service bundle. Closing desktop leaves service work running; reopening attaches to the same owner.

The process runs in the foreground. Use an OS service manager to keep it alive after logout. Closing an operator CLI does not stop work; terminating the service does stop local providers. Saved queued work follows existing queue rules on startup; an interrupted local turn is not automatically replayed or approved. Existing SSH runs are reattached through the common runtime.

## Operate

Run these commands from the service user's terminal. Every call needs the same `GECKIT_DATA`. `service help` works without a running service.

```sh
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service status
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service projects add /srv/project
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service settings get
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service sessions start '{"root":"/srv/project","provider":"codex","mode":"manual","text":"Describe this project"}'
```

`sessions start` returns an ID. Use `sessions list`, `sessions items <id>`, `sessions pending <id>`, `sessions stop <id>` or `sessions retry <id>`. `sessions send` takes the same JSON with an additional `session` field. Supported message fields are `root`, `text`, `mode`, `session`, `provider`, `model`, `employeeId` and `goal`.

The VPN/IP rule stays enabled by default. Before submitting work, configure approved public addresses with `settings set '{"vpnAllowedIps":["<your-public-IP>"],"vpnIpCheck":true}'`, or deliberately disable the rule with `settings set '{"vpnIpCheck":false}'`. Ready means the service is listening, not that an external provider is signed in or allowed to send.

Settings edits accept a JSON object with supported execution fields: `chatProvider`, `chatProviders`, `chatMode`, `chatModel`, `workingAtOnce`, `vpnIpCheck`, `vpnAllowedIps`, `guideClaude`, `guideCodex`, `guidePlugins` (provider-ID to boolean mapping). Enabling a provider requires it to be installed. Standalone Claude/Codex guides and their launcher are kept inside this service's directory. Desktop-launched service retains the desktop installation's guide paths.

Native permissions and questions remain pending until explicitly answered:

```text
service sessions answer <session-id> <card-id> once|session|no|<question-answer>
service sessions answer-request <session-id> <request-id> {"start":[false],"notes":["not now"]}
service sessions answer-team <session-id> <request-id> allow|decline [note]
```

Read `pending` first and use the exact IDs. A task proposal needs one explicit boolean and note per proposed task. Already answered cards are rejected. The internal legacy answer-origin field uses the server/computer value.

Manager commands: `manager view`, `manager configure <JSON>`, `manager send <text>`, `manager pause`, `manager resume`, `manager answer <decision-id> <choice>`. Configuration supports `enabled`, `provider`, `chatModel`, `instructions`, `delegation`. Sending a Manager message requires an enabled, available Manager provider; Telegram is not required for this local operator path.

`service employees ...` uses the existing employee commands: list, show, memory, create, edit, archive, restore, assign, tasks, shortcuts and shortcut add/edit/pause/resume/remove/give/run. Operator changes are direct. Ordinary `geckit employees` and `geckit start` from assistant conversations retain their approval requests. `service help` lists command syntax; the ordinary `geckit help` documents employee flags.

For the remaining core API, use `service methods` to list allowed named methods and `service call <method> '[JSON arguments]'`. For example, `service call settings:get '[]'` reads full settings and `service call settings:set '[{"theme":"dark"}]'` changes appearance. Desktop migration/update control methods are not exposed by this generic CLI. Binary RPC values preserve bytes for desktop; JSON CLI arguments cannot represent every binary operation.

## Local access and lifecycle

The Unix socket and `operator-token` are mode 0600. The token is created afresh on startup and is not placed in provider environments. Operator CLI rejects calls carrying assistant-session identity. This is a trusted OS-account boundary, not isolation between mutually untrusted processes of the same user: a process with that user's file access can read its credential. Do not share the data directory or token with colleagues. No TCP listener is exposed. Authenticated RPC uses a separate private local endpoint and explicit named method allowlist. Phone retains its existing restricted method list through desktop. Headless never falls back to plaintext saved SSH passwords. Native desktop capabilities need a connected desktop adapter; unavailable native requests fail explicitly.

Only the service owns `service-owner.json`; desktop does not compose another runtime or own core state files. A preexisting legacy socket is preserved even without ownership metadata. After a crash, check the recorded PID and confirm that no process owns the directory before manually removing stale `service-owner.json`, `geckit.sock`, `control.sock` and `operator-token`. A second process never removes them automatically. Do not remove files belonging to a live instance.

Use `service shutdown`, SIGINT or SIGTERM to stop. The service stops accepting requests, finishes accepted mutations, cancels waiting conversation requests, disposes scheduling/providers/SSH transports, flushes host-run state and releases its socket and ownership files. CLI timeout/disconnection never automatically retries a mutation; read back the state before resubmitting after an uncertain response.

For the example installation, stop it from another terminal:

```sh
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service shutdown
```

Before replacing a manually installed bundle, finish or stop active work, quit connected desktop clients, shut down the service and confirm its process exited. Replace the bundle directory, preserve the data directory and vault key, then start the new service. Source desktop can start its service again when reopened. Do not remove ownership or socket files from a running instance to force an upgrade.

Desktop reconnects with a fresh authenticated connection and bootstrap snapshot. It does not replay uncertain writes or start a replacement service after a disconnect. Package/protocol mismatches fail explicitly. Installing an application update first asks the service to stop while idle; active work or a failed shutdown blocks installation. Ordinary desktop quit does not install the update implicitly.

## Secret storage

The Node vault encrypts saved SSH passwords and Telegram state with AES-GCM. Its wrapping key uses macOS Keychain, Linux Secret Service (`secret-tool`) or Windows DPAPI. A deployment without an available OS backend can supply `GECKIT_VAULT_KEY` as a base64-encoded 32-byte key through a protected service-manager environment file. Keep that key stable and private; changing it is rejected by the stored fingerprint. It is removed from provider environments. If no backend is available, saved-secret operations are unavailable rather than written as plaintext. Non-secret configuration and tasks can still run.

On desktop attachment, legacy Electron-encrypted host and Telegram state is decrypted by desktop, sent over authenticated local RPC and sealed by the service. Readback is verified before replacing old files; encrypted backups are retained with mode 0600. A failed migration preserves the original files. Real OS key-store migration should be verified on each target platform before distribution.

## Linux service example

Create the `geckit` OS account, its home and a writable private `/var/lib/geckit` directory first. Adjust Node and provider paths for that installation. Example `/etc/systemd/system/geckit.service`:

```ini
[Unit]
Description=GeckIt headless service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=geckit
WorkingDirectory=/opt/geckit/service
Environment=HOME=/home/geckit
Environment=PATH=/home/geckit/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node /opt/geckit/service/service.js --data /var/lib/geckit
UMask=0077
Restart=no
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

Enable with `sudo systemctl enable --now geckit`; inspect with `journalctl -u geckit`. Automatic crash recovery is deliberately not configured because stale ownership requires operator inspection. A clean `systemctl restart geckit` releases ownership normally. The template has not been installed or tested on a Linux VM in this task.

## Verification

See [the verification record](../specs/019-headless-service/verification.md). Tests run real Node service/CLI processes from a copied standalone bundle and a child-process fixture provider. A built Electron acceptance test also verifies desktop/CLI state and events, task completion after desktop exits, and reattachment to the same service PID. The actual renderer was inspected against the real isolated service. Provider output is controlled by a child-process fixture; real model login/responses, live SSH/Telegram/phone connections and Linux service-manager installation remain unverified.
