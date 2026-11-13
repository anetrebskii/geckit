# Feature Specification: Secrets through a link, used by a broker

**Feature Branch**: `029-secrets-broker`

**Created**: 2026-11-13

**Status**: Draft

**Input**: Alex, 2026-11-13, in a design conversation: make handing secrets and browser profiles to GeckIt simple, as Grok Bot does. The bot sends a link; the person types a secret there and picks how long it lives (one use, 15 minutes, 1 hour, 1 day, never); the AI never sees the value. The link must open from Slack and Telegram. Then: "Брокер - это отдельный процесс, который сам подставляет ключи - через него проходят CLI команды, ssh, и он сам вставляет значения в браузер." The remaining question is how secrets are stored so the AI cannot reach them by accident, on macOS, Windows and Linux. The broker installs automatically with GeckIt.

## Decisions already made

These were settled with Alex in conversation and are not open questions:

- **The broker is a separate process that does the work itself.** It types values into browser pages, runs commands and SSH with the values supplied, and returns only results. It never hands a value to the AI.
- **Threat model: accidental access.** A value must never reach the model's context, the conversation, logs, screenshots or page snapshots by accident, and a prompt injection must not get it with an ordinary command. Defeating a deliberately malicious agent running under the same system account is out of scope here; a separate system account or approval on the phone may be added later without changing how secrets are requested or used.
- **Secrets are entered through a link.** The agent asks for a secret by name; GeckIt sends a link to the place the request came from (a GeckIt conversation, Slack, Telegram, Discord). The link opens a form in any browser, including the in-app browsers of Slack and Telegram, without GeckIt installed.
- **Lifetime is chosen in the form**: This task (default), One use, 15 minutes, 1 hour, 1 day, Keep. This follows Grok Bot, where a secret lives only in its chat or is saved to the vault, and adds the timed choices Alex asked for.
- **No home-made protection.** Encryption at rest uses the operating system's credential store and a key unique to the computer. GeckIt does not invent its own cryptography or hide keys in its program.
- **Installed with GeckIt.** The broker ships inside every GeckIt installer and update; there is no separate download, step or administrator prompt.
- **Website sign-in keeps using profiles.** Signing in through `geckit browser signin` (spec 025) stays the preferred way for websites: the session is kept, not the password. Secrets cover what a session cannot: API keys, tokens, passwords typed during work, SSH keys.
- **Different from the sign-in link on purpose.** Spec 025 decided that a sign-in link opens only in a paired GeckIt app, because it shows a live browser. The secret link is a plain web page because it shows nothing from the computer and the value is encrypted for that computer in the browser before it is sent.
- **The web client is a separate task.** Using all of GeckIt from a browser without installing it is the GeckIt conversation "Веб-клиент GeckIt без установки" (45b07e34). This feature needs only the secret form page.

## Background

- **Grok Bot**: a Secure Form in chat with one checkbox, "Securely save to Bot's vault"; unchecked, "the value is kept only for that chat and expires on its own". Saved values cannot be read back, only replaced. A reported bug (2026-10-05): a password filled by the Secure Form appeared in plain text in a browser snapshot and so in the transcript.
- **1Password**: for website logins it fills and submits the form itself and the agent never sees the value; for command-line use the value reaches the agent's process.
- **GeckIt today**: host passwords, channel secrets and Telegram data are sealed with one key per data folder. On macOS that key can be read by any program of the same user without a prompt, so an agent's shell can open every sealed secret. This feature fixes that (FR-031).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The agent asks for a secret and Alex enters it from a link (Priority: P1)

A task needs an OpenAI key. The agent asks GeckIt for `openai-key`, says it is for HTTP requests to `api.openai.com` and adds a note. Alex gets a message where he is talking to GeckIt, opens the link on his phone inside Telegram, sees what the secret is for and where it will be used, types the value, picks how long to keep it and saves. The agent is told the secret is ready and when it expires. The value never appears in the conversation.

**Why this priority**: Without a way to enter a secret, nothing else here has anything to work with, and today the only way is to paste a key into the chat.

**Independent Test**: Request a canary secret, open the link from a Telegram message on a phone and from a Slack message on a computer, save it, and confirm the agent learns only the name, the use, the allowed places and the expiry.

**Acceptance Scenarios**:

1. **Given** a running task, **When** the agent requests `openai-key`, **Then** a link is posted where the conversation came from (GeckIt chat, Slack thread, Telegram chat, Discord thread) and the agent is told a link was sent.
2. **Given** the link is posted in Slack or Telegram, **When** the messenger opens it to build a preview, **Then** the link still works and the preview says only "GeckIt: a secret is requested", without the secret's name or project.
3. **Given** Alex opens the link, **When** the page loads, **Then** it shows the secret's name, the note, which computer and task asked, how it will be used and where, a hidden value field with a show button, the lifetime choices with This task selected, and Save.
4. **Given** Alex saves, **When** the computer receives the value, **Then** the page says it was saved on that computer, the link stops working, and the agent is told "openai-key is ready, expires <time>".
5. **Given** the link is older than 15 minutes or was already used, **When** anyone opens it, **Then** the page says it is no longer valid and nothing can be submitted.
6. **Given** the computer is asleep when Alex saves, **When** it wakes within 15 minutes of the save, **Then** it receives the value and the agent is told.

---

### User Story 2 - The broker uses secrets without giving them to the agent (Priority: P1)

The agent works with secrets only by name. It asks the broker to do something with one; the broker does it and returns the result.

**Why this priority**: This keeps values out of the model's context. Story 1 without it would only move the paste from the chat to a form.

**Independent Test**: With a canary secret, run each kind of use and search everything the agent received for the canary.

**Acceptance Scenarios**:

1. **Website**: **Given** a tab on an allowed site, **When** the agent asks to type `github-pass` into a field, **Then** the broker types it and answers "typed". It types only into a password field or the field named when the secret was requested, and only on the secret's sites.
2. **HTTP API**: **Given** a secret for `api.openai.com`, **When** the agent runs a program through the broker that refers to the secret by a placeholder, **Then** the real value is sent only on requests to `api.openai.com`, and a request carrying the placeholder anywhere else is refused.
3. **Command**: **Given** a secret allowed for a named program, **When** the agent runs that program through the broker, **Then** the broker starts it with the value and returns its output without the value.
4. **SSH**: **Given** an SSH key secret, **When** the agent runs `git` or `ssh` through the broker, **Then** the broker signs with the key and the key never leaves it.
5. **Given** any use is refused (expired, wrong site or host, wrong field, wrong program), **Then** the agent gets the reason, not the value.

---

### User Story 3 - Values never leak by accident (Priority: P1)

Whatever the broker runs or types, what comes back to the agent is cleaned first.

**Why this priority**: The programs the broker runs are the most likely way a value reaches the model: verbose HTTP output prints the authorization header, status commands print tokens, SSH debug and error messages print connection strings, a settings page shows the token just saved.

**Independent Test**: The canary test in SC-001.

**Acceptance Scenarios**:

1. **Given** a program's output contains a secret's value or a common encoding of it, **When** the broker returns the output, **Then** each occurrence reads `[secret:<name>]`.
2. **Given** a page shows a value the broker typed, **When** the agent reads the page's text, elements, screenshot or snapshot, or runs script in it, **Then** password fields and fields the broker filled are blank or masked and the value is removed from the page text.
3. **Given** the broker refuses or fails, **When** it reports or logs it, **Then** the message names the secret, never the value.
4. **Given** GeckIt stores a conversation or an error report, **When** it contains a known value, **Then** it is stored with `[secret:<name>]` instead.

---

### User Story 4 - Lifetime, removal and history (Priority: P2)

Alex sees which secrets exist, how long each lives and when each was used, and removes any of them.

**Why this priority**: Needed before secrets pile up; not needed for the first secret to work.

**Independent Test**: Create one secret of each lifetime and check each is gone exactly when it should be, including after the computer slept through the expiry.

**Acceptance Scenarios**:

1. **Given** a This task secret, **When** its task is moved to Done or deleted, **Then** the secret is deleted.
2. **Given** a One use secret, **When** its first use succeeds, **Then** it is deleted in the same step.
3. **Given** a timed secret, **When** anything asks for it after the expiry, **Then** the request is refused and the secret deleted, even if the computer slept through the expiry.
4. **Given** a task still needs an expired secret, **When** the agent asks again, **Then** Alex gets a new link with the same note.
5. **Given** any secret, **When** Alex removes it from the command line or Settings, **Then** it is gone at once and its next use is refused.
6. **Given** the list of secrets, **Then** it shows names, use, allowed places, expiry and last use, never values; nothing in GeckIt shows a value. A value is replaced only through a new link.
7. **Given** any use, **Then** the history records time, secret, task, kind of use and place, never the value.

---

### User Story 5 - The same on macOS, Windows and Linux (Priority: P2)

The broker comes with GeckIt and keeps secrets in each system's own credential store.

**Why this priority**: Alex's computer is a Mac; Windows and Linux computers follow.

**Independent Test**: The canary test on each system, plus copying the broker's data to another computer and checking nothing opens there.

**Acceptance Scenarios**:

1. **Given** a fresh install or an update on any of the three systems, **When** the first secret is saved and used, **Then** no separate install step and no administrator prompt appears, and secrets saved before an update still work after it.
2. **Given** the broker's data copied to another computer or restored from a backup, **When** it is read there, **Then** no value opens.
3. **Given** a Linux server without a desktop keyring, **When** secrets are used, **Then** they still work and the status says which store is in use.

---

### Edge Cases

- The link is opened twice at once: only the first Save is accepted; the second page says it was already used.
- The link is forwarded: anyone holding it within its life can submit a value, but nobody can read one through it. The page asks not to forward it, and GeckIt shows every submission on the computer with time and device.
- The credential store is locked: the broker refuses and says the store must be unlocked; secrets are never moved to a weaker place.
- A program ignores the broker's HTTP route: its request fails and the placeholder never reaches the server.
- An API response echoes the key: the output cleaning removes it.
- A very short value (under 8 characters, such as a PIN) cannot be cleaned from output reliably: the list marks it "not cleaned from output".
- Two tasks request the same name with different places: the second request is shown to Alex as a change to the existing secret, not a silent overwrite.
- GeckIt is uninstalled: secrets stay in the credential store until Alex removes them; uninstalling never deletes or exports them silently.

## Requirements *(mandatory)*

### Functional Requirements

**Requesting and entering a secret**

- **FR-001**: The agent MUST be able to request a secret with a name, a kind of use (website, HTTP API, command, SSH), the allowed sites, hosts or program, and a note. GeckIt MUST send the link to the place the conversation came from.
- **FR-002**: The link MUST open as an ordinary web page in any current browser, including Slack's and Telegram's in-app browsers, without GeckIt installed.
- **FR-003**: Opening the link MUST NOT use it up; only saving does. The link's preview MUST NOT reveal the secret's name, note or project.
- **FR-004**: The link MUST stop working after one successful save or after 15 minutes.
- **FR-005**: The form MUST show the name, note, requesting computer and task, kind of use, allowed places, a hidden value field with a show button, and the lifetime choices: This task (default), One use, 15 minutes, 1 hour, 1 day, Keep.
- **FR-006**: The value MUST be encrypted in the browser so that only the requesting computer's broker can open it. Any service in between MUST hold only the encrypted value, for at most 15 minutes, and delete it once collected.
- **FR-007**: The page MUST prove which computer's key it encrypts to, so an intermediary cannot substitute its own key.
- **FR-008**: The page MUST NOT load third-party scripts.
- **FR-009**: The computer MUST show each accepted submission (time, device, secret name) in GeckIt.

**Using secrets**

- **FR-010**: The broker MUST be a separate program shipped with GeckIt that runs only its own code and accepts requests only from GeckIt on the same computer.
- **FR-011**: The broker MUST offer no way to read a value back. Its answers are results and reasons.
- **FR-012**: Website secrets MUST be typed by the broker only into a password field or the field fixed at request time, and only on the secret's sites.
- **FR-013**: HTTP API secrets MUST be supplied by the broker only on requests to the secret's hosts, for programs it starts; requests carrying the secret's placeholder to any other host MUST be refused. The broker's route MUST be trusted only by programs it starts, never system-wide.
- **FR-014**: Command secrets MUST be given only to the program the broker starts. GeckIt MUST mark these secrets "given to a program" in the list, since that program can read the value.
- **FR-015**: SSH secrets MUST be used by the broker to sign without the key leaving it.
- **FR-016**: The broker MUST check lifetime, task, use count, place and field at every use, not only on a timer.

**Storing secrets**

- **FR-017**: Each value MUST be stored in the operating system's credential store, encrypted with a key unique to the computer, and MUST NOT open on another computer or from a backup.
- **FR-018**: Other programs of the same user MUST NOT be able to read a value from the store without a system prompt where the system supports per-program access (macOS). Where it does not (Windows, Linux), the broker MUST still keep values out of every place an agent ordinarily reads (FR-020) and refuse memory inspection where the system allows a program to refuse it.
- **FR-019**: Lifetime, task and use count MUST be stored with the encrypted value, and that copy MUST win over any readable copy, so editing a readable file cannot extend a secret.
- **FR-020**: Values MUST NOT be written to project folders, GeckIt settings, environment files, the agent's environment, logs, conversations or crash reports. The broker's folder MUST be excluded from what Claude Code and Codex sessions may read.
- **FR-021**: Where a Linux computer has no desktop keyring, the broker MUST use an encrypted file tied to that computer, and the status MUST say so.
- **FR-022**: The broker MUST keep a value decrypted only for the duration of a use and MUST NOT let it be swapped to disk or written to a crash dump.

**Cleaning output**

- **FR-023**: Before any program output or page content reaches the agent, every active value of 8 characters or more, and its base64, URL-encoded and hex forms, MUST be replaced with `[secret:<name>]`.
- **FR-024**: Reading a page's text, elements, screenshot or snapshot, or running script in it, MUST NOT reveal password fields or fields the broker filled.
- **FR-025**: GeckIt MUST apply the same cleaning to conversations and error reports it stores.

**Lifetime and management**

- **FR-026**: This task secrets MUST be deleted when their task is moved to Done or deleted; One use secrets after their first successful use; timed secrets at expiry or at the first use after it.
- **FR-027**: Alex MUST be able to list, inspect (without value) and remove secrets from the command line and in Settings, and see the history of uses.
- **FR-028**: GeckIt's built-in guidance for its AI MUST teach requesting secrets by name and using them through the broker, and never asking for a secret in chat.

**Installation**

- **FR-029**: The broker MUST be included in every GeckIt installer and update on macOS, Windows and Linux, need no administrator rights, and keep working secrets across updates without a prompt.
- **FR-030**: GeckIt MUST check that the broker it starts is the one it shipped and refuse to use a changed one, saying why.

**Existing sealed data**

- **FR-031**: The key that seals existing host passwords, channel secrets and Telegram data MUST move under the same protection as broker secrets, so on macOS no other program can read it without a prompt.

### Key Entities

- **Secret**: name, kind of use, allowed sites, hosts or program, note, lifetime, expiry, task, use count, last use, the request it came from. The value exists only in the credential store.
- **Secret request**: name, note, kind of use, allowed places, requesting computer and task, the computer's key, link, link expiry, state (sent, saved, collected, expired).
- **Use record**: time, secret, task, kind of use, place, result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The canary test passes on macOS, Windows and Linux: a secret with a unique canary value is used every way (typed into a page that then shows it, a verbose HTTP request, a program that prints its environment, SSH in debug mode, a forced broker crash), and the canary and its encodings appear nowhere in what the agent received, the conversation, GeckIt's and the broker's logs, or crash reports.
- **SC-002**: On macOS, a Terminal command that reads a broker item, or the existing sealing key, gets no value without a system prompt.
- **SC-003**: Broker data copied to a second computer opens nothing there.
- **SC-004**: Alex can go from the agent's request to a working secret, entered from a Telegram message on his phone, in under one minute.
- **SC-005**: Every lifetime choice removes the secret within one use of its end, including when the computer slept through the expiry.
- **SC-006**: No step of installing, updating or using secrets asks for administrator rights on any system.

## Assumptions

- The relay that carries the encrypted value is GeckIt's existing `signal` project, extended with the one public page and the storage it needs.
- Messages with the link reuse the channels GeckIt already runs (Telegram, Slack, Discord) and the GeckIt conversation itself.
- The threat model is accidental exposure. A deliberate attack on the broker under the same user can still succeed on Windows and partly on Linux; a separate system account or phone approval is a later option.
- Website sign-in through `geckit browser signin` (spec 025) is unchanged.
- The web client without installation is out of scope (GeckIt conversation 45b07e34).
