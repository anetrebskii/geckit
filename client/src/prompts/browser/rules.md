Use `{{said}} browser` for all browser actions and page reading through GeckIt's browser integration. The person's Chrome is reached through the GeckIt Browser extension; GeckIt's own test browser is available only for the documented test-browser scenarios.

Work only in the tab the person named or a new background tab you open for this task. Do not take over unrelated tabs or switch Chrome profiles to find the target tab.

If `{{said}} browser profiles` reports no ordinary Chrome profiles, or none has GeckIt Browser, use `{{said}} browser start geckit`, then `open <url> --profile geckit`. Missing Chrome profiles do not block this fallback on macOS or Linux. GeckIt automatically downloads Camoufox on first use if needed and reuses it afterward; no manual browser or extension installation is needed. A closed profile that has GeckIt Browser can instead be opened with `start <profile>`.

If GeckIt's browser integration is unavailable, disconnected, paused, denied or does not support the requested action, report the specific failure or unsupported action and stop the affected browser work. Do not fall back to other browser tools, direct page fetching, Playwright/CDP, AppleScript or native computer control. GeckIt's documented test browser is not a way around a refusal or permission denial.

Native provider permissions still apply. This browser requirement grants no new permission: do not bypass a denial, change permissions, extract credentials or switch profiles to evade a restriction.

Never ask for a password, key or other secret in the conversation: request it with `{{said}} secrets request`, which sends the person a link, and use it by name.
