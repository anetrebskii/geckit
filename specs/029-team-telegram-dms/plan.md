# Implementation plan
## Technical context
Native Electron/React/TypeScript; no dependencies, one Bot API receiver. Base bd166986; depends on open PR75. Read design.md and linked UX/real-component preview before edits.
## Constitution check
Subscription credentials/policies unchanged, shared API contract, fake API/provider tests, UX handoff before UI, token CSS. Existing Windows/dependency failures require baseline comparison. No publishing authorized.
## Architecture
shared/telegram: member routing contracts. main/telegram-members: bounded validated registry/invitations. main/telegram: durable multi-route transport and child native conversation contexts. core/runtime: explicit account-to-Manager facades and all-route response/decision routing. manager/manager-operations/sessions: scoped projects, output reservation, fair native admission and revocation. renderer: owner controls. Tests: fake bot and provider crash/concurrency/authority matrix.
## Sequence
Registry and migration -> transport routing -> Manager authorization/concurrency -> owner UI -> regression/crash/resource/compatibility checks.
## Complexity tracking
Reuse the existing native Telegram conversation engine per route while sharing transport/token/storage; avoids duplicating receive/send/attachments logic. Existing large modules are extended minimally; registry and scheduling responsibilities extracted.
