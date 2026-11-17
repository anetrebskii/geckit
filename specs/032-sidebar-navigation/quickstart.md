# Quickstart: validating sidebar navigation

## Prerequisites

- The worktree with `client/node_modules` installed.
- For Q1 to Q6, a running renderer that no one else is using: the dev app (`npm run dev` in `client/`, data in `geckit-local`) when it is free, or a renderer preview on a fake backend. State which one was used.

## Automated

From `client/`:

```bash
npm run typecheck
npm run lint
npm run test
```

Expected: typecheck without errors; lint without findings in changed files; the suite passes, including `test/places.test.ts`.

## Rendered scenarios

| ID | Steps | Expected |
| --- | --- | --- |
| Q1 | Open Chat at 1180 px; choose each sidebar item | Each place fills the content area; the item is marked current; Settings lists no Checklists, Browsers or Secrets, and still lists Hosts |
| Q2 | Open a conversation, type a draft, choose Team, then Tasks | Same conversation, draft and scroll |
| Q3 | Choose Manager, quit and reopen | Manager is shown |
| Q4 | Resize to 820 px; press Cmd+Ctrl+S; choose a place | Icons only with tooltips; names open over the content and close on choosing |
| Q5 | Light and dark themes for Q1 and Q4; tab through the sidebar | Readable in both; focus ring on each item; no clipped names |
| Q6 | Phone at 390 x 844: press Menu, choose each place; leave a conversation waiting while on Settings; turn a channel off | Menu closes on choosing; amber dot with "Menu, a conversation is waiting for you"; the channel row says Off |

Record results, the backend used and anything not checked in `docs/plans/sidebar-navigation.md`.
