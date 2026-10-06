# AGENTS.md

Read `CLAUDE.md` for repository structure, architecture, build commands and project workflow instructions.

## Product feature list

`docs/features.md` is the canonical user-approved product feature list; `docs/feature-audit.md` holds supporting evidence and detailed implementation coverage. Read the list when implementing, reviewing or describing a product feature.

After implementing or discovering an implemented GeckIt feature missing from the list, show Alex the exact proposed entry and ask whether to include it. Batch related additions into one question and continue unrelated authorized work while waiting. After approval, append the entry to the relevant section automatically, without asking again; an explicit request to add that feature is already approval. Expand an existing entry instead of duplicating it. If Alex declines or has not answered, leave the list unchanged.

Describe GeckIt's user-visible workflow, not inherited model reasoning, coding or tool capabilities. Keep provider/platform limits accurate, distinguish working-tree support from released support, and leave unimplemented proposals out. Update the audit with evidence for approved additions. This is a documentation step, not a new implementation, commit or deployment approval gate.

## Spec Kit for Codex
Codex skills live in `.agents/skills/`; `.specify/integration.json` selects Codex as the default. Invoke them as `$speckit-specify`, `$speckit-clarify`, `$speckit-design`, `$speckit-plan`, `$speckit-tasks`, and `$speckit-implement`.

For new features, use specify -> clarify when needed -> design -> plan -> tasks -> analyze -> implement. The design stage writes `specs/<feature>/design.md`, links visible behavior in `docs/ux/`, and links layout prototypes in `docs/design/`. Planning, task generation, and implementation must read that handoff and its linked artifacts. Existing features may use their referenced UX documents and prototypes without creating duplicate designs.

The CLI workflow is `specify workflow run speckit -i spec="<feature description>"`; its project overlay adds design and design review before planning. `specify workflow resolve speckit` shows the composed stages. `specify integration status` verifies the setup. Scope `SPECIFY_FEATURE_DIRECTORY=specs/<feature>` to a command to select another feature; otherwise scripts use the checkout's `.specify/feature.json`.

These design customizations belong to this repository. Keep the workflow overlay and design template when refreshing Spec Kit, and preserve the design handoff instructions in the downstream skills.
