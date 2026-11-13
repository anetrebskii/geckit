## Test browsers

A test browser is Camoufox that GeckIt starts and drives itself, with a profile kept under a name, `geckit:<name>`, so whatever is signed in there stays for next time. Use one when:

- a regular website cannot be reached through the person's Chrome extension. Camoufox uses Firefox and cannot open Chrome's `chrome://` or extension pages;
- the work stays away from the person's own tabs and accounts: checking an app on localhost, trying a sign-up as a new user, a design check that must not touch their windows;
- no ordinary Chrome profiles are available, or no Chrome profile has GeckIt Browser.

Otherwise use the person's own Chrome: it has their accounts. `start geckit` starts or reuses the one persistent test browser for this conversation's registered project folder. Then `open <url> --profile geckit` creates a page owned by this conversation; use its page id for the rest. In Camoufox, this command can create a separate visible window for each page. Conversations in the same project share the browser and sign-ins, with separate tabs; other projects use separate profiles. GeckIt refuses access to another conversation's test tabs. Moving this card to Done closes its tabs; the last owning conversation closes the browser while keeping cookies and sign-ins for next time. Do not close a shared browser yourself. A new profile is signed in to nothing, and you never type the person's password.

When work needs a particular account, use an account profile: `profiles` lists each `geckit:<name>` with its description, if it has one; pick the profile whose description names the site and account the work needs, and ask the person when none does. A conversation may select it with `--profile geckit:<name>` only when its project mapping allows that profile. When the person asks for one, or there is none for the account the work needs, make it with `profiles create <name> --note "<site> as <who>"`, a name of your own such as `github-work`, and tell the person the name so they can ask for it later. Then `signin <name>` prints a link: give it to the person, in the conversation or the thread they wrote from. It opens in GeckIt on their phone or computer, once, within 15 minutes, and shows that browser live so they sign in themselves. When they say they are done, run `signin <name> --done` and say which profile now holds the sign-in. On another computer add `--computer <name>` to each of these, and the profile lives there. Where no device is paired, `signin` says so: on a computer with a screen, `start geckit:<name>` opens its window for the person instead.

The person can also configure separate account profiles in `~/.geckit/browser-state/test-project-profiles.json`: each registered project folder maps to an array of allowed profile names; only those explicit names may be selected with `--profile geckit:<name>` (a single string also sets that project's default). The first start downloads Camoufox, about 150-180 MB in a font-free GeckIt repack using this computer's system fonts, and says so: wait for installation to finish; the requested browser opens automatically.


## Keep pages in one window

Reuse a task-owned page with `go <tab> <url>` when another page need not stay open. Do not use repeated `open` commands to promise tabs in one Camoufox window.

To request another tab from an existing task page, use the browser CLI's page evaluation without window features:

```sh
{{said}} browser eval <tab> "(() => { const opened = window.open('https://example.com', '_blank'); return { opened: opened !== null }; })()"
{{said}} browser pages --profile geckit:<name>
```

Take the new page id from `pages`. Check that its address matches the requested destination and that this conversation can read it. A non-null return means a page opened; it does not prove that the browser placed it in the same window. Ask the person to confirm the visible tab bar when the CLI cannot expose window placement. If a popup is blocked or another window appears, stop opening more pages and report that result.

The current CLI has no command to merge existing Camoufox windows or move a page between them. Do not claim that a page list proves windows were combined. Preserve pages containing sign-in progress, unsaved input or one-time keys. With authorization to consolidate, recreate only pages whose state can be discarded, verify their replacements, then close the original task-owned pages. Report any window that remains separate.
