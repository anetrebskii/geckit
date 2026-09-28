# Quickstart: checking remote hosts end to end

## Prerequisites

- GeckIt built from this branch (`cd client && npm run dev`).
- A second computer reachable with `ssh <user>@<address>` from this one, with Claude Code installed and signed in there (`claude auth status` says `loggedIn: true`). The owner's is `leonid@192.168.3.33`.

## Checks

1. **Unit tests**: `cd client && npm test` — the `hosts-*` suites pass with the fixtures in `client/test/fixtures/hosts/`.
2. **Add a host**: Settings, Hosts, Add a host. Type `leonid@192.168.3.33` into Address: User fills with `leonid`. Connect: the three checks tick; the host is listed as Connected with its Claude Code version and plan.
3. **A folder on it**: Cmd+K shows Local and the host; "Add a folder on <host>..." opens the host's folders; pick one: it appears under the host.
4. **A conversation**: New task in that project, "list the files here and say which is largest". The answer streams; the card reads `<project> · <host>`; the status bar begins with the host's name.
5. **A permission card**: in Manual mode ask it to create a file; the card appears; Allow; the file exists on the host (`ssh <host> ls <folder>`).
6. **Out of reach**: during a long answer, turn Wi-Fi off for 20 s: the card says "<host> is out of reach. Still working there"; turn it on: the transcript catches up, nothing repeated.
7. **Quit mid-turn**: quit GeckIt while it answers; `ssh <host> ls ~/.geckit/runs` shows the run; start GeckIt: the conversation reattaches and finishes.
8. **Narrowing**: Cmd+K, "All on <host>": the board shows only that host's conversations; × brings the rest.
9. **Terminal conversations**: on the host run `claude -p "say hi"` in the folder; refresh the list: it appears.
10. **Nothing for others**: with no hosts, the picker, cards and status bar look as before.
