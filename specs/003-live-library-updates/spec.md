# Feature Specification: Apply provider library updates while GeckIt runs

**Feature Branch**: `003-live-library-updates`

**Created**: 2026-10-08

**Status**: Implemented

**Input**: User request: "can you implement to make it happen?" Context: activate a ready provider library update without reopening GeckIt.

## User Scenarios & Testing

### User Story 1 - Apply a ready library update (Priority: P1)

A person sees that a provider library has an update ready, applies it from Settings > Libraries, and keeps using GeckIt without closing or reopening the app.

**Why this priority**: The existing restart requirement delays fixes and improvements even after the update has downloaded and passed validation.

**Independent Test**: Stage a valid provider update, apply it from Settings, and start or continue a conversation. GeckIt remains open and the updated provider handles the next eligible turn.

**Acceptance Scenarios**:

1. **Given** a validated update is ready, **When** the person chooses Apply update, **Then** GeckIt loads it in the running app, removes the ready state, and confirms success.
2. **Given** a conversation is working on the old provider, **When** an update is applied, **Then** its current turn completes on the old provider and its next user message resumes through the new provider.
3. **Given** an update cannot be loaded or installed, **When** the person applies it, **Then** the old provider remains available, the update remains ready, and an actionable error is shown.

### Edge Cases

- The update finishes downloading while an apply action is already running.
- The installed provider disappears or changes identity between staging and apply.
- The new provider fails to initialize after its files replace the installed copy; GeckIt restores the old copy.
- Multiple libraries have ready updates; each row applies only its own update.
- The library has active and idle conversations when the update is applied.
- The person starts a conversation while the update is being applied; it uses one complete provider version.

## Requirements

### Functional Requirements

- **FR-001**: Settings > Libraries MUST offer an Apply update action for each validated ready update.
- **FR-002**: Applying an update MUST NOT require restarting or closing GeckIt.
- **FR-003**: GeckIt MUST validate and initialize the candidate before treating it as the active provider.
- **FR-004**: If applying fails, GeckIt MUST retain the installed provider and keep the update ready for another attempt.
- **FR-005**: Conversations already running MUST finish their current turn on their current provider version; their next user message MUST resume with the newly active version.
- **FR-006**: New conversations started during an apply MUST use either the complete old provider or the complete new provider, never partially updated files.
- **FR-007**: Settings MUST show progress while applying, clear the ready state on success, and show a retryable error on failure.
- **FR-008**: Applying one library MUST NOT change other libraries or assistant settings.

### Key Entities

- **Ready update**: A validated provider library version staged for explicit or automatic activation, identified by the installed library.
- **Active provider version**: The library implementation used by new conversations and by existing conversations after their current turn.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A person can activate a ready update with one action from its library row without restarting GeckIt.
- **SC-002**: An active conversation completes its current turn without interruption and uses the update on the next message.
- **SC-003**: A failed candidate leaves the previously installed provider usable and the apply action available.
- **SC-004**: Applying one update leaves all other provider rows and assistant selections unchanged.

## Assumptions

- The staged update has already passed the existing manifest, identity, and provider contract checks.
- Existing session IDs and provider contracts remain compatible across versions that keep the same library identity.
- Phone does not own library installation or update controls; activation is performed in desktop Settings.
