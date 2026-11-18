# Sequential channel approvals

- Request: implement Slack and Discord approval replies, one at a time, recover existing pending chats, and push to main.
- Checkout: /Users/alex/Projects/mine/geckit, main, permanent checkout.
- Started: 2026-11-18. Codex session 01a1ef49-0828-7b11-8c56-81e0670e37b6.

## Acceptance conditions

- Two requests in a thread -> only the first is posted with native buttons and typed choices; answering it confirms the outcome and posts the second.
- Reply or button -> applies only to the displayed request in that thread, with current actor authorization; repeated events and already queued replies cannot consume the next request.
- Reconnect or restart -> pull current Manager decisions and deliver still-pending requests even when an old version saved them as shown before posting; do not replay original user work or approve anything automatically.
- Resolved or cleared request -> remove buttons; stale replies never report success or answer another request.
- Failed prompt post -> keep it eligible for recovery; persisted receipts avoid reposting confirmed prompts.
- Manager receipt and inspection reads -> no configuration-change approval.

## Progress

### 1. Prepare the UX document

- [x] Done: docs/ux/channel-approvals.md records the behavior Alex approved in this conversation.

### 2. Prepare the UI and test it

- [x] Implemented native Slack Block Kit and Discord payloads with request-bound controls and typed fallback. No GeckIt renderer changes. Payload/handler checks passed through actual adapters with fake platform transports; native account rendering remains unverified.

### 3. Write the feature code

- [x] Shared ApprovalQueue, channel adapters, reconnect/startup recovery, thread-scoped decide, and read-only receipt/inspect classification implemented. Typecheck, full lint, service and desktop build passed; final Slack mention routing rechecked.

### 4. Update related distributed skills

- [x] Inspected configure-slack and channel reply skills. Updated configure-slack/references/setup.md with Interactivity, two-request checks and recovery diagnostics; formatting-only reply skills need no change. Source skill installation/profile checks passed within the full suite. Running services were not restarted.

### 5. Update the feature list

- [x] Read existing channel entries and audit. Requested approval for the exact expansion through the conversation; no answer at delivery, so feature list and audit remain unchanged as AGENTS.md requires. Existing Discord guide/UX now links the revised behavior.

### 6. Write unit tests

- [x] Full suite: 2168 passed, 7 skipped, 168 passing files and 5 skipped files. Final focused approval/channel/attachment run: 74 passed. Regression tests cover sequential requests, queued/concurrent/replayed replies, native button identity, thread/DM isolation, independent thread processing, failed posts, receipt reconciliation, restart/resume recovery, reset, stale outcomes, authorization changes and file rejection. Manager tests cover inspection/receipt classification and existing native-answer guards.

### 7. Test the feature through UI tools

- [x] Exercised actual createSlack/createDiscord and Channels decision boundaries with fake Slack HTTP/Socket Mode and Discord REST/Gateway transports. Manager suite includes real local CLI sockets with fixture providers. No real Slack/Discord messages, live provider approval or deployed bot was exercised; tests do not establish live account delivery.

### 8. Test the final UI

- [ ] Native rendered review unavailable: no authorized Slack/Discord test location was supplied or used. Native light/dark appearance, keyboard focus and desktop/mobile viewport behavior remain unverified. Reviewed payload limits and button/receipt binding against platform docs and tests; this is not visual acceptance. Renderer performance checklist is inapplicable because no renderer or CSS changed.

## Result

- Delivery: implementation verified locally; commit and direct push to main authorized by Alex. Permanent main checkout retained; no temporary task worktree was created.
- Remaining limitations: native account/UI verification and deployment to existing bots were not performed. Install the corrected build and reconnect/restart each target service to recover its still-pending requests. Slack buttons require Interactivity & Shortcuts enabled on the existing app; typed values remain available.
