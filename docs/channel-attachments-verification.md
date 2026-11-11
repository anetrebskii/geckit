# Channel attachment verification

Date: 2026-11-11. Task: `codex:01a1c97f-dfa2-7212-bf92-617858452d01`. Branch: `feat/channel-files`. Base: `4d5f0f4a18a14aea6fc4705d98889dc35d76a017` (Development 1.210).

## Controlled transport and Manager checks

These checks use fake Slack/Discord APIs and temporary local projects. They do **not** demonstrate live native account permissions or installed integration behavior.

| Direction | Checked |
| --- | --- |
| Slack incoming | Actual text/document and PNG bytes; signature-based native image; ordinary attachment followup; bot `files.info`/private download; exact current-root shares for links |
| Slack outgoing | Exact document and PNG bytes through external upload, completion in bound channel/root, native file receipt |
| Discord incoming | Actual document and PNG bytes through bounded native CDN download, same-thread Manager inputs |
| Discord outgoing | Exact document and PNG bytes in multipart upload, bound DM/thread, no parsed mentions, native message/attachment receipt |

Dedicated transport/cache tests: `client/test/channel-files.test.ts`. Hub coverage: `client/test/channels.test.ts` passes retained IDs and current authorization into Manager and rejects disabled/stale routes. Manager integration: `client/test/manager.test.ts` dispatches native image input and readable contents at the real session-send boundary; imports retained input into the selected worker; routes exact selected output through authenticated Manager operations and retains native receipts.

Refusal coverage includes unauthorized people, mismatched Slack shares, arbitrary attachment hosts/redirects, incomplete/oversize downloads, revoked/reset conversations, attachment-as-approval, cross-channel/legacy Telegram cache IDs, cross-thread worker input/output, protected/traversal paths, disabled/stale routes, missing native scopes/permissions, and uncertain uploads without retries. Existing file path/symlink/SSH/secret checks remain in the shared Manager file flow.

Final local checks on the frozen source: `npm --prefix client run lint`, `npm --prefix client run typecheck` (all four TypeScript configurations), `npm --prefix client run build` (service/main/preload/renderers), and `npm --prefix client test` all exited 0. Full suite: **1863 tests passed, 2 skipped; 142 files passed, 2 skipped**. The skips are existing opt-in desktop integration (`GECKIT_DESKTOP_INTEGRATION` is not `1`) and child-provider integration (`GECKIT_CHILD_PROVIDER_CANDIDATE` unset). Socket-based integration tests required sandbox permission for disposable local sockets; the initial sandbox EPERM was resolved by rerunning with that permission. `git diff --check` is clean.

## Visible settings review

The actual renderer Settings preview was served in an isolated test-browser tab with fake native setup data. Slack's extended scope help was inspected in full dialog context in light (1200px) and dark (900×700) views. No horizontal overflow; scope help wraps and inner scrolling reaches Save/Cancel and the Discord row. Tab moves from the token field to Forget; Escape closes setup and returns focus to Set up. No native settings or secrets were changed. Screenshots remain in `/private/tmp/channel-settings-light.png` and `/private/tmp/channel-settings-dark-narrow.png` for this task. The UX Mermaid rendered one SVG without syntax errors.

Performance checklist: only help text and an existing invite permission bit changed in the visible UI. No new list rendering, polling, effects, per-row work, animation or subscription was added; no new performance measurement was needed.

## Real integration and installation

No real file has been sent. Alex's exact authorized Slack test thread/DM and Discord test thread/DM were requested; no substitute recipient is permitted. Native OAuth/permission availability is unverified. A worker's installed product operator capability request was correctly refused with “Operator access denied”; this was not bypassed. Live validation must use the authenticated Manager and existing channel apps, after any required native user approval.

Release/install coordination remains with `codex:01a1c6f0-e1ba-7872-b398-2887d7893319` for shared local 1.210 and `plugin:claude-tmux:361f27c7-7323-4c64-ae1e-31c3088d7ba3` for remote update. This task does not promote, restart or replace their services. Integration/CI/release links and the exact remaining installation/live-test dependency are delivered in the session handoff. A green fake suite or merge alone is not completion.
