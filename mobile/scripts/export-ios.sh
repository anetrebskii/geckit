#!/bin/bash
set -euo pipefail

version=$1
build=$2
: "${IOS_APP_PROFILE:?Configure IOS_APP_PROFILE in the testflight environment}"
: "${IOS_EXTENSION_PROFILE:?Configure IOS_EXTENSION_PROFILE in the testflight environment}"

umask 077
work=$(mktemp -d "$RUNNER_TEMP/geckit-export.XXXXXX")
profiles="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$profiles"
installed=()
cleanup() {
  for profile in ${installed[@]+"${installed[@]}"}; do rm "$profile"; done
  rm -r "$work"
}
trap cleanup EXIT

install_profile() {
  local name=$1 bundle=$2 uuid destination
  base64 --decode > "$work/$name.mobileprovision"
  security cms -D -i "$work/$name.mobileprovision" > "$work/$name.plist"
  test "$(plutil -extract Entitlements.application-identifier raw "$work/$name.plist")" = "MQKD7Z7V2L.$bundle"
  uuid=$(plutil -extract UUID raw "$work/$name.plist")
  destination="$profiles/$uuid.mobileprovision"
  if [ ! -e "$destination" ]; then
    cp "$work/$name.mobileprovision" "$destination"
    installed+=("$destination")
  fi
  profile_uuid=$uuid
}

app_bundle=com.anetrebskii.geckit
extension_bundle=$app_bundle.NotificationService
install_profile app "$app_bundle" <<< "$IOS_APP_PROFILE"
app_profile=$profile_uuid
install_profile extension "$extension_bundle" <<< "$IOS_EXTENSION_PROFILE"
extension_profile=$profile_uuid
unset IOS_APP_PROFILE IOS_EXTENSION_PROFILE

cp ios/ExportOptions.plist "$work/ExportOptions.plist"
plist="$work/ExportOptions.plist"
/usr/libexec/PlistBuddy -c 'Set :signingStyle manual' -c 'Add :signingCertificate string Apple Distribution' \
  -c 'Add :provisioningProfiles dict' -c "Add :provisioningProfiles:$app_bundle string $app_profile" \
  -c "Add :provisioningProfiles:$extension_bundle string $extension_profile" "$plist"

archive="$RUNNER_TEMP/GeckIt.xcarchive"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination generic/platform=iOS \
  -archivePath "$archive" archive GECKIT_IOS_SIGN_STYLE=Manual 'GECKIT_IOS_SIGN_IDENTITY=Apple Distribution' \
  "GECKIT_IOS_APP_PROFILE=$app_profile" "GECKIT_IOS_EXTENSION_PROFILE=$extension_profile" \
  "MARKETING_VERSION=$version" "CURRENT_PROJECT_VERSION=$build"
xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$plist" -exportPath "$RUNNER_TEMP/ios-export"
mv "$RUNNER_TEMP/ios-export/"*.ipa "$RUNNER_TEMP/GeckIt.ipa"
node scripts/testflight.mjs verify "$RUNNER_TEMP/GeckIt.ipa" "$version" "$build"
