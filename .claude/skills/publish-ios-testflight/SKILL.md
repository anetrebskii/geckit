---
name: publish-ios-testflight
description: Publishes an existing signed GeckIt iOS build from GitHub Actions to TestFlight Public. Use when explicitly asked to upload, publish, or deploy a specific or latest GeckIt iOS build to TestFlight.
---

# Publish GeckIt iOS to TestFlight Public

Use the signed IPA produced by GitHub Publish. This workflow leaves the GitHub release channel and desktop installers alone. Deliver only when the user explicitly asks to publish. A request to build or inspect an IPA ends before delivery.

## Select and verify the IPA

Use the requested release tag or version. For "latest", use `gh release list --repo anetrebskii/geckit --exclude-drafts --limit 1 --json tagName --jq '.[0].tagName'` to include the Development prerelease. If that selection has no IPA, report the missing artifact. Use an older version only if the user selects it.

From the repository root on a Mac with authenticated `gh`, `jq`, Node and Xcode tools, run the following in Bash with the selected version or tag as the first argument.

```bash
set -euo pipefail
repo=anetrebskii/geckit
version=${1#v}
tag=v$version
work=$(mktemp -d "${TMPDIR:-/tmp}/geckit-testflight.XXXXXX")

gh release download "$tag" --repo "$repo" --pattern ios-build.json --dir "$work"
manifest="$work/ios-build.json"
artifact=$(jq -er --arg version "$version" 'select(.version == $version) | .artifactId | select(test("^[0-9]+$"))' "$manifest")
build=$(jq -er '.build | select(test("^[0-9]+$"))' "$manifest")
gh api "/repos/$repo/actions/artifacts/$artifact/zip" > "$work/ipa.zip"
ipa="$work/GeckIt.ipa"
unzip -p "$work/ipa.zip" GeckIt.ipa > "$ipa"
node mobile/scripts/testflight.mjs verify "$ipa" "$version" "$build"
unzip -q "$ipa" 'Payload/*' -d "$work"
codesign --verify --deep --strict "$work/Payload/App.app"
printf 'Version %s (%s)\nArtifact %s\nIPA %s\n' "$version" "$build" "$artifact" "$ipa"
```

Stop if the manifest, artifact, package version, bundle IDs, or signature fails verification. GitHub retains IPAs for 90 days. A missing or expired artifact needs a new successful Publish run or an explicitly selected retained release.

## Deliver and verify

1. Open [GeckIt in App Store Connect](https://appstoreconnect.apple.com/apps/6815725206/testflight/ios). Check the exact version and build number before uploading. If Apple already shows the build or an upload is processing, continue from that state.
2. For a new upload, add the verified IPA in Apple's Transporter app on the Mac and choose **Deliver** using an authorized Apple account. A GeckIt-only individual API key, when already configured for local use, also supports `node mobile/scripts/testflight.mjs deliver "$ipa" "$version" "$build"`. Keep credentials on the authorized host and follow its secret handling. If the required account sign-in or two-factor prompt needs the user, hand off that step and resume after sign-in.
3. In TestFlight, wait for processing and add the exact build to the existing external group **Public**. Fill in **What to Test** if Apple requests it, enable automatic notification, and submit for **TestFlight App Review** if required. Use the existing public link. [Apple upload guide](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/) · [Apple external testing guide](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)
4. Read back the processed version/build, Public group membership, review or testing status, and public link. Report the GitHub release and TestFlight link in the user's language. Say whether the build is awaiting Apple review or available to testers.
