# Validation

Use Node 22+ and existing `client/node_modules` dependencies. Run focused manager and sessions tests, `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` from `client/`. The CLI integration fixture builds the CLI, starts an owned private socket and runs authenticated Manager operations against temporary store/transcript files. Never point deletion fixtures at a user provider transcript directory or running GeckIt socket. Verify refusal, invalid scope, working/queued/host-only workers, provider false/throw and operation replay; a sentinel conversation and project file must remain.

Record exact results and limits in verification.md and day-plan. Do not restart the user app, push or publish.
