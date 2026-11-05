# Headless WebRTC transport compatibility probe

Date: 2026-11-06. Isolated worktree: `/private/tmp/geckit-remote-clients`. No production service, credential or external infrastructure changes.

## Verified

- Installed `node-datachannel@0.33.6` from the locked npm dependency, with optional native package `@node-datachannel/darwin-arm64@0.33.6`. The native API reports libdatachannel `0.24.6`.
- Real two-peer WebRTC connection under Node `22.23.4` on macOS arm64. Reliable ordered DataChannel `geckit` echoed 9,500 bytes exactly. Selected local/remote ICE candidates were host candidates over UDP. The remote DTLS certificate fingerprint was SHA-256.
- Same real connection under host Node `26.9.0`, selected host/prflx UDP candidates, passed.
- A separate esbuild Node22-targeted ESM bundle, with `node-datachannel` externalized and runtime packages copied into its own `node_modules`, ran from a fresh temporary directory outside the checkout and exchanged the same bytes. It did not resolve native dependencies from the source checkout. Tested under Node26.9.0.
- Electron38.8.6 in `ELECTRON_RUN_AS_NODE=1` mode (Node22.22.0) loaded the copied native dependency and exchanged9,500 bytes. No application window or working service was started. A full packaged/signed Electron artifact is still a separate release check.
- `otool -L` on the macOS arm64 addon shows system libc++ and libSystem dependencies; no Homebrew OpenSSL or developer build directory dependency.

Reproduce from `client/`, with UDP socket access (the default agent sandbox denies local ICE candidate gathering):

```sh
node test/remote-transport-probe.mjs
npm exec --yes --package=node@22 -- node test/remote-transport-probe.mjs
node test/remote-transport-probe-package.mjs
```

The commands produce JSON evidence with runtime, libdatachannel version, selected ICE pair, certificate fingerprint and exact payload result. The failed sandbox-only attempt reported `Failed to gather local ICE candidates`; it passed after permitting the isolated process network sockets. This was an environment restriction, not a fallback to a fake transport.

## Browser interoperability probe

`node test/remote-transport-probe.mjs --browser` starts `http://127.0.0.1:47931`. Opening this page in an owned GeckIt test-browser tab negotiates a real browser RTCPeerConnection against the Node native peer and exchanges a 7,500-byte payload. Browser result and server JSON must both report `pass` to count as verified. Verified by the main agent in its registered GeckIt test-browser tab: Chrome131 on macOS reported `connectionState: connected`, exact7,500-byte echo and `result: pass`. The Node process independently recorded `scenario: browser-node`, `result: pass` and a real host/prflx UDP selected pair. The research subagent could not create its own browser tab because it was not registered with GeckIt; the root conversation performed that browser step. No alternate browser control was used.

## Integration constraints

The current service build rejects every nonbuiltin external dependency. It must explicitly declare this one runtime dependency and ship its native runtime. Bundling the native loader into service.js is unsafe: it resolves native files relative to its own module location. Keep `node-datachannel` external, copy `dist/` and package metadata, `detect-libc`, and the appropriate platform-specific package beside service.js. A native `.node` addon cannot be embedded in a JS chunk. Electron packaging must keep the addon available outside compressed ASAR or place the complete headless bundle in extraResources; verify the actual resulting artifact independently.

Use the native `PeerConnection` API for headless server and the existing browser RTC API for mobile/desktop. Native `DataChannel` has `sendMessageBinary`, `bufferedAmount`, `setBufferedAmountLowThreshold`, `onBufferedAmountLow`; retain existing framing/backpressure rather than sending unlimited transcripts as one frame. `localDescription()` after gathering includes candidates for nontrickle exchange. `getSelectedCandidatePair()` exposes route evidence; `remoteFingerprint()` exposes the DTLS certificate identity to bind to the signed pairing transcript. Neither replaces device authentication. `iceTransportPolicy: 'all' | 'relay'` and TURN UDP/TCP/TLS configuration exist in the installed types; enabling them is not proof of a successful TURN route.

## Not verified by this probe

No physical mobile device, remote network, symmetric NAT, restrictive firewall, TURN allocation, TURN TLS route, Linux/Windows binary, packaged Electron artifact or user account was exercised. No TURN credentials were read or created. This probe establishes Node22 native loading, local real Node/browser WebRTC and a standalone packaging strategy, not complete product acceptance.

Primary package sources: [node-datachannel0.33.6](https://github.com/murat-dogan/node-datachannel), [API](https://github.com/murat-dogan/node-datachannel/blob/master/API.md), plus the installed package's `dist/types/lib/index.d.ts` and native loader. Installed declarations are authoritative for implementation details: for example the current `setLocalDescription` takes description type, whereas README/API excerpts may lag.

## Focused authorization and lifecycle checks

`npx vitest run test/remote-access.test.ts`: seven passing tests. These use a typed isolated runtime and simulated authenticated-channel/signaling callbacks, with real WebCrypto ECDSA device signatures and actual encrypted vault persistence in temporary directories. They cover operator phrase matching; one-device consumption and recovery by the same enrolled identity; reconnect; persisted explicit revocation after service restart; expiry; cancellation; reads denied before approval; forged signatures; negotiated transport-binding mismatch; incompatible protocol; forbidden control/native RPC; project filtering; host-scoped IDs; permitted versus out-of-scope history; and suppression of a history response completing after revocation. These checks establish application authorization/lifecycle behavior, not a real network connection or physical-device result. The real Node/browser transport checks above are separate.
