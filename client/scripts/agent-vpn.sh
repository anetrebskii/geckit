#!/usr/bin/env bash
set -euo pipefail

client_dir="$(cd "$(dirname "$0")/.." && pwd)"
go_bin="${GECKIT_GO:-go}"
target_os="${GOOS:-$("$go_bin" env GOOS)}"
target_arch="${GOARCH:-$("$go_bin" env GOARCH)}"
output_dir="$client_dir/vpn/bin/$target_os-$target_arch"
executable=geckit-agent-vpn
if [ "$target_os" = windows ]; then executable+=.exe; fi

mkdir -p "$output_dir"
cd "$client_dir/native/agent-vpn"
CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" "$go_bin" build -mod=readonly -trimpath -ldflags='-s -w' -o "$output_dir/$executable" .
