# Implementation Plan: Browser profile management

**Checkout**: shared `main` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

Implement the approved [UX](../../docs/ux/browser-profile-management.md) and [design](design.md). Extract the existing profile section into a focused React component, preserve existing polling/live sign-in APIs, make creation exclusive at the backend, and add dependency-free streaming archive commands for closed GeckIt profiles.

## Technical Context

TypeScript 6, React 19, Electron 45 and Node 22. Use existing stylesheet tokens and shared API types. Profile data stays under the existing `.geckit/chrome-for-testing` directory; account notes stay in browser lifecycle metadata. Archive operations use Node filesystem, streams and gzip. Tests use Vitest and synthetic temporary profile files; rendered UI uses the actual Settings component with an explicit native boundary fixture. Target macOS, Linux and Windows; no new runtime dependency, network request, startup scan or polling interval. Stream bounded records and chunks instead of buffering profile contents. Scope is one existing Settings section and two CLI commands.

## Constitution Check

Pass before and after design: existing provider credentials and native boundaries remain; account state is never asserted from profile files; no OS credential store copied; existing shared API reused; platform-neutral paths; token-based UI; browser verification and pure filesystem tests planned. No constitutional exception or new abstraction layer.

## Structure

- `client/src/renderer/src/ui/BrowserProfiles.tsx`: profile list, form, errors, operation guards and focus.
- `client/src/renderer/src/ui/SettingsDialog.tsx`, `styles.css`: integration and scoped layout.
- `client/src/cli/testing.ts`, `browser-lifecycle.ts`, `core/application.ts`: exclusive creation, lifecycle locks, truthful failed-open result.
- `client/src/cli/profile-archive.ts`, `browser.ts`: archive validation and public command dispatch/help.
- `client/test/browser-profile-archive.test.ts` and related lifecycle/CLI tests: real temporary-file round trip and failure cleanup.
- `client/test/browser/browser-profiles/`: actual Settings renderer with fixture controls and recorded native calls.

## Delivery and Verification

Independent UI and backend ownership follows the research handoff. Preserve unrelated edits in this shared checkout. Run focused tests, typecheck, lint, desktop build and mobile shared-renderer build. Inspect actual Settings in light/dark, desktop/narrow widths, scrolling, keyboard/focus and operation failures. Archive tests cover bytes, metadata, locks, collisions, malformed/truncated input and path safety. Cross-machine authentication remains unverified. Update feature evidence and the day-plan result. Do not commit, push or restart the active service.
