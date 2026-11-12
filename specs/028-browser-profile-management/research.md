# Profile backup and transfer feasibility

Date: 2026-11-12. Codex session `01a1cfc9-730a-79f2-9338-01d850ff59a9`. Initial feasibility investigation below records the pre-change behavior. The approved export/import implementation is now present in the working tree; see [verification.md](verification.md).

## What can be transferred

A Chrome user-data directory contains browser profile data and local installation state, including history, bookmarks and cookies. GeckIt already gives each managed Chrome for Testing profile its own user-data directory under `~/.geckit/chrome-for-testing/profiles/<name>/`. Its account note is stored separately under `~/.geckit/browser-state/accounts/<name>.json`.

A CLI archive can back up the profile directory and its account note. Restore on the same machine and transfer to another machine are technically possible file operations. That does not establish that all restored browser features or account sessions will work. Import should create a new profile and let the person open and check it.

## Why sign-ins are not portable guarantees

[Chromium's security FAQ](https://chromium.googlesource.com/chromium/src/+/main/docs/security/faq.md) documents saved-credential encryption using keys held in the operating system's credential facilities: Keychain on macOS, Secret Service or KWallet on Linux, and App-Bound encryption on Windows. Copying the profile files does not copy those operating-system keys.

[Google's explanation of Chrome cookie encryption](https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html) explicitly states that App-Bound encryption binds keys to the machine and does not function correctly for roaming profiles between machines. This source describes Windows; it does not establish identical cookie behavior on every macOS or Linux version.

Inference for this feature: browser-file backup can be useful, but an archive must not promise working sign-ins or saved passwords after transfer. Do not decrypt cookies or credentials and do not export the operating-system key store. Direct sign-in on the destination remains the dependable setup path supported by GeckIt's existing remote live view.

## Source lifecycle and consistency

[Chromium's user-data-directory documentation](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md) describes profile storage and notes that running Chrome instances cannot share one user-data directory.

Local implementation evidence:

- `client/src/cli/testing.ts`: `testingFolder`, `profilesFolder`, `testBrowser` and `testBrowsersState` own managed directories, Chrome launch and profile discovery. Chrome starts with `--user-data-dir=<profile directory>` and a debugging pipe.
- `client/src/cli/browser-lifecycle.ts`: `acquireTestLock` serializes test-browser startup. `TestAccount`, `testAccount` and `saveTestAccount` own account notes. Existing names accept 1-40 lowercase letters, digits or hyphens with an alphanumeric first character. Notes are normalized to 120 characters.
- `client/src/cli/browser.ts`: `accountCommand`, `openTest` and profile command dispatch already create/name/open profiles; no archive commands exist. Unknown `profiles` subcommands currently fall through to profile listing, so export/import need explicit parsing and validation.
- `client/src/core/application.ts`: `browser:openTest` currently awaits `openTest` without checking its `{ ok, said }` result. The UI also clears operation state in `finally` without surfacing row-action rejection. The proposed implementation should propagate the actual startup failure.
- `client/src/renderer/src/ui/SettingsDialog.tsx`: `TestBrowsers` already has New account profile, account/name inputs, Open, Sign in and confirmed Delete. This is an improvement to an existing manual flow.

Export should acquire the same profile lifecycle lock used during startup, reject an active/starting profile and respect Chrome's own singleton indication. It should exclude transient caches and singleton files. Neither export nor import should stop somebody's browser automatically. Import needs a staging directory, validation of archive paths and regular-file entries, and publication only under a new unused name.

## Earlier GeckIt decision

[Feature 025](../025-remote-browser-profiles/spec.md) explicitly excluded copying sign-in data and required destination-side sign-in. This proposal changes only explicit file backup/restore scope, while keeping destination-side sign-in and avoiding operating-system credential transfer. It is recorded as a proposed reversal in the UX document rather than silently rewriting the earlier spec.

Assigned engineer memory was requested through the supported GeckIt employee CLI. Relevant prior browser fallback conversation: `codex:01a1b0dd-e59c-7c03-a0d3-ba7b47aba10d`. It confirms that test browsers are the supported fallback for missing ordinary Chrome profiles, automatically download on first launch and do not override permission denials. The current source and feature documents are the evidence for this task's behavior; historical transcripts do not authorize new actions.

## Verification boundary

No real account profiles have been opened, copied, exported, imported or deleted. The existing project test browser rendered the UX state diagram, layout prototype and actual Settings renderer through GeckIt. No password or cookie value was read. Cross-machine authentication has not been tested. Backend validation used real filesystem operations on synthetic browser files in temporary directories; UI checks used the actual renderer with a clearly identified native boundary fixture. Fixture success is not evidence of real account sign-in or OS credential portability.

## Continuation record

Alex approved the UX and implementation with "implement" on 2026-11-12. Assigned engineer memory pagination is complete through 87 pages, saved in `/private/tmp/geckit-profile-memory-01a1cfc9/`; the continuation contained no additional browser-profile decision. Production changes followed prototype review and consistency analysis. Later steering renamed Integrations to Web Browser and made profiles the primary content. The checkout remains shared `main`; no commit, push, active-service restart, branch or temporary worktree was created.
