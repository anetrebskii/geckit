# Design: Manual browser profiles and profile transfer

**Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)
**Status**: UX approved by Alex with "implement" on 2026-11-12; implemented in the working tree and reviewed in the actual renderer. See [verification.md](verification.md).

## Scope

Improve the existing profile list and creation form in Settings > Web Browser. Keep existing local browser opening, live remote sign-in and confirmed deletion. Add explicit CLI file backup/restore for one GeckIt-managed Chrome for Testing profile, without portable-authentication guarantees.

## Artifacts

- UX document: [browser-profile-management.md](../../docs/ux/browser-profile-management.md).
- Layout prototype: [browser-profile-management.html](../../docs/design/browser-profile-management.html).

## Decisions

Later user correction: rename the Settings section to "Web Browser" and make managing profiles its first and most prominent content. Follow Apple-like hierarchy and restraint through the installed build-product-ui skill, preserving GeckIt tokens; no separate Apple UI skill was found. Put extension connection/setup below profiles. Use a prominent New profile action, readable identity, secondary account text/status and quiet supporting actions.

Separate name, account note and open/closed status. Make New profile visible in the section header and Open browser the main row action. Use labelled form fields with their own space and retain failed input. Keep action groups readable on narrow screens. Use the product's existing components and stylesheet tokens.

Export/import operates on closed profile files and metadata, with new-name restore and no overwrite. Direct remote sign-in remains available. See UX sections 3-10 for transitions, exact wording and the proposed change to feature 025's scope.

## Requirement Coverage

| Story / Requirement | Design decision | Validation scenario |
| --- | --- | --- |
| US1, FR-001 to FR-005 | Existing Settings list and disclosed creation form | Create, cancel, validation, failure/retry, open, live sign-in and confirmed/cancelled deletion |
| US2, FR-006, FR-009 | Closed-profile export, private new output | Byte preservation, active-browser refusal, destination collision |
| US3, FR-007 to FR-010 | Validated import to new profile | Round trip, malformed archive/path refusal, cleanup and truthful authentication message |

## Review Evidence

Read the supplied screenshot, actual TestBrowsers component, Settings stylesheet, core handlers and CLI profile lifecycle. Screenshot defects: identity, account and status run together; actions dominate row width; creation inputs are compressed into one horizontal row. The UX state diagram was rendered with Mermaid 11 in the GeckIt project test browser through a temporary localhost server, then visually inspected; all eight states rendered without a parser error. Evidence: `/private/tmp/geckit-profile-flow.png` (initial rendering) and successful render check after adding the required semantic palette. The interactive layout prototype was inspected in full Settings context in dark at 1440x1000 and light at 760x900, including the disclosed form. The implemented Settings renderer was then inspected in light and dark themes at desktop and narrow sizes, with creation, failures, keyboard focus and long-list scrolling. Narrow connection actions overlapped and live-view Escape initially reached Settings; both defects were fixed and the affected checks passed. The creation form sits directly below the header. Native calls in renderer checks were simulated; actual account operations and cross-machine authentication remain unverified. Detailed receipts and boundaries are in [verification.md](verification.md).

## Open Decisions

No unresolved behavior decisions. The archive cannot guarantee portable sign-in.

## Planning Handoff

UX approval is recorded above. Use existing GeckIt tokens and real components in a browser harness if Electron boundaries need fixtures. Verify desktop and narrow sizes, light/dark, keyboard, scrolling and failures. Independently test backend collision/busy behavior, archive path safety and round-trip byte preservation. Do not restart the active GeckIt service to load changes. Preserve other sessions' current working-tree edits.
