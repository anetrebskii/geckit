---
name: configure-remote-connection
description: Configure GeckIt remote connections by pairing computers for full workspace access or adding an SSH execution host. Use when connecting an existing server or repairing a connection. Installing the remote service belongs to configure-remote-geckit; Slack setup belongs to configure-slack.
---

# Configure a remote connection

## Purpose

Connect to an existing remote machine through the path the person needs. Pairing opens that machine's GeckIt workspace and Manager. An SSH host runs Claude Code conversations there through this GeckIt. They have separate identities and settings.

## Inputs

Use the requested machine, existing deployment instructions and current GeckIt state. Read [connection procedures](references/connections.md) before setup or diagnosis. Resolve the target by address or immutable computer ID; ask when names collide. If neither the request nor configuration establishes the intended connection type, ask whether the person wants the remote workspace or SSH execution.

Read `{{said}} help` and available capabilities for this installed version. Use `GECKIT_SOURCE_CLI` when set. Inspect existing computers and hosts through supported read operations; unavailable access is a blocker for the affected check.

## Work

1. Establish which machine and OS account each command targets. Check the remote service or SSH prerequisites before changing configuration.
2. For a paired workspace, have the person run `geckit pair` as the remote service owner with its existing data directory. Have them paste the code into Connect computer or the operator pairing command. Codes grant full control, expire after five minutes and are single use. Keep codes out of transcripts and reports.
3. Pairing, revocation and operator service access belong to the person. Do not remove assistant identity variables or read operator tokens to obtain access. Complete permitted preparation and give the exact remaining operator step when blocked.
4. For SSH execution, select an existing host or create a non-secret host draft using the target's advertised capabilities. Preserve SSH config, agent and jump-host settings. The person answers password, passphrase, trust and sign-in prompts. Builtin SSH execution requires Claude Code installed and signed in remotely; builtin Codex remains local.
5. Register the intended remote folder, then inspect a harmless read through that connection. Keep ordinary work in `manage-conversations`; use `configure-remote-geckit` when the service is absent.
6. On a timeout, inspect state before repeating any write. Resolve the observed failure with the reference; never silently run the command locally.

## Unknowns

Label an unconfirmed target, network cause or successful enrollment `Unknown`. Do not infer pairing from working SSH, provider authentication from Connected, or an active installation from a repository version pin. Stop dependent changes when target identity or authorization is unresolved.

## Output

In the person's language, report connection type, target, saved computer or host ID, registered folder and checks observed. Give the remaining operator action when blocked. Omit empty sections and all codes, tokens and passwords.

## Verification

For pairing, check the remote computer identity, fresh workspace data and a read on that target. For SSH, verify host status, provider authentication and a remote folder read. Test reconnect when requested and active work permits it. Record separately what was configured, observed through a real connection, or left unverified. A service status or network probe alone does not establish workspace access.
