# TestFlight from Stable promotion

- Request: Build iOS on each push and upload the built version to TestFlight Public on Stable promotion.
- Checkout: `/Users/alex/Projects/mine/geckit`, branch `main`.
- Started: 2026-11-23.

## Acceptance conditions

- An eligible `main` push passing the Publish test gate creates a signed IPA using the generated release version and retains it as a GitHub Actions artifact.
- The corresponding GitHub release records the artifact ID, source commit, version, and build number.
- Promote uploads the verified artifact selected by that release, adds the processed build to Public, and submits it for beta review when required. A retry reuses an existing Apple upload.
- Desktop Stable is available while TestFlight processing or review is pending. The workflow reports an expired or unavailable artifact.
- Assumption: "Each push" uses the existing Publish workflow's `main` branch and path filters.
- Unknown: Provisioning the GitHub environment and running the first hosted build require the CI signing credentials.

## Progress

### 1. Prepare the UX document

Not applicable: GitHub Actions automation through the existing workflow entry point.

### 2. Prepare the UI and test it

Not applicable: no product UI.

### 3. Write the feature code

- [x] Build and retain the signed IPA in Publish, then deliver it in Promote.
- Publish archives and exports using the release number it allocated. The release manifest pins the artifact ID, version, build number and source commit. Promote downloads that artifact, verifies both bundle versions, and uses App Store Connect for delivery and beta review.

### 4. Update the related distributed skills

Not applicable: no distributed skill covers the release workflows.

### 5. Update the feature list

Not applicable: release automation is an internal workflow.

### 6. Write unit tests

- [x] Exercise version mismatch and delivery retry paths without uploading a live build.
- A fixture using the real exported IPA checked a fresh upload, an upload already processing, an existing Public build, and an Apple processing failure. Version and build-number mismatches were rejected.

### 7. Test the feature through its CLI and workflows

- [x] Validate GitHub Actions workflows and verify an exported iOS artifact.
- `actionlint` passed with the existing desktop-signing SC2046 warning suppressed. Node syntax and plist checks passed. A signed export of the existing 1.302.0 archive passed package verification.
- The workflow shell steps selected the exact IPA from the fixture release manifest and rejected missing, expired and mismatched artifacts. A run against live App Store Connect with upload and API writes blocked verified that 1.302.0 (202611231) is in Public, with automatic distribution and beta review pending.
- The latest Publish failures were reproduced locally. The Chrome extension fixtures now provide the storage change event. The Manager lifecycle test attaches a regular conversation for the Done transition and checks that a separate unfinished checklist is refused. The headless fixture records worker PIDs by session. All 17 tests in the three affected suites passed.

### 8. Test the final UI

Not applicable: no product UI.

## Result

- The GitHub `testflight` environment was created and verified to allow only `main`. It needs signing credentials before the first hosted Publish run. The environment credentials and retention window are documented in `CLAUDE.md`.

## GeckIt-only publishing credentials

- Apple team keys are account-wide. GitHub will use an individual key for an App Manager whose App Store Connect access is limited to GeckIt. Promotion checks the account's visible apps before upload and stops unless GeckIt is the only one.
- Publish signs offline with the distribution identity and App Store profiles for GeckIt and its notification extension. Both profiles were created on Apple and verified against their exact bundle IDs. Xcode archived and exported a signed 1.303.0 (410) IPA with both profiles and no App Store Connect key. Signature and version checks passed.
- The existing team key was rejected by Apple's individual-key authentication. App Store Connect has no App Manager restricted to GeckIt. Creating and verifying the individual key is the remaining credential setup step.
