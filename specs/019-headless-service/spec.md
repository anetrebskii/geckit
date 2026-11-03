# Feature Specification: Headless GeckIt service

**Feature Branch**: `main` (existing checkout, unrelated edits preserved)
**Created**: 2026-11-03
**Status**: Implementation authorized
**Expanded request**: "Полностью реализуй это выделение, чтобы CLI и desktop работал, и все остальное тоже". Full extraction includes desktop and CLI as service clients.

**Input**: "Сделай это, выдели" following agreement to extract the core, run it without GUI and control it through CLI first.

## User Scenarios & Testing

### User Story 1 - Run without a display (Priority: P1)
An operator runs GeckIt continuously on a machine without a graphical session, then disconnects their terminal.
**Independent Test**: Start in an isolated data directory without display variables; query readiness from another process and terminate cleanly.
**Acceptance Scenarios**:
1. Given an installed service, when started, then it reports ready without creating windows or importing desktop APIs.
2. Given a running instance, when a second instance targets the same data directory, then the second fails without disturbing the first.
3. Given saved settings and tasks, when restarted, then they remain available.

### User Story 2 - Work through CLI (Priority: P1)
An operator registers a project, starts a task, reads its messages, answers a pending request and stops work from separate commands.
**Independent Test**: A child provider fixture executes a task after the submitting CLI exits; another command reads its result and persisted state.
**Acceptance Scenarios**:
1. Given a registered folder and available assistant, when a task is submitted, then execution belongs to the service and survives client disconnect.
2. Given an approval, when listed and explicitly answered, then the existing bound approval mechanism decides the result.
3. Given a settings or Manager edit, when accepted, then a fresh read returns the saved value.

### User Story 3 - Share the runtime with desktop (Priority: P2)
Desktop connects to the independently owned service and retains its existing native features.
**Independent Test**: Start built Electron with isolated service data, change state from desktop and CLI, close desktop during work, then reopen and observe the completed task.
**Acceptance Scenarios**:
1. Given desktop startup, when it attaches, then the separate service supplies providers, queues, settings and events.
2. Given no desktop features in service mode, when a desktop-only facility is requested, then it is explicitly unavailable rather than implicitly approved.

### Edge Cases
Stale ownership/socket files; simultaneous startup; malformed/oversized requests; provider unavailable; required sign-in; VPN policy blocks; client disconnect during a proposal; pending approvals at shutdown; existing personal data; corrupt configuration; service startup failure.

## Requirements

### Functional Requirements
- **FR-001**: Run continuously without a display or graphical runtime.
- **FR-002**: Give one process ownership of a data directory and reject a competing owner safely.
- **FR-003**: Support CLI readiness, settings, projects, session start/list/items/send/stop/retry and explicit pending-request answers.
- **FR-004**: Keep operator task execution independent of a connected client.
- **FR-005**: Reuse session, employee, Manager, provider and scheduling rules with desktop; expose Manager configuration and requests through CLI.
- **FR-006**: Retain provider subscription authentication, VPN checks and native approval semantics; an assistant cannot acquire operator authority through the new commands.
- **FR-007**: Persist settings/task state and dispose timers, processes and sockets on termination.
- **FR-008**: Provide build, run and system service instructions with honest integration boundaries.

### Key Entities
Service instance (data directory, owner, readiness); project; existing session/message/card; employee; Manager; settings; operator request.

## Success Criteria
### Measurable Outcomes
- **SC-001**: A separate client can observe ready state and manipulate a task without a graphical session.
- **SC-002**: Task output arrives after the submitting client has exited and remains readable after service restart.
- **SC-003**: A competing start leaves the original instance reachable and its data intact.
- **SC-004**: Existing core behavior checks and desktop build pass.

## Full extraction acceptance
- **FR-009**: Desktop connects to the same independently running Node service used by CLI. Desktop must not construct Sessions, Employees, Manager, Hosts or the scheduler, or write their state files.
- **FR-010**: Normal dev/build/package includes the service. Desktop starts it when absent; closing desktop leaves accepted tasks running. A second client observes the same settings, sessions and approvals.
- **FR-011**: Stream core events to desktop and phone bridge; after reconnect obtain authoritative snapshots. Never replay uncertain mutations automatically.
- **FR-012**: Preserve Telegram, intake, SSH, Plans, providers, exports, queues, employee memory, shortcuts, correction and transcription in service composition. Native capture, dialogs, desktop notifications and phone WebRTC stay native adapters.
- **FR-013**: Preserve secure secret persistence in a Node-only service, with explicit unavailable state if no supported key backend is configured; migrate legacy desktop ciphertext only after successful authenticated transfer.
- **FR-014**: Verify service/CLI/desktop boundaries through running isolated processes, including desktop detach/reattach, bidirectional event effects, bytes, settings persistence and pending approvals.

## Assumptions
Node 22+ and separately installed/signed-in provider CLIs under the service user's account. Existing workflows are preserved. Adding Slack, multi-user authorization and portable configuration import are separate product features, not necessary for completing the existing service/client boundary. Native facilities require the desktop adapter and its OS permissions; the service never invents an approval. Tests with a fixture provider do not establish a real account integration.
