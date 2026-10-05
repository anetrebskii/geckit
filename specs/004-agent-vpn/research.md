# Built-in agent VPN: initial investigation

Date: 2026-10-04. Alex selected Amnezia Self-hosted. These are findings and candidate approaches, not a selected implementation.

## Current launch paths

- `client/src/main/sessions/claude.ts` starts local Claude Code with `planOnly()` from `sessions/account.ts`. That environment removes off-plan credentials but currently inherits ordinary proxy variables.
- `client/src/main/sessions/codex-rpc.ts` starts Codex with `codexEnvironment()`, also based on `planOnly()`. `CodexRpc` can instead attach to `app-server-control.sock`; configuring a newly launched process would not cover that external process.
- Account, model, usage, correction, browser, and MCP helpers start processes separately. Changes to conversation launches alone cannot establish full provider-request coverage.
- `client/src/main/sessions/plugins.ts` exposes launch helpers to provider libraries. Libraries can also make independent requests; coverage must be declared and enforced instead of inferred.
- `client/src/renderer/src/ui/SettingsDialog.tsx` has General, Assistants, Libraries, Profiles, Hosts, Phrases, Correct and dictation, Phone, and Version sections. There is no built-in dedicated VPN/proxy section.
- `docs/features.md` accurately limits builtin SSH execution to Claude Code. Host network policy is separate from a local dedicated connection.

## Candidate approaches

### Imported Amnezia profile with a bundled tunnel engine

WireGuard's official Go implementation includes an in-process network stack. Its examples demonstrate HTTP clients over a userspace tunnel. This is a candidate for a bundled local gateway without changing computer-wide routes; feasibility, packaging, supported platforms, reconnect behavior, and strict provider coverage need a prototype before commitment.

Source: [WireGuard userspace HTTP client example](https://git.zx2c4.com/wireguard-go/tree/tun/netstack/examples/http_client.go).

Amnezia supports multiple connection protocols and export formats. Its general format guide lists `.vpn`, `.ovpn`, `.conf`, and `.json`. A generic WireGuard importer cannot establish compatibility with the person's Amnezia connection.

Source: [Amnezia supported configuration formats](https://docs.amnezia.org/documentation/supported-configuration-formats/).

For AmneziaWG specifically, the official instructions document `.conf` exports: Self-hosted uses Share, the AmneziaWG protocol, and AmneziaWG native format; Premium uses Configuration Files in its dashboard. Premium and Self-hosted instructions prohibit sharing one configuration across devices. GeckIt should obtain a dedicated tunnel identity rather than assume it can run a second client with an existing identity while the Amnezia app stays connected.

Source: [AmneziaWG configuration export instructions](https://docs.amnezia.org/documentation/instructions/use-amneziawg-app/).

Amnezia maintains its own MIT-licensed Go engine with a userspace network stack. The current source declares module `github.com/amnezia-vpn/amneziawg-go/v3` and includes protocol parameters that ordinary WireGuard does not understand. Import and engine compatibility must be checked against the exported version. A reported build problem in the older v1.0.4 userspace stack is evidence that source availability alone does not prove build feasibility; a build of the selected version is required.

Sources: [Official AmneziaWG engine](https://github.com/amnezia-vpn/amneziawg-go), [current module declaration](https://github.com/amnezia-vpn/amneziawg-go/blob/master/go.mod), [older userspace build report](https://github.com/amnezia-vpn/amneziawg-go/issues/156).

This checkout's PATH has no `go` command, but a cached Go 1.26.4 toolchain is available at `/Users/alex/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.4.darwin-arm64/bin/go`. Dependency downloads and build caches for the feasibility check are scoped to `/private/tmp/geckit-amnezia-research`; no global installation or real VPN credentials are required.

### Build feasibility result

Downloaded official module `github.com/amnezia-vpn/amneziawg-go/v3@v3.1.20260828` through the Go module service. Module checksum: `h1:D8d8gGvwXcTxUIsE4z6F6vjy4/VZddu95vMNtOygh1c=`.

`go build ./tun/netstack ./device ./conn` passed with Go 1.26.4 for `darwin/arm64`, `darwin/amd64`, `linux/amd64`, and `windows/amd64`. All module and build-cache writes were confined to the temporary research directory. The initial sandbox could not resolve the module service; the narrowly scoped public dependency downloads were approved and completed.

This establishes compilation of the candidate userspace engine packages only. No real Amnezia endpoint, exported profile, encrypted tunnel, assistant routing, drop/recovery behavior, packaged executable, or GeckIt UI was tested. The older v1.0.4 build report does not reproduce on this selected v3 version in these build checks.

### Configured dedicated proxy

GeckIt can expose connection settings and scope proxy configuration to supported assistant launches, subject to checking each client's actual HTTP, streaming, authentication, and WebSocket behavior. Merely adding proxy environment variables is not proof of fail-closed coverage. Child tools may inherit those variables, so provider-only coverage needs deliberate handling.

This supplies built-in proxy configuration, not an embedded VPN. The external proxy must supply the desired stable exit. It must not be substituted for a requested embedded VPN without settling the connection choice.

### All agent traffic

Commands, browsers, helper processes, and provider libraries can use independent network implementations. Routing all of them requires stronger process/network isolation than configuring a provider HTTP client. In particular, a userspace HTTP proxy alone does not enforce coverage of arbitrary direct sockets or UDP.

## Scope questions already sent

1. Provider, product, and protocol answered: Amnezia Self-hosted, AmneziaWG.
2. Traffic scope answered: everything, including commands and browsers. Agent-side VPN setup and proxy variables are excluded.
3. The literal request that an agent cannot discover VPN use cannot be guaranteed. Proposed interpretation: transparent ordinary networking, inaccessible keys and management, and no bypass by an unprivileged agent. Alex subsequently requested implementation; the practical transparent-routing interpretation is accepted for implementation.

## Native all-traffic enforcement investigation

Spec Kit planning calls for research agents. Two read-only researchers checked native enforcement and isolation alternatives; neither changed code. Findings were checked against Apple's downloadable documentation, retained in `/private/tmp/geckit-amnezia-research/apple-docs`.

### macOS

A userspace AmneziaWG engine can be one transport component, but does not capture arbitrary agent sockets. A native Network Extension is a candidate enforcement component. Apple's transparent proxy documentation states that declining a flow allows direct communication and that DNS settings supplied by the provider are ignored. System name resolution remains in use. Therefore a transparent proxy alone is insufficient for the selected requirements.

Source: [NETransparentProxyProvider](https://developer.apple.com/documentation/networkextension/netransparentproxyprovider).

Per-app packet routing could provide a stronger boundary. However, Apple's routing guide describes macOS app rules for MDM-managed applications, while its deployment table does not repeat a macOS managed-device restriction. Consumer deployment eligibility must be established with a native prototype; neither categorical support nor categorical impossibility has been established. App/helper rules do not prove ownership of existing shared browsers or externally running Codex processes.

Sources: [Routing VPN network traffic](https://developer.apple.com/documentation/networkextension/routing-your-vpn-network-traffic), [provider deployment](https://developer.apple.com/documentation/technotes/tn3134-network-extension-provider-deployment), [helper matching](https://developer.apple.com/documentation/networkextension/neapprule/3516852-matchtools).

Directly distributed macOS providers use system extensions with appropriate signing, provisioning, and OS approval. The repository's present Electron entitlements contain no Network Extension capability. Outside the sandbox, the local keychain exposes a Developer ID Application identity, so missing signing identity is NOT an established blocker. The sandbox-only identity query returned zero identities and was insufficient evidence. No provisioning profile, new App ID, entitlement activation, installed extension, or native packet-routing behavior was verified or changed.

Source: [provider deployment](https://developer.apple.com/documentation/technotes/tn3134-network-extension-provider-deployment).

### Linux and Windows

Linux network namespaces can isolate a process tree with a VPN-only network interface and separate resolver configuration. A privileged setup service must retain transport outside the agent's control, while descendants inherit the restricted network environment. Windows WFP connection redirection and filtering require a native service/driver approach with equivalent descendant, resolver, UDP, and failure proof. Ordinary environment variables do not supply either guarantee.

Sources: [WireGuard network namespace architecture](https://www.wireguard.com/netns/), [Microsoft WFP redirection](https://learn.microsoft.com/en-us/windows-hardware/drivers/network/using-bind-or-connect-redirection), [Microsoft driver signing policy](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/kernel-mode-code-signing-policy--windows-vista-and-later-).

### Architecture boundary

Intended direction is native enforcement plus a host-owned AmneziaWG transport. A VM could supply a clearer networking boundary but changes native tooling, login/keychain behavior, and execution location. It is not a silent fallback. No native architecture is implementation-ready until its capture and fail-closed gates pass. In particular, a proxy-only MVP or an ordinary second computer-wide VPN would not satisfy the agreed all-traffic independence requirement.

## Validation required before any claim of protection

- Capture outbound requests against controlled local test services; do not use live paid model requests for unit tests.
- Exercise startup before connection readiness, already-running Codex socket reuse, gateway loss mid-stream, gateway recovery, invalid secrets, proxy exclusions, IPv6, and name resolution.
- Exercise account, usage, models, correction, and sign-in/browser boundaries in addition to conversation turns.
- Verify local project and localhost access under the selected traffic scope.
- Review new UI states in Chrome in both themes and apply `docs/performance.md` before calling UI implementation done.

## Implementation-stage decision - 2026-10-04

Decision: implement profile configuration/selection separately; keep native Connect unavailable until qualification. Rationale: native API compilation proves availability, not enforcement. Alternative rejected: proxy environment, UID+PF or global tunnel misrepresented as isolated all-traffic networking. Apple's TN3165 says PF is not a supported distribution API; UID matching excludes non-TCP/UDP protocols. Current macOS allows unprivileged IPv4/IPv6 ICMP datagram sockets.

Current SDK probe /private/tmp/geckit-vpn-api-probe.swift compiles public per-app, filter and transparent-proxy APIs. No providerUnavailableBehavior API exists. defaultAction drop is unmatched-flow behavior, not a documented provider-crash guarantee. NENetworkRule has no process identity and any means TCP/UDP. Transparent-proxy DNS settings are ignored; NEDNSProxyManager enabling disables other DNS proxies. Per-app managed/unmanaged deployment and crash-safe DNS/descendant coverage still require signed installed runtime proof.

Primary sources: https://developer.apple.com/documentation/technotes/tn3165-packet-filter-is-not-api ; https://developer.apple.com/documentation/networkextension/nefiltersettings/defaultaction ; https://developer.apple.com/documentation/networkextension/neflowmetadata/filterflowidentifier ; https://developer.apple.com/documentation/networkextension/routing-your-vpn-network-traffic .

## Claude tmux plugin compatibility

User specifically requested compatibility assessment on 2026-10-04. Inspected official repository README.md and index.mjs (main blob bf41bfe657f15a6d8434da1e8ddb749fdf8c021f) through GitHub connector. https://github.com/anetrebskii/geckit-claude-tmux/blob/main/index.mjs

The plugin execFile launches tmux with no -L or -S socket selection. A random session name is insufficient to create a new protected tmux server: the default server may already be outside GeckIt's boundary. Claude starts as a child of that server rather than the client. All tmux operations need a dedicated server started inside protection; detached/persistent server descendants remain covered and external sessions are never assumed covered.

The plugin spreads host.claude, inheriting account, models, limits, saved state, correction and browsers; protecting just tmux would miss these. Its HTTP hook server listens on main-process 127.0.0.1 with per-session bearer authentication. An isolated runtime would require an explicit bounded control bridge; exposing generic host network access to make hooks work would defeat enforcement. Current configuration implementation supplies no runtime protection for this plugin.

## Signing and isolated-runtime availability check

Inspected capabilities only from 13 local provisioning profiles. GeckIt/iPhone profiles were found, none carrying Network Extension or system-extension install capabilities. A Developer ID Application signing identity exists; it does not replace entitlement provisioning. No profiles, App IDs, network routes or installed extensions were changed.

Docker Desktop is available and reports linux/aarch64. A private Linux runtime can support inherited all-traffic namespace enforcement but changes tool OS and requires an explicit decision. The choice was asked during implementation; no answer is recorded. No VM/container/runtime was created.

## Current native config compatibility

Official AWG native fields include current AWG3 header protection, timing/content padding ranges, booleans and CPS signatures. Importer preserves valid source text, supports known fields, rejects executable hooks and unknown/unsupported options. HeaderProtectionKey is canonical base64 of32bytes; H ranges uint32, documented J/S and timing ranges uint16. CPS tags b,t,r,rc,rd,d,ds,dz are supported; c is not. Peer AdvancedSecurity is rejected because selected Go backend does not implement its UAPI handler.

No Version field identifies the server's precise runtime. Display describes configuration-field compatibility rather than proving remote protocol version. Sources: https://docs.amnezia.org/documentation/amnezia-wg/ ; https://github.com/amnezia-vpn/amneziawg-tools/blob/master/src/config.c ; https://github.com/amnezia-vpn/amneziawg-go/blob/v3.1.20260828/device/obf.go .

## Required admission and reconnect prerequisites - 2026-10-04

Alex explicitly requires configured agents to stop until VPN is connected and wants real reconnect. The prior choice to leave ordinary agent networking enabled after import is superseded. Application admission can deny new local provider operations and stop owned drivers immediately while native routing remains unavailable. It cannot establish a packet-level kill switch for detached/external processes or arbitrary provider-library code; those native requirements stay open.

Rechecked signing outside the filesystem sandbox: four valid identities, including a Developer ID Application identity, are available. A sandbox-only zero-identity result is not evidence of missing signing. Decoded only capability flags from 13 installed provisioning profiles: zero include Network Extension or system-extension installation. No profile contents, device identifiers or private keys were printed. No networking, signing/profile registration or extension installation was changed.

Native macOS connect/reconnect requires a provisioned signed component and installed enforcement proof, rather than a UI refresh action. The native-versus-isolated-Linux execution choice was requested again as an optional clarification while independent admission work proceeds. Default remains native macOS; no Linux substitution or manufactured connection state.

## Encrypted transport progress - 2026-10-04

Implemented client/native/agent-vpn with pinned official AmneziaWG v3.1.20260828 and checksummed Go modules. It accepts a bounded native configuration through inherited pipes and exchanges framed raw IPv4/IPv6 packets. No arguments, proxy listener, agent environment, global interface or system route is used. Backend logging is disabled; stderr contains fixed non-secret states. Transport readiness precedes handshakes and cannot release required admission.

Final Go race tests passed in 28.400 s: generated AmneziaWG 1/2/3 peers, AWG3 header protection/content padding, TCP transfer, UDP/IPv6, tunneled DNS, gateway-down refusal, fresh transport restart, wrong-key refusal, packet/output pipe failures, startup cancellation and sanitized configuration errors. Tests use local UDP transport plus userspace networks; imported credentials and paid providers were not accessed. The first sandbox run could not bind UDP; the approved test-socket run passed.

Builds passed for darwin/arm64, darwin/amd64, linux/arm64, linux/amd64 and windows/amd64. go vet, go mod verify, shell syntax and diff checks passed. Build outputs are ignored. The source/build script are not yet integrated into packaged GeckIt.

This completes the transport subtask only. Native process capture, continuous OS isolation, protected launch ownership, plugin/shared-socket handling, remote enforcement, Connect/Reconnect/switch integration and live imported-server verification remain unfinished. No Connected UI or admission release was added. The native macOS decision was subsequently settled below. The existing required guard therefore still blocks configured agent work; this progress does not make the app VPN work.

## Native macOS implementation decision - 2026-10-04

Alex explicitly selected native macOS. The private Linux execution question is settled; do not create or use a VM as a fallback. Preserve native tool OS and existing project paths.

Build a native qualification host, packet-tunnel system extension and dedicated agent runner. Use NETunnelProviderManager.forPerAppVPN with a designated-requirement rule matching the signed runner; matchTools=nil is documented in the SDK to include its spawned helper tools. Keep excluded domains empty. The tunnel consumes packetFlow and the pinned AmneziaWG transport through private inherited pipes; never install a global default route as a substitute. Resolve and test provisioned direct-distribution signing and installed per-app eligibility, DNS/IPv6, helper ownership and disconnected/provider-crash behavior before connecting real agents or releasing admission. Qualification is not a user-visible Connected state.

A dedicated local test host is necessary to establish OS behavior without modifying the running GeckIt app or using imported credentials. Compile and prepare the complete reviewable test bundle first. Developer account provisioning and native extension activation require their actual capability/OS permissions; report a concrete rejection or absent capability rather than claiming a compile test proves routing.

## Native bundle evidence and provisioning gate - 2026-10-04

Implemented native/macos-vpn with a qualification controller, packet-tunnel system extension, signed-runner app rule, private framed-pipe bridge and reproducible bundle script. ARM64 and Intel macOS builds compile with Swift warnings treated as errors and pass ad-hoc deep/strict signature verification. Native route/DNS and truncated/oversized-frame checks pass. Four Python tests cover provisioning team/App ID/platform/expiry/capability refusal and unsigned bundle metadata. No imported VPN secrets, paid providers, system routes or running GeckIt processes were touched.

The bridge serializes launch versus stop, has a ten-second startup deadline, terminates its own helper before closing blocking read pipes, and schedules a bounded forced stop. Provider generations prevent stale start/settings callbacks from starting packet pumps after stop or a later start. These source and offline checks do not establish OS failure isolation.

Restricted-entitlement ad-hoc host execution was killed by macOS with exit 137 before a status message. No native extension activation, per-app preference change or routing qualification was attempted with that unsigned build. Direct distribution needs matching Developer ID profiles; [Apple's Network Extension entitlement documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension) specifies enabling the capability and selecting its provisioning profile and certificate.

Apple Developer is signed in on team MQKD7Z7V2L. The two proposed App IDs do not exist in its visible identifier list. Automatic approval review rejected selecting Network Extensions/System Extension in the registration form because specific capability authorization was absent. Requested approval for org.anetrebskii.GeckIt.VPNQualification (Network Extensions + System Extension) and org.anetrebskii.GeckIt.AgentVPN.Tunnel (Network Extensions), then their Developer ID profiles. No capability was enabled. The registration tab remains available for handoff. Native installation has its separate actual OS approval and installed routing/crash qualification still blocks GeckIt integration.

## Local test rerun - 2026-10-05

At Alex's explicit request to test locally first, reran the generated-peer AmneziaWG race suite, native Swift route/DNS/framing checks, four provisioning/bundle tests, 11 app admission/phone tests and the unsigned ARM64 qualification build. All passed. [Results and remaining installed-local stage](local-tests.md). No Apple capabilities or VPN preferences were changed and no extension was installed. Actual per-app traffic capture and crash-safe internet blocking still require the pending provisioning approval and installed qualification; local testing does not imply release or publication.

## Account inspection authorization and browser gate - 2026-10-05

Alex asked why an Apple Developer option cannot be selected. The account page redirected to Apple's authentication origin, and automatic review denied access because authentication inspection was not specifically authorized. Alex then explicitly approved read-only access to Apple sign-in and the existing Developer account with "Do it". The subsequent attempt was still rejected: automatic review treated access to the same previously blocked authentication-protected destination as a prohibited retry. This is an automation gate, not evidence that Apple disabled any capability or that Alex withheld account-inspection permission. Do not ask again for the already-granted read-only authorization or bypass the browser rejection. Use a user-supplied screenshot or exact form error to diagnose the option safely. Registration, capability changes, provisioning and native installation remain separate pending steps; no account settings were changed.

## Downloaded provisioning and signed local bundle - 2026-10-05

Alex completed App ID registration and Developer ID profile creation manually, then requested validation of the Downloads files and backup to Bitwarden. `GeckIt_VPN_Host.provisionprofile` and `GeckIt_VPN_Tunnel.provisionprofile` pass the bundle validator: selected team, exact host/tunnel IDs, macOS platform, unexpired profiles, `packet-tunnel-provider-systemextension`, and host system-extension installation entitlement. Both are Developer ID profiles and authorize the existing local Developer ID Application identity. Their expiry dates are 2044-09-30.

Built the ARM64 qualification bundle with these profiles and the existing Developer ID identity. Both embedded profiles match the downloaded files byte for byte. Host and tunnel signatures have the expected team, Developer ID authority and signing timestamp; deep/strict bundle verification passes. Output: `client/vpn/qualification/darwin-arm64/GeckIt VPN Qualification.app`. No extension was installed or activated, no VPN preference was created, and no routing was changed. Provisioning is now available; installed per-app routing and failure isolation remain unproved, and GeckIt Connect/Reconnect remain unavailable.

Bitwarden backup is pending: the local CLI reports a locked vault, and Computer Use access to the desktop app is not enabled. Requested local unlock and enabling Bitwarden in Computer Use. No vault item or attachment was created, and no password or session key was requested in chat. The downloaded profiles remain in Downloads; no profile contents or signing private keys were added to repository source.

## Fatal Codex network-permission diagnosis - 2026-10-05

Alex reported all GeckIt chats displaying `Fatal error: application network permission was revoked`. Exact-string search found no GeckIt source or test definition of this error. It is present in the local standalone Codex 0.159.3 executable among application-network-policy errors. The VPN admission guard instead throws `Agents are blocked until VPN connects. The native VPN component is not installed.` An unrestricted `systemextensionsctl list` check shows no GeckIt VPN extension installed. Saved VPN storage exists for geckit-local, not the installed geckit data directory; contents were not read.

Read-only process measurements found the managed Codex 0.160.0 shared daemon, PID 44452, with 248 numeric descriptors, 105 pipes and highest descriptor 255. `launchctl limit maxfiles` reports a soft launch limit of 256; the daemon's own process limit was not directly measured. The GeckIt-local owned Codex child, PID 11125, has 32 numeric descriptors and highest descriptor 36. Two diagnostic shell launches actually failed with `Too many open files (os error 24)` earlier in this investigation. These measurements strongly support descriptor pressure in the shared runtime, but do not establish which requirement/policy read caused each historical fatal or rule out integration contributions to resource retention.

[Upstream issue #48543](https://github.com/openai/codex/issues/48543) reports the same fatal plus EMFILE on macOS and describes policy-load failures revoking shared permits. Treat the report and local correlation as a likely diagnosis, not a causal proof. No matching exact fatal was found in the examined GeckIt or October 5 desktop log files.

The CLI exposes `codex app-server daemon restart`. Restarting this shared runtime can interrupt Codex chats beyond GeckIt, so it remains pending scoped authorization. No network-policy bypass, firewall change, configuration removal, provider restart or application restart was performed during diagnosis. The separate configured-VPN admission requirement remains in effect.

Alex subsequently explicitly approved the shared-daemon restart. Invoked the supported restart command and revalidated its state after the tool handle disappeared: the old daemon PID 44452 and restart process were gone, and a new managed 0.160.0 daemon, PID 2244, was running. Its numeric descriptor count was 164, with 59 pipes and highest descriptor 203, down from 248/105/255. Other active clients can repopulate resources; this is recovery evidence, not proof that the upstream lifetime problem is fixed.

A short-lived client using GeckIt's WebSocket transport completed `initialize`, `initialized` and `account/read` with `refreshToken=false`; the account was signed in. The socket was closed afterward. No prompt, turn or new conversation was submitted, credentials were not refreshed, and no account contents were logged. This verifies local RPC recovery; an actual model turn after restart remains unverified. VPN admission and system networking were preserved. GeckIt itself was not restarted during this recovery.

## Approved native installation and notarization gate - 2026-10-05

Alex approved installing/activating the prepared signed qualification component and creating its test per-app VPN preference. Copied the provisioned ARM64 bundle into `/Applications/GeckIt VPN Qualification.app`; source and installed deep/strict code signature verification passed. Extension activation returned `activation_failed`, code 8 (`OSSystemExtensionErrorCodeSignatureInvalid`), before user approval. The 15:11:22 local sysextd validation log reports `Error checking with notarization daemon: 3`, followed by requirement failure -67050 and extension validation failure. Gatekeeper independently rejects the installed host with `source=Unnotarized Developer ID`. This is an observed notarization blocker, not an absent provisioning profile or a user-denied OS approval. No signing-policy bypass was attempted.

The approved `configure` command subsequently returned `per_app_configuration_saved_unqualified`; `status` returned `native_status_unqualified`, code 1 (disconnected). macOS accepted saving this test per-app preference on the unmanaged Mac. That does not establish runtime routing eligibility, packet capture, descendant coverage or a kill switch. No start command, imported secret or production agent was used. The native extension remains inactive and GeckIt's runtime remains unavailable.

Prepared `client/scripts/notarize-macos-vpn.sh`: verify the provisioned bundle, create its upload archive, submit with an existing developer-owned notarytool Keychain profile, require Apple's Accepted status, staple/validate the ticket and require Gatekeeper acceptance. Shell syntax and missing-credential/missing-bundle refusal checks passed; no notarization submission occurred. Local notarization credential environment variables are unset; CI references Apple ID/app-specific password/team secrets but does not make them available locally. Requested the name of an existing local profile or private Terminal credential setup. Never request the password in chat or extract unrelated vault/keychain secrets.

[Apple's notarization documentation](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), fetched from its public documentation JSON, confirms Developer ID distribution, hardened runtime, secure timestamps, automated notarization and ticket stapling requirements. The installed notarytool help confirms missing credential options can prompt interactively and the app-specific password prompt is secure. Activation must be retried after accepted notarization; successful activation and installed routing/failure tests remain unverified.

Alex also requested automatic setup for ordinary users. Added FR-030, T035/T036 and [automatic setup/recovery UX handoff](automatic-setup-ux.md): build-time developer signing/provisioning/notarization, automatic component setup and same-server recovery, actual local OS approval, no direct fallback, and no end-user developer credentials. This is planned integration after qualification, not an implemented feature claim or a change to current UI.

## Installed notarized qualification and in-process engine - 2026-10-05

Alex configured and validated `geckit-vpn-notary` in Keychain. Versions 1 through 5 of the local qualification bundle were accepted by Apple's notarization service and stapled; final version 5 passed Gatekeeper and is activated/enabled on this Mac with the user's actual OS approval. The earlier notarization/profile gates are resolved for that installed build. GeckIt itself was not restarted or connected.

Activation exposed two packaging omissions: `NSSystemExtensionUsageDescription` is required, and the tunnel's Mach service must be prefixed by its App Group entitlement. Added the permission explanation and a team-prefixed macOS group to host/tunnel, following [Apple's entitlement documentation](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.application-groups). No extra Developer portal group registration was needed and no tunnel secret is written to the group container. Computer Use was not approved for System Settings, so the actual permission UI was handed to Alex; OS approval and successful activation were then observed through the native API. A visual review of that OS permission dialog was unavailable.

Installed system-extension staging made a secondary Go executable non-executable under both Resources and MacOS. Moving it was insufficient. Replaced the subprocess with a Go C archive linked into the single extension executable. Its four private pipes carry configuration/packets, sanitized status and cancellation. Engine-side duplicated descriptors are nonblocking before Go wraps them, allowing cancellation to interrupt reads. Native C-entry framing refusal and startup cancellation checks pass. macOS deployment flags are scoped to the C archive, avoiding SDK-26 object deployment mismatches with the 15.0 Swift target.

Generated-peer installed tests reached native status 3 (Connected). A LaunchServices-launched runner app passed IPv4 TCP and UDP. Direct execution of the signed runner executable did not capture the same child traffic; ordinary processes did not reach the generated peer either. Protected integration must use the application ownership boundary and still qualify descendants, detachment and shared services. The configured rule uses the runner signature/requirement/path with `matchTools=nil`; that metadata alone is not coverage proof.

IPv6 initially returned errno 65 (EHOSTUNREACH) with the `/128` interface prefix. A generated `/120` experiment passed IPv6 TCP/UDP without allowing ordinary processes to reach the peer. Native settings now cap only IPv6 interface prefixes above 120, preserving shorter prefixes. [WireGuard's settings generator](https://git.zx2c4.com/wireguard-apple/tree/WireGuard/WireGuardNetworkExtension/PacketTunnelSettingsGenerator.swift?id=e2b068af1a67a6d352138c2e397b347e13a84cc3) records a related Apple-stack workaround; this Mac's local experiment is the basis for the change. Installed version 5 used the generated /120 test profile; the source correction is in signed version 6, not yet activated.

Both connected and unconnected UDP echo passed. Direct UDP DNS to 10.91.0.1:53 and system getaddrinfo failed, with unique generated names to avoid negative-cache contamination. The OS installed a reachable resolver scoped to the test utun interface, but the test peer observed no DNS packet at its decrypted TUN boundary. Changing only the generated configured resolver to another private test address did not restore direct DNS to the peer. No other network system extension was activated and no VPN preference was Connected during the subsequent read-only conflict check. These observations narrow the gap but do not establish its macOS routing cause or rule out app-extension DNS interception. No global DNS or route setting was changed.

Read the current public JSON for [TN3134](https://developer.apple.com/documentation/technotes/tn3134-network-extension-provider-deployment): the macOS packet-tunnel system-extension row has no managed-device restriction, while the iOS per-app row does. Do not apply the historical iOS managed-environment restriction to this native Mac qualification. Neither that deployment table nor OS Connected proves DNS or crash-safe enforcement.

Version 6 builds/signs locally and verifies deeply/strictly. The Intel C-archive/Swift bundle also builds and verifies ad-hoc; execution on Intel hardware remains untested. Four provisioning/metadata checks, native profile/framing checks, linked engine cancellation checks and the Go race suite (25.362 seconds) pass. The generated qualification peer has no automated Go test of its own; its echo endpoints were exercised by installed probes.

Automatic approval review rejected uploading version 6 to Apple: it requires explicit authorization to send this private compiled bundle and its provisioning profiles to that external service. Requested authorization for this and future revisions in the same VPN work, with the artifact prepared and local signing checks complete. Do not bypass that rejection. The installed version 5 can still be used for approved local generated-profile diagnostics. DNS, failure blocking, dedicated daemon/browser/tmux ownership, remote coverage, protected secrets and GeckIt automatic setup/integration remain unfinished; Connect/Reconnect stay unavailable.

## Continued native qualification and startup correction - 2026-10-05

Found a separate reproducible first-packet bug in the pinned transport: its TUN reader caches S4 padding before blocking, while NewDevice starts that reader before IpcSet configures padding. The exact qualification peer lost its first UDP packet with S4=16; TCP-first hid the loss through retransmission, and an S4=0 generated control passed. Added configuration synchronization to the framed packet adapter and qualification-peer adapter. Their first read waits until configuration succeeds, then returns no packet so the backend reloads padding before consuming input. No upstream cache or imported Amnezia setting was modified. Ten first-UDP/short-and-long-DNS runs passed with original nonzero padding; the full race suite with the exact qualification peer passed in 25.397 seconds. Cancellation while waiting for configuration passed 20 race-enabled runs, and linked native startup cancellation still passes.

The installed version 5 plus corrected generated peer still loses port-53 traffic. The exact DNS payload echoes correctly on UDP port 8092; arbitrary non-DNS bytes sent to port 53 also never appear at the decrypted peer boundary. DNS sockets select the tunnel source address, but that is not delivery proof. Registered DNS-proxy metadata returned no entries and the bounded process-name conflict check returned no selected DNS-filter process. Native port routing remains unresolved; no global DNS/route change or fallback was added.

Bounded ping/ping6 tool probes passed through the LaunchServices runner for generated IPv4 and /120 IPv6; ordinary and directly executed controls did not reach the peer. Added `qualify_failures.py` with ordinary local TCP/UDP canaries bound to this Mac's existing address. Runner, detached child and a fresh tmux server on a private socket with `/dev/null` configuration passed while connected, through generated gateway loss and after explicit VPN disconnect. New direct TCP/UDP stayed blocked, an already-open direct UDP socket stayed blocked, and a previously established tunnel TCP socket stopped passing data. Ordinary controls remained available. This qualifies those local cases only; browser/Codex daemon ownership, provider crashes, broader protocols/failures, real-server switching and secret isolation remain open.

Source version 7 incorporates the tested IPv6 correction, transport synchronization and fixed IPv4 DNS packet counters. ARM64 Developer ID signing and unrestricted deep/strict verification pass; the sandboxed signature checker failed even though the same unchanged bundle verified outside that sandbox. Intel compilation/ad-hoc verification pass. Prepared `/private/tmp/geckit-vpn-version7-notary.zip` locally, without uploading it. Explicit Apple upload authorization remains pending after the earlier auto-review rejection. Counters can distinguish native capture from delivery after this corrected build is notarized and installed; version 5 is still installed.

Prepared a bounded generated-DNS capture command. Rootless capture is unavailable; `sudo -n` required a user password, so the user was asked to run `client/scripts/capture-vpn-dns.sh` in Terminal. It captures only UDP port 53 at 10.91.0.1 for 120 seconds; no password was requested in chat, no capture occurred and no BPF/group/system permission changed. Final native cleanup returned disconnected with no generated peer/failure actor left. Current GeckIt admission and unavailable Connect/Reconnect are preserved. Full VPN implementation remains incomplete.
