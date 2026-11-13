# Manager and browser profile workflow skills

Added locally on 2026-11-13, Codex session `01a1d452-b4ac-7670-9ea7-12f81f40fcf8`. GeckIt product sources now contain eleven skills. No commit, push, app restart, real task cleanup, timetable mutation or browser profile creation was performed.

| Skill | Entry words | Description words | Selection boundary |
| --- | ---: | ---: | --- |
| manage-worker-lifecycle | 572 | 29 | Assignment, corrections, prior Done/Archived lookup, worker reuse and verified Done |
| review-progress-tasks | 493 | 29 | Review every In progress candidate in requested scope without treating silence as completion |
| schedule-tasks | 492 | 28 | Existing shortcut lookup, worker versus Manager execution, CRON/timezone and configuration readback |
| configure-browser-profile | 584 | 30 | Existing account/project lookup, Chrome extension versus Camoufox, named creation and human sign-in |

## Sources and integration

Checked Manager instructions, capabilities and operations, worker receipts and ownership, lifecycle and shortcut UX, scheduler runtime, browser CLI and profile-management UX. The Camoufox amendment supersedes older Chrome-for-Testing setup instructions. Existing browser reference changes from another session remain intact; corrected only its unconditional named-profile access statement to respect project mappings.

Inventory comparison produced no candidate at 0.30 for the three coordination/scheduling jobs. Browser setup matched the installed older geckit-browser skill at 0.45; read that skill and the current use-browser source. Kept page interaction in use-browser and separated profile selection/setup into configure-browser-profile. This matches the requested separate job and avoids repeating page commands in its entry file.

Actual Manager instructions now include conditional loading pointers using provider-specific absolute skill paths. Manager retains its existing safety and authority rules. Ordinary generated guides point to all four workflows. Browser instructions route account/profile setup to the new skill. Text lives in profiles templates; TypeScript reuses existing naming/path/fill helpers and introduces no domain types. No new CLI command or UI flow was added.

## Verification

- Guide and Manager tests: 200 passed. Generated file checks cover all eleven skills and references, resolved placeholders, source/installed provider paths, entry/description budgets, guide budget and browser-off retention. Manager tests exercise initial, continuation, follow-up and restored turns with workflow pointers. These are isolated fixtures, not real model execution.
- Found and fixed an inline browser guide placeholder gap during final review. Guide/browser regression tests: 23 passed, including inline Claude/Codex path selection in source and installed modes.
- Final typecheck and exact package lint passed. Final desktop and headless service build passed; log: /private/tmp/geckit-manager-workflows-build.log.
- Strict Claude plugin validation on a temporary source-skill fixture: exit 0. Directory-submission advisories for README, license and icon remain outside this local plugin delivery.
- New entry size checks passed. Personal format checks exit 1 only for missing personal type/tags metadata; GeckIt product skills intentionally use name/description. No name errors for the four new skills.
- Write and Cut and fuzzy-word checks exit 0 for all four new entries, references and the two affected workflow profile templates.
- Browser entry remains within budget at 729 words. Its existing WC004 sentence-length findings remain at lines 16, 29 and 60; they preserve the browser refusal boundary, account selection conditions and layout-check conditions. The existing browser reference retains six WC004 findings at lines 3, 6, 11 and 13; these preserve conditional browser selection, ownership and sign-in instructions. No browser boundary was weakened to silence a wording warning. The literal --slow flag remains a retained fuzzy-word match in unchanged design instructions.
- git diff --check passed. Unrelated Codex source/test edits remain 19/3 and 30/1 lines, respectively; no edits were reverted.

## Workflow walkthroughs

A correction to a completed outcome first reads the prior worker's request and replies, then reuses it only for that outcome. An unrelated request sharing a project starts a new worker. Missing original requirements prevents a Done decision. Expected and observed instruction routing agree.

An In progress worker with an active runtime remains open. An idle worker with missing evidence is inspected or continued rather than marked Done. Verified complete work gets Done and readback; cancelled work can be archived while history is retained. Every requested candidate needs a recorded outcome. This was a source walkthrough, not a mutation of real tasks.

A revised daily job first lists shortcuts and edits its match. An ambiguous timezone blocks saving; a remote server's timezone must be established. A busy worker and downtime follow current scheduler semantics rather than creating overlapping or replayed runs. No real timed dispatch was observed.

A matching account profile is reused after checking identity and project access. Isolated project work uses start geckit without another named profile. A genuinely missing named account gets a distinct project/account name and a human sign-in link in the final reply. A refusal stops the affected browser work. No new live account or profile was created.

No audience-specific content standard matched this internal product guidance. Skill-format and Write and Cut were applied. The next service startup delivers these source changes; the running session was not restarted. Skill loading and worker compliance by a real model remain unverified.
