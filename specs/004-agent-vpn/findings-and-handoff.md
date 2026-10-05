# Agent VPN findings and paused-work handoff

Paused at Alex's request on 2026-10-05. Branch: `feat/agent-vpn`. Base commit: `238a956c4856487c36f818a027e3b819ba419879`. Codex session: `01a105c5-a273-7463-a08c-67bcc475b166`.

**VPN routing is not ready for use in GeckIt.** Saved configurations and admission blocking exist, but Connect, Reconnect, live server switching and automatic installation remain unavailable. Do not enable them from an OS Connected status or these partial qualification results. No further implementation should run until Alex resumes the work.

The branch was created in the existing shared checkout. All existing edits and untracked files were retained, including unrelated provider, Codex, UI and Spec Kit work. At the pause, nothing had been committed or pushed. Alex subsequently requested publication to the remote feature branch. The published snapshot includes native qualification sources, scripts, design/specification artifacts and this handoff. The shared application integration is preserved in [an archival patch and manifest](snapshot/README.md), rather than activated as a partial integration. Shared-file patch sections contain interleaved provider edits as recovery context; unrelated files and provider dependencies remain local. Do not reset, clean, apply that patch to this dirty checkout, or commit the entire checkout indiscriminately.

Remote branch: [feat/agent-vpn](https://github.com/anetrebskii/geckit/tree/feat/agent-vpn). Publication preserves paused work; it does not resume implementation or make VPN routing available.

## Requested behavior

- A built-in, self-hosted AmneziaWG connection for agent and tool traffic, independent of changes to the computer's VPN.
- Saved server configurations, selection, connection, explicit same-server reconnect and server switching.
- No direct internet fallback when VPN is required but unavailable or disconnected, including already running work and existing sockets.
- Coverage for Claude/tmux plugins, Codex, tool descendants, detached/background processes, dedicated browsers and remote execution boundaries.
- Desktop bottom-bar status and an immediate settings/reconnect entry point; corresponding paired-phone status and controls.
- Clear configuration instructions and an SSH-style routing illustration. The rejected export/import setup demo was removed.
- End users should import a configuration and approve necessary macOS dialogs. Developer signing, provisioning and notarization belong to the publisher.

Alex selected native macOS execution. A VM fallback was not selected. Windows/Linux routing and native iPhone tunneling have not been implemented. The phone currently reports and controls the paired computer's state, rather than establishing its own VPN. Environment-transparent routing is possible; complete VPN undetectability is not established and must not be promised.

## Implemented working-tree support

The canonical approved feature descriptions are in [docs/features.md](../../docs/features.md), with evidence in [docs/feature-audit.md](../../docs/feature-audit.md). These are working-tree features, not a release claim.

- AmneziaWG configuration import, validation, naming, encrypted storage, selection and removal; offline checks do not establish a connection.
- Configured-VPN admission checks before agent/provider/correction dispatch, including phone requests and SSH handoffs. Queued messages are retained. Owned running work is stopped by the admission machinery when required protection becomes unavailable; this does not establish network isolation of every existing external process.
- Desktop footer/settings and mobile status/settings, with truthful unavailable/required states.
- Intended-routing illustration, separately labeled from actual connection status. It is not a packet observation or proof of a kill switch.
- Pinned userspace AmneziaWG transport, private framed configuration and packet streams, generated-peer qualification tests, native Swift host/runner/system-extension bundle and signing/notarization scripts.

Earlier UI work was reviewed in Chrome using GeckIt's components/tokens in light/dark themes and desktop/narrow/phone viewports, including focus, scrolling and motion checks. Desktop/mobile builds and relevant checks passed at those stages. Native UI, physical-phone execution and some hidden-tab timing remain unverified. No renderer/UI change was made during the final native investigation.

## Native architecture and source map

| Area | Location | Responsibility |
| --- | --- | --- |
| GeckIt VPN | `client/src/main/vpn/`, `client/src/shared/vpn.ts` | Configuration, status and admission boundary; native runtime remains unavailable |
| Desktop/phone UI | `client/src/renderer/src/ui/AgentVpn*.tsx`, `chat/PhoneAgentVpn.tsx` | Configuration instructions, status and intended-routing explanation |
| Transport | `client/native/agent-vpn/` | Pinned Go AWG backend and framed packet adapter |
| Generated peer | `client/native/agent-vpn/cmd/qualification-peer/` | Ephemeral keys, dual-stack echo endpoints and synthetic DNS |
| Native controller | `client/native/macos-vpn/Controller.swift` | Signing checks, activation, per-app preference, start/stop/status |
| Native provider | `Profile.swift`, `PacketTunnel.swift`, `PacketBridge.swift` | Route/DNS settings, lifecycle and packetFlow/C-linked transport |
| Protected runner | `Runner.swift` | LaunchServices application owner that spawns test descendants |
| Optional native probe | `DNSProbe.swift` | Network.framework UDP/DNS diagnostics and fixed state/error metadata |
| Qualification | `qualify.py`, `qualify_failures.py` | Capture controls and bounded IPv4 failure/descendant tests |
| Packaging | `client/scripts/macos-vpn.sh`, `notarize-macos-vpn.sh`, `native/macos-vpn/bundle.py` | Build, provisioning validation, signing, notarization and stapling |

The host uses `NETunnelProviderManager.forPerAppVPN()` and `.sourceApplication`. An `NEAppRule` uses the signed runner identifier/designated requirement, normally its executable path, and `matchTools=nil`. Included IPv4/IPv6 routes cover all destinations for the selected app; excluded routes/domains are empty. `includeAllNetworks=false`, `enforceRoutes=true`, `disconnectOnSleep=false`, and on-demand is disabled in the qualification controller.

The Go engine is linked as a C archive into the system extension. macOS staging removed execute permissions from secondary bundled executables, so a separate transport executable inside the extension was not a viable launch dependency. Configuration travels through framed controller stdin and Network Extension start options in memory. VPN preferences contain only the qualification flag, not a private profile. Private pipes carry configuration/IP packets/control. Fixed logs contain packet totals and test-port/message-size metadata, not keys, DNS names or payloads.

The host and tunnel share a team-prefixed macOS App Group for their Mach service; the runner is not a member. This arrangement alone is not proof that agent processes cannot obtain saved VPN secrets. The actual protected credential boundary remains open.

Qualification profiles currently require numeric endpoints/DNS, IPv4 and IPv6 interface addresses and MTU >= 1280. Those restrictions describe the controlled test and are not a claim that all user imports work.

## Signing, provisioning and installed state

- Developer ID team: `MQKD7Z7V2L`.
- Host: `org.anetrebskii.GeckIt.VPNQualification`.
- Tunnel: `org.anetrebskii.GeckIt.AgentVPN.Tunnel`.
- Original runner: `org.anetrebskii.GeckIt.AgentVPN.Runner`.
- Current experimental runner: `org.anetrebskii.GeckIt.AgentVPN.RunnerIdentityProbe`.
- Profiles: `/Users/alex/Downloads/GeckIt_VPN_Host.provisionprofile` and `/Users/alex/Downloads/GeckIt_VPN_Tunnel.provisionprofile`.
- Keychain notary profile: `geckit-vpn-notary`. Credentials were validated and stored by Alex. No password or signing private key was read into chat or written to source.
- Current signed/notarized/stapled installed bundle: `/Applications/GeckIt VPN Qualification.app`, version **14**. macOS activation succeeded. ARM64 source/build metadata is also version 14.
- A separate, byte-identical signed version-13 runner exists at `/Applications/GeckIt Agent Qualification.app` for the fresh-path experiment. It is not the GeckIt runtime.
- The last Intel diagnostic build was version **10**, ad-hoc verified. Later revisions were not rebuilt for Intel, and Intel hardware routing was never tested.

The earlier automatic approval rejection of an Apple upload is resolved: Alex subsequently authorized the described upload/install work. Versions 7 through 14 were submitted to Apple's notarization service, accepted, stapled, Gatekeeper-assessed and installed/activated during the investigation. The latest ignored `client/vpn/qualification/darwin-arm64/qualification-notary.json` reports `Accepted` for version 14. Developer provisioning is no longer the immediate blocker.

A verifier inside the tool sandbox once reported an invalid signature; unrestricted read-only `codesign --verify --deep --strict` accepted the unchanged bundle. Do not treat that sandbox result as proof of corrupted signing. Actual macOS activation/admin dialogs were used. SIP/Gatekeeper were not bypassed. Computer Use access to System Settings and Bitwarden had been rejected; those denials were not bypassed. The requested Bitwarden profile backup remains unverified/incomplete.

Old terminated extension revisions were left under macOS management, waiting for uninstall on reboot. No files in `/Library/SystemExtensions` were edited manually. Rollback copies and test harnesses exist under `/private/tmp/geckit-vpn-*`; temporary and ignored build files are not durable Git artifacts.

## Confirmed transport findings and fixes

### First-packet AWG padding race

The exact generated qualification peer initially lost its first UDP packet with nonzero S4. TCP-first tests hid the loss through retransmission; an S4=0 control passed. The pinned backend cached transport padding before its first blocking TUN read, which could start before `IpcSet` configured padding.

Both adapters now wait for configuration and return an empty read before consuming a packet, forcing the backend to refresh its offset. Imported padding is preserved. Ten first-UDP runs with nonzero S4 and short/long DNS names passed. The configuration-wait cancellation test passed 20 race-enabled runs in 1.623 seconds. C-linked invalid-frame/startup-cancellation checks also passed.

The pinned backend is `github.com/amnezia-vpn/amneziawg-go/v3@v3.1.20260828`. Cached Go 1.26.4 was used with `GOTOOLCHAIN=local`, `GOPROXY=off`, `GOSUMDB=off`. An earlier full race suite passed in 37.249 seconds; the later suite including the exact qualification peer passed in 25.397 seconds. These are transport checks, not installed OS isolation proof.

### Native IPv6 prefix

The generated IPv6 `/128` interface setting returned `EHOSTUNREACH` (65). A `/120` control passed IPv6 TCP/UDP and ICMP. Native settings now cap interface prefixes at `/120`, preserving shorter prefixes. This follows the documented [WireGuard Apple workaround](https://git.zx2c4.com/wireguard-apple/tree/WireGuard/WireGuardNetworkExtension/PacketTunnelSettingsGenerator.swift?id=e2b068af1a67a6d352138c2e397b347e13a84cc3) and local observed behavior.

## Installed packet and failure results

Tests used macOS **26.5.2 (25F84)** on this Apple Silicon Mac. All peers/keys were generated locally. No imported real VPN profile, paid provider turn or production agent was used. No global DNS or route command was applied, and GeckIt was not restarted.

| Check | Observed result | Limit |
| --- | --- | --- |
| LaunchServices runner, original executable | IPv4/IPv6 TCP, UDP, unconnected UDP and ICMP passed | Generated endpoints, not real provider/web traffic |
| Direct executable launch | Did not reach generated peer | It is not a protected launch path |
| Ordinary-process control | Did not reach generated peer | Not a complete unaffected-internet check |
| Raw UDP DNS to generated resolver | Failed while other captured IP probes passed | Genuine DNS gap in the captured-child tests |
| System `getaddrinfo` | Failed | No successful scoped system resolution established |
| Native app-owned NWConnection DNS | Failed | Its UDP control also failed after executable changes; these runs lacked valid capture and cannot independently prove native DNS-port failure |
| Runner/detached child/private tmux server | Passed local IPv4 TCP/UDP gateway-loss and disconnect checks in earlier installed runs | Dedicated fresh tmux socket, not production plugin integration |
| Existing sockets | Existing tunnel TCP stopped passing data after failure; existing direct UDP stayed blocked | Local IPv4 cases only |
| Ordinary direct TCP/UDP canaries | Passed throughout earlier failure matrix | Local existing-interface canaries, not all applications/internet paths |
| Provider crash, sleep/wake, PC VPN changes, complete recovery | Not qualified | Mandatory before claiming a full kill switch |
| Production browser/Codex daemon/remote enforcement/secrets | Not qualified | Mandatory before admitting actual agents |

The generated peer listens on `10.91.0.1` and `fd91::1`, with TCP 8091, UDP 8092 and IPv4 UDP DNS 53. It answers unique `*.tunnel.test` A/AAAA names, uses TTL 1 and exits on stdin closure or after ten minutes. It is a userspace network, not a real OS route or public DNS service.

The IPv4 failure harness uses an ordinary directly reachable canary on the Mac's existing interface and ephemeral ports. It compares the runner, a detached double-fork descendant and a fresh private tmux server through connected, generated-gateway-down and explicitly disconnected phases. The final earlier matrix passed after reply framing and cleanup were corrected. It does not test provider crashes, real gateway switching or shared external daemons.

## DNS investigation

1. With valid runner capture, both a proper DNS packet and arbitrary bytes to destination UDP 53 failed to reach the decrypted peer. The same DNS payload succeeded as a UDP echo on port 8092. The raw DNS socket selected the generated tunnel source address. This excludes that payload's size as a sufficient explanation.
2. The per-app scoped resolver was present. A registered DNS-proxy lookup returned no entries, and a bounded process-name check found no selected DNS-filter processes. These checks do not exclude every native filter or system policy.
3. Version 7 full smoke counters were `captured=18 delivered=15 dns_ipv4_captured=0 dns_ipv4_delivered=0`. The peer saw no decrypted DNS packet. DNS therefore did not enter the provider packetFlow in these runs; a Go DNS forwarding fix alone cannot repair that observed gap.
4. A root packet capture used actual macOS administrator authorization and a synthetic-only filter for UDP 53 at `10.91.0.1`. The first capture used `pktap`, which excludes loopback/tunnels by default, and ended with an unhandled timeout: no usable packet evidence was returned.
5. A corrected 40-second `pktap,all` capture returned no matching packets. That includes tunnel/loopback interfaces. It was still filtered to the generated resolver and does not establish that system queries could not leak to another resolver. No broad capture of other users' DNS traffic was performed.
6. Version 14 `start-default-dns` removed the wildcard `matchDomains=[""]` from the test tunnel's DNS settings. From the successfully captured relocated runner, TCP/UDP/ICMP still passed but raw/system DNS both failed. That variant did not solve the gap. Normal behavior still uses `[""]`.

The DNS routing cause remains unknown. Do not claim that a particular macOS bug, filter, VPN or provider restriction has been established.

## App-update capture regression

A second reproducible issue appeared while adding native diagnostics:

| Revision/control | Observation |
| --- | --- |
| 7, original Foundation-only runner | IP probes passed; DNS failed |
| 8-10, changed runner executable with native diagnostics | Native DNS failed; version 9 native UDP echo/DNS both reported `ready`, `sent`, `timeout`; Python-child IP probes also lost capture |
| Registration refresh | `lsregister -f` for only the runner did not restore capture |
| Fresh test VPN preference | Remove/recreate only the qualification preference did not restore capture |
| Identical atomic runner replacement | Did not restore capture |
| 10 identity-only app rule | Removing `matchPath` did not restore capture |
| 11, restored original runner executable UUID | IP probes recovered; DNS still failed |
| 12, Foundation-only code with a different Swift module/executable UUID | IP probes lost capture again; no Network.framework linkage was required to reproduce this |
| 13, fresh runner bundle identifier with the same failing executable UUID | Still no capture |
| 14, same signed version-13 runner bytes at a fresh application path | IPv4/IPv6 TCP, UDP, unconnected UDP and ICMP recovered; DNS still failed |

The kernel-reported running runner UUID matched its file UUID in the checked changed-executable run. The running runner path matched the intended installed path. Read-only responsibility diagnostics reported that the runner was responsible for itself and its child. Signatures remained valid, and the extension stayed activated/enabled. In failed-capture runs, provider totals were typically `captured=1 delivered=0` with zero DNS counts; do not equate OS Connected or NWConnection ready/sent with actual capture.

The fresh-path success with byte-identical code strongly indicates stale native app/path-to-executable mapping during replacement. The exact cache/OS mechanism and general recovery have not been established. Changing only the bundle identifier was insufficient. Do not blame Network.framework itself from the initial correlation.

A **versioned helper path** was proposed as the next controlled experiment, not implemented: package the runner under a new signed path per build/version, atomically install, update the exact app rule, and verify actual capture before admission. It still needs an update/reconnect/failure matrix and cannot be called a production fix from one fresh-path experiment.

## Current experimental code and reproducibility

Source/bundle metadata remains version 14. `Profile.swift` and `bundle.py` currently use the experimental `RunnerIdentityProbe` identifier. `macos-vpn.sh` uses Swift module `GeckItAgentRunner` for the ordinary runner; `GECKIT_VPN_NATIVE_PROBE=1` instead compiles the optional Network.framework diagnostic and its `--qualify-udp`/`--qualify-dns` commands. Those probes write bounded boolean/state/numeric-error results to private test files.

The qualification controller has extra experiment commands:

- `configure`: normal nested runner path.
- `configure-identity`: same signed identity without the path constraint; failed to repair capture.
- `configure-relocated`: exact `/Applications/GeckIt Agent Qualification.app/Contents/MacOS/GeckItAgent` path; demonstrated recovered IP capture.
- `start-default-dns`: same framed generated profile, with `matchDomains=nil` only for this test; DNS still failed.

These are qualification controls, not product connection APIs. The canonical `qualify.py` still defaults to the nested runner path, which failed for the updated executable in the observed installation. Its default failure is expected until that issue is addressed; do not change expected test values to hide it.

To reproduce the relocated full smoke when work is explicitly resumed, adapt the existing harness without logging the generated profile. From `client/`:

```python
from pathlib import Path
import sys
sys.path.insert(0, "native/macos-vpn")
import qualify

qualify.RUNNER_APP = Path("/Applications/GeckIt Agent Qualification.app")
qualify.RUNNER = qualify.RUNNER_APP / "Contents/MacOS/GeckItAgent"
original_command = qualify.command

def command(name):
    return original_command("configure-relocated" if name == "configure" else name)

qualify.command = command
qualify.main("/private/tmp/geckit-qualification-peer")
```

This full adaptation includes ordinary/direct-runner controls; the final fresh-path experiments themselves used the faster app-only adaptation. Neither is a full qualification pass. The existing harness stops the tunnel and peer in `finally` after failure. The final DNS control used a temporary adaptation that selected `start-default-dns` in place of `start`.

Temporary diagnostic files include `/private/tmp/geckit-vpn-dns-only.py`, `geckit-vpn-native-dns.py`, their identity/fresh-path/default-DNS variants and `/private/tmp/geckit-qualification-peer`. They may disappear and are not branch contents. Rebuild the peer from the pinned module before relying on an old executable.

Use the documented build/signing environment in [local-tests.md](local-tests.md) and [the native README](../../client/native/macos-vpn/README.md). Matching profiles, the existing Developer ID identity and Keychain notary profile are required. No private credential contents belong in a report or repository.

## Other investigation and unresolved integration

The reported Codex `Fatal error: application network permission was revoked` was investigated separately. A shared Codex daemon had about 248 descriptors near a soft launch limit of 256. After the user-approved daemon restart, the replacement had 164 descriptors and signed-in/read-only RPC health passed without a paid turn. This supported descriptor pressure as a hypothesis, not a proven explanation for every chat failure. GeckIt was not restarted. Do not conflate that symptom with the native DNS gap.

A process launched through the signed app can be scoped. Arbitrary plugin code in GeckIt's main process, an existing shared tmux server, an existing Codex control daemon and a separately controlled browser do not automatically become protected by configuration import. Each needs a dedicated protected ownership boundary and qualification. The production tmux plugin was not validated end to end. SSH execution runs on another machine; a local tunnel cannot by itself isolate that machine's internet access. Paired-phone status does not qualify remote-host or phone network enforcement.

Saving encrypted configuration with Electron `safeStorage` alone does not prove that an agent running as the same user cannot access credentials. A signed/privileged authenticated secret boundary, controlled access and actual negative tests remain mandatory.

## Outstanding work, in order if resumed

1. Resolve scoped DNS with packet observation and successful system resolution. Include unique-name leak controls and DNS over TCP where applicable; preserve unrelated computer DNS/VPN behavior.
2. Implement and qualify reliable app-update ownership, testing the proposed versioned runner path or another supported solution. Include stale installs, denied/revoked approvals and reconnect.
3. Complete capture/blocking for IPv4/IPv6, UDP/ICMP, existing sockets, detached descendants, provider crashes, startup/transport failures, sleep/wake, network changes, computer VPN changes and server switching. Verify unrelated traffic stays unaffected.
4. Establish the real credential boundary; qualify dedicated tmux, Codex daemon, browser, provider-plugin and remote execution ownership.
5. Only after T031 passes, wire T032 truthful Connect/Reconnect/switch, live imported-server tests and desktop/phone recovery. Do not turn admission-only blocking into a claim of a full kill switch.
6. Implement T036 automatic end-user installation/activation and signed/notarized packaging for both Mac architectures. Apple approval dialogs cannot be silently granted by GeckIt. Hardware/platform claims must follow execution tests.
7. Review any later UI behavior through apple-ux/apple-ui, update UX/design docs, inspect the real rendered full screen in Chrome in both themes and target sizes, and complete the performance checklist.

T027, T031, T032, T035's full installed qualification and T036 remain unfinished. Successful signing/notarization is not the remaining authorization blocker. Windows/Linux, live provider traffic, production plugin execution, complete kill-switch behavior and agent-inaccessible secrets are not established.

## State at pause

The owned qualification tunnel was explicitly stopped. Final controller status was **1 (disconnected)**, and the owned peer/controller/runner/failure-actor process check returned no matches. The system extension remains installed/activated under macOS management, but no test tunnel/peer was intentionally left running. GeckIt and its configured-work guard were preserved. No global DNS/route change, production-agent launch, imported-key test, paid AI turn, commit or push was performed.
