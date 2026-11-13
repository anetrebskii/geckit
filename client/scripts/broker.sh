#!/usr/bin/env bash
# Builds the secrets broker (../broker, Go) into broker/bin/<os>-<arch>, where electron-builder picks it up and the service looks first.
#   scripts/broker.sh              this computer
#   scripts/broker.sh mac x64      another architecture; the Mac build needs cgo, so build each Mac copy on a Mac
set -euo pipefail

here=$(cd "$(dirname "$0")/.." && pwd)
case "$(uname -s)" in
  Darwin) os=mac ;;
  Linux) os=linux ;;
  *) os=win ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  *) arch=x64 ;;
esac
os=${1:-$os}
arch=${2:-$arch}
case "$os" in mac) goos=darwin ;; win) goos=windows ;; *) goos=linux ;; esac
case "$arch" in arm64) goarch=arm64 ;; *) goarch=amd64 ;; esac
name=geckit-broker
[ "$os" = win ] && name=geckit-broker.exe
cgo=0
[ "$os" = mac ] && cgo=1
out="$here/broker/bin/$os-$arch"
mkdir -p "$out"
(cd "$here/../broker" && CGO_ENABLED=$cgo GOOS=$goos GOARCH=$goarch go build -trimpath -ldflags "-s -w" -o "$out/$name" .)
{ if command -v sha256sum > /dev/null; then sha256sum "$out/$name"; else shasum -a 256 "$out/$name"; fi; } | cut -d' ' -f1 > "$out/$name.sha256"
echo "$out/$name"
