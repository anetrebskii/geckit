# Feature Specification: Signed-in browser profiles on another computer

**Feature Branch**: `025-remote-browser-profiles`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Alex, 2026-11-06: "Imagine the remote host is linux. Some my AI requests will be open browser and do something like simple user. It may require authentication, so, probably I need to create chrome test profile with authenticate user, and I would like simply share it with remote." Then: the AI on his own computer should manage the remote GeckIt through the CLI with the same actions as locally; the AI names profiles so later requests can refer to them; the same works in the UI; when he talks through Slack, he gets a link he opens to sign in; and how to do all this is part of the built-in skills GeckIt hands to its AI automatically.

## Decisions already made

These were settled with Alex in conversation and are not open questions:

- A profile that needs a signed-in account is created and signed into on the computer that will use it. It is never copied from another computer: the browser encrypts its sign-in data with a key held by the operating system, so a copied profile arrives signed out, and many sites distrust a session that moves to a new device.
- Signing in happens through a live view of that computer's test browser, shown in a paired GeckIt app. Passwords and sign-in data never leave the computer that owns the profile.
- A sign-in link opens only in a paired GeckIt app (the desktop client or the phone). There is no plain web link.
- The AI, the CLI and the UI all do the same things, and the how for the AI ships inside GeckIt's own built-in skills.
- Build order: driving another computer from the CLI, then profiles with notes on another computer, then the live view and the link.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The AI drives a paired computer through the CLI (Priority: P1)

Alex's AI on his Mac works with the GeckIt on a paired Linux computer exactly as with the local one: lists conversations, starts work, talks to Manager, manages test browser profiles. It does this by naming the computer on an ordinary GeckIt command.

**Why this priority**: Everything else (profiles, sign-in from a conversation) is a command sent to another computer. Without it, the AI on the Mac cannot help with the remote at all.

**Independent Test**: With a Linux computer paired, ask the AI on the Mac to list that computer's conversations and to start a task there; both happen on the Linux computer and the answers match what the desktop client shows for it.

**Acceptance Scenarios**:

1. **Given** a paired computer named `linux-box`, **When** a command is run with that computer named, **Then** it runs on `linux-box` and returns the same answer the same command gives when run on `linux-box` itself.
2. **Given** a command without a computer named, **When** it runs, **Then** it acts on this computer as today.
3. **Given** an AI session, **When** it tries to pair a new device, revoke one, or turn remote access on or off, on this or any computer, **Then** it is refused as today; only the person does those.
4. **Given** a computer name that is not paired or not reachable, **When** a command names it, **Then** it fails with a message naming the computer and the reason, and nothing runs anywhere else.

---

### User Story 2 - Named profiles with a note, on any computer (Priority: P2)

The AI creates a test browser profile on a chosen computer, gives it a name, and records which account it is for ("GitHub as alex"). Later requests ("use my GitHub profile on linux-box") resolve to that profile because the AI can list profiles per computer with their notes.

**Why this priority**: Naming and recall make a signed-in profile reusable across many future requests; it is the unit the sign-in flow fills.

**Independent Test**: Ask the AI to create `github-work` on `linux-box` with a note; in a new conversation ask it to use "my GitHub profile on linux-box" and see it pick `github-work` there.

**Acceptance Scenarios**:

1. **Given** a computer, **When** the AI or the person creates a profile with a name and a note, **Then** it appears in that computer's profile list with that note.
2. **Given** a name that breaks the existing naming rule or is already taken on that computer, **When** creation is asked, **Then** it is refused with the rule or the clash stated.
3. **Given** several computers, **When** profiles are listed, **Then** each profile shows which computer it is on, its name, its note and whether it is open.
4. **Given** an existing profile, **When** its note is changed, **Then** the new note is listed; the profile itself is untouched.
5. **Given** a profile, **When** the AI asks to delete it, **Then** it is refused; only the person deletes a profile, as today.

---

### User Story 3 - Sign in through a live view, from the desktop or the phone (Priority: P3)

Alex asks for a signed-in profile. GeckIt gives him a sign-in link. He opens it in GeckIt on his Mac or phone, sees the remote test browser live, signs in himself (password, two-factor, captcha), and says done. The profile on the remote stays signed in for later tasks.

**Why this priority**: It is what makes tasks behind a sign-in possible on a server with no screen, but it builds on the two stories above.

**Independent Test**: Create `github-work` on `linux-box`, open its sign-in link on the Mac, sign into GitHub, say done; then have the AI on `linux-box` open github.com in that profile and find it signed in.

**Acceptance Scenarios**:

1. **Given** a profile on a computer, **When** sign-in is asked, **Then** a link is produced that names the computer and the profile.
2. **Given** that link, **When** it is opened on a paired desktop client or phone, **Then** a live view of that profile's browser opens, and clicks, typing, scrolling and the keyboard reach the page.
3. **Given** the link, **When** it is opened on a device that is not paired with that computer, **Then** nothing is shown but a message that it opens only in GeckIt paired with that computer.
4. **Given** a link already used, expired (15 minutes) or ended by "done", **When** it is opened again, **Then** it says so and offers nothing else.
5. **Given** the live view on the phone, **When** the page is desktop sized, **Then** it can be pinch-zoomed and the keyboard can be raised to type into a field.
6. **Given** the person says done (in the view or in the conversation), **When** the view closes, **Then** the profile is kept signed in on its computer and the AI confirms which profile and computer.

---

### User Story 4 - The same from a Slack or Telegram thread (Priority: P3)

Alex talks to GeckIt through a channel. He asks for a GitHub profile on `linux-box`; the thread receives "Sign in: <link>". He taps it on the phone, signs in in GeckIt, replies "done" in the thread, and gets a confirmation.

**Why this priority**: Same flow as Story 3, delivered where Alex already talks to GeckIt. It needs nothing new from channels beyond posting the link.

**Independent Test**: Run the whole request from the Slack thread to the confirmation without touching the Mac.

**Acceptance Scenarios**:

1. **Given** a channel thread, **When** a signed-in profile is asked for, **Then** the thread gets the link and one line saying it opens in GeckIt.
2. **Given** the channel shows a preview of links, **When** it fetches the link, **Then** the link is not used up by that.
3. **Given** "done" in the thread, **When** the view is still open, **Then** it is closed and the thread gets the confirmation.

---

### User Story 5 - The same in the UI (Priority: P3)

In Settings > Integrations, test profiles are listed per computer with the note, New, Sign in (opens the live view), Delete, and a way to edit the note.

**Independent Test**: Create, sign into and delete a profile on `linux-box` using only the desktop client.

**Acceptance Scenarios**:

1. **Given** paired computers, **When** Settings > Integrations is open, **Then** each computer's profiles are listed under its name.
2. **Given** New, **When** a name and note are entered, **Then** the profile is created on the chosen computer, with the same naming rule as the CLI.
3. **Given** Sign in, **When** pressed, **Then** the live view opens directly, with no link step.

---

### User Story 6 - The AI knows how without being told (Priority: P2)

Every AI conversation GeckIt starts, locally or on another computer, already knows how to name another computer on a command, create and list profiles with notes, produce a sign-in link and wait for done. It learns this from GeckIt's built-in skills, which GeckIt hands to its AI automatically, as it does today for Chrome.

**Why this priority**: Without it Alex would have to explain the commands in every request, which defeats the point.

**Independent Test**: In a fresh conversation with no instructions, ask "make me a signed-in GitHub profile on linux-box"; the AI runs the right commands and posts the link without asking how.

**Acceptance Scenarios**:

1. **Given** Chrome through GeckIt is on, **When** a conversation starts, **Then** its built-in browser skill covers profiles on other computers, notes and sign-in links.
2. **Given** paired computers, **When** a conversation starts, **Then** its built-in guidance covers naming a computer on a command, and lists the paired computers by name.
3. **Given** the built-in skills are updated with a new GeckIt version, **When** the next conversation starts, **Then** it gets the new text with no step by the person.

### Edge Cases

- The other computer has no screen (a Linux server): the test browser still runs with a display of its own. If something it needs is not installed there, GeckIt says what is missing and does not install it without the person asking.
- The site refuses to sign in inside a browser driven by GeckIt (Google often does): the sign-in step must still succeed, or the view must say plainly that this site refused and why.
- The connection to the computer drops during sign-in: the view says so and resumes when it is back while the link is still valid; whatever was typed into the page stays on that computer.
- Two devices open the same link: the second is refused, since the link works once.
- A task is using the profile when sign-in is asked: sign-in waits or says the profile is busy; it never takes over a tab a task is working in.
- The sign-in expires later (the site logs the profile out): the next task that finds itself signed out says so and offers a new sign-in link instead of failing silently.
- A paired computer runs an older GeckIt that does not know a command: the command fails naming the version needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Any GeckIt command that acts on the workspace MUST accept a paired computer's name and then run on that computer with the same result as run there.
- **FR-002**: Commands that pair, revoke or change remote access MUST stay refused to AI sessions on every computer.
- **FR-003**: A command naming a computer that is unknown, unpaired or unreachable MUST fail with that reason and act nowhere.
- **FR-004**: Test browser profiles MUST be creatable, listable and openable on any paired computer, with the existing naming rule.
- **FR-005**: Each profile MUST be able to carry a short note saying which account it is for, editable later, listed with the profile.
- **FR-006**: Profile lists MUST show the computer, name, note and whether the profile is open.
- **FR-007**: Only the person MUST be able to delete a profile, as today.
- **FR-008**: GeckIt MUST produce a sign-in link for a profile that names the computer and profile, works once, expires after 15 minutes, and ends when the person says done.
- **FR-009**: The link MUST open only in a GeckIt app paired with that computer; elsewhere it MUST show only that message.
- **FR-010**: Fetching the link to build a preview MUST NOT use it up; it is used up when the person starts the view.
- **FR-011**: The live view MUST show the profile's browser as it changes and pass the person's clicks, typing, scrolling and keys to it.
- **FR-012**: Passwords, cookies and other sign-in data MUST NOT leave the computer that owns the profile; only the picture and the person's input cross the link.
- **FR-013**: On the phone the live view MUST support pinch zoom and raising the keyboard.
- **FR-014**: Profiles MUST be kept signed in across restarts of the browser, GeckIt and the computer, as far as the site allows.
- **FR-015**: A channel thread MUST be able to receive the link and accept "done" to end the sign-in.
- **FR-016**: Settings > Integrations MUST list profiles per computer with New, Sign in, Delete and the note.
- **FR-017**: GeckIt's built-in skills and guidance, handed to its AI automatically, MUST describe naming a computer on a command, profiles with notes and the sign-in flow, and MUST list the paired computers.
- **FR-018**: Interface copy MUST use "computer" for a paired machine on every system.

### Key Entities

- **Computer**: a paired GeckIt, known by a name the person sees; this computer is one of them.
- **Test profile**: a browser profile on one computer, with a name, a note and whether it is open. Its sign-in data stays on its computer.
- **Sign-in link**: names a computer and a profile; single use; expires; ended by done.
- **Live view**: a session showing one profile's browser on a paired device and carrying the person's input back.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh conversation, Alex gets a signed-in profile on a Linux computer in under 3 minutes of his own time, with no instructions about commands.
- **SC-002**: A profile signed in this way is still signed in for a task on the next day, for sites that keep sessions that long.
- **SC-003**: The same signed-in flow completes from a Slack thread on the phone without touching the desktop.
- **SC-004**: No password, cookie or other sign-in data from a profile is found on any computer other than its own after a sign-in.
- **SC-005**: A link opened a second time, after 15 minutes, or on an unpaired device shows nothing of the browser.
- **SC-006**: Every command that works on this computer gives the same answer when run with another computer named, apart from the pair, revoke and access commands for AI.

## Assumptions

- The computer is already paired through the existing pairing; this feature adds nothing to how computers are paired.
- A paired device already has full workspace access to the computer; letting the AI on that device use it is in line with that.
- Linux is the main target for the other computer; macOS works the same where the test browser can be shown.
- Phone and desktop clients both need to handle `geckit://` links; the phone app already registers the scheme for pairing.
- Copying sign-in data from the Mac to another computer is out of scope.
- Sites that bind a session to one IP address may still ask again; that is the site's rule, not a defect.
