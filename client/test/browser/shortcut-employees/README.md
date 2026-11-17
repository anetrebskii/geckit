# Shortcut employee browser fixture

From `client/`:

```sh
npx vite --config test/browser/shortcut-employees/vite.config.ts
```

Open `http://127.0.0.1:5202/test/browser/shortcut-employees/index.html`. Preview controls switch Light/Dark and Desktop/390px phone. `?preview=phone` embeds the real phone renderer in a 390px iframe; `?phone=1` opens it directly. Add `?theme=dark` or combine parameters. Reload resets synthetic data.

Uses actual `ShortcutList`, `PhoneShortcuts`, `ShortcutSheet`, employee components and application styles. Covers assigned/unassigned/archived/unavailable employees and long names. Desktop search and both real editors remain interactive. Save, reassignment, assignment removal, cancel and deletion use the real component handlers.

Only native API boundary is replaced: model discovery returns a fixed catalog; shortcut saves/removals update fixture state; Run records an attempt and never starts a task. Visible evidence reports saves and runs. `window.shortcutFixture` exposes `saves`, `removed`, `runs`, `navigations` and mutable `failSave` (phone preview has its own window/state). Browser saves prove request/response rendering, not disk persistence, actual accounts, scheduling or device integration.

```sh
npx tsc --noEmit -p test/browser/shortcut-employees/tsconfig.json
```


Destination controls use the actual `ShortcutDestinations` component. Add `destination=ready|loading|empty|error|legacy|unavailable|failed|uncertain` to select the native boundary state. Ready includes duplicate Discord channel names, a long name, Slack and unsupported Telegram. Legacy omits the host capability; unavailable keeps the removed saved identity. Failed/uncertain are synthetic completed run journal entries. The Mark fixture delivered button emits a synthetic native run event without reload or external writes; its result URL must not be mistaken for a real receipt.

Add `surface=team` for the actual desktop Team detail, or `phone=1&surface=team` for PhoneTeam. Theme links return to the Shortcuts surface, so keep `surface=team` in the URL when reviewing Team in both themes. The Fail save control, or `window.shortcutFixture.failSave` on the direct phone page, rejects the native save boundary while preserving the real form handlers. The phone iframe has a separate window and fixture state.

Recorded acceptance evidence and light/dark desktop/phone screenshots: [verification report](../../../../docs/reports/shortcut-destinations.md). No fixture path sends a result to a connected channel or starts a real task.
