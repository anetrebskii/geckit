#!/usr/bin/env bash
# Runs GeckIt from source with the secret link relay on this computer: the signal emulators (page, `secret` function, Firestore) and the app pointed at them.
# Ctrl+C, or quitting the app, stops what it started: the emulators, the app, its service and broker. It refuses to start while another GeckIt from this checkout runs.
#   npm run dev:secrets
# Ports: SECRETS_PORT (page and API, 5055), and 5056, 8095, 4405, 4505 for functions, Firestore, hub and logging.
set -euo pipefail

client=$(cd "$(dirname "$0")/.." && pwd)
signal=$(cd "$client/../signal" && pwd)
port=${SECRETS_PORT:-5055}
config="$signal/.firebase.dev.json"
log="$signal/.emulators.log"
emulators=''
app=''
started=''

tree() { local one; for one in $(pgrep -P "$1" 2>/dev/null); do tree "$one"; done; echo "$1"; }

stop() {
  trap - EXIT INT TERM
  [ -n "$app$emulators" ] && echo 'Stopping GeckIt, its service and broker, and the emulators...'
  local mine=''
  [ -n "$app" ] && mine="$(tree "$app")"
  [ -n "$started" ] && mine="$mine $(pgrep -f "$client/out/service/service.js|$client/broker/bin/" || true)"
  [ -n "$mine" ] && kill -TERM $mine 2>/dev/null || true
  [ -n "$emulators" ] && kill -INT "$emulators" 2>/dev/null || true
  for _ in $(seq 30); do
    alive=''
    for one in $mine $emulators; do kill -0 "$one" 2>/dev/null && alive=1; done
    [ -z "$alive" ] && break
    sleep 0.5
  done
  [ -n "$mine" ] && kill -KILL $mine 2>/dev/null || true
  [ -n "$emulators" ] && { kill -KILL "$emulators" 2>/dev/null; lsof -ti "tcp:$port,5056,8095,4405,4505" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; } || true
  rm -f "$config"
}
trap stop EXIT INT TERM

if pgrep -f "$client/out/service/service.js" > /dev/null; then
  echo "GeckIt from this checkout is already running (npm start, npm run dev or this script). Quit it first: its service would keep running without the local relay." >&2
  exit 1
fi
for need in go firebase java; do command -v "$need" > /dev/null || { echo "$need is needed: install it first." >&2; exit 1; }; done
case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; *) arch=x64 ;; esac
case "$(uname -s)" in Darwin) os=mac ;; Linux) os=linux ;; *) os=win ;; esac
[ -x "$client/broker/bin/$os-$arch/geckit-broker" ] || [ -x "$client/broker/bin/$os-$arch/geckit-broker.exe" ] || "$client/scripts/broker.sh"
npm --prefix "$client" run viewer --silent
[ -d "$signal/functions/node_modules" ] || npm --prefix "$signal/functions" ci

node -e '
const [from, to, port] = process.argv.slice(1)
const config = JSON.parse(require("fs").readFileSync(from, "utf8"))
delete config.hosting.predeploy
config.emulators = { hosting: { port: Number(port) }, functions: { port: 5056 }, firestore: { port: 8095 }, hub: { port: 4405 }, logging: { port: 4505 }, ui: { enabled: false } }
require("fs").writeFileSync(to, JSON.stringify(config, null, 2))
' "$signal/firebase.json" "$config" "$port"


(cd "$signal" && exec firebase emulators:start --config .firebase.dev.json --project geckit-signal) > "$log" 2>&1 &
emulators=$!
echo "Starting the relay emulators (log: $log)..."
until grep -q 'All emulators ready' "$log"; do
  kill -0 "$emulators" 2>/dev/null || { cat "$log" >&2; exit 1; }
  sleep 1
done
echo "Secret links open at http://localhost:$port/s/"

cd "$client"
started=1
GECKIT_SIGNAL_URL="http://localhost:$port" npm run dev &
app=$!
wait "$app" || true
