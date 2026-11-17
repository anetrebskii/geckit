# Show the connected GeckIt server version

- Request: connected to remote GeckIt, but Settings > Version shows no version.
- Checkout: /Users/alex/Projects/mine/geckit, main, permanent checkout.
- Started: 2026-11-17.
- Session: Codex session 01a1eafa-fef5-7ff0-8814-bbf73fd998a4.

## Acceptance conditions

- Open Settings > Version in a connected remote desktop workspace: show the running remote service version, never the local app version.
- Open the same server from a phone: About shows the same server version.
- Keep server-side update guidance and do not expose local desktop updater actions remotely.
- Missing metadata or a failed metadata read: show an explicit unavailable value rather than an empty or inferred version.
- Reopen the version surface: read fresh server metadata.
- Assumption: repair existing information without adding controls or redesigning Settings.

## Progress

### 1. Prepare the UX document

- [x] Done.
- Skill: define-ux-behavior.
- Evidence: docs/ux/remote-clients.md, connected-computer version repair; existing path and layout retained. No new prototype required. Apple design standard applied; no matching audience type standard for this technical repair.

### 2. Prepare the UI and test it

- [x] Done.
- Skill: build-product-ui.
- Evidence: existing SettingsDialog, Version and PhoneSettings components and existing styles. Desktop Version renders the value or "GeckIt version unavailable"; phone About uses the existing value cell. No CSS or new controls.

### 3. Write the feature code

- [x] Done.
- Skill: write-feature-code, write-strict-typescript.
- Evidence: service:about and service:bootstrap expose the build's package version; workspace-api reads it on demand for desktop and phone. Read failures remain an unavailable informational value. Existing CoreMethods return types, WorkspaceConnection, PhoneCalls, RemoteServer and UpdateView are reused. No new unsafe type shortcuts in changed lines.
- Checks: npm run typecheck, npm run lint (raw command via rtk proxy), npm run build in client and npm run build in mobile passed. Logs: /tmp/geckit-remote-version-build-final.log and /tmp/geckit-remote-version-mobile-final.log.

### 4. Update the related distributed skills

- [x] Not applicable: no commands, settings or distributed instructions changed. Checked skills/ and profiles/ for Version and service:about references.

### 5. Update the feature list

- [x] Not applicable: repairs missing information in the existing remote Settings workflow, already included under sidebar navigation and computer switching. No new product feature or approval-dependent list entry.

### 6. Write unit tests

- [x] Done.
- Evidence: remote-workspace-version.test.ts covers remote value, fresh reads after an update, phone About, bootstrap fallback, missing metadata and link failure; core-application.test.ts verifies version through real service RPC and bootstrap; desktop-service-client.test.ts fixture includes the added metadata.
- Final full suite: 2117 passed, 7 skipped, 165 passing files and 5 skipped files, npm test -- --reporter=dot --maxWorkers=4. Log: /tmp/geckit-remote-version-tests-verified.log.
- An earlier unrestricted run timed out in the unchanged Telegram tiny-attachment storage test. That file passed all eight tests in isolation; the final full run passed with four workers. No attachment code changed.

### 7. Test the feature through UI tools

- [x] Done.
- Skill: verify-change; GeckIt browser CLI.
- Evidence: isolated headless service, real WebRTC connection and actual desktop remote workspace at http://127.0.0.1:5213/test/browser/remote-clients/, plus actual mobile app at http://127.0.0.1:5214/. Connected through the normal forms, navigated sidebar/menu > Settings > Version/About and observed GeckIt 1.0.0 from this source-built fixture service. No local update buttons appeared remotely.
- Boundaries: fixture provider and local signaling mailbox; real service, metadata RPC, pairing, encryption, WebRTC and renderer. Older-server desktop value was checked with only update.view substituted to return absent metadata, through the real Version component; missing metadata and lost-link handling also covered at workspace API boundary. No real provider account, physical phone, ENTech VM, NAT or TURN verification.

### 8. Test the final UI

- [x] Done.
- Skill: build-product-ui and performance-review.
- Evidence: inspected full desktop screens at 1440x900 light/dark and 1024x768 dark; phone at 390x844 light/dark, including scrolling to About. Reviewed hierarchy, alignment, spacing, clipping and surrounding Settings. No horizontal overflow. Tab reached Keyboard shortcuts with a visible 2px outline; Escape dismissed desktop Settings. Reduced-motion preferences were exercised; no motion added.
- Screenshots: /tmp/geckit-remote-version-dark.png, /tmp/geckit-remote-version-light.png, /tmp/geckit-remote-version-1024-dark.png, /tmp/geckit-remote-version-unavailable.png, /tmp/geckit-remote-version-phone-light.png, /tmp/geckit-remote-version-phone-dark.png.
- Apple review: existing components, tokens, hierarchy and targets retained; no new colours, controls, permissions, destructive actions or notifications. Changed values remain readable in both appearances.
- Performance: no problems found. All 11 rendering/interaction/animation checklist items are unaffected; no new timers, list scans, formatting, handlers or per-render network calls. Metadata reads happen at the existing update/About request boundary; no profiling required. Phone rebuilt.

## Result

- Delivery: Alex requested a direct commit and push to main on 2026-11-17. The delivered commit and remote verification are recorded in the day-plan task. A main push triggers the existing Development release workflow; ENTech and the active development service were not restarted or deployed by this task. Both client and server need the fix to report a version; older servers explicitly show it as unavailable.
- Checkout: permanent main checkout retained; no temporary task worktree created or removed. Unrelated checklist, PhoneKit, CSS, .vitest and research work preserved.
- Cleanup: task-owned browser tabs closed; isolated test service and renderer servers stopped.
- Remaining verification: real ENTech VM and physical phone require deployment; no live integration claim.

- Day-plan record: task set to #inreview in /Users/alex/Projects/mine/my-workspace/tasks/2026-11-17.md. Validator still reports pre-existing missing Done proofs at lines 99, 103 and 296, repeated Zabookni section at line 295 and an existing link-format issue at line 296; unrelated entries preserved.
- Harness diagnostics: the isolated fixture also emitted pre-existing Codex account-discovery errors because its CODEX_HOME directory was not created; no real account was used and the verified service-version requests succeeded independently.

- Context lookup: assigned role was read from live GeckIt. Employee history retrieval completed after 170 pages with no remaining cursor and complete availability. No prior conversation supplied authorization or an implementation decision for this fix.
