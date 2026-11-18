# Slack and Discord approvals

## 1. Why and journey

A person talking to Manager in Slack or Discord must see requests that pause work, without opening GeckIt. Alex approved one-at-a-time requests and recovery for existing chats on 2026-11-18. A thread with two requests shows the first, accepts one answer, confirms it, and shows the second. Other threads proceed independently.

## 2. Surfaces

Use the existing Slack thread or Discord thread/direct message. Post the exact request title, native choice buttons when supported, and the exact typed values. No new desktop or phone screen. Native platform layout, themes, keyboard focus and accessibility remain platform-owned. Preserve provider-specific choices such as Allow once and Allow this session.

## 3. States

| State | Visible result |
| --- | --- |
| Empty | No approval message. |
| Posting | Current request is being sent; later requests stay queued. |
| Waiting | One delivered request has buttons and typed choices. |
| Answering | One answer is being checked; duplicate replies cannot claim the next request. |
| Answered | Remove controls and confirm the actual outcome, then post the next pending request. |
| Closed | Remove controls when resolved elsewhere, deleted or cleared. |
| Failed | No success claim; log the failure and retry pending delivery on a later snapshot or reconnect. |
| Disabled | Existing channel and Manager availability rules apply; no automatic answer. |

## 4. Transitions

| From | Trigger | To and result |
| --- | --- | --- |
| Empty | Pending snapshot | Posting, oldest pending request. |
| Posting | Native receipt | Waiting, persist receipt. |
| Posting | Failure | Failed, remain eligible for retry. |
| Waiting | Authorized reply bound to this message and request | Answering. |
| Answering | Manager accepts answer | Answered, confirmation before next request. |
| Answering | Stale or refused outcome | Closed or Waiting, show actual outcome. |
| Waiting | Request disappears | Closed, remove controls and advance. |
| Any | History reset | Close old controls and discard old request bindings. |
| Any | Startup or reconnect | Pull current requests; restore confirmed pending receipt or post a missing prompt. |

## 5. Silence

Do not broadcast queued requests, replay the original task, approve on reconnect, repeat a confirmed prompt, or announce ordinary empty snapshots. A request with no channel-supported choices retains its existing instruction to open GeckIt.

## 6. Thresholds

One active prompt per thread avoids ambiguous plain replies. Slack buttons follow Block Kit limits; Discord keeps its 25-button limit and five buttons per row. Longer choice sets retain typed replies. Existing title and message limits apply. No timer grants approval or expires a valid Manager request.

## 7. Wording

Prompt: request title followed by "Press a button or reply with one of:" and exact values; text-only prompts use "Reply with one of:". Accepted: "<person> chose <label>. Answer sent." Stale: "This request is no longer pending." Failure: "Could not record this answer. Try again." Closed elsewhere: "This request is no longer pending." Show actual nonstandard Manager outcomes rather than replacing them with a success message. Files cannot answer an approval or question.

## 8. Edge cases

Bind buttons to channel, thread, native message receipt, decision ID and choice index. Capture the displayed request when each text event arrives, before asynchronous processing; messages already received cannot approve a later prompt. Replayed native event IDs and concurrent answers for one prompt execute at most once. Consume an incoming reply before submitting its answer, so a lost result and failed confirmation cannot make its replay approve a subsequent request. Recheck actor authorization before Manager accepts an answer. A distinct new reply received after the next prompt appears is a new answer. A pending decision disappearing during a post closes the resulting stale prompt. Restart migrates old shown-only records by reading Manager, not by trusting them as delivery receipts. Confirmed prompts survive reconnect; old Discord multiple-prompt records are closed before showing the queue head.

## 9. Deliberate absence

No Allow all, approval batching, new ownership rules, automatic grants, desktop redesign or replay of completed requests.

## 10. Forks and verdict

Showing every request makes a plain allow ambiguous. Numbered replies add bookkeeping for the person. One delivered prompt per thread makes the target visible while retaining native buttons. The user explicitly selected this behavior and authorized implementation and push to main.

## 11. Reconciliation and verification

Existing Manager request identity and answer guards remain authoritative. Channel receipts are delivery evidence, never authorization. Test real channel adapters with fake platform transports, including simultaneous requests, stale answers, failures, reset, restart and reconnect. Record separately whether real Slack and Discord account interactions and native theme/focus/viewport rendering were checked. No GeckIt renderer or CSS changes are part of this task.


## Implementation verification - 2026-11-18

Implemented in `client/src/main/channels/approval-queue.ts`, `slack.ts`, `discord.ts` and the thread-scoped `decide` bridge. Actual adapter tests use simulated platform transports, and Manager tests use fixture providers plus real local CLI sockets. The full suite passed 2168 tests with 7 skipped; the final focused run passed 74 tests after preserving Slack mention-only routing. Typecheck, lint and service/desktop build passed.

No real Slack/Discord account messages, live provider approvals, deployed service restart, or native light/dark, focus and viewport inspection was performed. Native UI is not visually accepted by these tests. Installing the corrected build and reconnecting/restarting the bot is required before existing chats recover; no current bot was upgraded as part of pushing source.

Platform contracts: [Slack Socket Mode acknowledgements and interactive envelopes](https://docs.slack.dev/apis/events-api/using-socket-mode/), [Slack block actions](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/), [Slack button limits](https://docs.slack.dev/reference/block-kit/block-elements/button-element/), and [Discord message nonce enforcement](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx). Persisted native receipts suppress confirmed reposts; Slack reconciles an uncertain prompt by its message block marker and Discord uses a stable nonce for retries.
