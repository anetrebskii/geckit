#!/usr/bin/env bash
# Builds llama-server from a pinned llama.cpp into llama/bin/<os>-<arch>, which is where electron-builder picks it up and where npm run dev looks first. It runs the small model behind geckit browser find. One static binary, Metal built in on a Mac.
#   scripts/llama.sh              this computer
#   scripts/llama.sh mac x64      the Intel Mac copy, built on either Mac
set -euo pipefail

VERSION=v0.8.0

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
cmake=${CMAKE:-cmake}

# The source and the build stay out of client/, where vitest would go looking for tests in them.
work=${LLAMA_WORK:-${TMPDIR:-/tmp}/geckit-llama}
# The physical path: the web UI step of llama.cpp v0.8.0 breaks on paths through a symlink, as /var is on a Mac.
mkdir -p "$work" && work=$(cd "$work" && pwd -P)
source="$work/source-$VERSION"
build="$work/build-$os-$arch"
out="$here/llama/bin/$os-$arch"

if [ ! -d "$source" ]; then
  git clone --quiet --depth 1 --branch "$VERSION" https://github.com/ggml-org/llama.cpp "$source"
fi

flags=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_CURL=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_SERVER=ON)
case "$os-$arch" in
  mac-arm64) flags+=(-DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON) ;;
  mac-x64) flags+=(-DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  win-x64) flags+=(-DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  linux-x64) flags+=("-DCMAKE_EXE_LINKER_FLAGS=-static-libstdc++ -static-libgcc" -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  *) echo "No llama-server build for $os-$arch" >&2; exit 1 ;;
esac

"$cmake" -S "$source" -B "$build" "${flags[@]}"
"$cmake" --build "$build" --config Release --target llama-server -j 8

mkdir -p "$out"
if [ "$os" = win ]; then
  cp "$build/bin/Release/llama-server.exe" "$out/"
else
  cp "$build/bin/llama-server" "$out/"
fi
echo "$out"
