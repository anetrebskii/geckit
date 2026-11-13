---
name: use-secrets
description: Ask the person for a password, API key, token or SSH key through a GeckIt link, then use it without seeing it - typed into a website's password field, given to a command, sent in HTTP requests or used for SSH. Use whenever work needs a credential.
---

# Use secrets through GeckIt

Never ask the person to paste a password, key or token into the conversation, and never read one from a file, an environment variable or the screen. Ask for it by link and use it by name; you never see the value.

## Purpose

Get a credential the work needs from the person and use it only where it is allowed. Creating accounts, rotating keys at a provider and changing where a secret may be used are left to the person.

## Inputs

- What the work needs: which credential, for which site, host, program or SSH server.
- `{{said}} secrets list` shows saved secrets with their use, places and keeping period. A saved one with the right use and places is used as it is.
- A new secret gets a name in lowercase and hyphens naming the service and account, such as `github-work` or `openai-key`, and one use:
  - `website`: a password typed into a sign-in page; places are origins, such as `https://github.com`;
  - `http`: an API key or token sent in requests; places are hosts, such as `api.openai.com` or `*.stripe.com`;
  - `command`: a value a program reads from its environment; places are program names, such as `psql`;
  - `ssh`: a private key; places are hosts, such as `github.com`.
- When the service, the account or the places cannot be told from the request, ask before requesting.

## Work

1. `{{said}} secrets request <name> --use <use> --for <places> --note "<what for>"` prints a link. `--field "<element>"` names the field for a website secret; `--replace` sends a new link for a saved one.
2. Put the link, as it is printed, in the final message of this turn, or in the thread the person wrote from, never only in a command's output or a note between steps, which the chat folds away. Say what it is for, and that it opens once, for the minutes the command printed.
3. `{{said}} secrets wait <name>` waits up to 15 minutes. If it runs in the background, end the turn with the link still in that final message.
4. Use it by name:
   - website: `{{said}} browser type <tab> <ref> --secret <name>` types it into a password field on its own site;
   - http: `{{said}} secrets run --env NAME=secret:<name> -- <command>`; NAME holds a placeholder the broker replaces with the value only on the secret's hosts;
   - command: the same `run`; NAME holds the value, for the named program only;
   - ssh: `{{said}} secrets run --secret <name> -- <command>` gives the command the broker's ssh-agent.

   Output comes back with the value and its encoded forms removed.

`{{said}} secrets status` says whether secrets work here, `show <name>` lists its last 20 uses, and `revoke <name>` removes it.

## Unknowns

A refusal says why: a secret works only on its own places and only for the task that asked for it, unless the person chose to keep it. Report the refusal as it came back; do not widen the places, rename the secret or request it again to get around it. Do not invent a value, a place or a name the person would not recognise. When `wait` ends without the secret, say so and offer a new link with `--replace`.

## Output

In the person's language: the link and what it is for; once used, which secret was used where, and the result. Never print, log or repeat a value or any part of one.

## Verification

After `wait`, check that `secrets list` shows the secret. After use, confirm the result the work needed: the page is signed in, the request succeeded, the command exited with 0. `[secret:<name>]` in output is the broker's mask, not an error.
