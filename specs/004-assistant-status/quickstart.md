# Validation
Run client typecheck, lint, test and build; mobile build. Start Vite on renderer root for `assistant-status-preview.html`. Test four enabled assistants, disable/re-enable, partial metadata, unsigned account, failed request, many quotas, multi-host stale measurements. Inspect desktop and phone in both themes, keyboard entry/Escape/focus return and scroll to last quota. Check assistant selection and board scroll are unchanged after dismissal.

## Recorded validation

- Full client suite before final UI edits: 658 passed, 19 failed (677 tests, 59 files). Failures are in existing provider-library/session backend tests, including old replacement-provider and tmux transport expectations and absent builtin Codex fixtures. Status changes touch none of those backend modules or tests. Do not describe the full suite as passing.
- Attempt to propose separate backend-test repair through the GeckIt CLI failed because GeckIt was not running; no conversation was created.
- UX Mermaid state diagram rendered successfully with Mermaid CLI to `/private/tmp/geckit-assistant-status.svg`.

- Final client typecheck and scoped ESLint for AssistantStatus, Status, PhoneBoard and prototype passed.
- Final desktop and mobile production builds passed after local-plan freshness correction. Mobile retains its existing large-chunk warning.
- Targeted provider-usage, plans and phone tests passed: 17 tests, 3 files.
- Full lint reports two existing no-undef errors in dev-bundle.js. Full suite remains 658 passing and 19 failing as above; unrelated failures were not repaired in this task.
- git diff --check passed. Visual and performance review evidence/limits are in design.md. Native iOS and live account transport were not exercised.

## Final verification - 2026-10-08 20:29

- Final node/web typecheck passed. `npm run lint` (the repository's `eslint src test` command) passed; any separate script-directory lint report above is outside this command.
- Pending account request isolation/recovery tests and related targeted tests passed: 12/12 in 3 files. The new `test/accounts.test.ts` also passed in the final full-suite attempt.
- Final desktop and mobile builds passed, including the final phone quota sibling-selector fix. Mobile emitted the existing large-chunk warning.
- A final full-suite attempt after adding account tests reported failures/timeouts in existing backend tests and did not terminate; stopped with Ctrl-C after it stalled. It is not a passing run. The earlier completed full suite had 19 failures / 658 passes. No backend source or existing test was changed by the status feature.
- Final light/dark desktop overview/details and phone overview/sheet were inspected. Final 320px count-quota layout reaches quota 20 of assistant 4; compact footer retains assistant name, truncated quota label and reported percentage. Keyboard focus returns to the exact desktop/phone opener.
- Screenshots from final review: `docs/design/assistant-status-desktop-light.jpg`, `docs/design/assistant-status-phone-light.jpg`, `docs/design/assistant-status-phone-sheet-light.jpg`.
