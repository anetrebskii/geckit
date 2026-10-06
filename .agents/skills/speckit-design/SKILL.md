---
name: speckit-design
description: Create or update a GeckIt feature's UX document, layout prototype, and design handoff after specification and before implementation planning.
---

# Design stage

Use the user's request and current feature specification. This stage defines behavior and presentation; implementation architecture belongs in `$speckit-plan`.

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` from the repository root. Read `FEATURE_SPEC` and `.specify/memory/constitution.md`. If the specification is missing, run `$speckit-specify` first. For another feature, scope `SPECIFY_FEATURE_DIRECTORY=specs/<feature>` to the command; do not guess the feature from the Git branch.
2. Read existing `FEATURE_DIR/design.md`, UX documents, and prototypes referenced by the spec. Inspect affected components, `client/src/renderer/src/styles.css`, and `docs/performance.md` when relevant. Reuse existing behavior, vocabulary, and CSS tokens.
3. Resolve the handoff template with `.specify/scripts/bash/resolve-template.sh design-template --json`. Create or update `FEATURE_DIR/design.md` from `TEMPLATE_CONTENT`. Preserve prior decisions and user edits; list unresolved decisions explicitly.
4. For visible changes, create or update `docs/ux/<feature>.md`. Describe the person's goal, entry points, states, transitions, exact labels, empty/loading/error behavior, cancellation, focus, keyboard interaction, scrolling, and what stays silent. Give thresholds and their reasons. Cover desktop and phone where affected; use platform-neutral wording.
5. When layout changes, create or update an interactive prototype in `docs/design/<feature>.html`, using existing tokens and representative content. Use an existing prototype when it covers the change. Preserve a user-owned draft by writing a separate proposed revision. For Electron behavior that needs preload, mount the real component and app stylesheet in a browser preview with a narrow mock of the required contract.
6. Review any new or changed prototype in Chrome at the supplied viewport size, or record the desktop and phone sizes used when none was supplied. Click through affected states in light and dark themes; check layout, scrolling, focus, keyboard behavior, and labels. Record results and evidence in `design.md`. If browser review is unavailable, record the unverified states and limitation instead of claiming validation.
7. Map the design decisions and validation scenarios to spec story/requirement IDs. Link the UX document and prototype from `design.md` with paths relative to the feature directory. If there is no visible change, record why UX and prototype artifacts are not applicable; do not create empty artifacts.
8. Report the design handoff and artifact paths, unresolved decisions, and readiness for `$speckit-plan`. Mark approval only when the user has actually approved the design; existing authorization to implement may already cover it. Revise the documents first when a later stage changes agreed behavior.

Done when the feature has a design handoff, visible behavior is documented, layout changes have a reviewed prototype or an explicit review limitation, and downstream planning can identify the design decisions and remaining questions.
