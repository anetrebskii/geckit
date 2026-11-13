# GeckIt skill and profile refactor

Completed locally in the existing main checkout on 2026-11-13. Codex session: `01a1d452-b4ac-7670-9ea7-12f81f40fcf8`. No commit, push, temporary worktree or app restart.

Sources now live in `skills/` and `profiles/` at the repository root. The service discovers skill folders at build time and installs their Markdown and JSON files at startup. Runtime placeholders supply the CLI path, host-specific names and platform batch syntax.

| Skill | Entry words | Description words | Selection boundary |
| --- | ---: | ---: | --- |
| use-browser | 718 | 49 | Website and browser actions |
| use-secrets | 671 | 47 | Credential requests and named use |
| manage-conversations | 396 | 42 | Conversation history, delegation and linked results |
| manage-employees | 417 | 39 | Assigned roles, memory, team, shortcuts and preferences |
| configure-remote-connection | 527 | 39 | Pair an existing GeckIt or configure SSH execution |
| configure-remote-geckit | 561 | 38 | Install or update a headless service |
| configure-slack | 589 | 39 | Connect the built-in Slack channel and Manager |

The new skills extract existing guide procedures. Inventory comparisons returned no candidate scoring 0.30 or above. The existing browser and secrets skills remain separate from conversation and employee operations.

Profiles retain reporting, goals, employee lookup, browser boundaries and credential protection. Procedures load through explicit skill paths; the employee catalog comes from the CLI. The profile budget is 500 words, excluding user Manager instructions and browser names. A generated source Codex profile after browser disable measured 250 words. Installation tests also enforce the budget with browser access enabled.

Claude receives the GeckIt plugin. Packaged Codex skills remain in ~/.agents/skills/geckit-<name>. Source Codex skills live in <userData>/codex-skills/geckit-<name>, with absolute paths in the source guide. Source startup preserves global installed-copy skills and guides. Browser disable removes its skill while all other bundled skills remain available.

The profile policy is in [agent-profile](../standards/agent-profile/STANDARD.md). Skill coverage follows Alex's skill-format standard. No audience-specific content type standard matched this internal developer documentation.

## Verification

- Full sequential suite: 1968 passed, 22 skipped, 148 test files passed and 5 skipped. Command: npm test -- --fileParallelism=false.
- Final installer, browser-skill, employee-guide and bundled employee-CLI checks: 33 passed. They exercise real temporary file writes, readback and local socket/subprocess transport, with isolated user/data directories.
- Final typecheck, lint, desktop build and headless service build: passed.
- Tested source isolation, browser on/off, all four installed skills, descriptions and sizes, six-part coverage, reference resolution, placeholder substitution, guide migration and malformed-block preservation.
- Generated Claude plugin: strict validation passed. Directory-submission advisories remain for README, license and icon; this is a private runtime plugin, not a directory submission.
- Standard format and Sources checks, source links and git diff whitespace checks: passed.
- Personal skill-format checker exits 1 for missing personal inventory metadata on these product skills. It also rejects the previously selected verb use. Product installation tests enforce names, limits, coverage and resources; the personal repository vocabulary and metadata were not changed.
- Fuzzy-word check exits 1 solely for the literal --slow flag in skills/use-browser/references/design-checks.md:7. The CLI identifier is retained.
- Write and Cut exits 1 with 30 WC004 sentence-length review findings in moved procedures. Retained after review to preserve the scope of conditions and operational lists: use-browser/SKILL.md lines 16, 27 and 58; use-secrets/SKILL.md lines 8, 28 and 42; manage-conversations/references/commands.md lines 14, 26, 31, 34, 45 and 56; its exact-form.md and send-file.md line 1; manage-employees/references/commands.md lines 7 and 11; browser design-checks.md line 7 and test-browsers.md lines 3, 6, 11 and 13; profiles/browsers.md and manager.md line 3. Multiple findings on one line concern separate sentences. The new conversation/employee entry files and new profile standard have no sentence-length findings.

An overlapping build and test run failed when both changed out/service. The complete sequential rerun passed. Build and full tests must run sequentially when they share that output directory.

Instruction walkthroughs covered a website task, a credential for a command, a conversation-status lookup, an assigned employee, and ambiguous account/project selection. Expected routing is to the matching skill; missing account or project requests clarification. These were manual instruction reviews, not fresh-model executions.

The active desktop app and real account integrations were not restarted or retested. New generated instructions take effect on the next service startup. Existing unrelated codex.ts, codex.test.ts and .vitest state were preserved.

Logs remain in /private/tmp/geckit-skills-refactor/. The current checkout remains on main with its prior remote divergence unchanged.

## Setup-skill extension

The requested remote-connection, headless-installation and Slack skills are now included. Each has a separate selection boundary and conditional references. Generated profiles link all three by host-specific name and absolute installed path, including source Codex. See [setup skills and evidence](remote-setup-skills.md) for source records, checks and execution limits.
