# Connection procedures

## Select the path

| Need | Path |
| --- | --- |
| Open another GeckIt's board, Manager, settings and conversations | Pair computers |
| Run Claude Code on another machine from this GeckIt | SSH execution host |
| No GeckIt service installed on the target | Load configure-remote-geckit first |

Check `{{said}} help` for commands supported by this copy. Product control is available to an operator or authenticated Manager according to capabilities. Ordinary assistant conversations cannot promote themselves to operator. Do not unset `GECKIT_SESSION`, `GECKIT_MANAGER_SESSION`, `CLAUDECODE` or other identity variables to cross that boundary.

## Pair an existing service

The person runs this on the server, as its service account, using the existing bundle and private data directory. Example paths must be replaced with the deployment's actual paths:

```sh
GECKIT_DATA=/var/lib/geckit node /opt/geckit/service/cli.js service status
node /opt/geckit/service/cli.js pair --data /var/lib/geckit
```

`pair` starts a missing service and enables remote access. When systemd owns the installation, confirm its configured account, HOME, PATH and vault environment first. Start it through that unit rather than accidentally creating a second instance with another environment.

On the client, use the toolbar computer selector, Connect computer, paste the entire code, optionally name it, then Connect. A returning device opens the saved computer without another code. The operator CLI alternative is `geckit computers add <code>` on the client. The code is a temporary credential: let the person transfer it directly and do not capture it in task logs.

Successful new pairing grants the entire workspace, including future projects. It has no extra approval phrase or project-scoping step. Old observation-only grants need new pairing to gain control. A restart invalidates an unused code; an established device grant survives a normal restart with the same data and vault key.

Inspect saved computers with `{{said}} computers`. Resolve the immutable ID, then use supported reads such as `{{said}} sessions --today --host <id>`. Operator or authenticated Manager can run `capabilities --host <id>` before product configuration. `--computer` is a compatible alias. Unknown, ambiguous, offline or unsupported targets fail without local fallback. Remote writes retain the target-bound confirmation advertised by capabilities.

`geckit computers forget <id>` removes the client's saved connection. Server-side `geckit devices revoke <device-id> --data <directory>` revokes access. `geckit access disable --data <directory>` disables remote access. These are operator actions; forget does not revoke another device's server grant.

## Diagnose pairing

- Invalid, expired or already used code: obtain a fresh code on the intended server. Check for a service replacement or restart while the code was being transferred.
- Version incompatibility: compare client and server builds. Update through that installation's release workflow after active work is handled.
- Signaling works but connection fails: inspect both machines' firewall, VPN routing, cloud security-group and subnet rules, and the deployed signaling service's STUN/TURN configuration. Do not assume a TURN relay exists.
- Azure precedent: a deny-inbound rule blocked direct WebRTC UDP although SSH and signaling worked. An operator-IP-restricted UDP rule made a separate network probe connect. Persist an authorized network change in the owning Terraform repository; a portal-only edit may be overwritten. Recheck a VPN's public exit address when it changes. Do not open UDP to every source as a diagnostic shortcut.
- A probe that connects does not establish enrollment or workspace functionality. Verify those separately through the client.
- Connection lost after a write: reconnect and read target state before resubmitting. Do not replay uncertain mutations.

## SSH execution host

Check Settings, Hosts and the existing SSH config alias before adding a duplicate. GeckIt uses the machine's OpenSSH config, keys, agent and jump hosts. Resolve address, user, port and optional key-file path. Private keys stay on their owning machine.

For operator or authenticated Manager, inspect `capabilities`, `hosts list` and `hosts known`. The non-secret draft has `name`, `address`, `user`, `port`, `auth` (`key` or `password`) and optional `keyFile`. Use `hosts add --draft <JSON>`, or `hosts edit --id <id> --draft <JSON> --expected <last-read-JSON>`. Read back conflicts before merging. Do not pass passwords in drafts; native prompts own passwords, passphrases, codes and host-key trust.

Use Settings, Hosts, Connect, or the supported `hosts connect --id <id>` path. Install/sign in to Claude Code as the remote user when prompted; installation changes need the person's requested scope. A changed host key requires investigating the fingerprint with the person, never deleting known-hosts entries to suppress it.

Use the host folder picker or supported `hosts folders --id <id>` and `hosts add-folder --id <id> --path <absolute-folder>`. Preserve the returned host ID; remote project roots are `ssh://<host-id>/<absolute-path-without-leading-slash>`. Do not construct an ID from a display name.

Inspect a read in the chosen folder, checking that output comes from the remote machine. A model-backed task consumes the configured provider account; use it when the person's setup request covers that acceptance check. SSH execution does not control the remote GeckIt's Slack Manager.
