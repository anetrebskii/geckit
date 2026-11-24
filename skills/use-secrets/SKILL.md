---
name: use-secrets
description: Ask the person for a password, API key, token or SSH key through a GeckIt link, then use it without seeing it - typed into a website's password field, given to a command, sent in HTTP requests or used for SSH. Use whenever work needs a credential.
---

# Use secrets through GeckIt

Never ask the person to paste a password, key or token into the conversation, or read one from a file, an environment variable or the screen. Ask by link, use by name; you never see the value.

## Purpose

Get a credential the work needs from the person and use it only where it is allowed. Creating accounts, rotating keys and changing a secret's places are left to the person.

## Inputs

- What the work needs: which credential, for which site, host, program or SSH server.
- `{{said}} secrets list` shows saved secrets with their use, places and retention period. Match an existing secret before requesting a new one.
- A new secret gets a name in lowercase and hyphens naming the service and account, such as `github-work` or `openai-key`, and one use:
  - `website`: username and password. Request or use it only after opt-in for the site and account. Places are origins, such as `https://github.com`.
  - `http`: an API key or token sent in requests; places are hosts, such as `api.openai.com` or `*.stripe.com`;
  - `command`: a value a program reads from its environment; places are program names, such as `psql`;
  - `ssh`: a private key; places are hosts, such as `github.com`.
- When the service, the account or the places cannot be told from the request, ask before requesting.

## Work

1. `{{said}} secrets request <name> --use <use> --for <places> --note "<what for>"` prints a link; `--field "<element>"` names a website's password field, `--replace` sends a new link for a saved one.

   For a website password, send one credential link. Add `--user <account>` if known. Otherwise, collect the username or email on the same form as the password. The person selects the retention period. Leave one-time codes to the person in the browser.
2. Put the link as printed in the final message of this turn, in a private reply or direct message. Say what it is for, that it opens once, and when it expires. From a shared channel, ask the person to continue in a direct message.
3. End the turn after sharing the link. GeckIt resumes this conversation when the secret is saved. Do not schedule a timer, poll, or run `{{said}} secrets wait <name>`.
4. Use it by name:
   - website: type the username `secrets list` shows after `as` with an ordinary `{{said}} browser type`, then `{{said}} browser type <tab> <ref> --secret <name>` types the password into a password field on its own site;
   - http: `{{said}} secrets run --env NAME=secret:<name> -- <command>`; NAME holds a placeholder the broker replaces with the value only on the secret's hosts;
   - command: the same `run`; NAME holds the value, for the named program only;
   - ssh: `{{said}} secrets run --secret <name> -- <command>` gives the command the broker's ssh-agent.

   Output comes back with the value and its encoded forms removed.

`{{said}} secrets status` says whether secrets work here, `show <name>` lists its last 20 uses, and `revoke <name>` removes it (`revoke --all` removes every one).

## Unknowns

A refusal says why: a secret works only on its own places and only for the task that asked for it, unless the person chose to keep it. Report the refusal as it came back; do not widen the places, rename the secret or request it again to get around it. Do not invent a value, a place or a name the person would not recognise. If the person reports an expired link, offer a replacement.

## Output

In the person's language: the link and what it is for; once used, which secret was used where, and the result. Never print, log or repeat a value or any part of one.

## Verification

After GeckIt resumes, use the saved name from the completion message. Confirm the result the work needed: the page is signed in, the request succeeded, or the command exited with 0. `[secret:<name>]` in output is the broker's mask, not an error.
