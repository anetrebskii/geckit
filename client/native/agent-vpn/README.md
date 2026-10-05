# AmneziaWG packet transport

This helper implements the encrypted transport, not native agent capture or a working GeckIt connection. It is not wired to agent admission. Do not treat transport readiness as connection verification or tool protection.

Pinned backend: github.com/amnezia-vpn/amneziawg-go/v3 v3.1.20260828, MIT. Go 1.25 or newer is required. Dependencies and checksums are in go.mod/go.sum; no modified upstream sources are vendored.

Build from client with `bash scripts/agent-vpn.sh`. Set GECKIT_GO to a Go executable when it is not on PATH. GOOS/GOARCH select cross-compilation. Outputs go to ignored vpn/bin/<os>-<arch>/geckit-agent-vpn[.exe]. The helper is not yet included in a released app.

Run `go test -race -count=1 -timeout=90s ./...` in this directory. Tests use generated keys and local UDP peers, with userspace client/server networks. They exercise AmneziaWG 1/2/3 peers (including header protection), TCP transfer, UDP, IPv6, tunneled DNS, gateway-down refusal, a fresh transport reconnect, wrong server keys, malformed/closed pipes, startup cancellation and sanitized configuration failure. No system routes or imported private profiles are used. These tests do not prove native process isolation, PC VPN independence or a live self-hosted server.

Build `./cmd/qualification-peer` and select its executable with `GECKIT_QUALIFICATION_PEER` to include the same generated peer used by the installed macOS harness. This regression checks the first UDP packet before any TCP retransmission, followed by short and long DNS names. The pinned backend starts its TUN reader before configuring transport padding. Both adapters wait for configuration and return an empty first read so the backend reloads its padding offset before consuming a packet. This preserves the imported padding settings. The first-packet regression passed ten consecutive runs with nonzero S4; cancellation while waiting for configuration is also covered.

## Inherited pipe protocol

The process accepts no command arguments or environment-based configuration. A host-owned adapter launches it with private stdin/stdout/stderr pipes. Stdin begins with a 4-byte big-endian length and a UTF-8 native single-server AmneziaWG configuration, maximum 64 KiB. The configuration is not an argument, temporary file or log. Unsupported fields, scripts, duplicate fields, malformed keys and multiple peers are rejected. The parent must also run the app's full configuration validator before passing a profile.

After the configuration frame, stdin carries IP packets, each prefixed by its 4-byte big-endian length. Stdout carries decrypted IP packets with the same framing. Packet length cannot exceed the configured MTU; IPv4 and IPv6 lengths are validated. EOF, a broken output pipe or invalid framing closes the transport. There is no proxy listener, global interface, route change, DNS setting change or control socket. Address/DNS values are validated but installed by the future trusted capture/guest adapter, not this process.

Stderr carries only JSON lines with one state: transport_ready, invalid_configuration, transport_failed, packet_stream_closed, transport_stopped or invalid_arguments. It contains no backend errors, UAPI, addresses or keys. transport_ready means the encrypted device is configured and its UDP socket is open, before any handshake or connectivity proof. A wrong key can still reach transport_ready. The app must not label that state Connected or release required admission.

SIGINT/SIGTERM closes startup and active pipes. Reconnect is a fresh helper with fresh pipes and the selected profile; a future enforcement adapter must remain blocked throughout replacement and verify peer traffic before admission. Separate captures/launch ownership, DNS, shared daemon/browser/tmux handling, remote enforcement, secret isolation and crash-safe blocking are still required.
