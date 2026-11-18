# Automatic update audit, 2026-11-18

GeckIt does not currently provide fully automatic installation on macOS, Windows or Linux desktop. There is also a live Development feed failure on all three platforms. This audit changed no application code, settings, releases, workflows or installations.

| Installation | Automatic checks and downloads | Automatic installation |
| --- | --- | --- |
| macOS desktop, arm64 and x64 | Configured after 10 seconds and hourly when enabled; Development currently fails before download | Disabled on ordinary quit; requires Restart to Update, a signed app in Applications and successful idle service shutdown |
| Windows desktop, NSIS x64 | Same schedule; Development currently fails before download | Disabled on ordinary quit; requires Restart to Update and successful idle service shutdown |
| Linux desktop, AppImage x64 | Same schedule; Development currently fails before download; requires an actual AppImage launch with APPIMAGE set | Disabled on ordinary quit; requires Restart to Update and successful idle service shutdown |
| Headless Node service, any OS | No built-in application updater | Deployment tooling or manual bundle replacement required |
| Source desktop | Disabled by app.isPackaged, regardless of the saved autoUpdate preference | Rebuild/relaunch required |

## Development chooses an unpublished version

The installed dependency's GitHubProvider reads releases.atom and, with allowPrerelease enabled and a numeric current version, selects the first entry. During this audit the public Atom feed began with v1.263.0, followed by v1.262.0 and v1.261.0. The authenticated release listing showed v1.263.0 as a draft with no assets, v1.262.0 as a draft, and v1.261.0 as the newest published prerelease. Draft/tag entries in this feed are therefore insufficient evidence that update files are publicly downloadable.

A live read-only probe exercised electron-updater's actual GitHubProvider and resolveFiles with platform values darwin, win32 and linux. Its HTTP transport used Node fetch against the public URLs; it did not use Electron's HTTP transport or native installer. With Development enabled it selected v1.263.0 and failed on all three URLs:

- https://github.com/anetrebskii/geckit/releases/download/v1.263.0/latest-mac.yml: 404
- https://github.com/anetrebskii/geckit/releases/download/v1.263.0/latest.yml: 404
- https://github.com/anetrebskii/geckit/releases/download/v1.263.0/latest-linux.yml: 404

There is no fallback to the next complete published version. client/src/main/updates.ts:56 maps ERR_UPDATER_CHANNEL_FILE_NOT_FOUND to state empty, so this broken candidate is reported as no Development build instead of a release-feed failure. The same module disables updater logging and ignores emitted error events after handling check/download failures.

The same probe passed for Stable on all three platforms: it selected v1.252.0, parsed the corresponding platform metadata, and received successful HEAD responses for every referenced installer/ZIP. Separate authenticated downloads of the six small latest*.yml files from v1.252.0 and v1.261.0 confirmed their version numbers and asset names. Full installer downloads, checksum verification and installation were not performed.

The appropriate fix is to select a complete published release, excluding drafts and unpublished tags, and retain a usable published candidate when the newest feed entry lacks metadata. A feed failure must not be presented as an empty channel. Regression coverage needs real provider selection with an unpublished newest entry and a valid older prerelease; the existing updater tests substitute checkForUpdates and cannot catch this.

## Downloads do not install on ordinary quit

client/src/main/index.ts:1031 always supplies beforeRestart to startUpdates. client/src/main/updates.ts:159 consequently sets autoInstallOnAppQuit to false on every desktop platform. Only restartToUpdate invokes installUpdate, which first asks the independent service to shut down and then calls quitAndInstall. Waiting for work to finish begins only after the person requests that restart; becoming idle alone does not trigger installation.

This is an intentional service-protection rule, documented in docs/headless-service.md, but it contradicts the Settings checkbox description and update notice saying installation happens when the app restarts. An ordinary quit and reopen does not invoke this installation path. The source comment also promises installation on restart.

Restoring automatic installation needs a coordinated idle service lifecycle. Simply setting autoInstallOnAppQuit to true would bypass the service shutdown protection. Alternatively, if explicit installation remains the intended behavior, the automatic-update promise needs to describe checking and downloading accurately.

Read-only inspection of /Applications/GeckIt.app confirmed version 1.201.0, a Developer ID team signature and the same disabled install-on-quit logic in its bundled main process. Its saved general preferences have autoUpdate=true and updateChannel=dev. The updater cache contains pending/update-info.json naming GeckIt-1.223.0-arm64.zip, last modified 2026-11-12T16:49:01.723Z. This proves that this installed copy and its cached download are old; it does not establish the live updater state or prove why no later download replaced that cache. The source copy also follows Development in its preferences, but source builds explicitly disable the updater.

## Publishing is also affected by runner availability

The latest completed successful Publish run at the beginning of the audit was https://github.com/anetrebskii/geckit/actions/runs/44112108721, publishing Development v1.261.0 on 2026-11-17. Stable v1.252.0 was promoted separately. Stable promotion is manual by design; it does not track every Development build.

Two later publish attempts failed after cancelled macOS jobs, preventing the final release job from publishing their drafts. For https://github.com/anetrebskii/geckit/actions/runs/44164479626, attempt 1, cancelled job 134328641212 has GitHub check annotations stating "The job was not acquired by Runner of type hosted even after multiple attempts" and reporting macOS arm64 capacity constraints. Attempt 2 was in progress during the audit. No workflow was retried or changed by this audit.

The release job depends on every publish matrix job in .github/workflows/publish.yml:214. Windows and Linux success alone cannot publish a new shared release. Publishing only after all platform assets exist is correct; exposing an unpublished candidate through Development selection is the separate updater defect above.

## Verification and scope

- npm test -- updates.test.ts: 11 tests passed. These are mocked updater tests, including a test explicitly requiring autoInstallOnAppQuit=false when a service hook exists.
- Public feed/parser checks: three Stable platform checks passed; three Development platform checks failed with the reproducible metadata 404s above. The first custom probe had an incorrect URL conversion in its verification transport; that transport was corrected before the results recorded here.
- GitHub release metadata and CI annotations were read live. The installed Mac bundle, selected update preferences and cache metadata were inspected without launching, quitting or updating GeckIt.
- No native Windows/Linux installation, full download, signature/checksum verification, real update installation or remote headless host was exercised. These remain unverified. A deployment-specific external updater could exist outside this repository.
- Existing unrelated working-tree changes were preserved. No commit, push, promotion, deployment or temporary worktree was created.
- The assigned employee role was read. Historical memory pagination did not finish and its read-only scan was stopped; historical coverage is incomplete. Findings above rely on current code and live checks rather than prior conversation decisions. No audit commands remain running.

No creative/publication type standard matched this internal engineering audit.
