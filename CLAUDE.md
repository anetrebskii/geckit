# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GeckIt is an Electron desktop app with three things in it: correcting a piece of text, dictating one, and a Claude Code client that runs on the person's own Claude subscription rather than an API key.

## Repository Structure

- **`client/`**: the app (electron-vite + React 19 + TypeScript, hand-written CSS)
- **`site/`**: marketing website (Next.js + Tailwind) - a separate project
- Root `package.json`: only Firebase, for deploying the site

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

From `site/`: `npm run dev`, `npm run build`.

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
- `usage.ts` asks a `claude` that is given no message for `get_usage` and `get_context_usage` over the same stdio channel, so the status bar at the bottom of Chat shows the plan's five-hour and weekly windows and each model's context size without waiting for a turn. Cost comes from the `cost-state` lines the tool writes into the session file. `main/git.ts` reads `git status --porcelain=v2 --branch` for the project's branch and changes.

### Correct

Two engines, switched in the footer. `plan` runs `claude -p --restricted --no-session-persistence --output-format json --append-system-prompt <instruction>` with the text on stdin (`main/correct.ts`). `key` goes through `main/providers.ts` to OpenAI, Anthropic or OpenRouter, for when the process start time matters.

### Settings

A JSON file in `app.getPath('userData')`, owned by the main process (`main/store.ts`), read and written over IPC and broadcast to every window. Not `localStorage`: three windows and main need the same values.

## Key Files

- `client/src/shared/api.ts`: the whole main/renderer contract
- `client/src/main/sessions/claude-read.ts`: the stream reader
- `client/src/main/index.ts`: IPC and shortcuts
- `client/src/renderer/src/chat/useChat.ts`: chat window state
- `client/src/renderer/src/styles.css`: the tokens and every component rule

## CI/CD

`.github/workflows/publish.yml` builds and publishes macOS, Windows and Linux on push to `main` when `client/` changes.

## Notes

- Node 22+ (electron-vite 5).
- The package is ESM: `"type": "module"` in `client/package.json`.
- Tests run against recorded `claude` output in `client/test/fixtures/`, so they cost nothing.
- macOS users may need `xattr -d com.apple.quarantine /Applications/GeckIt.app` after installing.
