# Feature Specification: Manager chat in the app

**Feature Branch**: Not created; specification in the current checkout

**Created**: 2026-11-05

**Status**: Implementation authorized by Alex on 2026-11-05

**Input**: User description: "Я хочу, чтобы был чат с менеджером в приложении тоже, не только в телеграмм"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Talk to Manager without leaving the app (Priority: P1)

Alex opens Manager in GeckIt, writes a task, follows the answer and continues the conversation. Telegram is optional, including during first setup.

**Why this priority**: The existing app shows Manager history but directs every message to Telegram.

**Independent Test**: With Telegram disconnected, configure and enable Manager, send a task in the desktop app, receive an answer and send a follow-up in the same conversation.

**Acceptance Scenarios**:

1. **Given** an enabled Manager, **When** Alex opens Manager from the existing status control or Team, **Then** the shared conversation and a text composer are available.
2. **Given** a fresh configuration without Telegram, **When** Alex chooses an available assistant and delegation policy and enables Manager, **Then** the app can send a task without asking for a bot or Telegram account.
3. **Given** Manager is working, **When** Alex sends another message, **Then** it enters the existing ordered Manager queue and its pending state is visible.
4. **Given** a rejected send, **When** the error appears, **Then** the text remains editable and no success is claimed.

### User Story 2 - Continue the same conversation across channels (Priority: P2)

Alex uses the app or the paired Telegram bot to reach the same Manager, with the same context, workers and pending decisions.

**Why this priority**: A second independent Manager would split decisions and repeat work.

**Independent Test**: Send a request in Telegram, continue it in the app and verify that both use the existing Manager and worker records; restart GeckIt and reopen the recorded conversation.

**Acceptance Scenarios**:

1. **Given** a task received from Telegram, **When** Alex opens the app chat, **Then** its text, source and Manager's response are visible and a follow-up uses that conversation.
2. **Given** an app-origin task, **When** Telegram is disconnected or its token fails, **Then** app coordination continues if Manager's assistant and other existing prerequisites are available.
3. **Given** an existing Manager with retained history, **When** the feature is first opened, **Then** it preserves that session and its workers without restarting them.
4. **Given** a pending decision, **When** Alex answers in one channel, **Then** the other channel reflects that it is resolved; an old button cannot execute it again.

### User Story 3 - Use Manager from the paired phone app (Priority: P2)

Alex opens Manager from Tasks or Team on the phone, sends text and answers supported questions through the paired computer.

**Why this priority**: The phone app is also GeckIt; requiring Telegram there would leave the requested workflow incomplete.

**Independent Test**: With a connected paired computer and Telegram disconnected, open Manager on the phone, send a request and answer a supported decision. Disconnect the computer and verify that unsent text is retained.

**Acceptance Scenarios**:

1. **Given** a configured Manager and paired computer, **When** Alex taps Manager in Tasks or Open chat in Team, **Then** the same conversation opens as a phone page with Back.
2. **Given** the paired computer goes offline, **When** Alex tries to send, **Then** the phone shows connection loss, retains the draft and does not claim delivery.
3. **Given** a request requiring desktop-only native interaction, **When** Alex opens it on the phone, **Then** the app directs him to the computer without treating ordinary chat text as approval.

### Edge Cases

- Empty and whitespace-only text cannot be sent; slash and shell-like input remain text requests.
- Pause, disable, provider failure and VPN refusal retain the draft and show the existing recovery action; they never silently bypass a guard.
- A double click or a retry after an uncertain response cannot create duplicate accepted messages or duplicate work.
- Simultaneous Telegram and app input follows the same queue; no second Manager is started.
- Closing the chat preserves accepted work and the unsent draft; restart restores retained history and pending work.
- A session restarted deliberately uses the current Manager; late updates and approvals for the old session cannot affect it.
- Long messages, a long transcript, mobile keyboard and scroll position must remain usable in both themes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: GeckIt MUST provide a text conversation with Manager on desktop and the paired phone app, through the existing Manager role.
- **FR-002**: Desktop MUST open that chat from the Manager status control and an Open chat action in Team > Manager; phone MUST expose it from Tasks and Team > Manager.
- **FR-003**: First setup and app messaging MUST work without a Telegram connection; connecting Telegram remains optional and retains its existing account confirmation.
- **FR-004**: App and Telegram messages MUST use the same configured Manager, context, worker records and ordered queue. Existing sessions and history MUST be preserved on upgrade.
- **FR-005**: The app MUST show accepted requests, pending queue state, Manager answers and their recorded channel attribution. Acceptance MUST NOT be described as an assistant having read or completed the request.
- **FR-006**: Pending questions, delegation decisions and supported native approvals MUST be answerable in the app with the same identity, validity and permission checks as the existing host workflow. Stale answers MUST NOT execute again; unsupported native requests MUST retain their established desktop flow.
- **FR-007**: Paused, disabled, blocked and offline states MUST explain the next action and retain unsent text. Sending text MUST NOT resume or enable Manager implicitly.
- **FR-008**: Failed and uncertain sends MUST reconcile against the accepted request before a retry; accepted work MUST survive closing the chat and host restart without duplicate dispatch.
- **FR-009**: The composer MUST support multiline text, keyboard sending on desktop, accessible labels and visible focus. Phone MUST use an explicit Send control without consuming the multiline Return key.
- **FR-010**: Opening, closing or navigating away from the chat MUST NOT interrupt Manager or its workers; drafts MUST survive reopening and app restart.
- **FR-011**: Existing Telegram requests, replies, attachments, shortcuts and lifecycle controls MUST continue working. This change does not add app attachments or reinterpret Telegram commands as app controls.
- **FR-012**: The paired phone MUST use its paired computer's Manager and existing connection/permission boundaries; it MUST NOT require an independent assistant login.

### Key Entities

- **Manager conversation**: The existing configured Manager and its current session, retained history, workers and lifecycle state.
- **User request**: Text, origin channel, stable request identity and accepted/pending outcome.
- **Pending decision**: A host-bound request, its valid answer choices and resolution state shared across surfaces.
- **Composer draft**: Unsent text associated with Manager on the current device, distinct from accepted work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With Telegram disconnected, Alex can enable Manager, send a task, receive an answer and send a follow-up on desktop, and repeat messaging on the paired phone.
- **SC-002**: Opening Manager chat takes one action from the desktop status control or the phone Tasks page after setup; Team > Manager provides an explicit Open chat action.
- **SC-003**: In acceptance scenarios for duplicate submit, response loss, restart and simultaneous channel input, each accepted request appears once and is dispatched at most once unless Alex explicitly requests new work.
- **SC-004**: All tested decision types retain their existing permission checks, and answering in a second channel never executes an already resolved decision.
- **SC-005**: The primary send, queue, answer, recovery and draft-return paths pass in light and dark themes at desktop 1440 × 900, narrow desktop 900 × 700 and phone 390 × 844, including keyboard focus and transcript scrolling.

## Assumptions

- "В приложении" includes desktop GeckIt and its existing paired phone app. First setup and account changes remain on desktop.
- Manager remains the coordinator across projects and has no normal board task card.
- The current Manager inspection provides the desktop chat entry; Team continues to own setup, instructions and lifecycle settings.
- Telegram remains an additional channel to the same Manager. Its existing notification behavior is preserved; no new cross-posting of app messages to Telegram is required.
- Initial app input is text only; existing Telegram attachments remain supported.
- Existing provider/account availability, VPN policy, permissions and paired-computer connectivity remain prerequisites.
