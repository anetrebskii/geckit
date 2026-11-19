# Feature Specification: Test browser that looks like a real person

**Feature Branch**: `036-real-person-browser`

**Created**: 2026-11-19

**Status**: Draft

**Input**: Alex's decisions on the Camoufox options GeckIt does not use yet: "1. Fingerprint: I just want it to have the same machine. Just make it real for linux/ubuntu servers, maybe replace to more real person use. 2. No proxy for now. 3. Do for linux only. 4. ok. 5. ok. 6. Keep whatever pretends to be a real person. 7. ok, uBlock by default is good, to pretend to be a real person."

## Context

GeckIt's test browsers are Camoufox (Firefox) profiles named `geckit:<name>`. Since the browser rules change of 2026-11-19, `click`, `hover`, `type` and `scroll` there move the real cursor, press real keys and turn the real wheel. What still gives a test browser away is what GeckIt itself writes into the page, a missing ad blocker that most people have, and on a Linux server the server itself: true headless mode, software graphics, no microphone or camera, no voices.

Decisions already taken, and out of scope: no proxy and no location matching (item 2); no blocking of images, WebGL or WebRTC (item 6, since a person does not block them); no per-profile fake fingerprint on a computer with a screen (item 1: "the same machine").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pages cannot see GeckIt (Priority: P1)

A conversation works on a site in a test browser. The site's own scripts look for signs of automation in the page. They find none of GeckIt's: no `data-geckit-*` attributes, no GeckIt elements, no GeckIt styles.

**Why this priority**: it removes a trace on every test browser on every system, and changes no device identity, so it is safe for profiles already signed in, such as `geckit:zabookni`.

**Independent Test**: open a page that lists every attribute and element added to its document; run `read`, `find`, `click`, `type`, `type --secret`, `shot --pointer` and `record`; the page reports nothing added by GeckIt, and every command still works.

**Acceptance Scenarios**:

1. **Given** a test browser tab, **When** `read` lists the page, **Then** refs work in `click`, `type` and `scroll`, and no element carries a `data-geckit-ref` attribute.
2. **Given** a password field filled with `type --secret`, **When** a page script reads the document, **Then** it finds no `data-geckit-secret` attribute and no GeckIt style element, and `read`, `text` and `shot` still never show the value.
3. **Given** `click` in a test browser, **When** the person watches the live view or a recording with the pointer, **Then** they see GeckIt's pointer where the real cursor is, while the page's document contains no pointer element.
4. **Given** the person's Chrome through the extension, **When** the same commands run, **Then** they behave as before (this feature does not change the extension's page traces).

---

### User Story 2 - uBlock Origin in every test browser (Priority: P2)

Every test browser starts with uBlock Origin installed and on, as many real people have. Nothing has to be set up.

**Why this priority**: the uBlock Origin that comes with Camoufox makes every profile look more like a person's browser and pages lighter, with nothing more to download.

**Independent Test**: start any test profile; uBlock Origin shows in `about:addons` and blocks a known ad request.

**Acceptance Scenarios**:

1. **Given** a computer where test browsers were never used, **When** the first test browser starts, **Then** the uBlock Origin bundled with Camoufox is on in that browser.
2. **Given** an existing signed-in profile, **When** it starts after the update, **Then** uBlock Origin is on and the sign-in is kept.
3. **Given** a Camoufox without a bundled uBlock Origin, **When** a test browser starts, **Then** it starts without it and its log says so.

---

### User Story 3 - A Linux server shows a real window, not headless (Priority: P2)

On a Linux computer with no screen (a server running GeckIt headless), a test browser runs in a virtual display as an ordinary window instead of Firefox's headless mode.

**Why this priority**: headless mode is one of the first things sites test, and GeckIt on servers is how Manager and channels work while the person's computer is off.

**Independent Test**: on Ubuntu 24.04 without a display and with Xvfb installed, `start geckit` succeeds, and a page sees a normal, non-headless Firefox window.

**Acceptance Scenarios**:

1. **Given** Linux without `DISPLAY` or `WAYLAND_DISPLAY` and Xvfb installed, **When** a test browser starts, **Then** GeckIt starts a private virtual display for it, the browser runs headed in it, and the display stops when the browser closes.
2. **Given** Linux without a display and without Xvfb, **When** a test browser starts, **Then** it does not start, and the error says exactly what to install.
3. **Given** macOS, Windows, or Linux with a display, **When** a test browser starts, **Then** nothing changes.

---

### User Story 4 - A Linux server looks like one person's desktop (Priority: P3)

A test browser on a Linux server presents one ordinary desktop computer: a common screen, a real graphics card, a microphone, a camera, speakers and voices, a normal number of CPU cores. Every profile on that server is the same machine, and it stays the same across restarts.

**Why this priority**: it matters only on servers, and depends on User Story 3.

**Independent Test**: on the Ubuntu test server, two profiles and a restart show the same device values on fingerprint test pages, with no software renderer, no headless flag and non-empty media devices and voices.

**Acceptance Scenarios**:

1. **Given** a Linux server without a display, **When** its first test browser starts, **Then** GeckIt makes the server's desktop identity once and saves it, and every test browser on that server uses it.
2. **Given** a saved desktop identity, **When** any profile on that server starts again, **Then** the same values are presented.
3. **Given** a profile on a server that was used before this feature, **When** it starts after the update, **Then** it keeps presenting what it presented before, until the person moves it to the desktop identity with a command.
4. **Given** a computer with a screen (macOS, Windows, Linux desktop), **When** a test browser starts, **Then** it presents that computer as it really is.

---

### Edge Cases

- A ref from before a reload or navigation: commands answer as today, "No element N on this page now. Run geckit browser read again."
- Two test browsers start at once on a server: each gets its own virtual display number.
- A virtual display left by a crashed driver: it is found and stopped at the next start of that profile.
- The saved desktop identity file is damaged: the browser does not start and says so; GeckIt does not quietly make a new identity, since that would be a new device for every signed-in account.
- A Camoufox update changes which settings exist: the identity file keeps working, and unknown keys are dropped with a log line.
- A site that breaks under uBlock Origin: the person can turn it off for that site in the browser itself, like any uBlock Origin user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: In a test browser, GeckIt MUST keep refs, filled-secret marks and the pointer outside what page scripts can read: no attributes, elements or styles added to the page's document.
- **FR-002**: `read`, `find`, `click`, `hover`, `type`, `type --secret`, `scroll`, `select`, `upload`, `drop`, `drag`, `shot`, `record` and the live view MUST keep working in test browsers with the same output, including in frames.
- **FR-003**: The live view, `shot --pointer` and `record --pointer` MUST still show GeckIt's pointer at the real cursor position in test browsers.
- **FR-004**: Every test browser MUST start with uBlock Origin on, at a version pinned by GeckIt and checked by size and sha256.
- **FR-005**: A missing uBlock Origin MUST NOT stop a test browser from starting.
- **FR-006**: On Linux without a display, a test browser MUST run headed in a virtual display GeckIt starts and stops with it, and MUST NOT fall back to headless mode.
- **FR-007**: Where the virtual display program is missing, starting MUST fail with the exact install command.
- **FR-008**: On a Linux server without a display, GeckIt MUST present one desktop identity per server, made once and kept, consistent across its values and identical for every profile and start.
- **FR-009**: Profiles used on a server before this feature MUST keep their previous presentation until the person moves them with a command.
- **FR-010**: On computers with a screen, GeckIt MUST NOT change what the browser presents about the device.
- **FR-011**: The Chrome extension's behavior MUST NOT change.
- **FR-012**: Nothing MUST be installed on the computer outside GeckIt's own folders; the virtual display program is installed by the person.

### Key Entities

- **Desktop identity**: the one machine a Linux server presents: screen, window, CPU cores, graphics card (WebGL vendor and renderer), media devices, voices, fonts, language and timezone. One per server.
- **Profile presentation**: which presentation a test profile uses on a server: the desktop identity, or the previous one for profiles made before this feature.
- **Add-on**: an extension GeckIt installs into every test browser, pinned by version and checksum. Only uBlock Origin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A page script finds zero GeckIt attributes, elements or styles after every test-browser command in the quickstart.
- **SC-002**: Every existing browser test passes, and the quickstart's commands give the same output as before in test browsers and in Chrome.
- **SC-003**: Every test browser shows uBlock Origin on, and a known ad request is blocked.
- **SC-004**: On Ubuntu 24.04 without a display, CreepJS and BrowserScan report no headless mode and no software renderer, and the device values are identical across two profiles and a restart.
- **SC-005**: `geckit:zabookni` stays signed in to Instagram after the update with no new-device check.

## Assumptions

- Item 2 (location) and item 6 (blocking) are not built.
- A Linux computer with a desktop session is a person's computer and keeps its real values; only Linux without a display is treated as a server.
- The server's traffic still comes from its own (often datacenter) address, since there is no proxy; the desktop identity removes the browser-level signs, not that one.
- The other session's browser work in progress (frames, `upload`, `drop`, `drag`, `wait`) lands first; this feature builds on its page functions.
