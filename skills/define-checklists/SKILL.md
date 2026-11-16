---
name: define-checklists
description: Define, revise or remove saved GeckIt task checklists, shared or for one folder - ordered results a task must reach, each with an optional description and check. Use when asked to create a checklist, workflow or definition of done, or to set a folder's default checklist.
---

# Define task checklists

## Purpose

Save the results a kind of task must reach, in order, so new tasks can start from them. GeckIt sends a task's checklist to its assistant as its goal and keeps it working until every item holds.

## Inputs

Establish what kind of task the checklist is for, which folder it belongs to or whether it is shared, and whether it should be that folder's default. Read [checklist commands and item format](references/commands.md) before saving. Read the existing checklists first with `checklists list`, or `checklists list --project <folder>` for the ones a folder is offered.

## Work

1. Compare the request with the existing checklists. Edit the one that covers the same kind of task instead of adding a near copy under another name. A checklist used by one folder belongs to that folder; one that fits every folder is shared.
2. Write each item as a result that is true when the step is done, not an action: "Tests cover the change and pass", not "Write tests". One result per item, in the order they must hold. Keep the list short; more than ten items usually mixes steps with results.
3. Put how to prove an item, and what must not change, in its description. Keep it to a sentence; the whole checklist travels as one goal, and long descriptions may not fit.
4. Choose each item's check. `command` when a command proves it, with that command; it passes when it exits with 0. `person` when the person must approve before work goes on. `review` when the evidence must be shown in the conversation. `none` when the assistant's own word is enough. Mark `final` an item that later steps can break, such as tests after later edits: after the last item, the assistant confirms it still holds. `final` is ignored on `person` items.
5. Use commands that exist in that folder. Read its package scripts, Makefile or README rather than guessing `npm test`. A shared checklist cannot assume one folder's commands; leave the check `review` there, or make a folder checklist.
6. Set `--default` only when the person asks for it. A folder has one default; saving another replaces it. New tasks in that folder, and CLI starts with no goal or checklist, then use it.
7. Remove a checklist only when asked. Tasks already started keep their copy, and shortcuts keep the goal they were saved with.

## Unknowns

Ask which folder a checklist is for when the request does not say and more than one fits. Ask before inventing a check command that the folder does not show. When the person describes steps rather than results, propose the results and confirm them before saving.

## Output

Reply in the person's language with the checklist's name, where it belongs, whether it is the default, and its items in order with their checks. Say that tasks already running are unchanged.

## Verification

Read the saved checklist back with `checklists show --id <id>`. Confirm its folder, default flag, item order, checks and commands match what was agreed, and that its `goal` text reads as one coherent instruction.
