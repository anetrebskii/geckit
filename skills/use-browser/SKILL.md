---
name: use-browser
description: Work on websites through GeckIt, in the person's Chrome or a GeckIt test browser - open, read, click and type, screenshots, styles, layouts and animations, sign-in links for test profiles, and passwords or keys requested by link and used without being seen. Use for any website or Chrome task.
---

# Use the browser through GeckIt

## Browser boundary

Use `{{said}} browser` for all browser actions and page reading through GeckIt's browser integration. GeckIt's own test browser is available only for the documented test-browser scenarios.

Work only in the tab the person named or a new background tab you open for this task. Do not take over unrelated tabs or switch Chrome profiles to find the target tab.

If `{{said}} browser profiles` reports no ordinary Chrome profiles, or none has GeckIt Browser, use `{{said}} browser start geckit`, then `open <url> --profile geckit`. Missing Chrome profiles do not block this fallback on macOS or Linux. GeckIt automatically downloads Camoufox on first use when it is missing and reuses it afterward.

In this order:

1. Do what the person asked and reach the result with any GeckIt browser command available.
2. Wherever possible, act as a real person would: move the pointer, click, type on the keyboard and scroll.
3. Where no human action can do a step, use automation such as `eval`, including to fill fields or put files into an `input[type=file]`.

If GeckIt's browser integration is unavailable, disconnected, paused or denied, or no GeckIt browser command can do a step, report the specific failure and stop the affected browser work. Do not fall back to other browser tools, direct page fetching, Playwright/CDP, AppleScript or native computer control. GeckIt's documented test browser is not a way around a refusal or permission denial.

Native provider permissions still apply. This browser requirement grants no new permission: do not bypass a denial, change permissions, extract credentials or switch profiles to evade a restriction. Publish, post, send, buy or delete nothing the person did not ask for.

## Purpose

Reach the result the person asked for on a website.

## Inputs

For profile creation or account reuse, load `{{profilesSkill}}` from {{profilesPath}} first.

- When the site or account cannot be told from the request, ask.
- `{{said}} browser profiles` lists Chrome profiles. Pick one before opening anything: for a site that needs an account, the profile signed in to it, by email; for a public page, the one used last; when two fit and the choice matters, ask.
- `open <url> --profile <email or name>` opens a tab there; `pages` lists tabs by profile, and a tab id needs no `--profile` after that. `start <profile>` opens a closed profile that has GeckIt Browser. A profile without it cannot be used: say so and name those that can.
- For a site the extension cannot reach, work kept away from the person's tabs, or no usable profile, read [test browsers](references/test-browsers.md) first.

## Work

```
{{said}} browser pages
{{said}} browser find <tab> "the reply button under the second post"
{{said}} browser read <tab>
{{said}} browser click <tab> <ref>
{{said}} browser type <tab> <ref> "text"
{{said}} browser text <tab>
{{said}} browser shot <tab>
```

- Start with `find`: it returns the matching `[ref] role "name"` lines. `read` lists every heading and control; use it when `find` misses.
- One command per call. `text` gives the main text; `shot` prints a PNG's path. `{{said}} browser help` lists the rest.
- No command reaches a file chooser's dialog. Upload with `eval <tab> -`: a stdin script builds each `File` from base64 into a `DataTransfer`, sets the `input[type=file]`'s `files`, dispatches a bubbling `change`. Check the previews.
- Refs hold until reload; after a click changes the page, read again.
- For a design, layout or animation check, read [design checks](references/design-checks.md). When the work needs a password, API key or SSH key, use {{secrets}}.

## Unknowns

Take refs and page state from the latest `find` or `read`, never from memory. Hand a missing sign-in, a captcha or a payment step to the person. Quote a refused or failed command as it came back.

## Output

Reply in the person's language: what was done, the full address of each page changed, what is left. A link the person must open goes in the final message of the turn, never only in a command's output.

## Verification

After a change, read the page again or take a shot and confirm the change shows. If not, say so.
