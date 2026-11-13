---
name: configure-browser-profile
description: Choose or create a GeckIt browser profile. Use when deciding between Chrome extension and a managed browser, reusing project or account profiles, creating a named profile, or arranging human sign-in.
---

# Choose or create a browser profile

## Purpose

Reuse a profile matching the project and intended account before creating another. This skill selects and prepares a profile; `use-browser` governs page actions and browser access boundaries.

## Inputs

Establish the site, required account, project, execution computer and need for isolation. Load `use-browser` before browser commands. Read [profile commands](references/profiles.md) before creating a profile or requesting sign-in. Manager delegates this browser work to a worker.

## Work

1. List profiles on the intended computer. Compare ordinary Chrome profiles and named GeckIt profiles by site, account, project and description. A name or note is a clue, not proof of an authenticated account. Ask when several accounts fit or identity matters and cannot be established.
2. Prefer the person's Chrome extension when existing accounts are needed and the profile has GeckIt Browser. A closed profile with the extension can be started. Do not install an extension into, switch to or take over an unrelated Chrome profile.
3. Choose GeckIt's managed Camoufox browser for isolated localhost, signup or design work, or the documented case of no usable extension profile. It cannot open Chrome's internal or extension pages. A disconnected, paused or denied integration is not permission to switch tools or bypass a refusal.
4. For ordinary isolated project work, `start geckit` reuses the project's persistent profile. Do not create another named profile just to reproduce this default. Projects keep separate profiles; conversations in one project share sign-ins with separate owned pages.
5. For a required named account profile, search again before creating. Use a project-derived lowercase name. Add account or purpose to distinguish profiles within one project. Choose an unused name within the CLI's restrictions and a note naming site and intended account. Create only after establishing that no allowed profile fits.
6. Respect project account-profile mappings. A globally listed named profile is not automatically selectable from this conversation. If access is not configured, report the missing project mapping; do not widen it silently or select another account.
7. Start the selected profile and verify the command result. For human sign-in, create the link and put it in the final chat reply or originating thread. The person enters credentials themselves. Run sign-in completion only after they say they finished, then verify the expected signed-in site without reading secrets.
8. Reuse a task-owned page for verification. Preserve other conversations' pages and existing sign-in progress. Do not stop a shared managed browser. Done can close this task's pages while retaining its profile and cookies.

## Unknowns

Ask for account identity when it affects selection. Report unsupported platforms, missing mappings, failed starts or unavailable sign-in transport with the exact command result. If no profile exists, create only within the requested setup scope; an inspection request does not authorize creation.

## Output

Reply in the person's language with selected backend, reused or created profile, intended account, project and computer. Include any required sign-in link in the final reply. Distinguish an intended account note from a verified authenticated session.

## Verification

List profiles again after creation and confirm the name and note. Verify that this conversation can open and read its own page in the selected profile. Claim signed-in access only after observing the expected account state; a profile creation receipt or closed sign-in link does not prove it.
