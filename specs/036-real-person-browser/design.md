# Design handoff: Test browser that looks like a real person

This feature adds no screen and changes no layout. What a person sees:

| Where | Change | Source of the wording |
|---|---|---|
| Live view (`chat/LiveView.tsx`) | The pointer is drawn by GeckIt over the frame instead of inside the page. It must look and move exactly as today. | `docs/ux/chrome-cursor.md` (unchanged look) |
| Camoufox window | uBlock Origin's toolbar icon appears. | Not GeckIt's UI. |
| `geckit browser` output | New command, profile line suffix, start failures and log lines. | [contracts/cli.md](contracts/cli.md) |

Before implementation, `docs/ux/chrome-testing.md` gains a section "Looking like a person" with: what pages can no longer see, uBlock Origin by default, the Linux virtual display and its failure, the server desktop identity, why profiles from before keep their presentation, and the exact wording from [contracts/cli.md](contracts/cli.md). `docs/ux/chrome-cursor.md` gains one line: in test browsers the pointer is drawn over the picture, not in the page.

Validation constraints for the plan: the pointer's look, size and motion in the live view and recordings match the current ones side by side; no wording other than the contract's is shown.
