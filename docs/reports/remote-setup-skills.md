# Remote and Slack setup skills

Added locally on 2026-11-13 in the GeckIt main checkout, Codex session `01a1d452-b4ac-7670-9ea7-12f81f40fcf8`. No commit, push, app restart, VM deployment, pairing or Slack configuration change.

| Skill | Words | Description words | Scope |
| --- | ---: | ---: | --- |
| configure-remote-connection | 527 | 39 | Existing GeckIt computer pairing and SSH execution hosts, with distinct identities and prerequisites |
| configure-remote-geckit | 561 | 38 | Headless service installation, provider/account setup, vault preservation, updates and recovery |
| configure-slack | 589 | 39 | Built-in Slack app, Socket Mode, scopes/events, channel grants, Manager and live acceptance steps |

These are GeckIt product skills under skills/, separate from Alex's personal skill inventory. Their entry files cover Purpose, Inputs, Work, Unknowns, Output and Verification. Conditional references hold commands, deployment examples and troubleshooting. Inventory comparisons for each proposed description returned no candidate scoring 0.30 or above. Existing manage-conversations and manage-employees cover ongoing work and preferences; the new skills cover initial setup and repair.

## Sources checked

Read current GeckIt headless-service, configuration, channel-libraries, remote-client UX and SSH quickstart documentation. Checked actual CLI routing and authority in cli/remote.ts, cli/service.ts, cli/product.ts and core/product-cli.ts, host types and SSH transport, the built-in Slack adapter, and the smaller example Slack library. The example's Claude-per-thread policy does not describe the built-in Manager adapter.

Queried prior GeckIt conversation history rather than provider files:

- `codex:01a1c71d-e2e3-7c71-9cc6-788ee155c09b`: TwinsAIbot deployment, Slack read-method fix, service replacement coordination, pairing, VPN and Azure UDP diagnosis.
- `codex:01a1ceb5-5556-7090-a86c-1c8a4cbcb3c8`: EntechBot continuation, release pin and operator-only Terraform apply boundary.
- `plugin:claude-tmux:27b1e663-5ef4-4059-a142-02fba68f54ae`: correct Slack app IDs, duplicate TwinsAI app, files:write additions/reinstalls and lack of live file verification.
- `plugin:claude-tmux:f94b31d4-495c-4f9b-abfd-cec7530d6f3b`: missing unzip in an earlier remote browser release; browser installation is separate from core readiness.

Read repository instructions before inspecting the TwinsAIbot and EntechBot READMEs, units, wrappers and provisioning scripts. Confirmed that TwinsAI's bootstrap preserves an existing service while Entech's versioned extension replaces it. Their wrapper argument conventions differ. Examples are labeled historical and never select an account or target by default.

Inspected structural local configuration fields. geckit-local has no SSH hosts. Its built-in Slack row is disabled, without a Manager grant, projects or non-secret configuration. No saved credentials were read. Neither remote VM was queried or changed. Current assignment lookup returned no employee.

Checked Slack's official Socket Mode and connections:write documentation. Runtime scope requirements come from GeckIt's current built-in adapter. References: https://docs.slack.dev/apis/events-api/using-socket-mode/ and https://docs.slack.dev/reference/scopes/connections.write/.

## Verification

- Focused installer, browser-bridge, employee-guide and employee-CLI checks: 33 passed. The expanded installation assertions cover all seven skills and references, resolved placeholders, source/installed Codex paths, setup links and browser-off retention.
- Final typecheck and exact package lint: passed. The wrapped lint invocation initially scanned packaging scripts outside the package's src/test scope; rerunning through rtk proxy used eslint src test and passed.
- Desktop and headless service builds: passed. Build log: /private/tmp/geckit-setup-skills/build.log.
- Generated Claude plugin strict validation: exit 0. Directory-submission advisories remain for README, license and icon; no directory submission was requested.
- Size check: exit 0 for all three final entry files. Description and coverage checks also pass in the product installation test.
- Personal format checker: exit 1 only for missing personal type/tags metadata on all three. Product skills intentionally require name/description; no personal vocabulary or inventory was changed.
- Write and Cut: exit 0 for the eight new Markdown files and revised profile template.
- Fuzzy-word check: exit 1 only at skills/configure-remote-geckit/references/installation.md:40 for Type=simple. Retained because it is literal systemd syntax. All entry files and other new instructions have no matches.
- Manual walkthroughs: an existing VM workspace routes to pairing, and a Claude-over-SSH folder routes to SSH setup. An uninstalled VM routes to headless installation. Slack missing_scope routes to the existing app and workspace reinstall. Missing target/app identity pauses dependent edits. These are instruction walkthroughs, not fresh-model executions or real infrastructure tests.

The previous refactor's full suite remains recorded separately as 1968 passed and 22 skipped; it was not repeated for these additions. Actual skill delivery is exercised through isolated file generation. The running app was not restarted, so new instructions require the next service startup. No live Slack reply, file transfer, provider login or remote pairing was tested in this extension. The setup skills require those checks before claiming a future deployment works.

No audience-specific content standard matched this internal product guidance. Skill-format and Write and Cut requirements were applied. No new TypeScript type was introduced; guide wiring reuses existing skillSaid, skillPath and fill functions. Unrelated Codex/session edits remain untouched.
