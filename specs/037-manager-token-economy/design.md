# Design handoff: Manager token economy

| Where | Change | Source of the wording |
|---|---|---|
| Manager page, Setup (desktop and phone) | New row "Compact conversation at" with a token number and an off switch; a note when the assistant can't compact. | [contracts/manager-setting-and-wording.md](contracts/manager-setting-and-wording.md) |
| Manager thread state pill and status | Two new states: "Limit reset" and "Compacting". | same |
| Channels (Slack, Telegram, Discord) | Nothing new is posted at a reset or during compaction. | same |

Before implementation, `docs/ux/manager-threads.md` gains a section "Keeping Manager cheap" covering: which worker changes wake Manager, grouping, compaction (threshold, when, what the person sees), and the limit-reset rule with the exact wording from the contract. The Setup row follows the existing rows of `ManagerSettings` (`client/src/renderer/src/chat/Manager.tsx`); no prototype is needed because it adds one row of an existing pattern.

Validation constraints for the plan: the row reads correctly in light and dark, on desktop and phone widths; the states appear only in the cases the spec names; no channel receives an automatic message at a reset.
