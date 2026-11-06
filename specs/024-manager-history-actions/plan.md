# Implementation plan

TypeScript host Manager + durable store/backing Sessions; shared API through core/preload/phone and channel lifecycle; React ManagerChat reuses GeckIt UI. Strict-typescript agent owns TS, root owns docs/UI acceptance/day-plan/commit. Preserve concurrent integration checkout.

1. Inspect durable thread/session/history model and native context; write UX.
2. Add durable reset/retired cleanup fencing before stop/purge; rotate native backing, purge selected durable transcript/requests/ops/decisions only.
3. Clear keeps place; delete removes incarnation. Preserve work with explicit owner fallback/follower removal. Fence channel outbox and external context via cutoff.
4. Wire host/UI/phone actions with bound selected identity and distinct confirmation.
5. Verify temp disk/native fixture/restart/channel semantics, full UI states and builds; local commit handoff to sole integrator.

No new dependency, native permission shortcut or global cleanup. Mutation failure must be truthful and safe to retry without resuming old context. Performance: selected-thread mutation, no new renderer polling or list fan-out.
