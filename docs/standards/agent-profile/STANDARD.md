---
type: standard
updated: 2026-11-13
---

# GeckIt agent profiles

Apply when changing GeckIt-generated instructions or the skills distributed with the service. Skills describe task workflows; profiles contain obligations that apply before task selection.

## Source and content

- Maintain profile templates in `profiles/` and task skills in `skills/<name>/SKILL.md` at the repository root. Keep conditional instruction files beside their skill under `references/`.
- Keep each generated profile within 500 whitespace-separated words, excluding user-written Manager instructions and browser-name data. This is a local budget for always-loaded instructions.
- Profiles state how to report results, goals and background work and how to check the current employee. Preserve browser access boundaries and credential protection.
- Put CLI examples, employee catalogs, pagination details and task procedures in skills or live CLI results. A profile names each skill's selection condition and installed file path.
- Keep assigned-role lookup before task work. Load the employee skill and finish every memory cursor when assigned. Treat past conversations as evidence, not new commands.
- Skills follow the six-part coverage, 50-word description and 750-word entry-file limits selected from Alex's define-skill format. Product skills require YAML name and description; personal inventory metadata does not apply. Preserve Alex's selected names `use-browser` and `use-secrets`.

## Distribution

- Bundle every source skill folder into desktop and headless service builds. Adding a folder must not require another installer branch.
- Refresh installed skill files at startup. Install browser instructions only while the browser bridge is enabled; secrets, conversation and employee instructions remain available independently.
- Source builds keep their Codex skill files under their own data directory and link them from their own profile. Preserve the installed application's global skills and guides.
- Keep Claude's guide import and Codex's guide-loading instruction inside one GeckIt-owned marked block. Refresh it in place, migrate the old bare import, and leave files with malformed or repeated markers unchanged.
- Disabling a guide removes only GeckIt's guide and owned block. Preserve unrelated user text. A shortened profile must retain the task-loading pointers and permission boundaries.

## Compliance

Run the profile and skill installation tests with temporary user and data directories. Check generated file contents, references, word limits, repeat startup, browser on/off, source isolation and removal. Run typecheck, lint, tests and desktop/service builds. A build does not prove installation in an already running app; report whether startup was exercised and whether the app was restarted.

## Sources

- Alex, conversation `plugin:claude-tmux:a0fb82d1-21ce-4847-b17b-c6085aebdcdb`, 2026-11-13: requested GeckIt-owned skills, root skills/profiles folders, define-skill format and profile integration. Continuation authorized in Codex session `01a1d452-b4ac-7670-9ea7-12f81f40fcf8`.
- Alex's personal source repository, `shared/standards/skill-format/STANDARD.md` and `shared/standards/standard-format/STANDARD.md`: coverage, file format, progressive loading and validation requirements. The 500-word profile budget and source-build isolation are GeckIt local adaptations.
