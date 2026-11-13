# Contract: `geckit secrets` and secret use from the CLI

What the agent and Alex type. Every command answers in plain sentences like the rest of `geckit`; `--json` gives the same as JSON. No command prints a value.

## Request

```text
geckit secrets request <name> --use website|http|command|ssh --for <places> [--field "<element>"] --note "<what for>"
```

- `<places>`: comma-separated. website: origins (`https://github.com`); http: hosts (`api.openai.com`, `*.stripe.com`); command: program (`psql`); ssh: host patterns (`github.com`).
- Answers: `Sent a link for openai-key to <where>. It works for 15 minutes. You will be told when it is saved.` When the secret already exists and is active: `openai-key is already saved and expires <time>; nothing was sent.` Add `--replace` to send a link anyway.
- When saved, the conversation receives: `openai-key is ready (http, api.openai.com), expires <time>.`

## Status and listing

```text
geckit secrets list
geckit secrets show <name>
geckit secrets status
```

- `list`: one line per secret: name, use, places, lifetime and expiry, last use, `given to a program` for command secrets, `not cleaned from output` for short values.
- `show`: the same plus the last 20 use records.
- `wait <name>`: polls every 3 seconds, up to 15 minutes, until the person has saved the secret; exit 2 when they did not.
- `status`: broker running or not and why, store in use (`keychain`, `dpapi`, `secret-service`, `file-systemd-creds`, `file-keyfile`), version.

## Removing

```text
geckit secrets revoke <name>
geckit secrets revoke --all
```

## Using

```text
geckit browser type <tab> <ref> --secret <name>
geckit secrets run [--secret <name>]... [--env NAME=secret:<name>]... -- <command> [args...]
```

- `browser type --secret`: the broker types the value; answers `typed` or the refusal reason. `<ref>` must be a password field, or match the field fixed at request time, on an allowed origin.
- `secrets run`: the broker starts `<command>` and streams its cleaned output and exit code back.
  - For `http` secrets named with `--secret`, the command gets the broker's proxy and certificate; `--env NAME=secret:<name>` sets `NAME={{secret:<name>}}`, a placeholder the proxy replaces on allowed hosts.
  - For `command` secrets, `--env NAME=secret:<name>` sets the real value in that command's environment only, if `<command>` matches the secret's program.
  - For `ssh` secrets named with `--secret`, the command gets `SSH_AUTH_SOCK` of the broker's agent.
- Refusals: `openai-key has expired; geckit secrets request openai-key --replace sends a new link.`, `openai-key is not allowed for example.com.`, `psql-pass is for psql, not bash.`, `The credential store is locked; unlock it and try again.`

## Exit codes

`0` done; `2` refused (expired, place, field, program); `3` broker unavailable or store locked; `1` other errors.
