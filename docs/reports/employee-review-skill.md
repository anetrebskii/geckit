# Employee prior-work review skill

Added GeckIt product skill `skills/review-employee-work/SKILL.md` on 2026-11-13, Codex session `01a1d452-b4ac-7670-9ea7-12f81f40fcf8`. It is 654 words with a 47-word description. Conditional command details live in references/history.md.

The skill recovers original requests and corrections, reads every employee-memory cursor, inspects current artifacts and separates historical assertions from checks performed now. It identifies superseded decisions, reusable work, failures, unverified conditions and owners. Review-only requests do not authorize repairs. Worker review does not assign tasks or mark Done; Manager retains coordination authority.

manage-employees now routes prior-result review to this skill through provider-correct absolute paths. Twelve skills are discovered by the existing bundler. Sources are GeckIt product files, not personal skill links or caches. Inventory comparison returned no match at 0.30. Existing manage-employees handles role/memory access; manage-conversations handles history operations; the new skill interprets and verifies prior work.

Checked the current employee CLI, memory pagination implementation and existing conversation commands. Memory contains user/assistant messages, excludes tool outputs and can omit attachments. The reference records these limits and currently assigned source coverage. Live assignment lookup for this conversation returned employee null; no other employee's private task history was read for this authoring task.

## Checks

- Guide and employee-guide tests: 25 passed. Tests read twelve generated skills and resources, check placeholders and budgets, and verify this skill's actual paths for source/installed and Claude/Codex modes.
- Typecheck, exact package lint and desktop/headless build: passed. Build log: /private/tmp/geckit-employee-review-build.log.
- Size, Write and Cut and fuzzy-word checks: exit 0 for the new skill/resources and affected employee skill. Personal format checker exits 1 only for personal type/tags metadata; GeckIt product metadata uses name/description.
- Strict Claude plugin validation on a temporary source-skill fixture: exit 0. README/license/icon directory-submission advisories remain outside this delivery.
- Manual source walkthrough: a correction to an earlier result recovers its original conditions before checking current artifacts; an inaccessible source remains unverified. A nearby team-setting request stays with manage-employees. These instruction routes agree with their selection descriptions; no real model execution or external integration was tested.

No audience-specific content standard matched this internal guidance. Applied skill-format and Write and Cut. Changes remain local and uncommitted in the main checkout. No app restart, push, real task mutation or new worktree. Existing unrelated edits remain untouched. New instructions are delivered on the next service startup; real employee compliance remains unverified.
