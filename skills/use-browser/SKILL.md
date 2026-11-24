---
name: use-browser
description: Work on websites through GeckIt, in the person's Chrome or a GeckIt test browser - open, read, click and type, screenshots, styles, layouts and animations, sign-in links for test profiles, and passwords or keys requested by link and used without being seen. Use for any website or Chrome task.
---

# Use the browser through GeckIt

## Browser boundary

Use `{{said}} browser` for all browser actions and page reading. Use GeckIt's test browser only in the documented scenarios.

Work only in the tab the person named or a new background tab you open for this task. Do not take over unrelated tabs or switch Chrome profiles to find the target tab.

If `{{said}} browser profiles` reports no ordinary Chrome profiles, or none has GeckIt Browser, use `{{said}} browser open <url> --profile geckit`. Missing Chrome profiles do not block this fallback on macOS or Linux. GeckIt automatically downloads Camoufox on first use when it is missing and reuses it afterward.

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
- `{{said}} browser profiles` lists Chrome profiles with the name, `for:` description and Incognito access set in GeckIt Browser. Pick one before opening: the one whose description fits; for an account site, the one signed in; else the one used last; ask when two fit and it matters.
- `open <url> --profile <email or name>` opens a tab there. `pages` lists tab IDs usable without `--profile`. `start <profile>` opens a closed profile with GeckIt Browser. If the profile lacks it, name the available profiles.
- For a site the extension cannot reach, work kept away from the person's tabs, or no usable profile, read [test browsers](references/test-browsers.md) first.

## Work

- Start with `find <tab> "<what to find>"`. Use `read <tab>` when `find` misses. Click or type using the returned ref. Run one command per call. `{{said}} browser help` lists commands.
- For files, downloads, key combinations, dragging, the clipboard, waiting, dialogs, new tabs and frames, read [actions](references/actions.md).
- Refs hold until reload; after a click changes the page, read again.
- For design, layout or animation, read [design checks](references/design-checks.md).

### Sign-in

- When sign-in is required, default to a private, single-use link to the open tab via `{{profilesSkill}}`. In the same reply, offer to send a separate link to save the password if the site supports password sign-in. Send the credential link only after opt-in.
- Fill a password only after opt-in for that site and account. Use {{secrets}} for password entry, API tokens and SSH keys.
- For passkeys, 2FA or CAPTCHAs, pause and hand over the same tab, including after autofill. Keep one-time codes out of chat and the secrets form. After Done, GeckIt resumes. Skip timers and polling. Verify the expected account before continuing.

## Unknowns

Take refs and page state from the latest `find` or `read`, never from memory. Hand payment steps to the person. Quote a refused or failed command as it came back.

## Output

Reply in the person's language: what was done, the full address of each page changed, what is left. A link the person must open goes in the final message of the turn, never only in a command's output.

## Verification

After a change, read the page again or take a shot and confirm the change shows. If not, say so.
