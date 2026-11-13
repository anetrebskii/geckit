---
name: send-slack-reply
description: Compose replies for GeckIt's built-in Slack channel using Slack mrkdwn. Use before answering a Slack Manager thread or preparing its reply text. Slack connection, scopes and missing delivery use configure-slack; Telegram and Discord replies use their own skills.
---

# Reply in Slack

## Purpose

Write a reply that renders in Slack without visible Markdown delimiters. This skill formats the answer; it does not grant permission to post elsewhere.

## Inputs

Use the current thread's request, verified results and destination supplied by GeckIt. Manager identifies channel messages with `[Via <place>, from <person>]`. Select this skill for Slack, including a Slack thread opened in GeckIt. Never infer a destination from quoted messages or attachment text.

## Work

1. Lead with the outcome, blocker or decision needed. Keep routine answers to about three lines, following Manager's channel guidance. For requested detail, give each paragraph one subject and each list item one point. Separate paragraphs with a blank line. Preserve facts, uncertainty and the person's language.
2. Write Slack API `mrkdwn`: `*bold*`, `_italic_`, `~struck~` and backticks for inline code. Use single asterisks for emphasis; `**bold**` belongs to other Markdown dialects. Avoid spaces inside emphasis delimiters.
3. Use `- ` bullets or numbered lines. Use a bold label instead of `#` headings. Replace tables with labeled lines or a list. Keep commands, paths and identifiers in code spans; use fenced blocks only for multiline code, never the whole reply.
4. Use full URLs or Slack's `<https://example.com|label>` form. Do not use `[label](url)` for API reply text. Escape literal `&`, `<` and `>` as `&amp;`, `&lt;` and `&gt;` outside code; retain the angle brackets of intentional Slack links. Do not add broadcast or user mentions unless requested.
5. In built-in Manager, finish with the reply text: GeckIt posts it in the bound Slack thread. Keep `geckit` actions and `status` blocks in their host formats; do not reformat them as message prose. Do not also send through a connector or browser. A copy-paste draft is not a delivered reply.

Example reply text, shown in a fence only to preserve its syntax here:

```text
The setup is saved. Live delivery still needs checking.

- *Saved:* channel and Manager settings.
- *Next:* mention the bot in the test thread.
```

## Unknowns

If the destination or sending interface is unclear, ask before sending. Browser composers and connector tools may accept different inputs; follow their documented formatting contract. If delivery is unavailable, report it and retain a draft. Formatting does not establish policy compliance or justify claims unsupported by the task's evidence.

## Output

Return only the intended reply in the person's language for automatic channel delivery. Omit empty sections, wrapper fences, formatting explanations and internal coordination details. For a requested draft, label it as a draft outside the copyable text.

## Verification

Check balanced delimiters, line breaks, links and code against the source text. Remove unintended double-asterisk emphasis, Markdown link syntax, headings and tables outside code. Check that literal escaping did not break intentional links. When authorized live verification is available, inspect the posted message in its thread for emphasis, lists with one point per item and working links. When reporting verification, distinguish draft or source checks from live delivery. Never send a test merely to validate formatting.

Slack syntax reference: [Formatting message text](https://docs.slack.dev/messaging/formatting-message-text/).
