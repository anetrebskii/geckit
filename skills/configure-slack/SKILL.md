---
name: configure-slack
description: Connect GeckIt's built-in Slack channel to the correct workspace and app, configure Manager access, and verify messages and files. Use for Slack installation, missing replies or scope repairs. Remote service installation and computer pairing use their respective setup skills.
---

# Configure Slack

## Purpose

Connect the built-in Slack channel to the intended GeckIt service, with the requested people, project grants and Manager. Each mentioned Slack thread has its own Manager thread. The example Slack library has a different contract; do not use its setup as the built-in channel's specification.

## Inputs

Resolve workspace, app ID, target service, allowed people and project roots from the request, current channel settings and deployment instructions. Read [Slack setup](references/setup.md) before work. Read [deployment lessons](references/deployments.md) when continuing a company bot or diagnosing duplicate apps and earlier configuration.

Use `{{said}} help`, capabilities and `channels list` when available to inspect non-secret configuration and saved-secret presence. Use `GECKIT_SOURCE_CLI` when set. For a paired target, resolve its immutable computer ID and inspect capabilities there. If the target or app is ambiguous, ask before edits. Report inaccessible configuration without guessing its contents.

## Work

1. Confirm the app ID and workspace against the intended running service. Preserve an existing app and configuration; a matching display name is insufficient. Check whether a retired bot still consumes the same app's events before enabling another service.
2. Configure Socket Mode, the app-level token, bot scopes, event subscriptions and Messages tab using the reference. Install or reinstall in the correct workspace after scope changes. Verify granted scopes rather than assuming a token changed or stayed unchanged.
3. Let the person enter tokens through GeckIt's native channel setup. Never request tokens in chat or return them in tool output. Assistant product patches exclude secrets. For headless provisioning, use an existing operator-owned credential path; do not bypass identity checks or read operator tokens.
4. Configure the built-in `channel:slack`: allowed Slack user IDs, secret detection, registered project grants and May talk to Manager. Enable an available, authenticated Manager provider when requested. An empty allowlist permits full members of the app's own workspace; it does not deny everyone. Preserve the intended access policy.
5. Enable the channel and read back its state. Fix the reported cause of setup or connection failures before retrying. Read back uncertain writes before repeating them.
6. Verify the requested Slack interactions in a test location the person authorized. Posting test messages requires permission to send there; if absent, ask the person to send the trigger and inspect its result. Do not describe a saved configuration as a working reply.

## Unknowns

Mark unconfirmed app identity, granted scopes, runtime version or live replies `Unknown`. Repository pins and old OAuth screenshots do not establish current VM state. File scopes alone do not establish file handling. Do not add exporter permissions or auto-join channels unless that separate requirement is requested.

## Output

In the person's language, report workspace/app ID, target service, access policy, configuration changes and checks observed. Distinguish Connected, real message delivery and file verification. Give remaining operator or admin steps when blocked; omit empty sections and all credentials.

## Verification

Read back the channel and Manager configuration without secrets. For authorized checks, observe a mention, reply in the same thread, earlier-thread context and a DM when required. Check requested file receive/upload separately using harmless content. Confirm unrelated threads stay separate and disallowed-user handling when a test account is available. State which checks used real Slack, simulated transport or source inspection. Fix observed failures and rerun only the affected checks.
