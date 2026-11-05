# App Manager contract

All app surfaces reach host operations through ManagerApi. Desktop uses IPC to core service RPC; paired phone forwards only explicitly allowlisted operations. Renderer never mutates Manager files.

- send: {id,text,session?} -> accepted receipt. Same request id/text reconciles rather than enqueueing twice, including after a restart. Initial disabled/paused/blocked rejects; stale session rejects. Acceptance is durable host intake, not model delivery.
- receipt: request id -> known receipt or absent. Reads remain possible while paused/off so uncertain sends can reconcile.
- answer: {session,id,choice} -> existing ManagerDecisionOutcome, with current session/pending checks.
- answerCard: session, card identity, existing typed answer -> native response, through host validation and current pending fingerprint. Never generic chat.answer bypass.
- view/on: existing ManagerView plus pending user requests, streaming state and resolved decisions.
- inspect/onItems: existing Manager history/snapshot stream, immutable item merge in renderer.

Validate through backend tests for acceptance/restart/deduplication, stale ownership, current decisions, native guard refusal and phone allowlisting; browser fixtures prove renderer behavior only.
