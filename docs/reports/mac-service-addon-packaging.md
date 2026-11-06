# Mac service addon packaging verification

2026-11-06, release integrator Codex session `01a1af24-e587-7bd2-a795-9c490d3fd814`.

Development workflow [42164356388](https://github.com/anetrebskii/geckit/actions/runs/42164356388) failed after successful arm64 signing/notarization because its second Mac target lacked `@node-datachannel/darwin-x64@0.33.6` in the standalone service. npm installs optional dependencies for the build host's CPU; this runner builds both CPUs. The existing beforePack guard correctly rejected the incomplete target. Linux, Windows and iOS jobs succeeded; the release-finalization job was skipped. No Stable promotion was run.

The preparation script fetches both Mac addon tarballs using the versions and integrity in package-lock.json, rejects an integrity mismatch, and extracts them into node_modules without lifecycle scripts or dependency-tree resolution. npm run package and both PR/development Mac packaging paths invoke it before the service build. The missing-target guard remains intact. Non-Mac package invocation skips preparation.

Local verification in an isolated task worktree:

- Clean `npm ci --ignore-scripts`, preparation script and standalone service build passed. Lockfile unchanged.
- Both beforePack targets passed; `file` identified bundled binaries as Mach-O arm64 and x86_64.
- Standalone real Node WebRTC probe passed: Node 26.9.0, libdatachannel 0.24.6, 9500 bytes over a host UDP pair. This is local transport, not NAT/TURN proof.
- Full desktop/service build passed.
- `CSC_IDENTITY_AUTO_DISCOVERY=false npm exec electron-builder -- --dir --mac --arm64 --x64 --publish never -c.mac.identity=- -c.mac.hardenedRuntime=false` passed for both app bundles.
- Both actual app executables ran with ELECTRON_RUN_AS_NODE=1 and loaded node-datachannel from their packaged app.asar/out/service/node_modules. Results: x64 Node 22.22.0/libdatachannel 0.24.6 and arm64 Node 22.22.0/libdatachannel 0.24.6. No application UI or user data was opened.
- `actionlint -shellcheck=` passed for changed workflows; node syntax and git diff checks passed. Full actionlint retains the preexisting SC2046 warning in the signing script's security list-keychains substitution (unchanged).

Local bundles use ad-hoc signatures, no notarization, and omit optional whisper/llama build artifacts; this does not prove the final signed installers. Updated CI must confirm that workflow separately. Logs are outside the temporary worktree at `/private/tmp/geckit-packaging-*.log`. No release was manually published and no user service was restarted by these checks.
