#!/usr/bin/env bash
# Builds whisper-cli from a pinned whisper.cpp into whisper/bin/<os>-<arch>, which is where electron-builder picks it up and where npm run dev looks first. One static binary: no libwhisper or libggml beside it, no OpenMP, and on Windows no Visual C++ runtime to install.
#   scripts/whisper.sh              this computer
#   scripts/whisper.sh mac x64      the Intel Mac copy, built on either Mac
set -euo pipefail

VERSION=v1.9.4

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
work=${WHISPER_WORK:-${TMPDIR:-/tmp}/geckit-whisper}
source="$work/source-$VERSION"
build="$work/build-$os-$arch"
out="$here/whisper/bin/$os-$arch"

if [ ! -d "$source" ]; then
  git clone --quiet --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp "$source"
fi

flags=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_BUILD_EXAMPLES=ON)
case "$os-$arch" in
  mac-arm64) flags+=(-DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 -DGGML_METAL=ON) ;;
  # Rosetta is not there to lean on, so the Intel copy is built for Intel and with the vector units every Intel Mac since 2013 has.
  mac-x64) flags+=(-DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 -DGGML_METAL=ON -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  win-x64) flags+=(-DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  linux-x64) flags+=("-DCMAKE_EXE_LINKER_FLAGS=-static-libstdc++ -static-libgcc" -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON) ;;
  *) echo "No whisper-cli build for $os-$arch" >&2; exit 1 ;;
esac

"$cmake" -S "$source" -B "$build" "${flags[@]}"
"$cmake" --build "$build" --config Release --target whisper-cli -j 4

mkdir -p "$out"
if [ "$os" = win ]; then
  cp "$build/bin/Release/whisper-cli.exe" "$out/"
else
  cp "$build/bin/whisper-cli" "$out/"
fi
echo "$out"
