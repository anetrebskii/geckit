# Feature Specification: Assistant status

**Created**: 2026-10-08
**Status**: Ready for implementation
**Input**: Design and implement bottom status information for many enabled assistants, on desktop and mobile.

## User Scenarios & Testing

### User Story 1 - See all enabled assistants (Priority: P1)
See each assistant's own account and usage without changing the assistant for a conversation.
**Independent Test**: Enable Claude, Codex and two libraries; each has an independently labeled summary and details.
**Acceptance Scenarios**:
1. Given several assistants, when the board opens, then each enabled assistant has status information.
2. Given a conversation, when another assistant's information opens, then the conversation and composer selection stay unchanged.

### User Story 2 - Read status on a phone (Priority: P1)
Open all assistant information from a compact row on Tasks.
**Independent Test**: At 390 x 844 open Assistants and read every assistant and quota in the sheet.
**Acceptance Scenarios**:
1. Given multiple assistants, when Assistants is tapped, then a scrollable sheet shows all their information.
2. Given a dismissed sheet, when Tasks returns, then the board retains its position.

### Edge Cases
Loading, account unavailable, unsigned account, no reported quota, many quotas, long library names, disconnected SSH host with last measured usage, disabled assistant with a pending response.

## Requirements

- **FR-001**: Show all enabled assistants using their own identity and account data; never substitute another assistant's account.
- **FR-002**: Desktop shows compact labeled summaries, keeping plan/version/installation and all quotas in accessible details.
- **FR-003**: Phone Tasks provides a compact Assistants entry and scrollable details with adequate touch targets.
- **FR-004**: Missing usage is explicitly unavailable, never zero; loading and account errors are readable.
- **FR-005**: Preserve Claude account grouping across SSH hosts and indicate disconnected measurements.
- **FR-006**: Support light/dark themes, Escape, focus restoration, keyboard access and narrow viewports.
- **FR-007**: Reuse existing account refresh cadence and phone bridge; avoid polling per render or per conversation.

### Key Entities
Enabled assistant; provider account; reported quota; Claude place/account usage.

## Success Criteria
- **SC-001**: Four enabled assistants remain reachable at 1280 x 720 and 390 x 844 without clipping information.
- **SC-002**: Every quota is readable in details, including a twenty-quota fixture.
- **SC-003**: Opening status never changes current conversation or assistant selection.

## Assumptions
Existing account calls return provider-specific metadata. This change displays reported information; it does not add provider data collection. User's request authorizes design and implementation together.
