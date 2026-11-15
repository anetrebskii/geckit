# Feature Specification: Shortcut result destinations

**Feature Branch**: `feat/shortcut-destinations`

**Created**: 2026-11-15

**Status**: Implemented and locally verified; live delivery remains unverified (see verification report)

**Input**: Alex requests a saved transport and destination for each scheduled job/shortcut. Discord -> #general must receive a new thread for each completed run; replying continues that run through Manager with original context.

## User Scenarios & Testing

### User Story 1 - Choose a result destination (Priority: P1)

Alex edits a shortcut, chooses a supported channel transport and a specific place within it, saves, and sees that choice after reopening and restart. Existing jobs keep their current behavior until explicitly changed.

**Independent Test**: Save from desktop, phone and existing CLI boundaries, reload authoritative settings, compare values. Cancel and invalid values leave saved data unchanged.

**Acceptance Scenarios**:

1. Given connected Discord with an accessible text channel named general, choosing Discord and general persists its stable identity rather than only its display name.
2. Given a shortcut without a destination, opening and saving it preserves legacy execution and sends no new external message.
3. Given unavailable or unsupported transport/destination, the interface explains readiness and never silently redirects output.

### User Story 2 - Receive and continue one completed run (Priority: P1)

Each completed run creates a new result conversation at the chosen destination. Alex replies there and Manager can continue the originating task with its prompt, execution context and source conversation. Another run has another thread and cannot inherit the previous run's reply route.

**Independent Test**: Run twice with controlled provider and transport boundaries, complete both, inspect distinct native thread receipts, inject authorized replies and verify actual Manager inbox and original worker identities. Repeat after state reload.

**Acceptance Scenarios**:

1. A completed Discord run creates one new thread in the selected channel containing the result. An intermediate Manager acknowledgement does not count as completion.
2. An allowed user's unmentioned reply inside that thread reaches the matching Manager context and the original worker can be resumed.
3. A later run has a distinct thread and context. A duplicate completion event does not post again.
4. Invalid ownership or unauthorized authors cannot continue or read another run's work.

### User Story 3 - Understand delivery failures and transport differences (Priority: P2)

Delivery has a visible outcome distinct from task execution. Connection loss, missing permissions and deleted destinations preserve the result and actionable failure state. An uncertain send is never presented as success or automatically repeated as a new thread.

**Independent Test**: Exercise disabled channel, removed destination, refused and uncertain delivery, stopped Manager, long output, repeated events, restart and old settings.

### Edge Cases

Destination edits while a run is active; shortcut deleted after admission; run completes before start receipt is returned; Manager delegates several workers; worker awaits approval; source context unavailable; duplicate gateway events; channel restarted; old host drops fields; thread archived; secret-containing result; transport has no native threads.

## Requirements

### Functional Requirements

- **FR-001**: Every shortcut supports an optional persisted transport plus stable destination identity, independent of timetable and target.
- **FR-002**: UI, save/readback, CLI, schema, phone and service interfaces agree on the setting; unsupported old hosts fail explicitly rather than silently dropping it.
- **FR-003**: Each run snapshots its destination, prompt, target and source identities; edits to the shortcut do not retarget accepted runs.
- **FR-004**: Discord text channels receive a new thread and completed result for every run. Separate runs have separate native and Manager context identities.
- **FR-005**: Authorized messages in a result thread enter Manager and retain access to the originating context and worker, within existing ownership, queue, approval and authorization contracts.
- **FR-006**: Manager shortcuts deliver after the run's work finishes, not merely after enqueue or an acknowledgement.
- **FR-007**: Modules advertise real available destination semantics; absent support remains unavailable, with no promise of native threads.
- **FR-008**: Failure, uncertainty, restart and duplicate events preserve run identity and never silently fall back to another destination.
- **FR-009**: Legacy schedules without destinations preserve their prior execution and output behavior.
- **FR-010**: Results pass the existing secret-cleaning boundary before leaving GeckIt.
- **FR-011**: No real schedules change and no arbitrary live channel receives a test post. Use only a demonstrably safe project path or document the exact remaining live check.
- **FR-012**: Verify real renderer interactions and full-screen layout in light/dark at desktop and phone sizes; separate fake transport/provider evidence from actual integration evidence.

### Key Entities

- Shortcut destination: transport identity and stable place identity with a display label.
- Shortcut run: admitted occurrence, source configuration snapshot, execution/context identities, completion result and delivery state/receipt.
- Result route: native thread or reply identity bound to one run's Manager context.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A saved destination survives authoritative reload and is identical through UI and CLI.
- **SC-002**: Two completed runs produce two independent result threads, and each authorized reply continues only its own source task.
- **SC-003**: Duplicate completion/reconnect does not create another result thread for the same known delivery.
- **SC-004**: All required acceptance scenarios have inspectable evidence with mock/live boundaries, and any unavailable live checks are explicitly named.

## Assumptions

The configured channel decides who may write. Existing provider, Manager and native approval rules remain authoritative. Legacy jobs opt into external delivery only by an explicit edit. Saving a destination does not prove a working live connection. Actual transport capabilities are established from current module code before implementation.
