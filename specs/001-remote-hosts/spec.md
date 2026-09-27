# Feature Specification: Conversations on remote hosts

**Feature Branch**: `001-remote-hosts`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Local sessions, and the possibility to connect a remote host and work with it, with several sessions across hosts at once. Implement the agreed design in docs/ux/remote-hosts.md and docs/design/remote-hosts.html."

## Clarifications

### Session 2026-09-27

- Q: Can a Windows computer be a host? → A: Not in this release; a host needs a POSIX shell (Linux, macOS). Windows is supported as the computer running GeckIt.
- Q: Where is a host kept? → A: In GeckIt's settings, without secrets; a remembered password only in the system's credential store.
- Q: How is Claude Code installed on a host that lacks it? → A: With the official installer, run on the host only after the person presses "Install it".
- Q: Does the phone need anything of its own? → A: No; it sees conversations on hosts through the computer running GeckIt, as it sees local ones.
- Q: What if the same conversation is opened from a terminal on the host at the same time? → A: As with two local clients today: the last to send takes the turn; nothing new is added.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a host and work in a conversation there (Priority: P1)

The person adds another computer they can already reach over SSH, picks a folder on it, and starts a conversation. The conversation runs on that host, on the Claude Code and plan signed in there, and behaves like a local one: its answers stream, it asks for permissions with the same cards, its mode can be changed, and it is on the board beside local conversations with the host's name after the project.

**Why this priority**: Without it there is nothing remote to see; everything else builds on a conversation that runs on a host.

**Independent Test**: With one host that has Claude Code signed in, add it, add a folder on it, start a task, see the answer stream, answer a permission card, and find the card on the board labelled `project · host`.

**Acceptance Scenarios**:

1. **Given** no hosts, **When** the person opens Settings, Hosts and presses "Add a host", **Then** a sheet asks for Address, User, Port, Sign in with (Key or Password) and Name, offering the Hosts from the person's SSH configuration as the address is typed.
2. **Given** the sheet, **When** the person types `leo@devbox.local:2222` into Address, **Then** Address becomes `devbox.local`, User `leo` and Port `2222`.
3. **Given** a filled sheet, **When** the person presses Connect, **Then** the checks "Reached devbox", "Claude Code <version>", "Signed in: <plan>" tick one after another and the host is saved only after it was reached.
4. **Given** a connected host, **When** the person chooses "Add a folder on devbox..." and picks a folder in the host's own folder chooser, **Then** the project appears in the picker under the host's name.
5. **Given** a project on a host, **When** the person starts a task in it, **Then** the conversation runs on the host, streams its answers, and its card shows `trailmap · devbox`.
6. **Given** a conversation on a host, **When** Claude asks for a permission, **Then** the same permission card appears and the answer is carried to the host.
7. **Given** a conversation on a host is open, **Then** its header shows the host chip with a dot for how the connection stands, and the status bar shows that host's plan and Claude Code version.

---

### User Story 2 - The work outlives the connection (Priority: P1)

The connection to a host drops, the laptop closes, or GeckIt quits. The conversation keeps working on the host. When the connection comes back, GeckIt catches up with everything said meanwhile, including questions asked while it was away.

**Why this priority**: The main pain with remote work today is losing it when the connection goes; without this the feature is a fragile terminal.

**Independent Test**: Start a long task on a host, cut the network for a minute, restore it: the task is still running, the transcript catches up, and a permission question asked meanwhile appears as its card.

**Acceptance Scenarios**:

1. **Given** a working conversation on a host, **When** the connection drops for less than 10 s, **Then** nothing is shown.
2. **Given** a working conversation on a host, **When** the connection is gone for more than 10 s, **Then** its card reads "devbox is out of reach. Still working there", the chip's dot turns amber, and the composer keeps what is typed and shows "Reconnecting to devbox" where the send button was.
3. **Given** an out-of-reach host, **When** the connection comes back by itself, **Then** the lines go away and the transcript shows what was said meanwhile.
4. **Given** a conversation on a host was working when GeckIt quit, **When** GeckIt starts again, **Then** it reconnects to that host by itself and catches up.
5. **Given** a conversation on a host with nobody connected and nothing running for 12 hours, **Then** its process on the host is stopped, and the next message resumes the conversation.

---

### User Story 3 - Switch by narrowing, across hosts (Priority: P2)

The person watches conversations on several hosts at once and narrows to one host when they want to.

**Why this priority**: The value of one board is seeing everything; narrowing is how people "switch" without losing that.

**Independent Test**: With a local project and projects on two hosts, open Cmd+K, see projects grouped under "Local" and each host, choose "All on devbox" and see only devbox's conversations on the board, list and Cmd+P.

**Acceptance Scenarios**:

1. **Given** at least one host, **When** Cmd+K opens, **Then** projects are grouped under "Local" and each host, each host header showing a dot for how it stands and its `user@address` or state.
2. **Given** Cmd+K, **When** the person chooses "All on devbox", **Then** the board, the list and Cmd+P show only devbox's conversations until the scope is cleared.
3. **Given** no hosts, **Then** Cmd+K looks as it does today.
4. **Given** the New task form, **Then** the Project list groups projects under Local and each host and ends with "Choose a folder on this computer..." and "Choose a folder on <host>..." for each connected host.
5. **Given** conversations on several hosts, **Then** Ctrl+Tab and Cmd+P move between them as between local ones.

---

### User Story 4 - Signing in to a host (Priority: P2)

The host asks for a password, a key's passphrase, a one-time code, or trust in its key. GeckIt shows it as a card, passes on what is typed and keeps nothing unless the person asks to remember a password.

**Why this priority**: Many hosts need a password or a passphrase; without it the feature only works for people with an agent already loaded.

**Independent Test**: Add a host with password sign-in and "Remember on this computer" ticked; restart GeckIt; open a conversation there: it connects without asking. Untick remember: it asks with a card each time.

**Acceptance Scenarios**:

1. **Given** a host with password sign-in and nothing remembered, **When** it connects, **Then** a card reads "devbox asks for the password of leo." with a field, "Remember on this computer", "Sign in" and "Not now".
2. **Given** "Remember on this computer" ticked, **Then** the password is kept in the system's credential store and never in GeckIt's settings file.
3. **Given** a first connection to a host, **When** its key is unknown, **Then** a card shows the key's fingerprint and asks "Trust it?".
4. **Given** a sign-in card, **When** the person presses "Not now", **Then** the host becomes Not connected and its conversations stay listed.
5. **Given** a remembered password that the host refuses, **Then** the card asks again and a new one remembered replaces it.

---

### User Story 5 - Everything else a local conversation has (Priority: P3)

A conversation on a host keeps the rest of what a local one offers: conversations started on the host in a terminal show up in the list, git's branch and changes are read on the host, a file pressed in the transcript is read from the host, `http://localhost` links said there open here, `!` commands and the terminal button run there, pictures attached are copied there. Settings, Hosts lists the hosts with Disconnect and Remove.

**Why this priority**: These make a remote conversation feel the same as a local one, but each can be missing without the feature failing.

**Independent Test**: Start a conversation on the host from a terminal there; see it in GeckIt's list; open it and resume it; press a file in it and see its contents; press a `localhost` link and see the page.

**Acceptance Scenarios**:

1. **Given** a conversation started on the host in a terminal, **When** the host's project is listed, **Then** that conversation appears and can be resumed.
2. **Given** a conversation on a host, **Then** the status line shows the host's git branch and changes.
3. **Given** a `http://localhost:3000` link in a conversation on a host, **When** pressed, **Then** the page opens here through the host's connection; if 3000 is taken locally, the next free port is used and the person is told.
4. **Given** Settings, Hosts, **Then** Local is listed first, then each host with how it stands, its Claude Code version and plan, and Connect or Disconnect and Remove.
5. **Given** a host with conversations working, **When** the person presses Disconnect, **Then** they are asked "Disconnect devbox? 2 conversations are working there and will keep working."
6. **Given** a connected host without Claude Code, **Then** the person sees "Claude Code is not installed on devbox." with "Install it"; without a signed-in plan, "Claude Code on devbox is not signed in." with "Sign in on devbox".

### Edge Cases

- The same folder name locally and on a host: two projects, told apart by the host name.
- Every host out of reach: their cards stay in their columns, only working or asking ones say so.
- A question asked while out of reach waits on the host and appears as a card when the connection is back.
- The host's name no longer resolves: "Could not reach devbox: no host by that name."
- Nothing answers for 20 s: "Could not reach devbox: timed out after 20 s." with "Try again".
- The host's key changed since the last connection: both fingerprints are shown with a warning.
- A host removed in Settings: its conversations stay on the host and leave the list.
- The phone sees conversations on hosts through the computer running GeckIt, and only while it is awake.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The person MUST be able to add a host with Address, User, Port, a sign-in method (Key: default keys or a chosen key file; Password) and a Name; `user@address:port` typed into Address MUST fill User and Port.
- **FR-002**: The add sheet MUST offer Hosts from the person's SSH configuration as the address is typed, and MUST save a host only after it was reached.
- **FR-003**: GeckIt MUST use the SSH client and configuration already on the computer, and MUST NOT install anything of its own on a host.
- **FR-004**: A project MUST be identified by its host and folder; a local project and a project on a host with the same folder name MUST be two projects.
- **FR-005**: A conversation in a project on a host MUST run Claude Code on that host with the permission mode, model and permission cards a local conversation has.
- **FR-006**: The Claude Code process on a host MUST keep running when the connection drops or GeckIt quits, and GeckIt MUST catch up with its output on reconnecting without losing or repeating any of it.
- **FR-007**: GeckIt MUST reconnect by itself, retrying after 1, 2, 4, 8 and 15 s and then every 30 s; it MUST reconnect at start to hosts whose conversations were working.
- **FR-008**: A host's state MUST be one of Not connected, Connecting, Connected, Lost, Needs you, No Claude Code, Not signed in, shown by the chip's dot and in Settings, with the wording in docs/ux/remote-hosts.md section 10.
- **FR-009**: "Connecting" MUST NOT show before 1 s, and "Lost" MUST NOT show before 10 s.
- **FR-010**: While a host is Lost or Needs you, conversations on it that were working or asking MUST read "<host> is out of reach. Still working there"; other conversations on it MUST keep their line.
- **FR-011**: The composer of an out-of-reach conversation MUST keep what is typed and show "Reconnecting to <host>" in place of the send button.
- **FR-012**: A password, a key's passphrase, a one-time code and trust in a host key MUST be asked for on a card; a password MUST be remembered only when the person ticks "Remember on this computer", and only in the system's credential store.
- **FR-013**: Cmd+K MUST group projects under "Local" and each host once a host exists, and each host's header row MUST narrow every list to that host.
- **FR-014**: Project labels on cards, list rows, Cmd+P and Ctrl+Tab MUST show `<project> · <host>` for projects on a host and the project name alone for local ones.
- **FR-015**: The New task form MUST group projects by Local and host and offer "Choose a folder on <host>..." for each connected host, with a folder chooser that reads the host's folders.
- **FR-016**: The status bar MUST show the open conversation's host, plan and Claude Code version.
- **FR-017**: Conversations recorded on a host (including ones started there in a terminal) MUST be listed under the host's projects and be resumable.
- **FR-018**: Git status, file views, `!` commands, the terminal button and attached pictures of a conversation on a host MUST act on the host.
- **FR-019**: `http://localhost:<port>` links said in a conversation on a host MUST open here through a port forwarded over the host's connection, using the next free local port if the same one is taken, and saying so.
- **FR-020**: Settings MUST have a "Hosts" section listing Local and each host with Connect/Disconnect and Remove; Disconnect MUST warn when conversations are working; Remove MUST say that the conversations stay on the host.
- **FR-021**: A Claude Code process on a host with nobody connected and no turn running for 12 hours MUST be stopped; the conversation MUST resume on the next message.
- **FR-022**: Chrome MUST be unavailable in conversations on a host, with "Chrome is on this computer, and this conversation runs on <host>".
- **FR-023**: When Claude Code is missing on a host GeckIt MUST offer "Install it"; when it is not signed in, "Sign in on <host>", opening a terminal on the host.
- **FR-024**: The interface MUST call this computer "Local" and every other computer a "host", the same on macOS, Windows and Linux.
- **FR-025**: The environment handed to Claude Code on a host MUST be free of API keys, as it is locally.

### Key Entities

- **Host**: another computer: a Name, an Address, a User, a Port, a sign-in method (default keys, a key file, or a password), and its last known Claude Code version and plan. Its connection has one of the states in FR-008.
- **Project**: a folder on Local or on a host; its identity includes the host.
- **Conversation**: as today, plus the host its project is on; while its host is out of reach it may be "out of reach".
- **Remote run**: the Claude Code process of one conversation on a host, with what it has printed so far and how much of that GeckIt has read.
- **Remembered password**: a secret kept in the system's credential store for one host and user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with SSH access to a host adds it and has a conversation answering there within 2 minutes.
- **SC-002**: After a connection loss of up to an hour, 100% of the conversation's output from the gap appears in the transcript, with nothing repeated.
- **SC-003**: A dropped connection recovers by itself within 35 s of the network coming back.
- **SC-004**: Conversations on at least 3 hosts and Local can be worked in at the same time from one board.
- **SC-005**: A person with no hosts sees no change anywhere in the interface.
- **SC-006**: No password or passphrase is ever found in GeckIt's settings file.

## Assumptions

- The person can already reach the host with the SSH client on their computer; GeckIt does not set up SSH access.
- Hosts run a POSIX shell (Linux or macOS); a Windows computer is supported as the computer running GeckIt, not as a host.
- Claude Code on the host is signed in by the person, on the host.
- Reaching hosts directly from the phone is out of scope.
- The first release targets OpenSSH as the SSH client on the computer running GeckIt (bundled with macOS, Linux and current Windows).
