---
type: spec
---

# Secrets: a link to enter one, a broker to use it

Spec: [specs/029-secrets-broker/spec.md](../../specs/029-secrets-broker/spec.md). Layout prototype: not made yet (see design handoff).

## Why

Today the only way to give a conversation an API key or a password is to paste it into the chat, where it stays in the model's context, the transcript and the provider's history. A secret should reach the computer without passing through the conversation, and be used there without the AI ever holding it.

## Path to a result

- **Entry**: the agent needs a secret it does not have. It runs `geckit secrets request` and puts the link in its reply. Alex never starts this himself; he can see and remove secrets in Settings.
- **Result**: the agent is told the secret is ready, uses it by name, and gets results.
- **Readiness**: a secret is ready when the computer has collected and stored it, not when the page says Saved. The page says Saved when the relay has the sealed value; the conversation is told "ready" only after the broker stored it.
- **Shape**: one web page, one message in the conversation, one Settings section. No wizard.

## The message in the conversation

The agent's reply carries the link on its own line:

> I need an OpenAI key for the cover images. Enter it here, the link works for 15 minutes:
> https://geckit-signal.web.app/s/#…

GeckIt's chat also shows a notice under the reply: **Secret requested: openai-key** · HTTP API · api.openai.com · link valid until 14:17.

## The page

States, in order:

| State | What it shows |
| --- | --- |
| Loading | GeckIt mark and "Checking the link…" |
| Ready | Title **Enter a secret for GeckIt**. Under it: "Do not forward this link." Then a card: **openai-key** (large), the note, "Asked by alex-mbp for *time2you: cover images*", "Used for: HTTP API on api.openai.com". Field **Value**, hidden, with a show/hide eye button. Group **Keep it**: This task (selected), One use, 15 minutes, 1 hour, 1 day, Keep. Button **Save**. Footnote: "The value is encrypted for alex-mbp on this page. GeckIt's AI never sees it." |
| Saving | Button reads "Saving…", fields disabled |
| Saved | Check mark, **Saved for alex-mbp**, "You can close this page." |
| Already used | **This link was already used.** "Ask the agent for a new one if you need to change the secret." |
| Expired | **This link has expired.** "Nothing was saved from it. Ask the agent for a new link." |
| Not valid | **This link is not valid.** (bad fragment, card signature fails, unknown request) |
| Offline | **No connection.** "Your value was not sent." Button **Try again**; the typed value stays in the field. |

- Kinds read: Website, HTTP API, Command, SSH key. Places read as a comma list; for Website the origin without `https://`.
- For SSH key the value field is a multi-line text area.
- **Save** is disabled while the value is empty. Enter in the single-line field saves.
- Focus starts in Value. Tab order: Value, eye, lifetime options, Save.
- Phone widths first: the page is one column, 16 px side padding, the Save button full width at the bottom. Light and dark follow the system.
- The page never shows the value after Saved, and the browser is asked not to remember it (`autocomplete="off"`, `type=password`).

## On the computer

- When a value is saved, GeckIt shows a notice (desktop notification and the conversation's notice line): **openai-key was entered** · from iPhone, Telegram browser · 14:05. The device is the page's user agent, shortened.
- The conversation then gets: `openai-key is ready (http, api.openai.com), expires 15:05.`

## Settings > Secrets

A section after Web Browser.

- List, one row per secret: name, kind and places, "expires 15:05" / "until this task is done" / "after one use" / "kept", last use ("used 2 min ago by *time2you: cover images*"). Badges: **Given to a program** for Command secrets; **Not cleaned from output** for short values.
- Row menu: **History** (the last 20 uses: time, task, place, result), **Remove**.
- **Remove** asks: "Remove openai-key? Conversations that use it will be refused until it is entered again." Buttons **Remove**, **Cancel**.
- Footer line: the store in use ("Stored in the macOS Keychain on this computer", "Stored in files sealed with Windows DPAPI on this computer", "Stored in the system keyring on this computer", "Stored in an encrypted file on this computer"). When the broker is not running: "Secrets are unavailable: <reason>." with **Try again**.
- Empty state: "No secrets yet. When a conversation needs a key or a password, it sends you a link to enter it."
- There is no Add button: secrets come from a conversation's request, so each has a purpose and places. There is no Show value.

## What stays silent

- Uses that succeed are not announced; they appear in History.
- Expiry is not announced. A conversation that needs an expired secret asks again, and Alex sees a new link.

## Wording rules

- "Secret" everywhere, never "credential", "token" or "password" as the general term.
- Lifetime choices are exactly: This task, One use, 15 minutes, 1 hour, 1 day, Keep.
- The same text on macOS, Windows and Linux, except the store's name in the Settings footer.
