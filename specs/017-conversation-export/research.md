# Research

- Decision: normalized `SessionItem` history from Sessions, rather than provider raw file conversion. Rationale: consistent across builtin and library assistants; upstream omissions explicit. Alternative raw protocol cloning cannot cross providers.
- Decision: deterministic metadata, first/latest message excerpts and recorded file references. Rationale: no unrequested inference call or invented decisions. Alternative model summary adds work/cost and unavailable-service failures.
- Decision: app-owned Markdown file plus existing `hostUpload` for SSH. Rationale: no source-project edits and the target can read its path. Alternative passing local paths to remote drivers is incorrect.
- Decision: call existing `Sessions.send` without source session/active goal. Rationale: existing guard/queue/auth and source preservation. Alternative tool/message replay could perform old work twice.
- Decision: real Chat/preload browser fixture with synthetic Electron IPC only. Rationale: inspect actual handlers/layout independently of active user sessions. Native persistence and provider request behavior get focused tests.
- Evidence: `sessions/provider.ts`, `sessions/index.ts` delegate/reader/send, `main/hosts/route.ts` hostUpload, `chat/Composer.tsx`, `chat/Chat.tsx`, existing `test/browser/new-task-drop`.
- No unresolved research questions.

## Follow-up: durable copy without sending

- Decision: persist an app-owned prepared conversation in existing notes, rather than invoking provider.create. Evidence: builtin Codex create performs account/thread RPC; existing unborn entries restore only with queued or held work. A prepared copy needs independent restoration and must stay out of queues.
- Decision: whole first-message prompt remains editable in a durable draft. Rationale: user sees exactly what will be sent; no invisible context injection or duplicate replay. A narrow main-side draft contract supports reopen/restart and desktop/phone, including intentional empty draft.
- Decision: convert prepared placeholder on explicit first Send only. Rationale: provider/guard/queue behavior stays ordinary, with placeholder retired only after accepted destination.
