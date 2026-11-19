# Quickstart: validating the real-person test browser

## Prerequisites

- `client/` built from the branch (`npm run build:service` into a scratch `--outDir` while someone uses the dev app, as described in the plan).
- A trace-check page served locally: `specs/036-real-person-browser/fixtures/traces.html` (made in the first task). It records every attribute, element and style added to its document with a `MutationObserver` started before any GeckIt command, plus `wheel` events and `isTrusted` clicks, and exposes them as `window.traces`.
- For the server steps: an Ubuntu 24.04 machine without a desktop (a remote host, or `docker run -it ubuntu:24.04` with GeckIt's headless service installed per `skills/configure-remote-geckit`), with `xvfb` installed for steps 3 and 4 and removed once for the failure check.

## 1. No GeckIt traces (all systems)

In this project's test profile, open the trace page and run, one per call: `read`, `find <tab> "submit"`, `click`, `hover`, `type`, `type --secret` (with a test secret), `scroll <ref>`, `scroll down`, `select`, `upload`, `drag`, `shot --pointer`, `record --pointer`, then open the live view with `signin`.

Expected:

- `eval <tab> "window.traces"` (main world) lists no attribute starting `data-geckit`, no element or style GeckIt added, and the clicks as trusted.
- Every command answers as before; refs from `read` work until reload.
- `shot --pointer`, the recording and the live view show the pointer at the cursor, and the secret field blank.
- The same run in the person's Chrome (extension) answers as before.

Also confirm `geckit:zabookni` opens Instagram signed in, with no new-device check (SC-005).

## 2. uBlock Origin (all systems)

- A tracker image (`https://ad.doubleclick.net/favicon.ico`) fails to load and `adsbygoogle.js` is replaced by uBlock Origin's surrogate; without the `addons` setting both load. (`extensions.json` does not list it: it is a temporary add-on.)
- With Camoufox debug on (`debug: true` in `CAMOU_CONFIG_1`), stderr says `Installed 1 addon(s)`.

## 3. Virtual display (Ubuntu server)

- `start geckit` with `xvfb` installed: starts; `ps` shows an `Xvfb` owned by the driver; a page sees `navigator.webdriver` false and no headless signs on BrowserScan; `stop` leaves no `Xvfb` running.
- Two profiles started at the same moment: two displays, both browsers work.
- `kill -9` the driver, start the profile again: the old `Xvfb` is gone, a new one runs.
- Without `xvfb`: the start fails with `sudo apt install xvfb` in the message.

## 4. Desktop identity (Ubuntu server)

- First start makes `~/.geckit/camoufox/device.json`; a second profile and a restart present identical values on CreepJS and `browserleaks.com/webgl`; the unmasked renderer is the Intel one from the base, not `llvmpipe` (other WebGL parameters stay Mesa's); media devices and voices are not empty; `hardwareConcurrency` matches `cores`.
- A profile that existed before the update shows `as before` in `profiles`; `profiles device <name> --desktop` moves it and prints the new-device warning.
- A damaged `device.json`: the start fails with the message from [contracts/cli.md](contracts/cli.md), and the file is left as it was.

## 5. Nothing changes where it should not

On macOS: the values on CreepJS match the same check before the update, except uBlock Origin. `npm run lint`, `npm run typecheck` and `npm test` pass.
