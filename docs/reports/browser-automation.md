# Browser automation decision and Camoufox reference

Date: 2026-11-12. Codex session `01a1cfcc-a096-7b41-b13d-3b7e6f592236`.

## Decision

Alex chose to keep Chrome for Testing with GeckIt's existing browser driver and persistent profiles. New test-browser processes launch with `--disable-blink-features=AutomationControlled`, with `navigator.webdriver` expected to return `false`. This is a launch default rather than a per-profile preference. A browser already running picks it up only after closing and launching again. Ordinary Chrome extension sessions use their existing browser process.

The flag changes one browser-exposed automation signal. It does not prove that a website cannot detect automation from other browser properties, network signals, session history or behavior. GeckIt uses its own CDP driver over a pipe; it does not use ChromeDriver or Playwright for this path.

## Camoufox for a future comparison

[Camoufox](https://camoufox.com/) is a modified Firefox browser designed for automation. Its material difference from this Chrome setup is engine-level fingerprint control: navigator and hardware values, screen properties, fonts, WebGL, timezone, locale and WebRTC. Its documentation describes modifying native implementations rather than injecting page JavaScript. The project's claims of being undetectable and more memory efficient have not been independently verified here. Being based on Firefox alone does not demonstrate a detection advantage.

Camoufox supports Playwright's Firefox interface. It is not a replacement executable for GeckIt's current Chrome/CDP driver; adopting it would require a separate browser adapter and verification of GeckIt's commands and lifecycle.

[Persistent contexts](https://camoufox.com/python/usage/) use `persistent_context=True` and `user_data_dir`. The same documentation describes generated fingerprints by default, so saving a profile must not be assumed to preserve the entire fingerprint configuration. Stable account identity and cross-computer reuse would need explicit validation. Firefox's [manual profile transfer documentation](https://support.mozilla.org/en-US/kb/back-and-restore-information-firefox-profiles) warns that profiles are not always portable between operating systems. Camoufox profile migration and continued acceptance of transferred logins were not tested.

If Chrome encounters a reproducible problem on a required site, compare the same authorized workflow in both browsers. Check fresh launch, saved sign-in after reopen, required interactions and any actual cross-computer transfer. Judge results on those target sites rather than a generic fingerprint score. No Camoufox installation or integration is included in this decision.

## Existing observations

Earlier live trials used Chrome for Testing `131.0.6778.204` and Chromium `160.0.8158.0` on macOS ARM64. Each returned `navigator.webdriver=true` without the flag and `false` with it, including after a GeckIt click navigated from example.com to IANA. Those trials used isolated profiles and process-local wrappers; they did not change the default launch. Evidence remains in `/private/tmp/geckit-cft-01a1cfcc/verification.json` and `/private/tmp/geckit-chromium-01a1cfcc/verification.json`, which are temporary files.

## Default-launch verification

Built the production service/CLI with `npm run build:service`, then created the isolated profile `test:cft-default-01a1cfcc` and launched it through the normal `geckit-local browser start test:cft-default-01a1cfcc` command. No executable wrapper or process-local flag override was used. The running GeckIt service and existing shared test browsers were not restarted.

Observed driver PID `9987` running the rebuilt `out/service/cli.js`; its browser child PID `9989` ran the actual Google Chrome for Testing `131.0.6778.204` binary with `--remote-debugging-pipe` and `--disable-blink-features=AutomationControlled`. A live page evaluation returned `navigator.webdriver=false` at `https://example.com/`. GeckIt's real link click navigated to `https://www.iana.org/help/example-domains`, where a second evaluation also returned `false`. Read and click commands continued to work. This verifies the new default launch on macOS ARM64, not a JavaScript property override or a stubbed browser.

All four TypeScript configurations passed `npm run typecheck`; ESLint passed for `client/src/cli/testing.ts`; the service build and `git diff --check` passed. The focused browser-testing, remote-browser-profiles, browser-routing and browser-lifecycle suites passed all 23 tests. Their initial sandbox run hit an `EMFILE` filesystem watcher error; the same suites passed outside the sandbox without that error. No new types or source comments were introduced.

Linux runtime behavior, site-specific bot checks, authenticated account reuse and cross-computer migration were not exercised for this launch-only change. The installed release was not rebuilt or published. The source copy's rebuilt CLI applies the default to future driver launches; already running browser processes retain their original arguments. The verification profile contains no signed-in account and remains subject to the conversation's normal browser cleanup lifecycle.

## Sources

- [Camoufox design and features](https://camoufox.com/), read 2026-11-12. Maintainer documentation; detection and performance claims are not independently established.
- [Camoufox launch configuration and persistent contexts](https://camoufox.com/python/usage/), read 2026-11-12.
- [Firefox profile backup and transfer](https://support.mozilla.org/en-US/kb/back-and-restore-information-firefox-profiles), read 2026-11-12. Documents Firefox, not a verified Camoufox migration procedure.
- [Cloudflare detection engines](https://developers.cloudflare.com/bots/concepts/bot-detection-engines/), read 2026-11-12. Describes browser, request and behavioral detection signals.
- Local implementation: `client/src/cli/testing.ts`, `testBrowser` launch arguments and persistent profile directory.
