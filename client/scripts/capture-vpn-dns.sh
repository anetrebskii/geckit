#!/usr/bin/env bash
set -euo pipefail
umask 077

capture_log="$(mktemp /private/tmp/geckit-vpn-dns.XXXXXX)"
printf 'Capture log: %s\n' "$capture_log"
printf 'Reply when tcpdump says listening. Capture stops automatically after 120 seconds.\n'

sudo /usr/bin/python3 -I - > "$capture_log" <<'PY'
import subprocess

command = [
    '/usr/sbin/tcpdump', '-i', 'pktap', '-n', '-l', '-tt', '-vv', '-XX',
    '-s', '192', '-k', 'INPD',
    'udp and host 10.91.0.1 and port 53',
]
try:
    subprocess.run(command, check=True, timeout=120)
except subprocess.TimeoutExpired:
    print('qualification_capture_complete')
PY

printf 'Capture finished: %s\n' "$capture_log"
