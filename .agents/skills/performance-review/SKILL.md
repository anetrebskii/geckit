---
name: performance-review
description: "Review GeckIt changes against the performance checklist in docs/performance.md before calling them done. Use after any change to the renderer (Chat window, board, lists, menus, pickers, hover, animations, CSS, the phone's Chat), before committing or pushing such a change, and whenever the request sounds like \"review for performance\", \"is this slow\", \"check against the checklist\", \"it feels laggy\"."
argument-hint: "Optional: a commit, branch or file to review instead of the working tree"
---

# Performance review against the checklist

The checklist is `docs/performance.md` in this repository. It is the only copy: read it in full at the start of every review, and never review from memory of it, since items are added as new slowdowns are found.

## 1. What to review

- With no argument: `git diff` and `git diff --cached` of the working tree, plus new files from `git status --short`.
- With a commit, branch or file: that, against `main`.

Only renderer code and CSS are in scope: `client/src/renderer/`, `client/src/shared/` where the renderer uses it, and `mobile/` where it draws. Say so and stop if the change touches none of it.

## 2. How to review

1. Read `docs/performance.md`, section 1, and take each checklist item in turn.
2. For each item, decide whether the change touches what it is about. An item about memoized rows is touched by a change to a component drawn once per conversation, row or result, or to anything it compares. An item about formatters is touched by any `toLocale...String` or `Intl` call. An item about animation is touched by any `animation`, `transition` or `@keyframes`.
3. For each touched item, read the changed code and the code around it, not only the diff: a memo comparison, the props a row is given, where a callback comes from. Decide `holds`, `broken` or `cannot tell without measuring`.
4. For each `broken`, name the file and line, what goes wrong, and the fix in the form the checklist gives, pointing at the place in the code that already does it right (`BoardCard` in `Board.tsx`, `sameAsBefore` in `useChat.ts`, `pointAt` in `Projects.tsx`, `spinner-turn` in `Icon.tsx`).
5. When something new was slow and the checklist has no item for it, say so and propose the item, with where it was found.

Do not fix anything unless asked: this is a review. When asked to fix, fix only what was reported `broken`, and run `npm run typecheck`, `npm run lint` and `npm run test` in `client/` afterwards.

## 3. When to measure

Measure in the running dev app, as section 2 of `docs/performance.md` says, when an item is `cannot tell without measuring`, or the change adds a list, a card, a row, a hover or an animation drawn many times. The dev app is the one Alex is using: measure passively while he works, and drive it with synthetic input only when he asks. Numbers from the dev build are inflated by React's development-only work, so compare before and after under the same build.

## 4. The answer

The first line says where the change stands: `No performance problems found`, `N problems found`, or `Needs measuring: <what>`.

Then one row per touched item:

| Item | Verdict | Where | What |
|---|---|---|---|
| A component drawn once per conversation is memoized | broken | `Board.tsx:742` | compares `chat.sessions` whole, so every list update draws every card again |

Items the change does not touch are left out, with one line saying how many.
