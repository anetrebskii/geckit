# Repair Claude tmux queued Send now

- Request: queued-send arrow does not work for Claude Code tmux; later correction: pending native answer-review form is missing in GeckIt.
- Checkouts: /Users/alex/Projects/mine/geckit and /Users/alex/Projects/mine/geckit-claude-tmux, main, permanent checkouts.
- Started: 2026-11-19. Codex session 01a1f3bb-f444-7133-9664-8f78e60871ec.

## Acceptance conditions

- Recognize native answer-review screens with and without the older confirmation sentence, show all visible selections, and require an explicit Submit answers or Cancel choice.
- Send now during recognized Claude work delivers selected guidance without interruption; native questions, idle and unknown screens reject injection and retain the queue.
- Preserve text, attachments and lifecycle behavior; delivery failures remain visible above the composer on desktop and phone.

## Changes

- Updated existing host and provider UX documents before implementing behavior changes. Existing feature list already covers these workflows; no feature addition or distributed skill change.
- Provider review detection no longer requires the exact sentence "Ready to submit your answers?". Review cards retain the full visible summary rather than its last six lines.
- Queued guidance uses bracketed tmux paste to avoid slash autocomplete hiding Claude's working spinner during character-by-character typing. Ordinary sends and question answers keep their typing rule.
- Restored the shared composer error surface removed by the earlier account-status redesign; preview uses the production error component.

## Evidence and checks

- User's actual tmux pane %160 shows Review your answers, three completed selections, Submit answers and Cancel, without the older confirmation sentence. Original parser reports unknown; fixed parser reports question, both choices, correct focus and all three answers. This check only reads the real pane and submits nothing.
- Regression failed before the parser fix. Fake-Claude integration in real isolated tmux verifies explicit Submit and Cancel, no automatic action, and injection rejection while a review is pending. Legacy and current review layouts are covered.
- Earlier approved Formula queue retry captured slash autocomplete replacing the working spinner midway through the exact /mcp guidance, followed by draft clearing. Regression failed before bracketed paste and passes after it.
- Provider serial suite: 62/63 passed; only the unchanged 80-character ordinary typing test exceeded its 10-second wait. All 6 input tests pass after allowing the 80-character subprocess test 20 seconds for delivery; its exact-content, no-paste and long-input-speed assertions remain intact. Fixed input tests wait for the driver's send acceptance before injection, removing a fixture race.
- Host suite: 2201 passed, 7 skipped, one Telegram attachment timeout; all 8 attachment tests pass when rerun alone.
- Host typecheck, direct eslint src test, desktop build and mobile build pass. The earlier npm lint wrapper reported packaging-script errors outside the requested src/test command; direct ESLint passes.
- Browser review: production Composer with fixture provider boundary, desktop 1200x900 and phone 391x844, light/dark, retained queue, visible rejection, keyboard focus/Enter and scrolling. No horizontal overflow. Full screenshots inspected at /tmp/queue-error-dark.png, /tmp/queue-error-light.png, /tmp/queue-error-phone-light.png and /tmp/queue-error-phone-dark.png. Task-owned preview tab closed; shared browser preserved.
- Performance review: one static error paragraph in the open composer; no new polling, subscriptions, lists or expensive computations.

## Delivery

- Alex authorized direct delivery to main on 2026-11-19. Delivery targets: https://github.com/anetrebskii/geckit-claude-tmux/tree/main and https://github.com/anetrebskii/geckit/tree/main. Exact verified commit links are recorded in the day plan. Both are permanent checkouts; no temporary worktree to remove. Unrelated working edits are preserved.
- The running provider still uses its old snapshot. Real form submission and successful injection with the updated plugin remain unverified until the fix is installed and the provider restarted. No pending form was answered on Alex's behalf.
- No publication type standard matched this technical repair. Day-plan validator has an unrelated existing duplicate MiniMax result link. Semantic search failed with "Failed to start server"; no index created.
