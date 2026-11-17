# Implementation Plan: Sidebar navigation

**Branch**: `feat/sidebar-navigation` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/032-sidebar-navigation/spec.md`

**Note**: the code was written before this plan was filed, from the approved UX document; this plan records the approach taken.

## Summary

Give the Chat window a left sidebar listing GeckIt's places, turn the dialogs and overlays reached from the board's bar into pages, and on the phone replace the tab bar with a left menu holding the same places. The board stays mounted under any other place, so returning to Tasks restores it unchanged. The design handoff is [design.md](design.md); behavior and wording are in [docs/ux/sidebar-navigation.md](../../docs/ux/sidebar-navigation.md).

## Technical Context

**Language/Version**: TypeScript, React 19, Node 22+ (ESM)

**Primary Dependencies**: Electron with electron-vite; hand-written CSS with the tokens in `styles.css`; Capacitor for the phone. No new dependency.

**Storage**: the service-owned settings file gains `chatPlace` and `navNames`; the phone keeps its own place in the web view's storage under `phonePlace`, as it kept `phoneTab`.

**Testing**: vitest. Pure place logic in `client/test/places.test.ts`; the phone board fixture in `client/test/board-groups.test.ts`.

**Target Platform**: macOS, Windows, Linux desktop; iPhone and Android through the phone app.

**Project Type**: desktop app with a phone client sharing the Chat renderer.

**Performance Goals**: switching places shows the new place on the next frame; the board is not re-mounted or re-read when returning to Tasks.

**Constraints**: no literal colours beyond those the stylesheets already use; one term per concept on all systems; settings never in renderer storage on desktop; the phone reaches only calls listed for it.

**Scale/Scope**: 9 places plus the computers group; 4 phone pages made top-level.

## Constitution Check

| Principle | Status |
| --- | --- |
| I. The person's own plan | Not affected: no session is started differently. |
| II. One contract between main and windows | Pass: the two settings fields are added to `shared/api.ts`, `configuration.ts` and `agent-settings.ts`; the phone's new abilities (list, history and remove secrets; turn a channel on or off) are entries in main's phone call map and `phone.ts`. The phone keeps only its own place locally, as it kept its tab; that is phone UI state, not a setting. |
| III. Recorded output, not live calls | Pass: the place rules are pure functions in `chat/places.ts`, covered by vitest; the suite passes offline. |
| IV. UX before pixels | Pass: UX document and both prototypes approved before code; differences found while building are in the UX document's "Implementation notes". |
| V. Every system, one word | Pass: copy says "computer"; the names key is Cmd+Ctrl+S on macOS and Ctrl+Alt+S elsewhere. |
| VI. Tokens only | Pass with the existing exceptions: white text on the amber count, black shadows and the phone's `--asks` fallback amber, as `styles.css` and `phone-home.css` already use them. |

Post-design re-check: no new violation.

## Project Structure

### Documentation (this feature)

```text
specs/032-sidebar-navigation/
├── spec.md
├── design.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── phone-calls.md
│   └── places.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/shared/api.ts, configuration.ts, agent-settings.ts   settings fields
client/src/renderer/src/chat/places.ts        pure place rules
client/src/renderer/src/chat/PlacePages.tsx   AppNav and the desktop pages
client/src/renderer/src/chat/places.css       sidebar and page layout
client/src/renderer/src/chat/Chat.tsx         shell, keys, inert board
client/src/renderer/src/chat/Board.tsx        trimmed top bar
client/src/renderer/src/ui/SettingsDialog.tsx SectionBody and SettingsPage
client/src/renderer/src/employees/Team.tsx, chat/ShortcutList.tsx   page mode; remote/Computer.tsx   useComputers shared by the sidebar and the phone bar
client/src/renderer/src/chat/PhoneHome.tsx    left menu
client/src/renderer/src/chat/PhoneKit.tsx     PhoneMenu context and MenuButton
client/src/renderer/src/chat/PhoneBoard.tsx, PhoneSearch.tsx, PhoneSettings.tsx, PhoneBrowser.tsx, PhoneShortcuts.tsx, ManagerInspection.tsx, employees/PhoneTeam.tsx   phone pages
client/src/renderer/src/chat/phone-home.css   drawer
client/src/main/index.ts, renderer/src/phone.ts   phone calls
client/test/places.test.ts, recurrence.test.ts, product-rpc.test.ts, board-groups.test.ts
```

**Structure Decision**: the existing client layout. Place rules live in a pure module so they are tested without rendering; page components reuse the existing Team, ShortcutList and settings sections, and the computer selector's list in a page mode rather than copying them.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Board kept mounted under an absolutely placed page | Returning to Tasks must restore drafts, scroll and the open conversation (FR-003) | Unmounting the board would lose drafts and re-read the list on each return |
| `PlacePages.tsx` beside `places.ts` | macOS file systems ignore case, so `Places.tsx` and `places.ts` collide | One file would mix pure rules with components and lose the cheap unit tests |
| `Chat.tsx` grows by about 40 lines past the 400-line guide | It already held the window's shell and keys (about 1100 lines); the place state and its keys belong with them | Splitting the existing file is a separate refactor; the new rules went to `places.ts` and the new components to `PlacePages.tsx` |
