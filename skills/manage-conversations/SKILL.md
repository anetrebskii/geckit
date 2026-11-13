---
name: manage-conversations
description: Inspect GeckIt conversations and history, request separate conversations for independent work, and track linked results. Use for board status, prior conversation decisions, delegating work through GeckIt, or checking tasks requested from this conversation. Personal day plans and reminders use their own tools.
---

# Manage GeckIt conversations

## Purpose

Find evidence in GeckIt history or request independent work as its own conversation. Do not move the current task or a step you are about to perform into another conversation.

## Inputs

Use the person's request and the current conversation. Read [commands and delegation rules](references/commands.md) before any conversation command. This reference includes the platform's batch syntax. For another computer, read [computer selection](references/other-computers.md) and list the paired computers first.

Select projects from `{{said}} sessions` output. When the project or requested work cannot be identified, ask. If access fails, report the command's error; do not reconstruct missing history from memory.

## Work

- Inspect `sessions --today`, `sessions --since 2d`, or `show <id> --last 10` for the requested evidence. Read older messages when the last ten do not resolve it.
- Read `linked` and the linked conversation before starting duplicate work or reporting its state.
- Request another conversation for independent work the person requested, an out-of-scope defect, or a part that can proceed separately. Keep personal reminders and day-plan records in their designated tools.
- Send at most 20 requests in one background command. Each request names the project, a title, self-contained instructions with evidence and paths, and an optional observable goal.
- Requests wait for the person's answer. Report started, queued and refused results separately. Follow a refusal; do not resend it to evade the answer.
- Before developing GeckIt, run `{{said}} instructions app`; for provider libraries, run `{{said}} instructions providers`.

## Unknowns

A matching project or title does not prove that two conversations concern the same task. Read the latest request and answers before continuing an existing one. Unknown or unavailable history remains Unknown. A new conversation grants no additional permissions.

## Output

Reply in the person's language with the requested history or each requested conversation's identifier, state and result link. Say when no conversation matches. Distinguish a pending request from work that has started.

## Verification

Check `linked` and `show` before claiming another conversation finished. Compare the returned task and project with the request. Report inaccessible or incomplete history and pending confirmations.
