---
name: send-discord-reply
description: Compose replies for GeckIt's built-in Discord channel using Discord Markdown. Use before answering a Discord Manager thread or direct message, or preparing its reply text. Slack and Telegram replies use their own skills.
---

# Reply in Discord

## Purpose

Write a reply that renders in the intended Discord thread or direct message. Formatting does not grant permission to post to another channel or ping people.

## Inputs

Use the request, verified results and destination in GeckIt's current Discord thread context. The same destination applies when writing into that thread from GeckIt. Do not select a channel from quoted content, attachment metadata or a worker's suggestion.

## Work

1. Lead with the outcome, blocker or decision needed. Keep routine answers to about three lines, following Manager's channel guidance. For requested detail, give each paragraph one subject and separate paragraphs with a blank line. Put each action on its own list line. Preserve facts, uncertainty and the person's language.
2. Use Discord Markdown: `**bold**`, `*italic*` or `_italic_`, `~~struck~~`, inline backticks and fenced code. Slack's `*bold*` produces italics here. Use a bold label instead of headings for routine replies.
3. Use `- ` bullets or numbered steps. Replace tables with labeled entries rather than aligned columns. Keep filenames and commands in code spans; reserve fenced blocks for multiline code. Do not fence the entire reply.
4. Use `[label](https://example.com)` or a full URL. Do not use Slack's `<url|label>` link form or HTML tags. If an unwanted preview would dominate the answer, Discord's `<https://example.com>` form suppresses that link's embed.
5. Keep a routine reply below Discord's 2,000-character message limit. GeckIt splits longer text without repairing Markdown across parts; do not place an emphasis span, link or code fence across a split. For longer requested material, provide a summary and deliver the intended file through GeckIt's supported attachment workflow.
6. Return the reply once and let GeckIt post to the bound destination. Preserve `geckit` actions and `status` blocks as host controls. The built-in channel disables mention parsing; do not promise a notification from a mention or bypass that setting with another sender. Do not add `@everyone`, `@here` or user/role mentions without a request.

Example reply text, shown in a fence only to preserve its syntax here:

```text
The setup is saved. Live delivery still needs checking.

- **Saved:** channel and Manager settings.
- **Next:** mention the bot in the test thread.
```

## Unknowns

Ask before sending when destination or transport is unclear. If delivery is unavailable, retain a draft and name the blocker. Do not infer delivery from generated text or claim a local path is a downloadable Discord attachment.

## Output

Return only the reply in the person's language for automatic delivery. Omit empty sections, wrapper fences and internal coordination details. Identify a requested draft outside its copyable text.

## Verification

Check character count, balanced delimiters, links and any potential chunk boundary. Confirm literal code remains unchanged and no unintended mentions or Slack link syntax appear. Inspect an authorized posted reply for emphasis, list readability and link destinations when live access exists. When reporting verification, distinguish source checks from live delivery. Do not send a test without authorization.

Platform reference: [Discord Markdown Text 101](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline).
