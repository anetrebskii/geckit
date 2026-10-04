# AGENTS.md

Read `CLAUDE.md` for repository structure, architecture, build commands and project workflow instructions.

## Product feature list

`docs/features.md` is the canonical user-approved product feature list; `docs/feature-audit.md` holds supporting evidence and detailed implementation coverage. Read the list when implementing, reviewing or describing a product feature.

After implementing or discovering an implemented GeckIt feature missing from the list, show Alex the exact proposed entry and ask whether to include it. Batch related additions into one question and continue unrelated authorized work while waiting. After approval, append the entry to the relevant section automatically, without asking again; an explicit request to add that feature is already approval. Expand an existing entry instead of duplicating it. If Alex declines or has not answered, leave the list unchanged.

Describe GeckIt's user-visible workflow, not inherited model reasoning, coding or tool capabilities. Keep provider/platform limits accurate, distinguish working-tree support from released support, and leave unimplemented proposals out. Update the audit with evidence for approved additions. This is a documentation step, not a new implementation, commit or deployment approval gate.
