#!/usr/bin/env bash
set -euo pipefail

client_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="$client_dir/native/macos-vpn"
go_bin="${GECKIT_GO:-go}"
target_arch="${GOARCH:-$("$go_bin" env GOARCH)}"
team="${GECKIT_VPN_TEAM:-MQKD7Z7V2L}"
mode="${1:-unsigned}"
if [ "$mode" != unsigned ] && [ "$mode" != signed ]; then exit 64; fi
if [ "$mode" = signed ]; then : "${GECKIT_SIGNING_IDENTITY:?Set a Developer ID Application identity}"; fi
output_dir="$client_dir/vpn/qualification/darwin-$target_arch"
app="$output_dir/GeckIt VPN Qualification.app"
extension="$app/Contents/Library/SystemExtensions/org.anetrebskii.GeckIt.AgentVPN.Tunnel.systemextension"
runner="$app/Contents/Helpers/GeckIt Agent.app"
swift_arch="$target_arch"
if [ "$target_arch" = amd64 ]; then swift_arch=x86_64; fi

python3 "$source_dir/bundle.py" "$output_dir" "$team" "$mode"
rm -f "$extension/Contents/Resources/geckit-agent-vpn"
rm -f "$extension/Contents/MacOS/geckit-agent-vpn"
(
    cd "$client_dir/native/agent-vpn"
    MACOSX_DEPLOYMENT_TARGET=15.0 CGO_CFLAGS="-mmacosx-version-min=15.0 ${CGO_CFLAGS:-}" CGO_LDFLAGS="-mmacosx-version-min=15.0 ${CGO_LDFLAGS:-}" CGO_ENABLED=1 GOOS=darwin GOARCH="$target_arch" "$go_bin" build -mod=readonly -trimpath -buildmode=c-archive -o "$output_dir/libGeckItAgentVPN.a" .
)

swift=(xcrun swiftc -swift-version 5 -warnings-as-errors -module-cache-path "$output_dir/swift-cache" -target "$swift_arch-apple-macosx15.0" -parse-as-library)
"${swift[@]}" -module-name GeckItAgentVPN -import-objc-header "$output_dir/libGeckItAgentVPN.h" "$source_dir/Profile.swift" "$source_dir/PacketBridge.swift" "$source_dir/PacketTunnel.swift" "$source_dir/ExtensionMain.swift" -framework NetworkExtension "$output_dir/libGeckItAgentVPN.a" -lresolv -o "$extension/Contents/MacOS/GeckItAgentVPNTunnel"
"${swift[@]}" "$source_dir/Profile.swift" "$source_dir/Controller.swift" -framework NetworkExtension -framework SystemExtensions -framework Security -framework AppKit -o "$app/Contents/MacOS/GeckItVPNQualification"
if [ "${GECKIT_VPN_NATIVE_PROBE:-0}" = 1 ]; then
    "${swift[@]}" -D VPN_DNS_PROBE "$source_dir/Runner.swift" "$source_dir/DNSProbe.swift" -framework Network -o "$runner/Contents/MacOS/GeckItAgent"
else
    "${swift[@]}" -module-name GeckItAgentRunner "$source_dir/Runner.swift" -o "$runner/Contents/MacOS/GeckItAgent"
fi

sign_bundle() {
    if [ "$mode" = signed ]; then
        codesign --force --sign "$GECKIT_SIGNING_IDENTITY" --options runtime --timestamp "$@"
    else
        codesign --force --sign - "$@"
    fi
}
sign_bundle "$runner"
sign_bundle --entitlements "$output_dir/tunnel.entitlements" "$extension"
sign_bundle --entitlements "$output_dir/host.entitlements" "$app"
codesign --verify --deep --strict "$app"
printf '%s\n' "$app"
