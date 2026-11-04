#!/bin/sh
# Packs client/extension for the Chrome Web Store, which refuses a manifest with a key.
set -e
cd "$(dirname "$0")/../extension"
version=$(node -p "require('./manifest.json').version")
out="$(cd .. && pwd)/out/geckit-browser-$version.zip"
work=$(mktemp -d)
cp -R background.js popup.html popup.js icons "$work/"
node -e "const m = require('./manifest.json'); delete m.key; require('fs').writeFileSync(process.argv[1], JSON.stringify(m, null, 2) + '\n')" "$work/manifest.json"
mkdir -p "$(dirname "$out")"
rm -f "$out"
(cd "$work" && zip -qr "$out" .)
rm -rf "$work"
echo "$out"
