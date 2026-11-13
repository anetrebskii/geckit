# Camoufox migration verification

Local changes on main, 2026-11-13. Codex session 01a1cfcc-a096-7b41-b13d-3b7e6f592236. Local implementation was verified before delivery; Alex subsequently authorized direct-main integration and push. The running application was not restarted. The separately authorized font-free browser assets were published to GitHub Releases. Internal engineering record; the public release notes were checked with the Own English standard.

## Result

Managed test profiles now use Camoufox 158.0.1-beta.41 with Playwright Core 1.62.0 and native human cursor movement. The installer downloads version-pinned font-free GeckIt repacks, verifies their pinned SHA256, defensively excludes bundled font/fontconfig directories, publishes only a complete installation, reports download/extraction progress and permits retry after failure. It needs no Python installation. Personal Chrome extension access is retained.

New browser data is under `~/.geckit/camoufox/`. Existing Chrome test-profile names and notes are retained once as fresh Camoufox profiles; their old browser data is preserved under `~/.geckit/chrome-for-testing/`. Reauthentication is required. Renaming or deleting a new profile does not resurrect its old name. Camoufox profile archives use format version 2; Chrome archives are explicitly refused rather than restored into Firefox.

## Checks completed on macOS ARM64

| Check | Evidence and boundary |
| --- | --- |
| Clean install | Actual official 1,297,694,189-byte archive downloaded, SHA256 verified, fonts excluded during extraction and installed browser launched. Installation measured 369,168 KiB, about 361 MiB. Isolated temporary HOME, no user profile modifications. |
| Real browser acceptance | `client/test/camoufox-browser.integration.test.ts` passes against the installed binary and an isolated built CLI. Open/read/type/hover/style, element screenshot, viewport/media, recording, live-view frames/input, cookies/localStorage after restart and rename, archive export/import, persistent website downloads with duplicate filenames, conversation isolation and release/process exit. Login is to a local test server, not a real account. |
| Native mouse | Local page observed 35 trusted mousemove events and `navigator.webdriver === false`. This does not establish that a website cannot detect automation. |
| Settings | Actual SettingsDialog/BrowserProfiles renderer with a synthetic native API: create, edit/rename, Open, Sign in, Done and restored keyboard focus. Full-context light/dark desktop review, first-use/download/install/failure/migration notices, and smaller 1024x768 desktop review. Actual backend acceptance is the separate real-browser test above. |
| Automated regression | `npm test -- --no-file-parallelism`: 147 files passed, 3 skipped; 1,959 tests passed, 20 skipped. Final installer plus opt-in real browser rerun: 2 files, 5 tests passed. Parallel full-suite attempts had intermittent CLI integration failures; serial run passed. |
| Static and build | Exact `npm run typecheck`, `npm run lint` and `npm run build` passed. Isolated service output contains its Playwright runtime and launched the real test browser. |
| Performance checklist | Settings adds static notices only. Existing row memoization, callbacks, polling, list structure and animation behavior remain. Browser dependency loads lazily on launch; archive download and extraction stream data. No new repeated renderer work or performance claim. |

Temporary receipts: `/private/tmp/geckit-camoufox-evidence-01a1cfcc/real-browser.json`, `settings-receipt.json`; full-suite log `/private/tmp/geckit-camoufox-all-tests.log`. Test browser and settings preview were closed after verification. Installed test binary and evidence remain in temporary storage for repeatable local checks.

## Published font-free distribution

The authorized [font-free release](https://github.com/anetrebskii/geckit-browser-assets/releases/tag/camoufox-158.0.1-beta.41-no-fonts.1) is public in a separate Camoufox source fork. Keeping browser assets outside the GeckIt app-release repository avoids interfering with app update discovery. No new source commit was created. The release tag points to upstream source commit `c3ad3bf2c3c6e93225aa6587246c8b70f9314664`.

| Target | Download bytes | Decimal MB |
| --- | ---: | ---: |
| macOS ARM64 | 157,420,465 | 157.4 |
| macOS x64 | 165,802,745 | 165.8 |
| Linux ARM64 | 156,821,544 | 156.8 |
| Linux x64 | 163,246,401 | 163.2 |
| Windows x64 | 180,868,489 | 180.9 |

`client/scripts/camoufox-repack.py` verifies all five original archives against upstream SHA256, streams every non-font entry into a new archive, retains file contents, modes and third-party notices, and adds redistribution/source/license notices. Every archive passed ZIP CRC verification and retained-entry comparison against its original. The release includes this script, MPL license, manifest and SHA256SUMS. All five GitHub asset digests match the local archives and pinned installer hashes. All five public download URLs returned HTTP 200 with the expected content length without authentication.

The local installer now uses this release. A clean temporary HOME downloaded the actual public macOS ARM64 archive, verified its checksum, installed and launched the browser without an executable override. Installed size was 369,192 KiB, about 361 MiB; no bundled font/fontconfig directories remain. The isolated browser was closed after the check. Receipt: `/private/tmp/geckit-camoufox-evidence-01a1cfcc/public-slim-install.json`. The opt-in real-browser acceptance and installer checks were rerun against this downloaded binary: 2 files, 5 tests passed, including 35 trusted native mousemove events with `navigator.webdriver === false`. The receipt `real-browser.json` now records this public-package binary. Full serial suite: 1,959 passed, 20 skipped; log `/private/tmp/geckit-camoufox-slim-tests.log`. Final full local build passed; log `/private/tmp/geckit-camoufox-slim-build.log`.

Settings' 150-180 MB first-use notice was reviewed in full desktop context in light/dark themes, including download progress at 1024x768. This changes static wording only. The actual native integration remains covered separately by the real browser acceptance checks. Intel Mac, Linux and Windows archives were verified for integrity, executable metadata and source preservation, but were not runtime-tested on those systems.

Earlier investigation found no current official slim asset. Full upstream 158 archives were about 1.3 GB; older 152 builds were smaller but would downgrade the browser. The published repacks retain current 158 browser files. The host must supply fonts, especially on Linux. These repacks are identified as unofficial and retain corresponding-source availability; they are not upstream Camoufox releases.

## Remaining manual checks

Restart GeckIt when ready to load the rebuilt backend, then Settings > Web Browser > New profile > Open browser or More > Sign in. First use downloads and installs Camoufox. Check the actual account manually, close its browser and try Rename. Existing Chrome test profiles need a fresh login.

Real website account acceptance, physical paired-device/remote-host sign-in, Linux/Windows runtime behavior and packaged application installation are unverified. Supported release targets are configured, but only macOS ARM64 was exercised. Linux needs host system fonts and browser libraries. A 390x844 Settings fixture review showed the existing desktop two-column dialog is cramped at phone width; that preexisting layout was not redesigned in this browser-backend migration. Ordinary page phone viewport/media controls passed in real Camoufox.

## Direct-main integration verification

Delivery uses a separate task worktree based on current `origin/main`, preserving the original checkout and its unrelated Codex edits. The isolated integration passed typecheck, lint, full build and the serial regression suite: 147 files passed, 3 skipped; 1,958 tests passed, 20 skipped. The earlier 1,959-test run included one unrelated local Codex test that is excluded from this delivery. Logs are `/private/tmp/geckit-camoufox-main-{typecheck,lint,tests,build}.log`. The user explicitly authorized direct integration and push to main.
