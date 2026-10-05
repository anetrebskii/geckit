# Native macOS VPN qualification

Alex selected native macOS execution. This bundle is a qualification tool, not the GeckIt VPN runtime. It does not change GeckIt's configured-work block, enable Connect or claim protection. No VM is used.

The host manages a per-app packet tunnel system extension. A signed `GeckIt Agent.app` runner is the app rule's owner, with `matchTools=nil` to include its spawned helper tools. The extension exchanges IP packets with the pinned AmneziaWG engine over private pipes. The Go engine is linked into the extension executable as a C archive; it is not a child process. No proxy configuration is added to an agent. Configuration travels in memory through the controller's framed stdin and the Network Extension start options; native VPN preferences contain only a qualification flag. No private profile is embedded in the bundle.

Installed system-extension staging strips executable permissions from every file except the extension's main executable, including a secondary binary under `Contents/MacOS`. Linking the engine into that executable avoids depending on a staged helper's execute bit. A dedicated control pipe cancels the engine; its duplicated descriptors are nonblocking so shutdown can interrupt reads. The extension includes the required `NSSystemExtensionUsageDescription`. Host and tunnel share a team-prefixed macOS App Group for the tunnel's Mach service; the agent runner is not a member. [Apple documents this macOS group format](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.application-groups) without additional portal registration. No tunnel secret is placed in its shared container.

The current qualification profile must contain numeric IPv4/IPv6 interface addresses, numeric DNS addresses and a numeric endpoint with a valid port. Dual-stack addresses are required for the controlled test. These restrictions are not a claim that all imported GeckIt configurations are supported. Run GeckIt's full validator before passing any real configuration; the Go helper independently rejects unsupported fields and hooks.

## Build and signing

From `client/`, `bash scripts/macos-vpn.sh unsigned` compiles the host, extension, runner and Go transport with warnings treated as errors. `GECKIT_GO` selects Go 1.25+; `GOARCH` selects `arm64` or `amd64`. The generated bundle and metadata are ignored under `vpn/qualification/`. An ad-hoc signature verifies bundle structure only. macOS may kill this build before its entry point because its restricted entitlements are not provisioned. It cannot be activated.

Direct distribution requires a Developer ID Application identity and matching macOS provisioning profiles. Register these App IDs on the selected Apple Developer team:

| App ID | Capabilities |
| --- | --- |
| `org.anetrebskii.GeckIt.VPNQualification` | Network Extensions, System Extension installation |
| `org.anetrebskii.GeckIt.AgentVPN.Tunnel` | Network Extensions |
| `org.anetrebskii.GeckIt.AgentVPN.Runner` | Ordinary signed runner; no VPN entitlement |

The host and tunnel profiles must authorize `packet-tunnel-provider-systemextension`; an iOS or app-extension-only profile is rejected. Set `GECKIT_VPN_TEAM`, `GECKIT_SIGNING_IDENTITY`, `GECKIT_VPN_HOST_PROFILE` and `GECKIT_VPN_TUNNEL_PROFILE`, then run `bash scripts/macos-vpn.sh signed`. The script checks profile team, exact App ID, macOS platform, expiry and capabilities before copying them. It signs the runner, extension and host, then verifies the bundle. The transport is part of the extension executable. Apple documents [Developer ID provisioning](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension) and [system extension installation](https://developer.apple.com/documentation/systemextensions/installing-system-extensions-and-drivers).

## Installed qualification

Developer ID signing alone is insufficient for installation. Before copying the signed bundle into `/Applications`, notarize and staple it:

```bash
GECKIT_NOTARY_PROFILE=geckit-vpn-notary bash scripts/notarize-macos-vpn.sh 'vpn/qualification/darwin-arm64/GeckIt VPN Qualification.app'
```

The profile is a developer-owned `notarytool` Keychain credential, not a VPN server configuration. Create it in your own Terminal with `xcrun notarytool store-credentials geckit-vpn-notary --team-id MQKD7Z7V2L`; missing credentials are prompted interactively, including a secure app-specific password prompt. Do not put passwords in command arguments or chat. The script requires Apple's Accepted result before stapling and Gatekeeper assessment. A valid code signature or accepted VPN preference does not substitute for notarization or installed routing tests. End users receive a signed, notarized component with GeckIt and do not perform developer provisioning or notarization.

Install only a correctly provisioned build in `/Applications`, with the user's actual macOS approval. Invoke `Contents/MacOS/GeckItVPNQualification` with one command: `activate`, `configure`, `start`, `status`, `stop` or `remove`. `configure` writes only this bundle's per-app VPN preference. `start` reads one length-prefixed native profile, then observes OS status. Messages explicitly say `unqualified`; OS Connected and `transport_ready` do not prove a handshake, traffic capture or protection. `remove` stops and removes this preference; it does not uninstall the system extension. `activate` refuses replacement; `activate-replacing` allows the approved update of this exact qualification extension.

Before integration, use generated local peers and packet observation to establish:

- Eligible per-app routing on an unmanaged Mac, without computer-wide capture.
- TCP, UDP, ICMP, IPv4, IPv6 and DNS from the runner and descendants reach only the selected peer; the same tools outside the runner retain ordinary networking.
- Startup disconnected, gateway loss, helper crash, provider crash, runner termination, reconnect and server switch never permit direct fallback, including already-open sockets and detached descendants.
- A dedicated tmux server/socket, browser instance and Codex daemon belong to the protected runner; existing external/shared processes cannot be reused.
- Computer VPN changes retain protection or block traffic. Remote/delegated execution requires equivalent enforcement on its execution computer.
- Management configuration and private keys remain inaccessible to agent-owned processes. The unsigned source and qualification bundle are not a demonstrated secret boundary.

Per-app routing alone is not established as a crash-safe kill switch. If any failure scenario permits direct traffic, additional native enforcement is required before agent admission. No production agent, imported key or paid AI request is needed for qualification.

`activate` refuses replacement. For an approved update of this same qualification extension, use `activate-replacing`; the controller still validates the bundle's provisioned signature and exact extension identifier, and macOS remains responsible for approval. Do not use this command to substitute a different extension or imply routing has passed.

For the first generated-peer installed smoke test, build `../agent-vpn/cmd/qualification-peer` using the transport module's pinned dependencies, then run `python3 native/macos-vpn/qualify.py /absolute/path/to/qualification-peer` from `client/`. The peer generates ephemeral keys and a private framed configuration, serves dual-stack TCP/UDP echoes and `tunnel.test` DNS in its userspace network, and exits on stdin closure or after ten minutes. The harness passes the profile in memory, compares an ordinary process, a directly executed signed runner and a LaunchServices-launched runner app, and stops the test tunnel on completion/failure. Only app launch has demonstrated capture; direct executable launch is not a protected launch path. DNS names are unique per probe to avoid negative-cache contamination. Connected and unconnected UDP, direct DNS packets and system resolution are checked separately. It uses no real profile, paid provider, global route command or production agent. A passing basic test is still not the complete failure/descendant/secret-boundary matrix above.

## Local checks

Run `python3 -m unittest discover -s native/macos-vpn -p 'test_*.py'` from `client/` for capability/profile rejection and bundle metadata checks. Compile `Profile.swift` and `Tests.swift` with `xcrun swiftc -swift-version 5 -warnings-as-errors -parse-as-library -framework NetworkExtension`, then execute the test binary for route/DNS and malformed-frame checks. These checks do not install an extension or prove macOS routing. AmneziaWG peer tests are documented in [the transport README](../agent-vpn/README.md).

## Installed results - 2026-10-05

Work is paused at Alex's request. See [the consolidated findings and handoff](../../../specs/004-agent-vpn/findings-and-handoff.md) for current version 14, the app-update capture regression, experiment commands and remaining blockers. The default nested-runner smoke path lost capture after executable changes; a byte-identical runner at a fresh path recovered IP capture. DNS remains failing.

Version 5 was accepted by Apple notarization, stapled, installed and activated with macOS approval. It reached OS Connected and passed IPv4 TCP/UDP from the LaunchServices-launched runner app. Separate bounded ping/ping6 probes passed ICMP for both families with a generated /120 IPv6 prefix. Ordinary processes and direct runner execution did not reach the generated peer. The installed test does not establish production coverage.

The original `/128` IPv6 setting produced `EHOSTUNREACH` (65). A generated-profile `/120` experiment passed IPv6 TCP/UDP while ordinary processes remained outside the tunnel. The native settings now cap interface prefixes at `/120`, preserving shorter prefixes. [WireGuard's native settings generator](https://git.zx2c4.com/wireguard-apple/tree/WireGuard/WireGuardNetworkExtension/PacketTunnelSettingsGenerator.swift?id=e2b068af1a67a6d352138c2e397b347e13a84cc3) documents this workaround for the Apple networking stack; the local macOS experiment provides the evidence for applying it here. Versions 7-14 were subsequently signed, notarized, stapled and activated with this fix, synchronized transport-padding startup and fixed IPv4 DNS packet counters. The earlier upload-approval blocker is resolved. Counters contain totals only, with no packet contents, names, addresses or keys.

Direct DNS to the configured resolver and system `getaddrinfo` still fail. The per-app resolver is present and scoped to the tunnel, but the generated peer has not observed those DNS packets. The exact DNS query succeeds as a UDP echo payload on port 8092; arbitrary bytes sent to port 53 also fail to reach the peer. This narrows the installed gap to DNS-port handling rather than that payload's size. The padding-startup correction passes generated transport DNS checks and was included in later installed revisions. Installed DNS still fails with zero provider DNS packet counts. Removing wildcard DNS matching in a separate version-14 control did not resolve the gap.

Run `python3 native/macos-vpn/qualify_failures.py /absolute/path/to/qualification-peer` from `client/` for the local IPv4 failure matrix. It starts synthetic actors under the signed runner, including a detached child and a fresh tmux server on a private socket with `/dev/null` configuration. A directly reachable canary uses this Mac's existing address and ephemeral ports; ordinary controls must continue reaching it. Generated gateway loss and explicit VPN disconnect are tested separately. No existing tmux server is reused. Results remain explicitly unqualified: these checks do not cover provider crashes, every network protocol, browser/Codex daemon ownership, server switching or a live imported server.

DNS routing, the complete failure matrix, dedicated browser/daemon ownership and the secret boundary remain unqualified. GeckIt Connect/Reconnect and automatic setup stay unavailable. No imported profile or production agent was used.

Apple's [deployment table](https://developer.apple.com/documentation/technotes/tn3134-network-extension-provider-deployment) permits a macOS system-extension packet tunnel without the managed-device restriction listed for iOS per-app mode. Local capture tests remain necessary; the deployment table is not a routing or kill-switch guarantee.
