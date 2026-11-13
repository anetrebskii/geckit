#!/usr/bin/env bash
# Runs GeckIt from source with secrets: builds the broker if it is missing, then the app, whose service starts the broker. Secret links go through the real relay, https://geckit-signal.web.app.
# Ctrl+C, or quitting the app, stops what it started: the app, its service and the broker. It refuses to start while another GeckIt from this checkout runs.
#   npm run dev:secrets
set -euo pipefail

client=$(cd "$(dirname "$0")/.." && pwd)
app=''
started=''

tree() { local one; for one in $(pgrep -P "$1" 2>/dev/null); do tree "$one"; done; echo "$1"; }

stop() {
  trap - EXIT INT TERM
  [ -z "$started" ] && return
  echo 'Stopping GeckIt, its service and the broker...'
  local mine
  mine="$(tree "$app") $(pgrep -f "$client/out/service/service.js|$client/broker/bin/" || true)"
  kill -TERM $mine 2>/dev/null || true
  for _ in $(seq 30); do
    alive=''
    for one in $mine; do kill -0 "$one" 2>/dev/null && alive=1; done
    [ -z "$alive" ] && break
    sleep 0.5
  done
  kill -KILL $mine 2>/dev/null || true
}
trap stop EXIT INT TERM

if pgrep -f "$client/out/service/service.js" > /dev/null; then
  echo "GeckIt from this checkout is already running (npm start, npm run dev or this script). Quit it first." >&2
  exit 1
fi
case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=x64 ;; esac
case "$(uname -s)" in Darwin) os=mac ;; Linux) os=linux ;; *) os=win ;; esac
[ -x "$client/broker/bin/$os-$arch/geckit-broker" ] || [ -x "$client/broker/bin/$os-$arch/geckit-broker.exe" ] || "$client/scripts/broker.sh"

cd "$client"
started=1
env -u GECKIT_SIGNAL_URL npm run dev &
app=$!
wait "$app" || true
