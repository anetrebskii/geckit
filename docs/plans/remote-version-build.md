# Report the release version from tagged source builds

- Request: remote Settings now displays the wrong version, GeckIt 1.0.0, after the previous missing-version fix.
- Checkout: /Users/alex/Projects/mine/geckit, main, permanent checkout; unrelated checklist and styling changes preserved.
- Started: 2026-11-18.
- Session: Codex session 01a1eafa-fef5-7ff0-8814-bbf73fd998a4.

## Acceptance conditions

- Build a tagged checkout with its unchanged package.json, as Entech provisioning does: service:about, service:bootstrap and desktop:hello report the tag's release version from .version.
- Build with a package version stamped by release CI: retain that exact version, including any prerelease suffix.
- Desktop-to-service compatibility uses the same version source as the service.
- Remote desktop Version and phone About display the corrected server value; existing unavailable handling and server update guidance remain.
- The service output remains self-contained after copying it away from the checkout.
- Assumption: this is a backend metadata correction under the existing remote Settings UX, with no new controls, wording or layout.
- Delivery authorization: the existing request to push this fix directly to main continues to apply to its correction. No remote deployment or service restart requested.

## Progress

### 1. Prepare the UX document

- [x] Done.
- Evidence: docs/ux/remote-clients.md already defines the server version and unavailable states. Clarify the tagged-source version source without changing states, wording or entry points. No new prototype or audience type standard applies; Apple design requirements remain satisfied by the existing UI.

### 2. Prepare the UI and test it

- [x] Not applicable: no renderer, component, style or control changes. Reuse the existing desktop Version and phone About; verify the corrected value through them after the backend fix.

### 3. Write the feature code

- [x] Done.
- Skills: implement-change, investigate-first, write-feature-code, write-strict-typescript.
- Evidence before editing: v1.266.0 contains .version = 1.266 and client/package.json version = 1.0.0. EntechBot infra/azure/provision.sh.tftpl lines 101-125 clones the release tag and runs npm ci and build:service without npm version, then copies the output. Release CI stamps package.json before building. The previous fix imported the placeholder, so a source-built remote truthfully returned the wrong build metadata. Local built service contains the same placeholder. No live Entech status or installed artifact has been read in this correction.
- Debug-issue skill is not installed in the personal source checkout; investigate-first used for evidence before editing. GeckIt code is not in the local llmdex catalog; exact identifiers and known files used for retrieval. No index created.
- Evidence after editing: client/src/shared/version.ts embeds the release marker with a .0 patch when the package retains 1.0.0, otherwise preserves the stamped package version. Core metadata, service hello and the desktop connector reuse it. Desktop startup uses the connector's default build version instead of overriding it with Electron's source placeholder. No new types, unsafe type shortcuts, timers or runtime file access. Client typecheck, raw npm lint, client build and mobile build pass. Logs: /tmp/geckit-version-typecheck-correction.log, /tmp/geckit-version-build-correction.log, /tmp/geckit-version-mobile-correction.log.

### 4. Update the related distributed skills

- [x] Done.
- Updated skills/configure-remote-geckit/references/installation.md and docs/headless-service.md to explain tagged-source version selection and copied-bundle metadata. Existing commands, flags and settings unchanged. Product profile standard read; full tests include guide/skill installation and client/service builds bundle the reference. No personal skill edited.

### 5. Update the feature list

- [x] Not applicable: repairs the already documented remote Settings workflow; no new product feature.

### 6. Write unit tests

- [x] Done.
- build-version.test.ts covers the source placeholder and exact CI versions, including a prerelease suffix. core-application.test.ts independently reads the release marker and verifies the actual built service's about/bootstrap responses and desktop handshake after building into a separate temporary directory. Desktop and recovery fixtures use the same build version.
- Focused run: 38 passed, 1 skipped in five files. Full Node 22 run with local socket access: 2144 passed, 7 skipped; 167 passing files, 5 skipped files. Log: /tmp/geckit-version-tests-node22.log. Earlier Node 26 sandboxed full run stalled with failed cases and no final diagnostics; interrupted its runner, then the complete supported-runtime run passed. No unrelated test or product code changed to obtain a pass.
- Separate stamped-build proof: copied the source inputs, changed only that scratch package version to 1.999.0-beta.2, and ran core-application.test.ts against its real built service and RPC. Passed, including exact metadata and default desktop compatibility. Log: /tmp/geckit-version-stamped-integration.log. Scratch copy removed; permanent package.json unchanged at 1.0.0.

### 7. Test the feature through UI tools

- [x] Done.
- Existing isolated remote-clients fixture, actual desktop and phone renderers. Service/RPC/WebRTC/pairing real; provider and local signaling are fixtures. Built unchanged package.json from checkout release marker 1.266, copied the service away from the checkout, paired through the Connect forms, and opened desktop Settings > Version and phone Menu > Settings > About. Both show 1.266.0; desktop retains the server update guidance. Reopened the desktop Version surface and observed the same correct value. No production service restarted or deployed. Physical phone, ENTech artifact/process and real NAT/TURN remain unverified.

### 8. Test the final UI

- [x] Done.
- Full-screen review: desktop 1440x900 light/dark and phone 390x844 light/dark, scrolling to About. Existing hierarchy, alignment, density and adjacent controls retained; corrected values readable and contained. No UI component, CSS, motion, colour or keyboard behavior changed. Apple design and performance requirements unchanged by this embedded metadata correction; no new work per render or request.
- Reviewed desktop screenshots: /var/folders/c3/2y8b2_v56c9bl7_qfsfg9tsh0000gn/T/geckit-tab-427693802-1795008169556.png and geckit-tab-427693802-1795008179603.png. Reviewed phone About screenshots in the same directory: geckit-tab-427693805-1795008243813.png and geckit-tab-427693805-1795008244353.png.

## Result

- Verified correction prepared for direct delivery to main under Alex's existing instruction; delivered commit and remote verification will be recorded in the day-plan task. Prior fix: https://github.com/anetrebskii/geckit/commit/68a2150b79db19c7a8347faf2ce469d0f38c8d8a.
- Permanent main checkout retained; no temporary worktree created or requiring removal. Task browser tabs closed, fixture service and Vite processes stopped, stamped-build scratch copy removed. Unrelated working changes preserved. Active development service and ENTech installation unchanged; they need a rebuilt version to display the corrected metadata.
- Day-plan validators retain pre-existing unrelated missing proof, duplicate/link and line-format errors; task moved from November 17 to November 18 without duplicating it.
