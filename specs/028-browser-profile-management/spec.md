# Feature Specification: Manual browser profiles and profile transfer

**Feature Branch**: Current checkout `main`; no branch created.

**Created**: 2026-11-12

**Status**: Implemented in the working tree on 2026-11-12 after Alex approved with "implement". See [verification.md](verification.md) for checked behavior and integration limits.

**Input**: "Improve UI for managing chrome profiles. I'm going to create them manually, then sign in, etc. GeckIt CLI should be able to export profiles and then maybe even import to another machine (is it possible)?"

## User Scenarios & Testing

### User Story 1 - Create and use an account profile by hand (Priority: P1)

In Settings > Web Browser, Alex finds his named browser profiles, creates one, opens its browser and signs in himself. He can identify it later by its name and account note.

**Why this priority**: The supplied screenshot makes notes, names and status run together, while equal-sized actions squeeze profile identity and the creation form.

**Independent Test**: In Settings, create `github-work` with an account note, open the browser, sign in manually, close it and find the same profile again.

**Acceptance Scenarios**:

1. **Given** the profile list, **When** Settings opens, **Then** every profile has a distinct name, account note and open/closed status, with actions readable independently of note length.
2. **Given** New profile, **When** a valid unique name and account note are submitted, **Then** the profile appears and can be opened for manual sign-in; creation alone never claims it is signed in.
3. **Given** invalid input, a duplicate name or a failed operation, **When** the action is attempted, **Then** its error remains visible beside the relevant controls and input is retained for correction.
4. **Given** a long list or narrow window, **When** it scrolls, **Then** names, actions and the creation form remain accessible without horizontal scrolling.
5. **Given** a working profile, **When** Delete is cancelled, **Then** the profile and its data remain unchanged.

### User Story 2 - Back up one managed profile from the CLI (Priority: P2)

Alex exports a closed GeckIt-managed Chrome for Testing profile into a file with its name and account note.

**Independent Test**: Export a synthetic profile containing bookmarks, preferences and representative browser files; verify the archive describes its source and preserves the intended files.

**Acceptance Scenarios**:

1. **Given** a closed managed profile, **When** export is requested with an output file, **Then** a private archive is saved with the profile's data and account note.
2. **Given** an open or starting profile, **When** export is requested, **Then** it is refused with instructions to close that profile first; no browser is closed automatically.
3. **Given** an existing output file, **When** export is requested at that path, **Then** the existing file is preserved and the command fails clearly.
4. **Given** a completed export, **When** the CLI reports success, **Then** it names the file and explains that sign-ins may require renewal on another computer.

### User Story 3 - Restore on this or another computer (Priority: P2)

Alex transfers the archive himself, then imports it with the destination computer's CLI under a new profile name. He opens it there and signs in again where required.

**Independent Test**: Import into a clean temporary browser store; check file contents and account note, then list the restored profile. This does not establish live cross-machine authentication.

**Acceptance Scenarios**:

1. **Given** a valid archive, **When** it is imported under an unused name, **Then** a closed profile appears with its note and saved browser data.
2. **Given** an existing destination name, **When** import is requested, **Then** the existing profile is preserved and the command asks for another name.
3. **Given** an invalid, truncated or unsafe archive, **When** import is requested, **Then** it fails without writing outside the profile store or leaving a usable partial profile.
4. **Given** a profile imported on another operating system, **When** import completes, **Then** the CLI explains that sign-ins and saved passwords may not work and that the profile needs checking in its browser.

### Edge Cases

- Empty profile before first launch; long names and notes; duplicate names; rapid repeated submissions; failed browser launch; disconnected remote computer.
- Export racing a browser launch; Chrome singleton locks; stale driver records; non-regular files; archive path traversal, duplicate paths, symbolic links, malformed metadata and truncated content.
- Destination profile created during import; failed disk write; output inside the source profile; different Chrome versions or operating systems.

## Requirements

### Functional Requirements

- **FR-001**: Settings MUST present profile name, account note and open/closed status separately and preserve access to actions with long content.
- **FR-002**: The person MUST be able to create a profile and open it for manual sign-in without an assistant creating it first.
- **FR-003**: Creation MUST use the existing lowercase name rule and required account note, reject duplicate names, retain input after failure and prevent repeated submissions while saving.
- **FR-004**: Open MUST expose startup errors rather than treating a failed launch as success.
- **FR-005**: Existing live Sign in and confirmed Delete MUST remain available.
- **FR-006**: CLI export MUST save one closed GeckIt-managed Chrome for Testing profile and its account note; it MUST exclude transient caches, singleton files and GeckIt ownership or sign-in-link records.
- **FR-007**: CLI import MUST restore into a new name, validate its archive and paths, preserve existing profiles and clean incomplete imports.
- **FR-008**: Export and import MUST never promise portable authentication, decrypt operating-system credentials or transfer the operating-system key store.
- **FR-009**: Operations MUST preserve unrelated profiles, ordinary Chrome, running conversations and existing output files.
- **FR-010**: CLI help MUST document the transfer procedure, sensitive archive contents and the need to sign in again where required.

### Key Entities

- **Managed profile**: GeckIt-owned Chrome for Testing user-data directory, name, account note and open/closed status.
- **Profile archive**: One profile's browser files and metadata identifying the archive format, source operating system and browser version when known.
- **Destination profile**: A newly named managed profile restored from an archive, whose authentication is not assumed ready.

## Success Criteria

### Measurable Outcomes

- **SC-001**: From Settings, creation and opening can be completed without CLI commands or an assistant.
- **SC-002**: Each long profile name, note and action remains readable and reachable at desktop and narrow Settings sizes in both themes.
- **SC-003**: A synthetic export/import round trip preserves all included files byte for byte and retains the account note.
- **SC-004**: Busy profiles, collisions and malformed imports fail without changing existing profile data or files outside the destination store.
- **SC-005**: Every successful cross-machine import explicitly states that authentication must be checked and may need repeating.

## Assumptions

- "Chrome profiles" refers to the GeckIt-managed Chrome for Testing profiles shown in the screenshot, not ordinary Chrome's own profiles.
- File transfer between computers is manual in this change; CLI paths refer to the computer running the command. Automatic paired-computer archive transport is outside this change.
- Export is a backup of browser files, potentially containing sensitive website data, not a guarantee that signed-in sessions can move.
- Remote live sign-in from feature 025 remains the supported way to establish authentication on a destination computer.
- This extends existing profile management. It explicitly revisits feature 025's blanket exclusion of copying profiles while preserving its credential-store boundary.
