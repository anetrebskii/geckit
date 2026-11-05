# Mission Control focus investigation - 2026-11-05

Status: candidate mitigation; the reported desktop switch is not yet verified after the change.

## Reported case

GeckIt is on Desktop 1. Activate another application there, enter Mission Control and choose Desktop 2, which has no GeckIt main window. macOS sometimes immediately returns to Desktop 1 and brings GeckIt forward. An open conversation is not required; the board is affected too.

## Evidence

- The running GeckIt Local had a visible, non-focusable gecko window on all Spaces. Its menu also joined all Spaces. Neither window explicitly opted out of Mission Control.
- A temporary main-process probe recorded four app activations followed by Chat focus without JavaScript calls to the existing windows' `show`, `focus` or `restore` methods. A separate, explicit Open GeckIt action did record calls through `gecko.ts` and `openChat`. The activation times were not correlated with an observed Mission Control transition, so they support an OS activation hypothesis without proving its cause.
- Electron's [upstream reproduction](https://github.com/electron/electron/issues/29644) describes the same desktop bounce when a non-focusable window is present on another Space. The issue also documents a Cocoa reproduction; it does not establish that this candidate mitigation fixes it.
- Electron 38.4's native implementation maps `hiddenInMissionControl` to `NSWindowCollectionBehaviorTransient`. Apple's [collection behavior documentation](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct?language=objc) describes this as floating in Spaces and hiding in Mission Control.

## Candidate change

Set `hiddenInMissionControl: true` on the macOS gecko and menu panels. Keep the existing non-activating panel type, all-Spaces visibility and explicit user actions that open Chat. Update the existing UX contract with the intended desktop-selection behavior.

## Checks performed

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- test/gecko.test.ts test/gecko-panel.test.ts`: 30 passed.
- Isolated native Electron smoke check bundled the actual changed `windows.ts` with temporary settings. Both real macOS windows reported exclusion from Mission Control, all-Spaces visibility and always-on-top. Neither was focused; the gecko remained non-focusable, the hidden menu remained focusable. No provider or service was used. The test process exited.
- Temporary focus listeners and method wrappers were removed and the diagnostic inspector was closed. No active conversation or service was restarted.

## Remaining verification

Native automation timed out when trying to enter Mission Control and again when accessing Dock. The actual desktop-selection sequence, its repeatability with the gecko hidden, and its behavior with the changed windows remain unverified. The smoke check proves the native flags and focus policy, not that macOS no longer switches back. The running app still has its previously loaded window code. No renderer layout, wording or styling changed; no light/dark visual review is claimed.

Before calling this fixed, reproduce with the original windows, compare with the gecko hidden, then repeat with the changed windows: another app active on Desktop 1, select Desktop 2, stay there. Cover both the board and an open conversation, and confirm the gecko menu still opens by click, handles keyboard selection and dismisses on blur.
