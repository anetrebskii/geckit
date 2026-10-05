# Local VPN test results - 2026-10-05

Work paused at Alex's request. The current consolidated findings, revision history, update-capture regression, DNS results and cleanup state are in [findings-and-handoff.md](findings-and-handoff.md). Initial results below remain historical evidence; they do not establish a working GeckIt VPN.

Requested by Alex before Apple capability registration. All tests below passed on this Apple Silicon Mac. This verifies the packet transport, offline native configuration and application admission boundary. It does not establish installed macOS process capture or a network-level kill switch.

| Check | Result | Scope |
| --- | --- | --- |
| AmneziaWG transport race suite | Passed, 37.249 seconds | Generated AWG1/2/3 peers, TCP transfer, UDP, IPv4/IPv6, tunneled DNS, gateway loss, fresh helper restart, wrong-key refusal, malformed/closed packet pipes, startup cancellation and secret-free failure messages |
| Native Swift checks | Passed | Dual-stack route and DNS settings, invalid metadata rejection, bounded framing, oversized/truncated frame rejection |
| Provisioning/bundle checks | 4 tests passed | Team, App ID, macOS platform, expiry and required capability validation; unsigned bundle metadata |
| GeckIt admission and phone boundary | 11 tests passed | Required VPN denies agent dispatch, preserves queued work and enforces the phone bridge boundary |
| Native qualification build | Passed | Host, packet-tunnel extension, runner and transport compile with Swift warnings treated as errors; ad-hoc deep/strict bundle signature verification |

The transport suite used generated keys and local UDP peers, with userspace client/server networks. It needed test-socket access outside the filesystem sandbox. Cached Go dependencies were used with GOPROXY=off and GOSUMDB=off. No imported VPN credentials, paid AI request, Apple capability registration, extension activation, saved VPN preference or system-route change was involved. The qualification bundle remains under client/vpn/qualification/darwin-arm64 and was not installed.

## Commands

From client/native/agent-vpn, with the cached Go 1.26.4 toolchain and temporary module/build caches:

```sh
go test -race -count=1 -timeout=90s -v ./...
```

From client:

```sh
python3 -m unittest discover -s native/macos-vpn -p 'test_*.py' -v
xcrun swiftc -swift-version 5 -warnings-as-errors -module-cache-path /private/tmp/geckit-vpn-local-swift-cache -parse-as-library native/macos-vpn/Profile.swift native/macos-vpn/Tests.swift -framework NetworkExtension -o /private/tmp/geckit-vpn-local-native-tests
/private/tmp/geckit-vpn-local-native-tests
./node_modules/.bin/vitest run test/vpn-admission.test.ts test/phone-vpn.test.ts
bash scripts/macos-vpn.sh unsigned
```

The local Go executable used was /Users/alex/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.4.darwin-arm64/bin/go, also supplied through GECKIT_GO for the bundle build. Cache locations were /private/tmp/geckit-amnezia-research/build-cache and /private/tmp/geckit-amnezia-research/modules; GOTOOLCHAIN=local prevented toolchain downloads.

## Remaining local macOS test

The next stage is still local: install a correctly provisioned signed qualification extension on this Mac, approve its macOS activation, and use generated test peers to observe actual runner/descendant traffic and failure isolation. No publication or release is needed for that stage. Local execution still needs the restricted Network Extension and system-extension signing capabilities; an ad-hoc signature does not grant them.

Follow the installed-qualification matrix in [the native README](../../client/native/macos-vpn/README.md#installed-qualification), including DNS, ICMP, IPv6, detached descendants, dedicated tmux/browser/daemon ownership, existing sockets, crashes, reconnect, server switch and simultaneous computer VPN changes. A working encrypted transport or an OS Connected status cannot substitute for those checks. The earlier capability approval was subsequently completed; see the installed results below. Native T031/T032 remain pending.

## Installed native results after provisioning - 2026-10-05

| Check | Result | Practical limit |
| --- | --- | --- |
| Developer ID profiles/signature | Passed | Host/tunnel profiles validated and embedded; no signing private key or VPN key is in source |
| Apple notarization, stapling, Gatekeeper | Passed for versions 5 and 7-14 | Version 14 is installed; later user authorization resolved the previous upload rejection |
| System-extension activation | Activated/enabled, with macOS approval | OS permission UI could not be visually reviewed because Computer Use for System Settings was not approved |
| Native per-app startup | OS Connected | Status alone cannot admit agents |
| LaunchServices runner, IPv4 TCP/UDP | Passed | Generated userspace peer only |
| LaunchServices runner, IPv6 TCP/UDP | Passed with generated /120 prefix | /128 failed with EHOSTUNREACH; the correction is installed, but updated executable identities lost capture at the original runner path |
| ICMP tools, IPv4/IPv6 | Passed | Bounded ping/ping6 under LaunchServices runner with generated /120; ordinary/direct-executable controls did not reach peer |
| Unconnected UDP echo | Passed | DNS is a separate failing case |
| Direct execution of runner | Uncovered | Cannot be used as the protected launch path |
| Ordinary-process control | Did not reach any generated-peer endpoint | Does not qualify all unrelated applications or original internet connectivity |
| Direct DNS and system resolver | Failed | Scoped resolver present; peer observed no decrypted DNS packet; changed test resolver address did not resolve the gap |
| C-linked native transport checks | Passed | Invalid framing rejection and startup cancellation, not installed crash isolation |
| Go race suite | Passed, 25.397 seconds | Includes the exact generated qualification peer selected through GECKIT_QUALIFICATION_PEER |
| Intel native C-archive bundle | Built, ad-hoc signature verified | Intel hardware execution and installed routing untested |
| Local IPv4 TCP/UDP failure matrix | Passed | Runner, detached child and fresh private tmux server stayed blocked through gateway loss and explicit VPN disconnect; an open tunnel TCP socket stopped passing data and ordinary direct canaries remained available |
| Complete kill switch, browser/daemon ownership, secrets | Unverified | Provider crashes, other failure cases/protocols, live server switching and secret boundary remain mandatory before integration |

`qualify.py` stops the test tunnel on completion or failure. Keys remain ephemeral in peer/controller memory. Tests used no imported profile, paid provider, production agent, route command or global DNS change. Old terminated extension versions waiting for uninstall on reboot were left under macOS management. The running GeckIt app and unrelated work in the shared checkout were preserved.

## Startup race and continued native investigation

The exact qualification peer initially lost its first UDP packet with nonzero S4, while a TCP-first test passed through retransmission. A generated S4=0 control passed. The pinned backend caches transport padding before its first blocking TUN read, which can start before IpcSet configures padding. Both adapters now wait for configuration and return an empty read to force the backend to refresh its offset before consuming the first packet. Imported padding values are preserved. Ten nonzero-S4 first-UDP and short/long-DNS runs passed. The configuration-wait cancellation check passed 20 race-enabled runs (1.623 seconds); linked native framing/cancellation checks also passed.

Installed version 5 with the corrected generated peer still failed DNS. The same DNS query succeeds as an echo on UDP port 8092, while both valid DNS and arbitrary bytes sent to port 53 were absent at the decrypted peer boundary. The outgoing socket selected the generated tunnel source address. Registered DNS-proxy lookup returned no entries, and the bounded process-name check found no selected DNS-filter processes. These observations narrow the failure but do not establish its native routing cause.

`qualify_failures.py` now automates the local IPv4 matrix with a directly reachable canary bound to this Mac's existing address and ephemeral TCP/UDP ports. The runner, detached child and dedicated tmux server reached only the generated tunnel peer while connected. After generated gateway loss and explicit tunnel disconnect, new direct TCP/UDP attempts remained blocked, an existing direct UDP socket remained blocked, and a tunnel TCP socket established before failure stopped passing data. Ordinary TCP/UDP controls passed throughout. The final run passed after TCP reply framing and cleanup were strengthened. This is bounded local evidence, not every internet/failure/protocol case or production plugin integration.

Version 7 builds/signs on ARM64 and passes deep/strict verification outside the tool sandbox. The sandboxed verifier reported an invalid signature; the unrestricted read-only verifier confirmed the unchanged bundle valid on disk and satisfying its designated requirement. The updated Intel bundle also builds and verifies ad-hoc; execution on Intel hardware remains untested. Version 7 adds fixed IPv4 DNS packet totals with no payload/name/address/key logging. Its local archive is prepared at `/private/tmp/geckit-vpn-version7-notary.zip`, 1689833 bytes, SHA256 `14ccf6d27e731690e59276b648a995d9e1ef20e4f5bddf40339772bc744889da`. That was the earlier prepared-artifact checkpoint. Alex subsequently authorized upload/install; versions 7-14 were accepted, stapled and activated. No Apple upload approval remains pending. See the handoff for the later native results.

An optional bounded root capture is prepared in `client/scripts/capture-vpn-dns.sh`. It selects only UDP port 53 at the generated private resolver and stops after 120 seconds. `sudo -n` required the user's Mac password, so the user was asked to run it in their own Terminal; no password was requested in chat and no capture occurred. That was the earlier capture checkpoint. Later actual macOS administrator authorization allowed a bounded capture: the first attempt returned no usable evidence after a timeout, and a corrected pktap,all capture returned no packets matching the synthetic resolver filter. This does not exclude DNS sent to a different resolver. Final pause cleanup verified native status 1 (disconnected) and no owned test actors. GeckIt Connect/Reconnect stay unavailable until DNS and the remaining native qualification/integration pass.
