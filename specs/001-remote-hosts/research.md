# Research: Conversations on remote hosts

All unknowns of the Technical Context, resolved. Each entry: decision, rationale, alternatives.

## R1. How to reach a host

- **Decision**: Spawn the person's OpenSSH `ssh` (on PATH; `C:\Windows\System32\OpenSSH\ssh.exe` on Windows) with `-T`, `-o ConnectTimeout=20`, `-o ServerAliveInterval=5`, `-o ServerAliveCountMax=2`, and, off Windows, `-o ControlMaster=auto -o ControlPath=<userData>/hosts/cm-%C -o ControlPersist=600`.
- **Rationale**: FR-003 promises the person's own SSH config, agent and jump hosts; Zed does the same ("shells out to the ssh on your path"). Multiplexing makes the many short commands (list, read, git) cost one handshake. Keepalives of 5 s × 2 detect a dead link in about 10 s, which is the Lost threshold.
- **Alternatives**: the `ssh2` npm library (drops `~/.ssh/config`, ProxyJump, agent forwarding on Windows, adds a dependency); a long-lived shell over one ssh with our own framing (fragile, one broken command poisons the stream).

## R2. Keeping `claude` alive without the connection

- **Decision**: Start it on the host with a POSIX script: `mkdir ~/.geckit/runs/<id>`, `mkfifo in`, then `nohup <setsid|perl -e 'use POSIX setsid; setsid; exec @ARGV'> sh -c 'exec 3<>in; env -u … claude -p … <in >>out 2>>err; echo {"type":"geckit_exit",…} >>out' &`, the pid written to `pid`. Input is written by `ssh host 'cat > ~/.geckit/runs/<id>/in'` with stdin piped from GeckIt; output is read by `ssh host 'tail -c +<offset+1> -f out'`.
- **Rationale**: Verified on the owner's host (macOS, no `setsid`): the process has ppid 1 and its own session, survives the ssh that started it, takes lines from several successive writers because fd 3 holds the FIFO open, and `tail -c +N -f` resumes at any byte. Only `sh`, `mkfifo`, `nohup`, `tail` and `perl` or `setsid` are needed, all present on macOS and common Linux.
- **Alternatives**: tmux/screen (not on every host; terminal escape codes in the output); a daemon of GeckIt's on the host (installing something, which the spec rules out); ending with the connection (Claude Desktop's behaviour, the bug the design fixes).

## R3. Catching up without loss or repeats

- **Decision**: GeckIt counts the bytes of whole lines it has handed to the stream reader; a reconnect tails from that count. A partial last line is held until its newline arrives. The run's offset is saved in `runs.json` so a restart of GeckIt continues from it.
- **Rationale**: `out` is append-only, so a byte offset is a precise cursor; counting whole lines makes a line never split across two connections. SC-002.
- **Alternatives**: line numbers (`tail -n +N` counts on every reconnect and cannot resume mid-file cheaply); asking the tool to replay (it has no such request).

## R4. Knowing the run ended

- **Decision**: The wrapper appends `{"type":"geckit_exit","code":<n>}` to `out` when `claude` exits; the reader treats it as the process closing. A missing `pid` process with no sentinel (killed hard, host rebooted) is found by `kill -0` on reconnect and treated the same.
- **Rationale**: The reader already consumes JSON lines; a sentinel keeps "closed" in-band and ordered after the last output.

## R5. Idle runs with nobody attached (12 hours)

- **Decision**: The start script also launches a reaper loop beside the run: every 10 minutes, if `out` has not been written for 12 hours and `seen` (touched by GeckIt on every attach and send) is older than 12 hours, it kills the run. GeckIt's own 10-minute idle rest ends a remote run the same way it ends a local one (the conversation resumes with `--resume`).
- **Rationale**: FR-021; no process waits forever on a host after GeckIt went away mid-turn.

## R6. The environment on the host

- **Decision**: The run command is `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL -u CLAUDE_CODE_OAUTH_TOKEN -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX -u CLAUDE_CODE_USE_FOUNDRY claude …`, and `PATH` is extended with `$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin` before it.
- **Rationale**: Principle I, FR-025; the same list `planOnly` removes locally. A non-login ssh command may not have the installer's folder on PATH (the owner's host has it through zshenv; many do not).

## R7. Signing in: passwords, passphrases, host keys

- **Decision**: Every `ssh` is started with `SSH_ASKPASS=<userData>/hosts/askpass(.cmd)` and `SSH_ASKPASS_REQUIRE=force` (OpenSSH ≥ 8.4; 10.2 on both of the owner's computers), `DISPLAY` set where it is not. The helper runs Electron's own binary as Node (`ELECTRON_RUN_AS_NODE=1`) on a small script that sends the prompt to GeckIt over a local socket (Unix socket, named pipe on Windows) with a per-launch token, and prints the answer. GeckIt reads the prompt: "password:" → the remembered password or a password card; "passphrase for key" → a passphrase card; "Are you sure you want to continue connecting" / "fingerprint" → a trust card (answer `yes` or `no`); anything else → a generic card with the prompt's words. `StrictHostKeyChecking=ask` is left as the person set it.
- **Rationale**: OpenSSH asks through `SSH_ASKPASS` exactly when there is no TTY; the host-key question goes the same way, so one mechanism covers FR-012. Cards match "Needs you" in the UX document.
- **Alternatives**: `sshpass` (not installed anywhere by default, puts the password in argv or env); a pseudo-terminal (native module per platform).

## R8. Remembering a password

- **Decision**: `safeStorage.encryptString` (Keychain on macOS, DPAPI on Windows, libsecret/kwallet on Linux) and the encrypted bytes base64 in `userData/hosts/secrets.json`, keyed by host id. Where `safeStorage.isEncryptionAvailable()` is false, "Remember on this computer" is disabled with the reason.
- **Rationale**: SC-006 (never in `settings.json`); the key is held by the system's credential store. No new dependency (keytar is archived).

## R9. A host's conversation files

- **Decision**: Listing runs one script on the host that prints, for the project's slug folder and the ones that start with it, `name size mtime` of each `*.jsonl` (mtime from `date -r`, which GNU and BSD both take for a file). GeckIt compares with its mirror and, for new or changed files only, fetches the first and last 64 KB in one more script (`head -c` / `tail -c` through `base64`), then feeds them to the same row builder `disk.ts` uses. Opening a conversation appends what grew to the mirror with `tail -c +<mirror size+1>` and reads it with the existing `readClaudeSession`. Deleting runs `rm` on the host and on the mirror.
- **Rationale**: Files are append-only, so growth is the only change; the parsers stay the tested ones. Two round trips per list, not one per file.
- **Alternatives**: rsync (not on Windows by default, whole-file semantics); reading over SSH each time (slow for tens of MB with pictures).

## R10. Git, files, `!` commands, the terminal

- **Decision**: `git.ts` takes a runner; for a host it runs `git -C <path> status --porcelain=v2 --branch` over ssh. `file-shown.ts` reads through `ssh host cat`. `!` commands run `ssh host 'cd <path> && <shell> -lc <command>'` with the output streamed. The terminal button opens the local terminal with `ssh -t <host> 'cd <path> && exec $SHELL -l'`, or `claude --resume <id>` for Continue in terminal. Opening a file in a local application is offered only for local projects.
- **Rationale**: FR-018 with the existing shapes (`GitState`, `FileShown`, shell items) unchanged.

## R11. `localhost` links

- **Decision**: For a link to `http://localhost:<port>` or `127.0.0.1:<port>` in a conversation on a host, GeckIt starts `ssh -N -L <free local>:localhost:<port> <host>` once per host and port, picks the same local port if free and the next free one otherwise, opens the forwarded address, and says "<host>'s <port> is at localhost:<local> here" when they differ. Forwards close when the host disconnects.
- **Rationale**: FR-019; VS Code's behaviour. A separate `ssh -N` works on Windows, where the control socket does not.

## R12. Installing and signing in to Claude Code on a host

- **Decision**: "Install it" runs `curl -fsSL https://claude.ai/install.sh | bash` on the host (the official native installer) with its lines streamed onto the card. "Sign in on <host>" opens the local terminal with `ssh -t <host> claude`, where the person runs `/login`; GeckIt checks `claude auth status --json` again when asked to reconnect.
- **Rationale**: FR-023; GeckIt never handles the host's Claude credentials.

## R13. Where hosts are kept and how a project names its host

- **Decision**: `Settings.hosts: HostConfig[]` with a stable `id` (slug of the name, unique), and project roots `ssh://<id><absolute path>`. The folder chooser resolves the path on the host with `cd <path> && pwd -P`, so the slug Claude Code files it under matches.
- **Rationale**: Every list, profile, colour and favourite keyed by root keeps working; a host renamed keeps its id.

## R14. Windows as the computer running GeckIt

- **Decision**: Same code with `ssh.exe`; no ControlMaster (unsupported), so every operation is its own connection; the askpass helper is a `.cmd` that runs Electron as Node; the socket is a named pipe `\\.\pipe\geckit-askpass-<pid>`. A remembered password avoids re-asking for each connection; without one, a password host asks once per GeckIt session and keeps it in memory only.
- **Rationale**: Principle V: the feature degrades (slower connects) rather than breaks.
