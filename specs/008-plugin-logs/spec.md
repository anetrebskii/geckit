# Feature Specification: Plugin logs

**Feature Branch**: Current checkout; coordinated with concurrent work.
**Created**: 2026-10-09
**Status**: Implementation authorized.
**Input**: "Can we support logs for plugins? And implement in all current plugins?"

## User Scenarios & Testing

### User Story 1 - Audit limits checks (Priority: P1)

Alex can inspect a library's local logs to determine when it checked limits, whether it skipped a check, and why.

**Independent Test**: Request tmux limits repeatedly before and after a message and cooldown. The log distinguishes actual checks from cached answers.

**Acceptance Scenarios**:

1. Given an initialized idle library, when limits are requested without new messages, then the log records a skipped check with its reason and no actual check.
2. Given a newly sent message and elapsed cooldown, when limits are requested, then the log records a check and its outcome.
3. Given overlapping requests, when they share a check, then the log records one actual check.

### User Story 2 - Diagnose every current library (Priority: P2)

Alex can inspect separate logs for Claude tmux, Codex Mirror and OpenCode + Ollama without exposing conversation content.

**Independent Test**: Exercise fake backends for all three libraries and read their events, including lifecycle, limits behavior and send/turn outcomes.

**Acceptance Scenarios**:

1. Given multiple libraries, when operations run, then records identify their source and timestamp in separate bounded logs.
2. Given a failed operation, when a library reports failure, then diagnostics identify the operation without writing prompts, answers, credentials or raw backend response bodies.
3. Given an older library that ignores the logging API, when GeckIt loads it and requests limits, then host events remain available and the library works.

### Edge Cases

- Concurrent active versions and staged validation candidates share a plugin log but identify their load attempt.
- Log writes fail or storage fills: provider behavior continues.
- Logs rotate: one previous file remains available; oldest records expire.
- Initial tmux measurement, cooldown, no new messages, in-flight message and failed send retain the previous fix's behavior.
- Plugin code on older GeckIt versions has no logger and continues working.

## Requirements

### Functional Requirements

- **FR-001**: Provide separate local, timestamped, structured plugin logs with bounded storage and documented access paths on supported desktop platforms.
- **FR-002**: Record host library loading and limits requests separately from library backend measurements.
- **FR-003**: Tmux records actual usage-command checks, outcomes, cache/skip reasons, new-message counts and next allowed check time.
- **FR-004**: Claude tmux, Codex Mirror and OpenCode + Ollama use the shared logging facility for their limits and lifecycle/send outcomes.
- **FR-005**: Existing libraries and updated libraries on older hosts continue working when they do not use or receive the logger.
- **FR-006**: Log failures do not fail operations; normal logs omit conversation text, tool arguments, attachment contents, credentials and backend bodies.
- **FR-007**: Concurrent records remain valid and ordered across loaded versions; rotation retains at most a current and one previous bounded file per library.

### Key Entities

- Plugin log: one library's bounded local diagnostic history.
- Log record: timestamp, severity, plugin identity, operation event and scalar diagnostic fields.
- Check: one attempt to obtain backend limits, distinct from a request answered by cache.

## Success Criteria

- **SC-001**: All three current libraries produce readable diagnostic events in deterministic backend tests.
- **SC-002**: A quiet tmux library produces zero additional checks after its initial measurement, regardless of polling, until a new message is successfully sent.
- **SC-003**: Overlapping requests produce one backend check and distinguish shared/cached requests.
- **SC-004**: Simulated write failures preserve provider behavior; secret/content fixtures do not appear in logs.

## Assumptions

- This change adds file-based diagnostics, with documented terminal access. No new settings controls or mobile log viewer.
- Logs are local, enabled when GeckIt runs libraries, and not sent externally.
- Current plugins include the two maintained examples and their external source repositories, plus the external tmux library. Installed immutable running copies are not edited.
- Publishing and installing updates are separate from implementation.
