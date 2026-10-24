# Telegram attachment verification

Status: implemented and controlled checks passed; In review, manual review pending. At initial review, no merge, push, deployment, application restart or live Telegram test had been performed. Alex subsequently requested "push to main", authorizing commit, main integration, push and temporary-worktree cleanup. Live Telegram/provider checks remain unperformed.

## Review location and model

Worktree: `/private/tmp/geckit-telegram-attachments`, branch `feature/telegram-attachments`, base fresh `origin/main` at `18c580d` (includes reply routing `0538ffb`). Session: `01a1593c-e8c6-7b23-b8c0-502d9865be49`.

Local Codex config reads `model = "gpt-6.1-sol"`. The TypeScript implementation agent was explicitly configured as `gpt-6.1-sol`; the root session has no independent server-side serving-model attestation. This feature uses the selected Manager/worker provider and model; it does not silently force a user's configured assistant to Sol.

## User flow

1. Enable Manager, select an enabled assistant/model and complete existing desktop Telegram pairing.
2. Send a photo or document in the paired private bot chat with optional caption. Reply to a known Manager result to retain its saved session and managed-task context. Telegram albums are independent inputs with a shared group ID.
3. Supported PNG/JPEG/GIF/WebP content uses the provider's existing native image input. Other documents are retained as real readable local files with metadata; UTF-8 files up to 64 KiB also include a bounded text excerpt. No file is executed, extracted or trusted as permission authority. Format understanding depends on the selected provider's tools.
4. For a managed local worker, Manager can explicitly run `attachments send --attachment <id> --id <worker> --text <instruction>`. It creates and reports a permanent project input copy beneath `.geckit-attachments/<id>/`, passes image bytes natively where applicable, and retains that copy until user/project cleanup.
5. Ask Manager to send an intended result. A worker reports `Deliver to Telegram: <exact project-relative path>` through its normal task result; Manager deliberately selects its worker ID and file. `telegram send-file --id <worker> --path <relative-file> [--caption <text>] [--as document|photo]` defaults to document. Photo selection is explicit; Telegram may recompress it. Success returns Telegram's message ID and saves worker/session origin so a reply continues its subject.
6. A definite upload error is exposed to Manager and connection detail. An unknown outcome is uncertain, never automatically retried. Inspect the paired chat and current operation, acknowledge a bound uncertainty decision when present, then use `/resume` before a fresh deliberate send.

## Storage and limits

Downloaded inputs: 20 MiB maximum observed bytes each, 200 MiB retained payload and 256 retained files. Each unpinned file expires after 24 hours from receipt. Queued/sending Manager input IDs are pinned, still count against capacity, and are resolved again at dispatch. Startup, ingestion/access and the active receiver's one-minute timer clean expired files; disconnect clears the cache. A full cache rejects new content rather than silently evicting queued input. Cache folders/files use private modes, generated paths, safe extensions and sanitized display names. Explicit project imports and existing provider transcript history are separate retention scopes and are not erased by cache cleanup.

Uploads: documents up to 50 MiB, photos up to 10 MiB, captions up to 1,024 characters, with Telegram's photo dimension/format constraints enforced by its API. Empty files are rejected. Cloud limits are based on the [current Telegram Bot API](https://core.telegram.org/bots/api#sending-files), checked 2026-10-20; GeckIt's count/cap/TTL are application budgets. No automatic photo/document fallback follows an uncertain send.

## Controlled evidence matrix

Full required checks passed in the isolated worktree: `npm run typecheck`, `npm run lint`, `npm test` (1,118 tests in 82 files) and `npm run build`. Tests used escalation for local socket access; no network account call was enabled. Final test-only extensions for selected PNG photo delivery and manual/SSH rejection passed the focused file-operation tests (2 passed, 40 unrelated skipped), typecheck and lint; production code was unchanged after the full run. [Focused output](evidence/final-file-ops.txt). Logs: [tests](evidence/test.txt), [typecheck](evidence/typecheck.txt), [lint](evidence/lint.txt), [build](evidence/build.txt).

| Requirement | Required observable evidence | Result |
|---|---|---|
| FR-001 | Real update shape; paired private account accepted; other user/chat/external reference rejected before getFile | Passed: telegram.test.ts "checks chat, sender, reply, decision and enabled state before fetching attachment bytes"; getFile absent for rejected inputs. Existing forged/cross-chat/external reference tests pass. |
| FR-002 | Captions, photo variants, source message/group, known reply origin and correct Manager/worker context | Passed: composed actual Manager/Sessions test asserts caption whitespace, no caption, highest photo variant, shared album ID, saved reply identity and worker origin. Albums remain independent messages. |
| FR-003 | Real Manager and Sessions paths into controlled provider input; native image byte equality and readable document bytes; local worker copy | Passed: composed test records native PNG base64 byte equality and ordinary text at provider driver; actual disk project copy equals source. manager.test.ts explicit file operations assert import bytes and overwrite refusal. Real provider processes substituted. |
| FR-004 | Authenticated explicit command through actual project read and bridge upload; photo/document bytes/captions and returned mapped message ID | Passed: composed command from actual Manager output traverses authenticated command handling, filesystem read, bridge and multipart; exact document bytes/caption/chat and subsequent reply worker mapping asserted. Manager file-operation tests select a valid PNG with exact photo bytes/type/caption; binary transport tests assert both photo/document multipart bytes. |
| FR-005 | Unowned/manual/remote/root traversal/symlink/private-path cases rejected; no prose-link automatic upload | Passed: explicit file-operation tests reject Manager identity, root traversal, symlink outside root, .env and revoked/unregistered authority, actual unrelated manual session and managed SSH host for both directions; currentWorker enforces managed/local/provider/root at dispatch and before upload. Prose never invokes upload code. |
| FR-006 | Reopen/expiration/pins/count/byte cap/disconnect and filenames/paths; tokens/URLs absent from surfaced errors | Passed: attachment tests reopen actual private files, assert 0600, filename sanitization, symlink rejection, 24h expiry/pins/200MiB and 256-file caps. Delayed restart test asserts disconnect deletion; fetch exceptions with token-bearing URL surface sanitized messages. |
| FR-007 | Oversized/truncated/empty/unsupported/download failure, definite outbound rejection and uncertain send; no false receipt or blind retry | Passed: transport tests cover unsupported metadata, advertised/getFile/stream size, truncated/empty bodies and download exceptions. Controller test asserts definite rejection, unknown durable uncertainty, no retry on restart and stale-pairing rejection. |
| FR-008 | File reply cannot approve native decision; quoted task content cannot attach or control unrelated session | Passed: file reply to a pending approval is refused before getFile/answer; existing real Sessions permission and unrelated worker tests pass. Manager ownership and saved-reference validation remain required. |
| FR-009 | Harmless fixtures, exact byte checks and network/provider substitution inventory | Passed: synthetic valid PNG/text/binary fixtures; actual bytes asserted. Full composition uses real filesystem, Manager, Sessions, parser, cache, bridge and authenticated operation; fetch and provider driver are substitutes. |
| FR-010 | Isolated diff, concurrent overlap, day-plan current and In review | Passed: isolated branch based on18c580d; other worktrees preserved. Integration overlaps documented below; day-plan retained In review with real session ID. |

## Boundary honesty

Controlled tests may use real filesystem, Manager, Sessions, Telegram controller, parser, cache and multipart code while substituting Bot API/download HTTP and provider process. Such tests prove local wiring and handling of those controlled responses. They do not prove real Telegram credentials, pairing, live delivery, Telegram's image processing, provider authentication, model interpretation or the installed build loading this code. No live result will be claimed without separate evidence.

No renderer changes are planned; new Telegram media uses Telegram's own client UI. No GeckIt light/dark/viewport/focus/layout acceptance result is claimed. The UX diagram rendered and was visually inspected: [states](evidence/states.svg).

## Optional live follow-up

[Harmless fixtures and exact procedure](evidence/live-fixtures/README.md) are prepared. Live sends/uploads require explicit user authorization; none have been sent. A test should compare documents by SHA-256 and photos visually because Telegram can recompress photos. Do not use private files, print tokens or restart active sessions to load a test backend.

## Concurrent integration

PR [#27](https://github.com/anetrebskii/geckit/pull/27) was initially OPEN at `f0b7b7d` and rechecked OPEN at `3f5787b` after concurrent work advanced it. This feature does not merge or depend on it. The current sharing branch inserts public viewer links into prose and keeps Stop controls, replacing its earlier offer-button design. A later integration must preserve both link rendering/Stop controls and attachment reply origins, current pairing/late handling and separate cleanup domains; do not replace the current transport with its older routing snapshot. Sharing a viewer link is separate from deliberate attachment byte upload. Both branches touch main wiring, Manager, transport/tests and UX/feature docs.

`feature/013-telegram-tables` changes `telegram-render.ts` and its tests, and also carries older sharing changes. This feature leaves formatter code alone; do not merge its transport snapshot over current reply/attachment routing. The shared source checkout and pre-existing links worktree remain untouched.
