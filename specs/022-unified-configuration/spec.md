# Feature Specification: Unified configuration

**Feature Branch**: Original storage delivered on `main`; UI follow-up isolated on `feat/configuration-transfer-ui` in `/private/tmp/geckit-configuration-ui`.
**Created**: 2026-11-05
**Status**: Implementation authorized
**Input**: "ok, then merge into one. Like it's in vscode, with sections"

## User Scenarios & Testing

### User Story 1 - Keep configuration together (Priority: P1)

The person keeps preferences, employees, Manager instructions, hosts and saved automation in one readable file with named sections.

**Why this priority**: Copying several unrelated configuration files is unreliable.
**Independent Test**: Change preferences, an employee and Manager instructions through existing APIs, restart their owners, and read the same values from one configuration file.

**Acceptance Scenarios**:
1. Given an existing installation, when the new version first reads configuration, then preferences, employees and Manager configuration are preserved and original files are backed up.
2. Given separate preference, employee and Manager changes, when each saves, then the others' sections survive.

### User Story 2 - Move configuration (Priority: P2)

The person copies the configuration file to another stopped GeckIt installation and retains reusable settings without transferring conversations or device credentials.

**Why this priority**: This was the reason for the consolidation request.
**Independent Test**: Copy only configuration between two temporary data directories and read the resulting preferences, employee IDs, shortcut assignments and Manager instructions; destination pairing and runtime state remain its own.

**Acceptance Scenarios**:
1. Given copied configuration, when the destination starts, then shared settings load without source pairing secrets, queue state or account credentials.
2. Given a malformed or newer unsupported file, when configuration is read or saved, then the original bytes remain intact and the failure is reported.

### User Story 3 - Transfer from Settings (follow-up)

Alex asked to add Open configuration, Export and Import controls. Desktop Settings > General uses native file pickers and a confirmed replacement with automatic backup and restart. Cancellation preserves configuration; active or queued work blocks import. See [Approved UX](../../docs/ux/configuration-transfer.md). Alex approved the UX flow on 2026-11-05.

### Edge Cases

Missing legacy files; repeated migration; empty employee list; omitted configuration sections; invalid employee catalog; failed backup or atomic write; external editor replacement; unknown future fields; source/development isolation; standalone CLI reads; session-ID migration.

## Requirements

### Functional Requirements

- **FR-001**: Keep reusable configuration in one versioned file with named sections.
- **FR-002**: Automatically migrate legacy preferences, employees and Manager configuration without losing their original files or runtime state.
- **FR-003**: Keep device identity, pairing secrets, conversation metadata and Manager queues outside reusable configuration; keep encrypted credentials in their existing stores.
- **FR-004**: Preserve sibling and unknown configuration fields on writes; reject unreadable or unsupported configuration rather than replacing it with defaults.
- **FR-005**: Existing preference, employee, Manager, CLI and metadata-migration entry points must use the same configuration.
- **FR-006**: Document how to copy configuration while both services are stopped, including local path and provider-library requirements.
- **FR-007**: Verify migration, owner interleaving, corruption/failure preservation, restart and copy-to-another-directory behavior using actual filesystem operations without live provider calls.

- **FR-008**: Offer Open configuration, Export and Import in desktop General Settings.
- **FR-009**: Validate and confirm import, refuse active/queued work, preserve private backups, and load replacement only after the old service exits.
- **FR-010**: Show truthful cancellation/error/progress feedback and verify keyboard, scrolling, light and dark states in the actual renderer.

### Key Entities

- Configuration: reusable settings grouped by purpose, employee catalog and Manager instructions.
- Local state: device identity and recorded work, tied to one installation.
- Legacy backup: originals preserved before the consolidated file replaces old preferences.

## Success Criteria

- **SC-001**: One file carries all reusable preferences, employees and Manager configuration.
- **SC-002**: Migration and restart preserve all configured values in the test fixture.
- **SC-003**: Copying configuration carries none of the source's pairing keys, conversation queues or credential ciphertext.
- **SC-004**: Failed or invalid writes leave the last valid configuration usable.

## Assumptions

- "Another app" means another GeckIt installation; unrelated products need their own format adapter.
- The follow-up requests file access and export/import in the existing Settings screen. JSON-with-comments editing remains outside scope.
- Copying uses the filesystem with both GeckIt services stopped; accounts and provider libraries are installed separately and paths must exist on the destination.
- Existing desktop/phone contracts stay flat; grouping is the persistence format.
