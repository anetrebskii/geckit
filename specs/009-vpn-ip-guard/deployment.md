# VPN guard deployment

User goal: "It's implemented. Deploy to iphone, to development, and promoted to stable channel."

Source baseline: main 3593efc, remote main b4a3a14 before feature commit. VPN change remains uncommitted. Client checks passed: 822 tests in 64 files, types/lint, desktop and phone bundles. Release uses repository Publish workflow on main and explicit Promote workflow; Stable uses the same installers.

Destination: Alex's paired iPhone 13 Pro, bundle com.anetrebskii.geckit, configured development team. Capacitor sync passed. Signed Release build succeeded in /private/tmp/geckit-vpn-iphone-build; build log /private/tmp/geckit-vpn-iphone-build.log. Proposed native version 1.88.0/build 188 must be reconciled with the version selected by CI before installation.

Automatic approval rejected the bounded commit twice, citing implementation-only restriction and treating the goal context as insufficient publication authorization. A direct combined confirmation has been requested for commit/push, iPhone installation, Development publication and Stable promotion. No rejected action has been bypassed; no commit, push, device installation or channel change has occurred.

Completion evidence required: source commit in release tag; successful platform and iOS CI jobs; Development prerelease and all updater assets; verified signed iPhone installation containing current bundle; successful explicit Stable promotion and GitHub Latest metadata/installer aliases matching the same release.

## Prepared iPhone artifact

Xcode Release build succeeded. codesign --verify --deep --strict passed with system trust/keychain access. Bundle ID com.anetrebskii.geckit, native version1.88.0/build188 (candidate version; CI has not allocated release number yet). All22web assets match the current mobile/www bundle byte-for-byte; no mismatches. Built JavaScript contains approved-address field, periodic-stop switch and ten-second help text. Proof: /private/tmp/geckit-vpn-iphone-bundle-proof.json.

Phone lock-state query reports passcodeRequired:true; installation may need Alex to unlock it. A separate device-details probe could not mount the developer disk image while locked. No developer security settings were changed.

Current blocker: direct confirmation is pending. The automatic approval reviewer explicitly did not accept the goal/tool context as trusted deployment authorization. Commit/push/install/promote remain unperformed. Full deployment objective remains unchanged.

## Release-state recheck

GitHub confirms remote main remains b4a3a14017919c74ad219a8241e3c9906719265f. Newest Development release is v1.87.0; Latest Stable is v1.78.0. Neither contains the uncommitted VPN implementation. iPhone still reports passcodeRequired:true. Prepared bundle is not deployment evidence; no direct confirmation has arrived and no live build/release process remains to wait on.

## Blocked audit

The same direct-authorization blocker persisted across three consecutive deployment goal turns. Read-only rechecks prove source remains uncommitted at3593efc, remote main remains b4a3a14, Development v1.87.0 and Stable v1.78.0. Signed local iPhone preparation is complete; no live deployment process remains. Required commit, push, device installation and channel promotion cannot proceed under the automatic approval rejection without a direct user confirmation. Goal marked blocked, not complete; the original three deployment destinations remain required.


## Preparation invalidated by Send again fix - 2026-10-11

Source and desktop/mobile bundles now include the Send again queue correction, validated by 831 tests. The earlier signed iPhone candidate predates that correction and must be rebuilt and its web-asset/signature proof refreshed before installation. The earlier asset match describes preparation at that time, not the current bundle. Deployment remains blocked pending direct authorization; no installed/released state changed.


## Local iPhone deployment authorized and installed - 2026-10-11

Alex explicitly requested "Deploy to my local iphone". This authorizes the local device update; commit/push, Development publication and Stable promotion remain unperformed and pending separate authorization.

Fresh mobile build and Capacitor sync succeeded. Signed Xcode Release build succeeded; codesign deep/strict verification passed. All 22 app/public files match current mobile/www byte-for-byte and the bundle contains VPN settings and current Send again renderer changes. Build version 1.88.0/build 188 is a local development snapshot, not a published channel release.

Installed in place on iPhone 13 Pro (Alex), CoreDevice 8E21F7EE-BD85-5E2E-B403-F141E8EA88A5, bundle com.anetrebskii.geckit. devicectl returned successful installation and post-install device metadata confirms version 1.88.0/build 188 (previously 1.0/build 1). App was not uninstalled. Proof: /private/tmp/geckit-local-iphone-{bundle-proof,install,app-after}.json. Logs: /private/tmp/geckit-local-iphone-{mobile-build,sync,xcode-build,install}.log.

Launch verification initially failed because the phone locked after installation (FBSOpenApplicationErrorDomain Locked). Asked Alex to unlock on the device; no lock/developer security setting was bypassed or changed. Desktop active sessions/backend were not restarted by this phone deployment. Backend fixes require the paired desktop app to load the current build on its next restart.


## Single-switch local iPhone update - 2026-10-11

The existing explicit local-iPhone deployment authorization carries forward to Alex's requested correction. Fresh mobile bundle, Capacitor sync and Xcode Release build succeeded for local snapshot 1.88.0/build 189. Deep/strict codesign verification passed; all 22 web assets match the current mobile/www files. Bundle proof confirms obsolete stop-option copy is absent and single-switch monitoring help is present.

Installed in place on the same paired iPhone 13 Pro, bundle com.anetrebskii.geckit. Device metadata confirms 1.88.0/build 189. Native process launch succeeded while unlocked. Device UI and paired-backend VPN interruption were not driven or visually observed. Desktop backend is built but active app/conversations were not restarted; automatic monitoring under the single flag takes effect when the paired app next loads the current backend.

Proof: /private/tmp/geckit-single-vpn-{bundle-proof,install,app-after,launch}.json. Logs: /private/tmp/geckit-single-vpn-{mobile-build,sync,xcode-build,install,launch}.log. Client source validation: 64 files / 828 tests, typecheck/lint and desktop/mobile builds pass. No commit/push, Development publication or Stable promotion performed.
