---
type: spec
status: implemented
created: 2026-10-09
---

# OpenCode + Ollama

## Purpose and surfaces
Use an available Ollama model through OpenCode as an independent GeckIt assistant. Installation, enable switch, model picker, transcript, board and correction use [provider libraries](provider-libraries.md) and [model details](provider-model-details.md). No new layout.

## States and transitions
| From | Event | To | Person sees and action |
| --- | --- | --- | --- |
| Disabled | Enable assistant | Ready | "OpenCode + Ollama"; select an Ollama model |
| Ready | Send task | Working | Existing working state and streaming transcript; Stop cancels |
| Working | Tool requests permission | Waiting | Existing approval card; allow once, allow for session or refuse |
| Waiting | Answer card | Working | Approval resolves; transcript continues |
| Working | Question arrives | Waiting | Existing question cards; select or type answer |
| Working | Turn completes | Review | Existing completion state; reply or review work |
| Working | Stop | Ready | Existing stopped state; another message can be sent |
| Ready/Working | Backend fails | Failed | Backend error through existing error state; fix setup and retry |
| Ready | OpenCode 1 or 2 startup banner arrives | Ready | Models available from the installed version; select an available Ollama model and send |

## Silent states
Unknown prices, quotas, capacities and versions are omitted. No model downloads, sign-in, credential edits or global OpenCode configuration changes occur. GeckIt instruction toggle applies an owned system prompt to later messages without changing project AGENTS.md.

## Thresholds and wording
Server startup timeout is 15 seconds to bound missing or stalled CLI startup. Normal control requests time out after 30 seconds; generation has no fixed deadline and Stop remains available. Assistant name is "OpenCode + Ollama", short name "Ollama". Resolved approval labels are "Allowed once", "Allowed for session" and "Declined". Session grants are confined to that conversation until library unload. Missing-model error: "No Ollama models available. Start Ollama and make a model available to OpenCode."

The library detects OpenCode's server protocol and uses its matching adapter. OpenCode 1.18.35 and 2.0.25 retain native history in their own stores; the plugin does not migrate or downgrade either store. OpenCode 2 permission requests and question forms use the existing cards. Unsupported conditional or authentication forms fail explicitly instead of leaving a task waiting without an answer surface.

## Edge cases and omissions
Namespaced IDs and exact folder checks isolate conversations. SSE disconnect fails an active turn and releases its slot. Duplicate idle events cannot finish twice. Plan selects OpenCode's plan agent. Manual permissions are enforced; automatic safety review, native goals, remote control, image input and browser selection are unavailable. Existing keyboard/focus return, scrolling and cancellation rules apply unchanged on desktop and phone.

## Decisions and coverage
Reuse GeckIt's own components and tokens. The existing Model picker receives every available Ollama text model, including Qwen, Gemma, Kimi and Llama; other providers are excluded. OpenCode 2 discovers its Ollama catalog automatically; OpenCode 1 uses configured Ollama models. Default uses the native default when it belongs to Ollama, otherwise the first available Ollama model. An explicit model choice is sent to OpenCode unchanged. Library parameters are unnecessary for this workflow. FR-001 through FR-007 map to existing library, model, transcript, history and correction surfaces. Native installed-library visual review remains unverified as recorded in the design handoff. Model discovery waits up to 15 seconds for asynchronous OpenCode 2 discovery so the first request does not expose an empty catalog before initialization completes. Missing models return an empty list; sending with no model produces the error above. A removed explicit selection produces "Ollama model is not available: <provider/model>". Stable plugin and session IDs retain existing conversations and installed-library updates.

On 2026-10-09 Alex replaced the proposed library parameters form with this existing Model picker workflow. The cancelled configuration form is removed.

## User message identity during a turn

GeckIt displays each submitted message immediately before OpenCode starts. The plugin's live driver emits assistant replies, reasoning, tools and approvals, but does not echo native user messages into that same transcript. Native history reads continue to include every user message with its native identity, including repeated identical submissions. Completion-time history snapshots cannot append a second copy after the reply. Reopening a conversation shows its native user/reply order once. Stop and failures retain GeckIt's displayed submission; they do not fabricate an extra copy. No layout or controls change.

## Completion without a final reply

Reasoning stays in the existing steps disclosure; final text remains outside it. A native successful completion with no nonblank text in the last assistant message of the current turn becomes the existing failed state, with detail "OpenCode finished without a final text reply. Try another model or send again." The person can select another model or send another message. Earlier turns and intermediate text before a final reasoning-only message do not count as the final reply. Native errors keep their own diagnostic, and Stop keeps the stopped state. No automatic retry, model change or promotion of reasoning into an answer occurs. Native history remains unchanged. This repairs the 2026-10-09 report where Qwen returned only reasoning and OpenCode marked the turn successful.
