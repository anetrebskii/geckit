# Implementation Plan: Conversations on remote hosts

**Branch**: `001-remote-hosts` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-remote-hosts/spec.md`; agreed UX in `docs/ux/remote-hosts.md`, prototype `docs/design/remote-hosts.html`.

## Summary

A project's root becomes an address that may name a host: `ssh://<host id><absolute path>` for a folder on a host, a plain path for a local one. Everything that already takes a root keeps taking a string; at the edges where GeckIt touches the outside world (spawning `claude`, reading Claude Code's conversation files, git, `!` commands, files, the terminal) a router sends a remote root through a new `main/hosts/` module built on the person's own OpenSSH client. `claude` on a host is started detached from the connection (input from a FIFO, output appended to a file, its own session), so it outlives the connection; GeckIt reads the file from the byte it last saw, which is how a reconnect catches up without loss or repeats. Conversation files on a host are mirrored locally by appending only what grew, so the existing parsers in `disk.ts` read them unchanged. SSH questions (password, passphrase, host key) reach GeckIt through an askpass helper and are answered on cards; a remembered password is encrypted with Electron `safeStorage` (Keychain, DPAPI, libsecret) and kept outside the settings file. The renderer groups projects by host, shows the host chip, the out-of-reach lines and the new Settings, Hosts section and Add a host sheet exactly as the prototype draws them.

## Technical Context

**Language/Version**: TypeScript 5 (ESM), Node 22 in Electron's main process, React 19 in the renderers.

**Primary Dependencies**: Electron (`safeStorage`, `ipcMain`), electron-vite; the person's OpenSSH client (`ssh`); no new npm dependency.

**Storage**: `settings.json` gains `hosts` (no secrets); `userData/hosts/secrets.json` holds `safeStorage`-encrypted passwords; `userData/hosts/runs.json` holds the detached runs to reattach; `userData/hosts/<host>/projects/...` mirrors conversation files; on the host, `~/.geckit/runs/<conversation id>/` holds `in` (FIFO), `out`, `err`, `pid`.

**Testing**: vitest over pure functions (`client/test/*.test.ts`), fixtures under `client/test/fixtures/`; an end-to-end check against the owner's second computer at 192.168.3.33.

**Target Platform**: GeckIt on macOS, Windows, Linux; hosts with a POSIX shell (macOS, Linux).

**Project Type**: Desktop application (Electron: main, preload, three renderers, the phone's copy of Chat).

**Performance Goals**: A reused connection opens a conversation in under 1 s; a reconnect catches up in one read; listing a host's project reads only the two 64 KB ends of each changed file.

**Constraints**: Nothing installed on the host; no secret in `settings.json`; the environment handed to `claude` on the host is scrubbed of API keys (`env -u`); Windows has no SSH multiplexing, so each operation opens its own connection there.

**Scale/Scope**: Up to ~10 hosts, ~200 conversations per project listed, several live conversations per host.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan keeps it | Status |
|---|---|---|
| I. The Person's Own Plan | `claude` on the host runs under `env -u ANTHROPIC_API_KEY -u ...` (the same list as `planOnly`); passwords only through `safeStorage` in `hosts/secrets.json`, never `settings.json`; nothing reads the host's credentials | Pass |
| II. One Contract | New calls `hosts.*` in `preload/index.ts` and main handlers; hosts in `Settings.hosts` broadcast by `store.ts`; phone reaches them through `phoneCalls()` (`hosts.list`, `hosts.folders`) | Pass |
| III. Recorded Output | Address parsing, the run script, catch-up offsets, askpass prompt reading, host state rules, remote listing parsing are pure and tested with fixtures; process code stays thin | Pass |
| IV. UX Before Pixels | Implements `docs/ux/remote-hosts.md` as agreed; any deviation goes back into it | Pass |
| V. Every System, One Word | "Local" and "host" in every string; OpenSSH on all three systems; Windows falls back to one connection per operation | Pass |
| VI. Tokens Only | New rules in `styles.css` use existing tokens | Pass |

Post-design re-check (after Phase 1): unchanged, all Pass.

## Project Structure

### Documentation (this feature)

```text
specs/001-remote-hosts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ipc.md
│   └── host-run.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/shared/
├── hosts.ts                # Host, HostView, HostState, address parse/format, labels (pure)
└── api.ts                  # Settings.hosts; ChatSession unchanged (root carries the host)

client/src/main/hosts/
├── ssh.ts                  # ssh argv for a host, spawn over ssh, run a script, control path, env
├── askpass.ts              # local socket server + helper script; prompts to cards or stored password
├── secrets.ts              # safeStorage-encrypted passwords in hosts/secrets.json
├── run.ts                  # detached claude on a host: start, attach, catch up, reconnect, end
├── run-script.ts           # the POSIX scripts for start/attach/stop/reap (pure strings, tested)
├── disk.ts                 # listing, mirroring and deleting a host's conversation files
├── hosts.ts                # Hosts: states, checks, backoff, events; add/remove/connect/disconnect
├── forward.ts              # localhost port forwarding per host
└── route.ts                # one place deciding local vs host for claude, disk, git, shell, files

client/src/main/
├── index.ts                # wires Hosts, routes into Sessions deps, IPC, phone calls
├── sessions/index.ts       # Driver.leave for dispose; reattach runs on start
├── sessions/heard.ts       # Driver.leave
├── sessions/disk.ts        # rows from edges split out so a host's edges reuse it
├── git.ts, file-shown.ts   # take a runner so a host's root runs over ssh
└── store.ts                # hosts in settings; projects accept ssh:// roots

client/src/preload/index.ts # hosts.* calls and events

client/src/renderer/src/
├── chat/project.ts         # projectName/homePath/host label for ssh:// roots
├── chat/Projects.tsx       # grouped by Local and host; "All on <host>"; Add a folder on <host>; Add a host
├── chat/useChat.ts         # host scope; hosts state
├── chat/Chat.tsx           # host chip and its menu; out-of-reach composer; Chrome greyed
├── chat/Composer.tsx       # "Reconnecting to <host>" in place of send
├── chat/Board.tsx, Sidebar.tsx, Switcher.tsx, Recent.tsx  # `project · host` labels; out-of-reach line; New task grouping
├── chat/Status.tsx         # host prefix before plan
├── chat/Hosts.tsx          # Settings, Hosts section; Add a host sheet; host folder chooser; sign-in cards
├── ui/SettingsDialog.tsx   # new section
└── styles.css              # tokens only

client/test/
├── hosts-address.test.ts
├── hosts-run-script.test.ts
├── hosts-catchup.test.ts
├── hosts-askpass.test.ts
├── hosts-state.test.ts
├── hosts-disk.test.ts
└── fixtures/hosts/         # recorded remote listing output, recorded run output
```

**Structure Decision**: One new main-process module, `main/hosts/`, owns everything about reaching another computer; existing modules gain a router at their outside edge rather than host-specific branches inside. The renderer gets one new file for the host surfaces that are new (Settings section, sheet, folder chooser, sign-in card) and small edits where existing surfaces change.

## Notes from analysis

- Pictures put in the composer travel inside the stream-json message as base64, so they reach `claude` on the host through the input FIFO with nothing copied; only a dropped non-picture file (a path on this computer) is not there, and its path is sent as it is today.
- The plan usage meters belong to the Local account; for a conversation on a host the status bar shows the host's plan and version and leaves the meters out, since the host may be signed in to another account.
- Search (Cmd+P over what was said) reads the mirror, so it finds what was opened or listed from a host.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A local mirror of a host's conversation files | The parsers in `disk.ts` read files; mirroring the append-only files lets them run unchanged | Reading every file over SSH per list or open costs hundreds of round trips; a parser over a remote stream duplicates `disk.ts` |
| An askpass helper with a local socket | OpenSSH asks for secrets only through a TTY or `SSH_ASKPASS` | An SSH library would drop the person's SSH config, agent and jump hosts, which the spec promises |
