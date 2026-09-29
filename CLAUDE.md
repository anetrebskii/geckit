# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GeckIt is an Electron desktop app with three things in it: correcting a piece of text, dictating one, and a Claude Code client that runs on the person's own Claude subscription rather than an API key.

## Repository Structure

- **`client/`**: the app (electron-vite + React 19 + TypeScript, hand-written CSS)
- **`mobile/`**: the iPhone app (Capacitor), built from the client's own Chat sources and React
- **`signal/`**: the Firebase project `geckit-signal`: Firestore rules for the rooms the phone and the Mac meet in, and the `ice` function that hands out the relay

## Build Commands

From `client/`:

```bash
npm run dev            # electron-vite dev, the app with hot reload
npm run build          # build main, preload and the three renderers into out/
npm run package        # build then electron-builder (dmg, exe, AppImage)
npm run lint           # eslint
npm run test           # vitest
npm run typecheck      # tsc over the node and web configs
```

From `mobile/` (needs `client/node_modules`): `npm run build` into `www/`, `npm run ios` to sync and open Xcode.

## Architecture

### Three windows

- **Panel** (`renderer/panel.html`): the small always-there window, frameless with vibrancy. Two tabs, Correct and Transcribe, and a button that opens Chat.
- **Chat** (`renderer/chat.html`): its own resizable window, sidebar plus transcript plus composer.
- **Voice** (`renderer/voice.html`): the frameless capsule the dictation shortcut opens.

`main/windows.ts` owns all three and remembers their bounds. `main/index.ts` holds every IPC handler and the two global shortcuts: `Cmd/Ctrl+C+D` picks up the selection and fills Correct, `Cmd/Ctrl+Alt+V` opens the dictation capsule and pastes back what it heard.

### Sessions

`main/sessions/` drives the person's own `claude` binary as a subprocess: `claude -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --permission-mode <manual|auto|plan> --permission-prompt-tool stdio`. The env is scrubbed of `ANTHROPIC_API_KEY` and friends, so a session can only ever run on the plan.

- `claude.ts` spawns and drives one process; `claude-read.ts` is the pure stream reader and is what the tests cover.
- `disk.ts` reads `~/.claude/projects/<slugged path>/<id>.jsonl`, which is how a conversation started in a terminal shows up in the sidebar and resumes here.
- The mode (`manual` / `auto` / `plan`) is Claude Code's own and is handed over with `--permission-mode`: in `auto` its own safety check decides what runs. Whatever it still asks about reaches GeckIt over stdio and is drawn as a card; `rule.ts` reads what a request wants into what the card says. The person's own `settings.json` rules and `PreToolUse` hooks still come first, so a command allowed there never reaches a card. A mode chosen for a running session holds at once: Manual and Auto are switched over the same channel with `set_permission_mode`, and a card waiting when it goes into Auto is handed back to be tried again under the tool's own check. Plan is still a new start at the next message. A change of model is always a new start with `--resume`, and the model menu says what that costs, because the new model has no cache of the conversation and reads all of it again.
- `index.ts` keeps live sessions by id, each with its own project root, and fans items out to the Chat window.
- How many conversations work at once is `workingAtOnce` (6 by default, 0 is no limit), and the rule is in `main/lineup.ts`: a conversation holds a slot only while it works. A message to a conversation not working goes at once where fewer are working than the limit, and otherwise is queued in it, the card saying "Waiting for a slot" (a new task is a conversation at once, kept in its note as `unborn` until its first message goes). When a job is done, `Sessions` waits a random 3 to 10 s, then looks at the cards from the top of In progress (`progressOrder`) and sends the first queued message of as many as there is room for, the one that just finished included. Dragging cards only reorders. The design is `docs/ux/conversation-queue.md`.
- What Claude Code runs in the background (commands, Monitor watches, helpers) arrives as `task_*` system lines and is kept per session, ended ones too until cleared, as the terminal's `/tasks` keeps them. `tasks.ts` reads what one printed from the tool's own output file, and a helper's conversation from its transcript. Stopping and sending a waiting command there go over the control channel as `stop_task` and `background_tasks`.
- `usage.ts` asks a `claude` that is given no message for `get_usage` and `get_context_usage` over the same stdio channel, so the status bar at the bottom of Chat shows the plan's five-hour and weekly windows and each model's context size without waiting for a turn. Cost comes from the `cost-state` lines the tool writes into the session file. `main/git.ts` reads `git status --porcelain=v2 --branch` for the project's branch and changes.
- Which Claude Code answers is `claude --version`, with where the program is read into how it was installed (`account.ts`), shown in the model menu and along the bottom of Chat. It is looked at again at most once a minute, when the plan is measured or a model menu opens, and a new version has the models and every context size asked again: an older build names fewer models, and measures one it does not know at its default window. The models it names and cannot run (`unavailable_models`) are listed greyed, with its own reason.

### Hosts

A conversation can run on another computer reached over SSH, a host; this computer is called Local, the same on every system. A project on a host has a root of the form `ssh://<host id><path>`, so everything keyed by a root (lists, colours, profiles, favourites) works unchanged, and the places that reach the outside world ask `main/hosts/route.ts` whether a root is local or on a host.

- `hosts/ssh.ts` starts the person's own `ssh` (their config, agent and jump hosts hold), sharing one connection per host through ControlMaster except on Windows. `hosts/askpass.ts` makes ssh ask GeckIt instead of a terminal (`SSH_ASKPASS` running GeckIt's own binary as Node, a socket with a token), and `hosts/hosts.ts` turns each question into a card: a password, a passphrase, a code, trust in a key. A remembered password is encrypted with `safeStorage` in `hosts/secrets.json`, never in the settings.
- `hosts/run-script.ts` holds every script run on a host. `claude` there is started apart from the connection (a FIFO in, a file out, its own session, `env -u` the off-plan variables), and `hosts/run.ts` reads the file from the byte it reached, so a dropped connection, a closed lid or GeckIt quitting lose nothing; `hosts/runs.json` has the runs picked up again at the next start (`Sessions.reattach`). A run nobody looked at and that said nothing for 12 h is stopped by its reaper.
- `hosts/disk.ts` lists a host's conversation files by the two ends of each changed file, and keeps a copy of each opened one here, adding only what grew, so `sessions/disk.ts` reads them unchanged.
- `hosts/forward.ts` carries a `localhost` link said in a conversation on a host to this computer over ssh.
- A host that is not connected is not reached to list the board: `hosts/disk.ts` answers the last listing, kept in `hosts/<id>/listed/`, and the copies here, and the projects are read again when it comes up. Search and Hidden read those copies too. Edit is `Hosts.update`: a new name alone is saved, a change to how it is reached is checked again first.
- On the phone a host is only what it is paired with, and every "Mac" there says host. The hosts this computer reaches come with it as the labels of their projects (`chat/PhoneHosts.tsx`, `chat/PhoneHostSheet.tsx`): a folder on one is added under Where, what ssh asks is answered in a sheet, and a host's `localhost` page opens through the forward here (`hosts.forwardLink`), the moved port said over the page's title. Adding, changing, connecting or disconnecting one is on the computer; the phone connecting over SSH itself is a topic of its own.
- The design is `docs/ux/remote-hosts.md` and `docs/ux/remote-hosts-phone.md`, the prototypes `docs/design/remote-hosts.html` and `docs/design/remote-hosts-phone.html`; the Spec Kit artifacts are in `specs/001-remote-hosts/` and `specs/002-hosts-phone/`.

### Correct

Two engines, switched in the footer. `plan` runs `claude -p --restricted --no-session-persistence --output-format json --append-system-prompt <instruction>` with the text on stdin (`main/correct.ts`). `key` goes through `main/providers.ts` to OpenAI, Anthropic or OpenRouter, for when the process start time matters.

### The phone

With Phone on in Settings, main opens a hidden `peer` window, since WebRTC lives in a renderer and not in main. It listens in Firestore (`signal/`) for offers sealed with the key in the Settings QR (`shared/pairing.ts`, `renderer/src/link.ts`), answers each, and relays the phone's calls to main over `peer:call` against the list in `phoneCalls()`, and main's tells back. The app in `mobile/` scans the QR, dials, and installs a `window.geckit` built over the link (`renderer/src/phone.ts`) before loading the Chat window with `html.phone`. Cloudflare TURN is used only when `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` are in the `ice` function's environment (`signal/functions/.env`, not committed); without them it hands out STUN only. A file pressed in a conversation on the phone is read on the Mac (`main/file-shown.ts`, a page with what it links to put inside it) and shown in `chat/FileView.tsx`. A `http://localhost` link pressed on the phone opens in the app's own web view (`mobile/ios/App/App/LocalPage.swift`) as `geckit-local://`, and each request it makes is carried over the link to `local.fetch` and made on the Mac (`main/local-page.ts`), which follows redirects and keeps cookies itself, since WebKit does neither for a scheme of its own; websockets, and so hot reload, do not cross. With the app closed and nobody at the Mac for a minute, a notice goes to the phone as a push (`main/push.ts`): sealed with the pairing key, carried by the `push` function in `signal/` to APNs (its key in `signal/functions/.env`, not committed), and opened on the phone by the Notification Service Extension in `mobile/ios/App/NotificationService/`, which reads the keys from the App Group the app leaves them in. What it looks like and why is in `docs/ux/phone.md` and `docs/ux/phone-push.md`.

### Settings

A JSON file in `app.getPath('userData')`, owned by the main process (`main/store.ts`), read and written over IPC and broadcast to every window. Not `localStorage`: three windows and main need the same values.

### Counting and errors

Both off until asked, as in Notula. On the first start a card asks whether GeckIt may count what gets used (`analytics`, `analyticsAsked`); `main/analytics.ts` and the phone send through `shared/counting.ts` only after a Yes. Errors are caught in main (`main/errors.ts`) and in each window (`renderer/src/errors.ts`), redacted and held in `errors.json` by `shared/reporting.ts` (Notula's `@notula/reporting`), and a card shows what would be sent with Never, Later and Send; Sentry receives them only while `sendErrors` is on. The Sentry project is `geckit` in the `notula` organisation, its DSN written into `electron.vite.config.ts` and `mobile/vite.config.ts`, which `GECKIT_SENTRY_DSN` overrides at build time. The phone asks both questions for itself and keeps the answers and its held errors on the phone (`renderer/src/phone-errors.ts`, `OWN` in `phone-calls.ts`). The cards are `ui/Consent.tsx`.

## Key Files

- `client/src/shared/api.ts`: the whole main/renderer contract
- `client/src/main/sessions/claude-read.ts`: the stream reader
- `client/src/main/index.ts`: IPC and shortcuts
- `client/src/renderer/src/chat/useChat.ts`: chat window state
- `client/src/renderer/src/styles.css`: the tokens and every component rule

## CI/CD

`.github/workflows/publish.yml` builds and publishes macOS, Windows and Linux on push to `main` when `client/` changes, as a prerelease: that is the Development channel. `.github/workflows/promote.yml`, run by hand, marks one release Latest, which is the Stable channel, and adds copies of its installers named without the version, which the README's `releases/latest/download/<name>` buttons fetch. The channel a copy follows is `updateChannel` in Settings, Version; `main/updates.ts` reads Development with `allowPrerelease`.

## Notes

- Run from the source (`npm run dev`), GeckIt keeps its data in `geckit-local` beside the installed app's `geckit` (`main/local-data.ts`), so both run at once. The first start copies the installed settings and notes, with the phone off; its command is `~/.geckit/bin/geckit-local`, and `GECKIT.md` stays the installed app's.
- Node 22+ (electron-vite 5).
- The package is ESM: `"type": "module"` in `client/package.json`.
- Tests run against recorded `claude` output in `client/test/fixtures/`, so they cost nothing.
- macOS users may need `xattr -d com.apple.quarantine /Applications/GeckIt.app` after installing.
