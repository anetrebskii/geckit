# Verification: Send queued messages now

2026-10-09, working tree on `feat/send-queued-now`.

| Check | Result |
| --- | --- |
| Client typecheck | Passed |
| Client lint (`eslint src test`) | Passed, no warnings |
| Full client suite | 61 files, 700 tests passed |
| Desktop production build | Passed |
| Phone production build | Passed; existing chunk-size advisory |
| Independent Codex provider build/test | Passed; copied runtime exercises turn/steer with text, image and context |
| External Claude tmux suite | 4 tests passed using fake Claude and private tmux socket |
| Diff whitespace check | Passed |
| Mermaid state diagram | Rendered with Mermaid CLI |

The npm command-output wrapper reported unrelated `dev-bundle.js` errors for `npm run lint`; direct `eslint src test` and invoking npm through its Node entry point both passed the exact lint script. No source workaround was needed.

## Visual review

See [design evidence](design.md#review-evidence). Actual components reviewed in Chrome at desktop 1440x900 and phone 390x844, both themes. No running user session was restarted. The temporary Vite preview used fixture transports.

## Performance review

No performance problems found in the changed renderer code against [the checklist](../../docs/performance.md).

| Touched item | Verdict | Evidence |
| --- | --- | --- |
| Unchanged conversation identity | Holds | Existing `sameAsBefore` serialization includes capability and pending state, preserving unchanged conversation objects |
| Per-render work | Holds | Queue fallback memoized; new focus lookup runs only after queued/pending changes; no new conversation-wide scan or formatter |
| Pointer and keyboard | Holds | Existing drag selection behavior retained; pending locks prevent competing changes; latest session checked before async error display |
| Phone rebuild | Holds | Production build passed after shared Composer/CSS changes |

No new list, row component, hover tracking or animation was added. The existing bounded queue scroll area was reviewed with 15 messages. Passive timing in the user's running app was not collected because it was running prior code; no before/after latency claim is made. Live provider services, real tmux Claude and installed iOS were not exercised. Offline tests prove the transport envelopes, queue lifecycle, duplicate prevention, approval protection, rejection and completion races.

## External library

Updated source is `/Users/alex/Projects/mine/geckit-claude-tmux`; reviewable patch is [claude-tmux-steer.patch](../../docs/claude-tmux-steer.patch). These checks preceded the authorized push to main. Existing installed libraries gain Send now after updating to a driver that implements optional `inject`.

## Follow-up: queued message briefly looked sent

Removed the optimistic `sending:` transcript item and its 1.5-second cleanup from shared `useChat.send`. The host's item and session broadcasts now determine transcript versus queue placement. This also handles a stale client state or a slot taken while submission is in flight. Text and attachment restoration on submission failure is retained.

Verified the actual `useChat`, Transcript and Composer with an isolated, manually acknowledged host fixture. Before acknowledgment, the submitted text had zero visible copies. A queued acknowledgment produced exactly one queue row; a sent acknowledgment produced one transcript item; rejection restored the draft and displayed the existing error. Reviewed full context on desktop 1440x900 and phone 390x844, both themes, with keyboard submission and existing queue controls. The fixture was temporary and did not touch live conversations or provider services.

Repeated checks after this fix: 700 tests passed, typecheck/lint passed, desktop and phone production builds passed. Performance review found no problems: removed a transcript insertion/removal, a timer and an echo scan; stable conversation identity and send callback dependencies remain unchanged. No new list or animation needs timing measurements. The rebuilt phone app has not been installed.
