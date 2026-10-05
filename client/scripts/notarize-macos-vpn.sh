#!/usr/bin/env bash
set -euo pipefail

: "${GECKIT_NOTARY_PROFILE:?Set the name of an existing notarytool Keychain profile}"
app="${1:?Pass the signed qualification app path}"
if [ ! -d "$app" ] || [ ! -f "$app/Contents/embedded.provisionprofile" ]; then
    printf '%s\n' 'A provisioned, signed qualification app is required.' >&2
    exit 64
fi
app_dir="$(cd "$(dirname "$app")" && pwd)"
app="$app_dir/$(basename "$app")"
codesign --verify --deep --strict "$app"
archive="$app_dir/qualification-notary.zip"
result="$app_dir/qualification-notary.json"
ditto -c -k --keepParent "$app" "$archive"
xcrun notarytool submit "$archive" --keychain-profile "$GECKIT_NOTARY_PROFILE" --wait --output-format json > "$result"
python3 - "$result" <<'PY'
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1]).read_text())
if result.get("status") != "Accepted":
    print("Notarization was not accepted. Inspect qualification-notary.json and Apple's submission log.", file=sys.stderr)
    sys.exit(1)
PY
xcrun stapler staple "$app"
xcrun stapler validate "$app"
codesign --verify --deep --strict "$app"
spctl --assess --type execute --verbose=4 "$app"
printf '%s\n' 'Notarization verified. Native routing and failure qualification are still required.'
