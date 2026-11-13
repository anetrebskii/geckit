# Installation and recovery

## Establish current state

Use the deployment's wrapper when it exists. Otherwise run the bundled CLI as the service account with matching `GECKIT_DATA`, HOME and PATH. `service help` lists the installed operator syntax. Operator commands refuse assistant-session identity; leave that boundary intact and hand denied operator commands to the person.

Before an update, inspect the unit, bundle version, `service status`, `service sessions list`, queues and schedules. Coordinate with other operators so they do not replace the service while you are pairing or testing. Retain the data directory and vault environment; never display their credentials.

## Obtain the bundle

For a source deployment, use a checkout of the requested release on the target platform:

```sh
cd client
npm ci
npm run build:service
```

Copy all of `client/out/service/`, including `assets/` and `package.json`. Node must be version 22 or newer. Native addons must match the target OS and architecture; do not transplant a macOS service bundle onto Linux.

A Linux packaged release may contain the same bundle at `resources/app.asar` -> `out/service`. Follow the owning repository's pinned extraction procedure and checksum verification; do not execute a downloaded AppImage as root merely to unpack it. Do not substitute Development for Stable or publish a release without the person's authorization.

## Account, storage and provider

Create the intended service account and private data directory, owned by that account with mode 0700. Keep installed program files separate from writable state. Use its real home for provider login and model caches. Install the selected provider, then have the operator complete its sign-in as that account. A root login is not the service user's login.

The vault uses macOS Keychain, Linux Secret Service or Windows DPAPI. A headless Linux installation without a working backend needs a persistent `GECKIT_VAULT_KEY`: 32 random bytes, base64 encoded, supplied through a protected service-manager environment file. Generate it directly into that file without returning the key to the conversation. Use mode 0600 and restrict access to the service manager/operator. Preserve an existing key; replacing it makes sealed credentials unreadable. Do not place it in source, command arguments, logs or exported settings.

## Linux systemd example

This template assumes the `geckit` account, `/home/geckit`, a compatible bundle in `/opt/geckit/service`, private `/var/lib/geckit`, and a provisioned `/var/lib/geckit.env`. Replace those paths together with the actual deployment paths. Omit the EnvironmentFile line only when an OS vault backend is available.

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
EnvironmentFile=/var/lib/geckit.env
ExecStart=/usr/bin/node /opt/geckit/service/service.js --data /var/lib/geckit
UMask=0077
Restart=no
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
```

For a mounted data disk, add `RequiresMountsFor=<mount-path>` under Unit. Validate paths and ownership before `systemctl daemon-reload` and `systemctl enable --now geckit`. Read status and sanitized journal output. Automatic crash restart is not enabled here because stale ownership needs inspection.

As the service account, with the same environment:

```sh
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service status
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service projects add /srv/project
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service settings get
```

Inspect settings without dumping unrelated private fields. `service settings set <JSON>` supports the installed operator schema. Set enabled providers explicitly, for example `chatProviders: ["claude"]` and `chatProvider: "claude"` on a Claude-only installation. Do not install another assistant to silence an outdated build's missing-executable error.

The default VPN/IP check must allow the service's approved public egress address. Preserve `vpnIpCheck` and set `vpnAllowedIps` according to the owner's policy. Confirm the actual field values and public egress before submitting work; the operator's SSH source address may differ from the service's egress address.

Run `service manager view` before a requested `service manager configure <JSON>`. Choose an installed, authenticated provider and supported model. A local service exposes private IPC, not a public TCP admin endpoint. Use computer pairing for desktop access rather than publishing its socket or operator token.

## Updates and recovery

Stage a compatible replacement while the old service runs. Confirm no active or queued work will be interrupted. Stop connected desktop clients from launching it again. Request `service shutdown`, stop the OS unit and verify process exit. Move the old bundle to a unique rollback location, put the staged bundle at the configured path and start the same unit. Preserve data, vault key, OS account and pairing identity. Check status, version, providers and any configured channel; report the exact rollback directory.

For infrastructure-managed installations, update the pinned version and produce the required plan through that repository. Respect an operator-only apply boundary. A reviewed plan is not a deployment. Avoid changing VM bootstrap/custom-data fields that would replace the VM.

An abrupt exit can leave `service-owner.json`, `geckit.sock`, `control.sock` and `operator-token`. Check the recorded PID and both endpoints before recovery. Only with the process absent and listeners stopped may the operator remove stale ownership artifacts and restart. A live PID, denied access, malformed metadata or reachable listener requires investigation. Never remove ownership files from a running service or erase settings to recover startup.

Interrupted work is not automatically replayed or approved. Inspect sessions and pending cards after recovery. Roll back the bundle only with the service stopped; a build that changed the configuration format may also need its documented configuration rollback. Preserve backups before touching state.
