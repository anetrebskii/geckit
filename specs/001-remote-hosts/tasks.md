# Tasks: Conversations on remote hosts

**Input**: Design documents from `specs/001-remote-hosts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by the constitution (principle III) for every pure function; process code is checked end to end on the owner's host.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Add `Settings.hosts: readonly HostConfig[]` with `[]` in `DEFAULT_SETTINGS` in client/src/shared/api.ts
- [ ] T002 [P] Create client/src/shared/hosts.ts with `HostConfig`, `HostDraft`, `HostState`, `HostView`, `HostPrompt`, `HostAnswer`, and the address helpers `hostOf`, `pathOf`, `remoteRoot`, `isRemote`, `parseTarget` (`user@address:port`), `hostIdFor(name, taken)`
- [ ] T003 [P] Create client/test/fixtures/hosts/ with a recorded listing (`list.txt`), recorded edges (`edges.txt`) and a recorded run output (`out.jsonl`) taken from the owner's host

## Phase 2: Foundational (blocks every story)

- [ ] T004 [P] Unit tests for the address helpers in client/test/hosts-address.test.ts
- [ ] T005 [P] Implement ssh argv building (`sshArgs(host, extra)`, control path, keepalives, `-p`, `-l`, `-i`), `spawnOn(host, command)` and `runOn(host, script)` in client/src/main/hosts/ssh.ts
- [ ] T006 [P] Implement the POSIX scripts (start, attach-out, attach-in, alive, stop, clean, list, edges, grow, folders, check) as pure string builders with shell quoting in client/src/main/hosts/run-script.ts
- [ ] T007 [P] Unit tests for quoting and every script in client/test/hosts-run-script.test.ts
- [ ] T008 Implement the askpass helper (script written to userData, local socket server with a per-launch token, prompt kind reading) in client/src/main/hosts/askpass.ts
- [ ] T009 [P] Unit tests for prompt reading (password, passphrase, trust with fingerprint, code, other) in client/test/hosts-askpass.test.ts
- [ ] T010 [P] Implement `safeStorage` password keeping in client/src/main/hosts/secrets.ts
- [ ] T011 Implement the `Hosts` manager (states with 1 s/10 s thresholds, checks `ssh true`, `claude --version`, `claude auth status --json`, backoff 1/2/4/8/15/30 s, prompts to windows, views) in client/src/main/hosts/hosts.ts
- [ ] T012 [P] Unit tests for the state rules and backoff (pure reducer) in client/test/hosts-state.test.ts
- [ ] T013 Wire `Hosts` into client/src/main/index.ts: IPC handlers of contracts/ipc.md, `hosts:changed` and `hosts:prompt` to every window and the phone
- [ ] T014 Add the `hosts.*` calls of contracts/ipc.md to client/src/preload/index.ts

**Checkpoint**: a host can be added, checked and connected from the main process; nothing visible yet.

## Phase 3: User Story 1 - Add a host and work in a conversation there (P1) 🎯 MVP

**Goal**: add a host, a folder on it, and run a conversation there that streams and asks.

**Independent Test**: quickstart steps 2–5.

- [ ] T015 [P] [US1] Unit tests for catching up whole lines from byte offsets in client/test/hosts-catchup.test.ts
- [ ] T016 [US1] Implement the detached run (`startRun`, `attachRun` with offset, whole-line splitter, reconnect on link loss, `geckit_exit`, stop, leave) returning a process-like object in client/src/main/hosts/run.ts
- [ ] T017 [US1] Let `holdClaude` take a process from outside (local spawn stays the default) and add `leave()` to the driver in client/src/main/sessions/claude.ts and client/src/main/sessions/heard.ts
- [ ] T018 [US1] Implement the router (`routedClaude`, `routedDisk`, `routedShell`, `routedTerminal`, `routedGit`, `routedFile`) in client/src/main/hosts/route.ts and pass it as `Sessions` deps in client/src/main/index.ts
- [ ] T019 [US1] Split the row builder out of `rowsOf` (`rowOf(file, head, tail, cut)`) and take a base folder for reading in client/src/main/sessions/disk.ts
- [ ] T020 [US1] Implement the host's conversation files (list with edges cache, grow the mirror, has, delete) in client/src/main/hosts/disk.ts
- [ ] T021 [P] [US1] Unit tests for reading the recorded listing and edges into rows in client/test/hosts-disk.test.ts
- [ ] T022 [US1] Remote folder listing and adding a folder (`pwd -P`), remembering the `ssh://` root, in client/src/main/hosts/hosts.ts and client/src/main/store.ts
- [ ] T023 [US1] Project naming for `ssh://` roots (`projectName`, `homePath`, `hostLabel`) in client/src/renderer/src/chat/project.ts
- [ ] T024 [US1] Settings, Hosts section and the Add a host sheet (Address split, suggestions from `hosts.known`, Key/Password, remember, Name, checks) in client/src/renderer/src/chat/Hosts.tsx and client/src/renderer/src/ui/SettingsDialog.tsx
- [ ] T025 [US1] Host folder chooser sheet in client/src/renderer/src/chat/Hosts.tsx
- [ ] T026 [US1] Host chip with its menu in the conversation header, Chrome greyed on a host, in client/src/renderer/src/chat/Chat.tsx and client/src/renderer/src/chat/Composer.tsx
- [ ] T027 [US1] `project · host` labels on cards, rows, Cmd+P and Ctrl+Tab in client/src/renderer/src/chat/Board.tsx, Sidebar.tsx, Switcher.tsx
- [ ] T028 [US1] Host prefix, the host's plan and Claude Code version in the status bar, with the Local account's 5h and week meters left out for a conversation on a host, in client/src/renderer/src/chat/Status.tsx
- [ ] T029 [US1] Styles for the chip, dots, sheet fields and Hosts list with tokens only in client/src/renderer/src/styles.css

**Checkpoint**: MVP: a conversation on the owner's host answers and asks.

## Phase 4: User Story 2 - The work outlives the connection (P1)

**Goal**: drop, quit, come back: nothing lost.

**Independent Test**: quickstart steps 6–7.

- [ ] T030 [US2] Keep `runs.json` (session, host, root, offset) up to date in client/src/main/hosts/run.ts
- [ ] T031 [US2] `Sessions.dispose` leaves remote runs instead of ending them; `Sessions.reattach(runs)` holds each alive run again as working in client/src/main/sessions/index.ts
- [ ] T032 [US2] On start, find alive runs and reattach them; drop gone ones, in client/src/main/index.ts
- [ ] T033 [US2] The reaper beside each run (12 h without output or `seen`) in client/src/main/hosts/run-script.ts
- [ ] T034 [US2] Out-of-reach second line on cards and rows for working/asking conversations on a Lost or Needs-you host in client/src/renderer/src/chat/Board.tsx and Sidebar.tsx
- [ ] T035 [US2] Composer keeps the text and shows "Reconnecting to <host>" or "<host> needs you, above" in client/src/renderer/src/chat/Composer.tsx
- [ ] T036 [US2] Hosts state in the chat window state (`hosts`, `hostOf(session)`) in client/src/renderer/src/chat/useChat.ts

## Phase 5: User Story 3 - Switch by narrowing, across hosts (P2)

**Independent Test**: quickstart step 8.

- [ ] T037 [US3] Cmd+K grouped under Local and each host, host header rows as scopes, "Add a folder on <host>...", "Add a host..." in client/src/renderer/src/chat/Projects.tsx
- [ ] T038 [US3] Host scope (`host:<id>`) in the lists, the board, Cmd+P and the picker label "All on <host>" in client/src/renderer/src/chat/useChat.ts
- [ ] T039 [US3] New task form: projects grouped by Local and host, "Choose a folder on <host>..." in client/src/renderer/src/chat/Board.tsx

## Phase 6: User Story 4 - Signing in to a host (P2)

**Independent Test**: a password host with and without "Remember on this computer".

- [ ] T040 [US4] Sign-in card (password with remember, passphrase, code, trust with fingerprints, Not now) in client/src/renderer/src/chat/Hosts.tsx, shown in the open conversation and over Settings
- [ ] T041 [US4] Remembered password answers askpass without a card; a refused one is forgotten and asked again, in client/src/main/hosts/hosts.ts

## Phase 7: User Story 5 - Everything else (P3)

- [ ] T042 [P] [US5] Git status of a host root over ssh in client/src/main/git.ts
- [ ] T043 [P] [US5] Files said in a conversation read from the host in client/src/main/file-shown.ts
- [ ] T044 [P] [US5] `!` commands on the host in client/src/main/hosts/route.ts
- [ ] T045 [P] [US5] `localhost` forwarding in client/src/main/hosts/forward.ts and `open:link` in client/src/main/index.ts
- [ ] T046 [US5] Terminal button and Continue in terminal over `ssh -t` in client/src/main/hosts/route.ts
- [ ] T047 [US5] Install Claude Code and Sign in on the host (No Claude Code / Not signed in cards) in client/src/main/hosts/hosts.ts and client/src/renderer/src/chat/Hosts.tsx
- [ ] T048 [US5] Disconnect warning with working count and Remove wording in client/src/renderer/src/chat/Hosts.tsx
- [ ] T053 [P] [US5] `@` file list (`git ls-files` or `find` on the host), MCP servers without a running process (`claude mcp list` on the host) and background task output (`cat` of the tool's output file) over ssh in client/src/main/hosts/route.ts
- [ ] T049 [US5] Phone calls `hosts.list`, `hosts.connect`, `hosts.disconnect`, `hosts.folders`, `hosts.addFolder`, `hosts.answer` in client/src/main/index.ts

## Phase 8: Polish

- [ ] T050 `npm run lint`, `npm run typecheck`, `npm test` clean in client/
- [ ] T051 End-to-end on the owner's host per quickstart.md, with screenshots of the running app
- [ ] T052 Update CLAUDE.md (Architecture: Hosts) and docs/ux/remote-hosts.md where building changed anything

## Dependencies

- Phase 1 → Phase 2 → US1 → US2; US3, US4, US5 depend on US1 and not on each other.
- Within US1: T016 → T017 → T018; T019 → T020; T023 before T024–T028.

## Parallel examples

- Phase 2: T004, T005, T006, T007, T009, T010, T012 touch different files.
- US5: T042, T043, T044, T045 touch different files.

## Implementation strategy

MVP is US1 + US2 (both P1): without surviving the connection the feature is a fragile terminal. Then US3 and US4, then US5.
