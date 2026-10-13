# Feature Specification: VPN public IP guard and error retry

**Feature Branch**: Not created; specification prepared in the requested main checkout.

**Created**: 2026-10-10

**Status**: Implemented and verified in the working tree

**Input**: User description: "Add control that VPN enabled, only then allow to start or continue session. List public IP addresses of my VPNs. If enabled and IP differs, do not send info to model; show explanation and Try again, like Continue, when an error happens."

## User Scenarios & Testing

### User Story 1 - Block sending outside approved public IPs (Priority: P1)

Alex enables a setting and lists his VPN public IPs. Starting or continuing a conversation is allowed only after a fresh public IP check matches the list.

**Why this priority**: A warning after sending cannot protect the message.

**Independent Test**: With the guard enabled, simulate matching, mismatching and unavailable IP checks and observe whether any conversation content is sent.

**Acceptance Scenarios**:

1. **Given** the guard is off, **When** Alex starts or continues a session, **Then** existing behavior applies without an IP lookup.
2. **Given** the guard is on and the current public IP matches an approved address, **When** Alex sends, **Then** the requested operation proceeds once.
3. **Given** the guard is on and the IP does not match, **When** Alex sends, **Then** no session content is sent, the message and attachments remain available, and the explanation names the observed IP and offers Try again.
4. **Given** the guard is on and the IP cannot be verified, **When** Alex sends, **Then** sending is blocked with an explanation and Try again.
5. **Given** a queued or scheduled message was prepared while the IP matched, **When** its actual dispatch occurs after the IP changes, **Then** it is held without sending and without automatic repeated retries.
6. **Given** Alex sends from the phone, **When** the guard blocks the operation, **Then** the check uses the paired computer's IP and the phone shows the actual guard explanation.

---

### User Story 2 - Configure approved addresses (Priority: P1)

Alex opens the dedicated VPN IP check settings tab and edits one computer-wide setting with an enable switch and a list of public IPv4 or IPv6 addresses.

**Why this priority**: The blocking rule must be explicit and remain configured between launches.

**Independent Test**: Save valid addresses, try invalid and empty enabled lists, reopen settings and restart the app.

**Acceptance Scenarios**:

1. **Given** the guard is off, **When** Alex saves valid addresses and enables it, **Then** all GeckIt conversation entry points on that computer use that list.
2. **Given** Alex enters an invalid address, **When** he saves, **Then** the field identifies the invalid entry and the prior effective configuration remains intact.
3. **Given** the guard is on, **When** the effective list is empty or unreadable, **Then** sends remain blocked until Alex configures it or explicitly disables the guard.
4. **Given** saved addresses, **When** Alex disables the guard, **Then** the addresses are retained for later use.

---

### User Story 3 - Recover from an error in place (Priority: P2)

Alex sees Try again at the end of an errored conversation, where Continue appears after Stop. Retrying a blocked operation sends the saved operation after a new check. Retrying a turn that had already started continues the conversation instead of replaying the original instructions.

**Why this priority**: Recovery should not require retyping or accidentally repeat completed actions.

**Independent Test**: Block a message, repair the connection, press Try again twice rapidly, then test an error after the assistant has already started work.

**Acceptance Scenarios**:

1. **Given** a message was blocked before dispatch, **When** Alex fixes the VPN and presses Try again, **Then** the same text and attachments are checked again and sent once without duplicate transcript messages.
2. **Given** a turn failed after dispatch, **When** Alex presses Try again, **Then** the existing conversation receives a continuation after a fresh IP check.
3. **Given** the assistant is stopped by Alex, **When** he opens it, **Then** the action remains Continue.
4. **Given** a retry is checking or working, **When** Alex presses again, **Then** no second operation is submitted.
5. **Given** Alex has typed another draft, **When** he retries an older failed operation, **Then** the draft is preserved.

### Edge Cases

- No internet, timed-out lookup, malformed reply and lookup service failure all block sending while enabled.
- Whitespace, duplicate addresses and equivalent IPv6 spellings do not create different approved identities; hostnames, ranges and private-only addresses are rejected.
- Where both public address families can carry model traffic, an unapproved or unverified usable family must not silently pass because another family matched.
- Changing settings during a lookup invalidates that result; dispatch uses the effective settings at dispatch time.
- Queue order and unsent attachments survive a blocked dispatch; no following message bypasses it in that conversation.
- Closing settings discards only an unsaved address edit. Closing a conversation does not discard its held operation.
- Stopping or cancelling remains available while the guard blocks sends.
- An SSH host or provider library may send from a different computer; the proposed first version checks the computer running GeckIt and explicitly describes this boundary.
- A VPN can drop after a successful check. While enabled, periodic checks interrupt active work after detecting failure, with a detection/stop delay; this is not continuous routing enforcement.

## Requirements

### Functional Requirements

- **FR-001**: GeckIt MUST provide a disabled-by-default, computer-wide public IP guard with persistent enable state and approved address list.
- **FR-002**: Settings MUST accept exact public IPv4 and IPv6 addresses, validate all entries before saving, remove duplicates and retain the list when disabled.
- **FR-003**: With the guard enabled, GeckIt MUST verify a current matching public IP before starting, resuming or submitting conversation content through any GeckIt entry point, including desktop, phone, shortcuts, scheduled work, queue dispatch, Send now, restart continuation and automatic follow-ups initiated by GeckIt.
- **FR-004**: A mismatch, failed verification, empty effective list or unusable configuration MUST block the operation before session creation or resume can send conversation context, goal text, messages or attachments to the model.
- **FR-005**: Successful checks MUST NOT be reused for later sends; settings changes during a check MUST be respected before dispatch.
- **FR-006**: A blocked operation MUST retain its text, attachments and destination, identify why it was blocked, and offer Try again.
- **FR-007**: Try again MUST run a new check and perform at most one saved operation; it MUST preserve unrelated drafts and avoid duplicate transcript messages.
- **FR-008**: Conversation errors MUST offer Try again in the same transcript position as Continue after Stop; retry after an already-started turn MUST continue the existing conversation rather than replay its original prompt.
- **FR-009**: A blocked queue or automatic continuation MUST wait for a deliberate retry, edit, cancellation or new submission; a failed check MUST NOT cause a repeated dispatch loop.
- **FR-010**: Phone requests MUST use the paired computer's effective guard and return its actual explanation rather than a generic connection error.
- **FR-011**: The setting MUST state that it checks the computer running GeckIt, does not verify SSH-host egress and cannot prevent traffic between periodic checks or replace a VPN kill switch.
- **FR-012**: The lookup MUST disclose its service in settings and send no conversation content, attachments, goals or approved-address list to that service.
- **FR-013**: Answers that resume model work and goal-changing operations MUST follow the same gate; cancelling or stopping MUST remain available without a successful check.

- **FR-014**: The single disabled-by-default VPN IP check setting governs both before-send verification and active-session stopping. Whenever enabled, perform an immediate shared check when work/monitoring becomes active and every 10 seconds thereafter, with no overlapping periodic checks or idle probes.
- **FR-015**: On periodic mismatch or verification failure, interrupt GeckIt-owned active sessions and supported background/Remote Control work, hold existing queues, show a specific VPN explanation and preserve manual Try again recovery. Late provider events MUST NOT erase the hold or resume queued work.
- **FR-016**: Settings changes/disposal invalidate stale periodic results. Success stays silent, never replaces before-send checks, and recovered connectivity/disabling MUST NOT automatically resume paused work. Retry continues started work rather than replaying its original prompt.

### Key Entities

- **IP guard configuration**: Enable state and canonical approved public addresses, owned by the computer running GeckIt.
- **IP check result**: Current verified address information or a specific failure, associated with the attempted operation and effective configuration.
- **Held operation**: Unsent message, continuation or answer with destination and attachments, retained for explicit retry or cancellation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every covered dispatch scenario with a mismatch or unverifiable IP sends zero conversation content and initiates zero conversation starts or resumes that transmit context.
- **SC-002**: Every successfully recovered blocked operation sends its retained content exactly once, including rapid double-click retries.
- **SC-003**: Every conversation error with a recoverable destination shows an actionable Try again control on desktop and phone.
- **SC-004**: A check completes or reports a blocking error within 10 seconds; the interface remains usable throughout.
- **SC-005**: Disabled mode performs zero public IP checks, and configuration survives an application restart.

## Assumptions

- Before-send scope was approved on 2026-10-10. Alex approved ten-second active-session monitoring and stopping on mismatch/unavailable lookup on 2026-10-11 with "implement it", then requested automatic monitoring under the main flag and removal of the separate option.
- "Computer" means the computer running GeckIt; the phone's public IP is irrelevant to its model session. SSH host egress checking would require a separate scope decision.
- The guard applies to conversation/session operations. Selected-text correction, provider account/usage lookups, terminal sessions outside GeckIt are outside this session feature. Provider-owned traffic between checks cannot be intercepted; supported active work is interrupted after periodic failure when the new option is on.
- Exact public IP matching is the user's chosen VPN indicator; it cannot prove routing of every destination or replace a VPN kill switch.
- IP discovery needs a reachable external service. ipify IPv4/IPv6 probes verify configured address families; unsuccessful verification blocks.
- UX behavior was approved on 2026-10-10; prototype/review precedes UI implementation. The product feature list remains unchanged until this feature is implemented.

Periodic extension acceptance: fake timers prove shared ten-second cadence/no overlaps/no idle probes; stale/off/disposed results do not stop sessions; mismatch/unavailable interrupts once, parks queues despite late end events, retains unsent work and requires explicit retry.
