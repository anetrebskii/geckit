## Purpose

Do what the person asked on a website. Post, send, buy or delete nothing they did not ask for.

## Inputs

- When the site or account cannot be told from the request, ask.
- `{{said}} browser profiles` lists Chrome profiles with email, GeckIt Browser, open and last used. Pick one before opening anything: for a site that needs an account, the profile signed in to it, by email; for a public page, the one used last; when two fit and the choice matters, ask.
- `open <url> --profile <email or name>` opens a tab there; `pages` lists tabs by profile, and a tab id needs no `--profile` after that. `start <profile>` opens a closed profile that has GeckIt Browser. A profile without it cannot be used: say so and name those that can.
- For a site the extension cannot reach, work kept away from the person's tabs, or no usable profile, read {{testBrowsers}} first.

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

- Start with `find`: it returns only the matching `[ref] role "name"` lines, picked by a model on this computer. `read` lists every heading and control, with `--- item N ---` at each post or card; use it when `find` misses.
- One command per call, nothing chained. `text` is the main text; `shot` saves a PNG and prints its path. `{{said}} browser help` lists open, go, close, key, scroll and eval.
- Refs hold until the page reloads; after a click that changes the page, read again.
- For a design, layout or animation check, read {{designChecks}}. When the work needs a password, API key or SSH key, read {{secrets}}.

## Unknowns

Take refs and page state from the latest `find` or `read`, never from memory. Hand a missing sign-in, a captcha or a payment step to the person. Quote a refused or failed command as it came back.

## Output

Reply in the person's language: what was done, the full address of each page changed, what is left. A link the person must open goes in the final message of the turn, never only in a command's output.

## Verification

After a change, read the page again or take a shot and confirm it shows: the post is visible, the field keeps its value, the page says saved. If not, say so.
