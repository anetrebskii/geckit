# Quickstart: validating secrets through a link

**Spec**: [spec.md](spec.md) | **Contracts**: [cli](contracts/cli.md), [broker](contracts/broker-protocol.md), [relay](contracts/relay.md)

## Prerequisites

- GeckIt built from this branch with the broker (`client/scripts/broker.sh`, then `npm run dev` or `npm run package`).
- `signal/` deployed to a test Firebase project, or the emulators (`firebase emulators:start` in `signal/`) with `GECKIT_SIGNAL_URL` pointing to them.
- A Telegram or Slack channel connected in Settings > Channels, and a phone.
- A canary value, for example `canary-7f3c9a2e-5b1d`, used nowhere else.

## 1. Request and save (US1)

1. In a GeckIt conversation started from Telegram, ask the agent to run `geckit secrets request canary --use http --for httpbin.org --note "canary test"`.
2. Expected: a Telegram message with the link; the preview says only "GeckIt: a secret is requested".
3. Open the link on the phone in Telegram's browser. Expected: name `canary`, note, computer, task, "HTTP API, httpbin.org", lifetime This task selected.
4. Type the canary, pick 15 minutes, Save. Expected: "Saved on <computer>"; GeckIt shows the submission; the conversation gets `canary is ready (http, httpbin.org), expires <time>.`
5. Open the link again. Expected: "This link is no longer valid."

## 2. Use without seeing (US2, US3)

Run each through the agent and keep everything it receives:

```bash
geckit secrets run --secret canary --env TOKEN=secret:canary -- sh -c 'curl -sv -H "Authorization: Bearer $TOKEN" https://httpbin.org/headers'
geckit secrets run --secret canary --env TOKEN=secret:canary -- sh -c 'curl -sv -H "Authorization: Bearer $TOKEN" https://example.com/'
```

- Expected: the first succeeds and its output shows `[secret:canary]` where httpbin echoes the header; the second is refused with `canary is not allowed for example.com.`

Website: request `canary-site --use website --for https://httpbin.org`, open `https://httpbin.org/forms/post` in a test browser, add a password field via `eval`, then `geckit browser type <tab> <ref> --secret canary-site`; then `read`, `text`, `shot`, `eval 'document.querySelector("[data-geckit-secret]").value'`. Expected: typed; every answer masks the value.

Command and SSH: request a `command` secret for `env` and run `geckit secrets run --env X=secret:canary-cmd -- env`; request an `ssh` secret with a test key and run `geckit secrets run --secret ssh-test -- ssh -vvv -T git@github.com`. Expected: output shows `[secret:...]`, never the value or key.

## 3. Canary search (SC-001)

After the runs above and `kill -SEGV <broker pid>`:

```bash
grep -rF 'canary-7f3c9a2e-5b1d' ~/.claude/projects ~/.codex/sessions "<GeckIt data folder>" "<broker folder>" ~/Library/Logs/DiagnosticReports 2>/dev/null
```

Also search its base64 and hex forms. Expected: no match anywhere.

## 4. Store isolation (SC-002, SC-003)

- macOS: `security find-generic-password -s org.anetrebskii.geckit.broker -a canary -w` from Terminal. Expected: a system prompt, no value printed when denied. Same for the vault key service name after migration (FR-031).
- Copy the broker folder and, on Linux file store, the sealed key to another computer; run `geckit secrets list` there. Expected: nothing opens.

## 5. Lifetime (US4, SC-005)

- `once`: one successful use, then `geckit secrets list` no longer shows it.
- `15m`: put the computer to sleep for 20 minutes; on wake, a use is refused with "expired" and the secret is gone.
- `task`: move the conversation card to Done; the secret is gone.
- `geckit secrets revoke canary`: next use refused.

## 6. Install and update (US5, SC-006)

Install the packaged build on each system without administrator rights, save a `keep` secret, install the next build over it, use the secret. Expected: no prompts on install or update; the secret still works; `geckit secrets status` names the store.
