# Research

## IP discovery

Decision: HTTPS probes to api.ipify.org (IPv4) and api6.ipify.org (IPv6), each forced to its family. Official [ipify docs](https://www.ipify.org/) distinguish these from api64 which returns either. A single universal result could miss unapproved IPv6. Require every detected configured public-capable family to verify and match; global IPv6 configuration makes IPv6 mandatory. Total ten-second abort deadline; bounded plain-text response, no redirects or conversation payload. Re-read policy/families before success. No cache, endpoint fallback or new dependency.

Local interfaces and one public service cannot prove every destination route or remote provider egress. Firewall/tunnel configuration and older Agent VPN work remain outside scope. Optional periodic monitoring was subsequently approved on 2026-10-11.

## Dispatch research

Read-only explorer found provider creation before ordinary send; queue inject, positive and automatic answers, Auto permission retry, native goals, history fork, restart/reattach fallback startup, Remote Control and shell-associated provider creation bypasses. Main Sessions owns these, so inject optional verifier there rather than only IPC/renderer. Spoken-command planning also sends session titles/text before Sessions; gate this session-intent request in main.

Before-send checks do not intercept provider-owned autonomous continuations. The approved periodic monitor additionally interrupts owned drivers and pauses Codex native goals on failure. A blocked answer must preserve unanswered asks (#ended clears them). Queue carryOn removes head when send resolves, so blocking must keep queue and park. Current useChat failed-turn effect unqueues next message into draft; skip for guard-held state. Scheduled failures otherwise only log, so retain a visible pending operation.

## Recovery

Known unsent retry reuses saved text/attachments/destination; partial started turn continues. Lock before check; invalidate cancelled result. Preserve unrelated draft. Existing phone transport retains error messages but useChat replaces them with generic host error; fix there. Existing fake provider/session harnesses test exact side effects without network/model calls.

## Periodic lifecycle research - 2026-10-11

Sessions.#changed is the central activity reconciliation point; settings broadcasts already call Sessions.again. One monitor reconciles there, fingerprints effective policy and invalidates results when policy, activity or lifecycle changes. Active work means working/asks, live background tasks or owned Remote Control, not an idle history reader. One timer/one in-flight periodic lookup covers all current active sessions; no renderer status/broadcast on successful probes.

Existing stop sends a provider interrupt and uses a five-second termination fallback for working/asks. Background and Remote Control need explicit driver termination. SSH stop is best effort and may not reach an offline host. Periodic failure must retain a distinct pause across #ended because ordinary done/stopped signals otherwise unpark queues. Preserve known unsent operations; started work retries with continuation, never original prompt replay. Queue holds persist through restart and cancellation cannot resurrect a removed entry.

Codex native goal pause via Driver.send('/goal pause') would reconnect/reset stopped state. Add a control-only pause operation to CodexSessions/LlmProvider instead, without turn/start or user content. Native goals and supported remote/background work must remain held until deliberate retry. Dispose invalidates the monitor/timer without altering unrelated normal shutdown behavior.

Native-goal review also found delayed pause acknowledgement could race deliberate continuation. Keep pause control in a per-session barrier and await acknowledgement before fresh-check/manual resume; native control is bounded by the existing RPC deadline and does not send user content. Resume only after explicit retry and successful fresh check.
