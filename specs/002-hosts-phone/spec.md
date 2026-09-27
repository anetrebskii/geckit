# Feature Specification: Hosts on the phone, and what the first pass left

**Feature Branch**: `001-remote-hosts` (continued; the same PR)

**Created**: 2026-09-28

**Status**: Approved design

**Input**: "Мы будем поддерживать работу с удаленными папками с телефона? Это нужно. Телефон - это шлюз когда я не дома и мне нужна с ним свобода." Implement the agreed design in `docs/ux/remote-hosts-phone.md` and `docs/design/remote-hosts-phone.html`.

## Clarifications

### Session 2026-09-28

- Q: Does the phone reach hosts itself? → A: No; through the computer running GeckIt, which has the keys and the network (principle 3 of the design).
- Q: Can a host be added or edited on the phone? → A: No; the phone shows the computer's hosts only as the labels of their projects, and adds a folder on one under Where. Connecting to a host over SSH from the phone itself is a topic of its own.
- Q: What is the computer called on the phone? → A: By its name, never "Local".
- Q: Where is the moved port said on the phone, whose page opens in a native view? → A: In the view's own bar, as the line iOS puts over a title (`navigationItem.prompt`).

## User Scenarios & Testing

### User Story 1 - Keep working on a host from the phone (Priority: P1)

Away from the desk, the person sees conversations on hosts labelled `project · host`, sees when a host is out of reach (amber line on its working rows, the pill in its conversation, Send held), and answers what a host asks (a password, a passphrase, trust in a key) in a sheet on the phone.

**Independent Test**: With a host added on the computer, open the phone: a row reads `geckit-remote-test · <host>`; disconnect the host's network: after 10 s the row turns amber and the conversation shows "Reconnecting to <host>"; a password question on the computer comes up as a sheet on the phone, answered there, gone on both.

**Acceptance Scenarios**:

1. **Given** a working conversation on a host out of reach, **When** the board is shown on the phone, **Then** its row says "<host> is out of reach. Still working there" in amber.
2. **Given** that conversation open, **Then** Send is greyed, what is typed stays, and a line over the field says "<host> is out of reach. What is typed stays until it is back".
3. **Given** a host asks for a password, **When** the phone is open anywhere, **Then** a bottom sheet asks it with "Remember on <computer>", Sign in and Not now.

### User Story 2 - Add a project on a host from the phone (Priority: P1)

In Settings, Projects, Add a project (and in a new task's Choose a folder), the person first chooses Where: the computer by its name, or a host; then walks the host's folders and adds one.

**Independent Test**: Add `~/geckit-remote-test` on the host from the phone; it appears first in Projects as `geckit-remote-test · <host>`.

### User Story 3 - One kind of host on the phone (Priority: P2)

The phone connects only by pairing with a host where GeckIt runs. The projects that host has on other hosts come with it as labels; the phone has no list of them and nothing to connect them with. Every "Mac" on the phone says "host", or the host's name.

### User Story 4 - A host's localhost page on the phone (Priority: P2)

A `localhost` link in a conversation on a host opens through the computer; when the port moved, the page's bar says so.

### User Story 5 - The computer's leftovers (Priority: P2)

Cmd+K groups follow the profile's projects, Local too; Settings, Profiles lists projects grouped by where they are, each labelled; a host can be edited in the Add sheet filled in (Save; checked again only when a connection field changes; Forget the password); a host that is not connected is not contacted to list the board and asks nothing; an update restart waits only for local conversations; Search and Hidden read conversations on hosts; removing a host stops its runs and removes its shortcuts; voice orders name projects with their host; a recording note in a task on a host leaves out the video.

## Requirements

- **FR-001** Phone rows, headers, project lists and profile lists label host projects `project · host`.
- **FR-002** The phone shows the out-of-reach states of `remote-hosts.md` with the same 1 s / 10 s thresholds (it is told the shown state).
- **FR-003** Host prompts on the phone are a bottom sheet; answered anywhere, gone everywhere.
- **FR-004** Add a project on the phone offers Where only when at least one host exists; otherwise it is as before.
- **FR-005** No new phone call gives the phone anything a host's connection would need (keys, addresses beyond what the list shows).
- **FR-006** Edit host re-checks only when Address, User, Port, auth or key changed.
- **FR-007** Listing a host that is not connected runs nothing on it and answers the last listing kept here.
- **FR-008** With no hosts added, nothing on the phone or the computer changes.

## Success Criteria

- **SC-001** From the phone alone, a project on a host is added and a task started in it, on the owner's host 192.168.3.33.
- **SC-002** Starting GeckIt with a host switched off shows the board at once and asks nothing.
- **SC-003** Lint, typecheck and the whole suite pass.
