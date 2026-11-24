## Test browsers

A test browser is Camoufox that GeckIt starts and drives itself, with a profile kept under a name, `geckit:<name>`, so whatever is signed in there stays for next time. Use one when:

- a regular website cannot be reached through the person's Chrome extension. Camoufox uses Firefox and cannot open Chrome's `chrome://` or extension pages;
- the work stays away from the person's own tabs and accounts: checking an app on localhost, trying a sign-up as a new user, a design check that must not touch their windows;
- no ordinary Chrome profiles are available, or no Chrome profile has GeckIt Browser.

Otherwise use the person's own Chrome: it has their accounts. `open <url> --profile geckit` starts or reuses the persistent test browser for the conversation's registered project and returns a tab owned by the conversation. Additional opens add tabs to the same Camoufox window. The person and conversations in the same profile share sign-ins and own separate tabs. In `pages`, `[read-only]` marks other owners' tabs. Use `text`, `read`, `find`, `style` or `wait` to inspect one when the task calls for it. Open your own tab for interaction. Moving the card to Done closes its tabs and popups. The browser shuts down when its last tab closes and keeps sign-ins for next time.

In a test browser, `click`, `hover` and `type` move the real cursor and press real keys, and `scroll` turns the real wheel. Always use them; use `eval` only when they block what the person asked for.

Pages in a test browser cannot see GeckIt: refs and secret marks stay outside the page, and the pointer is drawn only on `shot --pointer` and `record --pointer` pictures. Every test browser has uBlock Origin. On a Linux server, test browsers run in a virtual display and present one Ubuntu desktop; a profile from before keeps what it showed until `geckit browser profiles device <name> --desktop`, which the person decides on because sites then see a new device.

When work needs a particular account, use an account profile: `profiles` lists each `geckit:<name>` with its description, if it has one; pick the profile whose description names the site and account the work needs, and ask the person when none does. A conversation may select it with `--profile geckit:<name>` only when its project mapping allows that profile. When the person asks for one, or there is none for the account the work needs, make it with `profiles create <name> --note "<site> as <who>"`, a name of your own such as `github-work`, and tell the person the name so they can ask for it later. Follow the browser profile skill for a sign-in link. On another computer add `--computer <name>` to each command.

The person can also configure separate account profiles in `~/.geckit/browser-state/test-project-profiles.json`: each registered project folder maps to an array of allowed profile names; only those explicit names may be selected with `--profile geckit:<name>` (a single string also sets that project's default). The first start downloads Camoufox, about 150-180 MB in a font-free GeckIt repack using this computer's system fonts, and says so: wait for installation to finish; the requested browser opens automatically.


## Keep pages in one window

Use `open <url> --profile geckit` for each page that should stay open. Use `go <tab> <url>` to replace a page in a task-owned tab. GeckIt opens a separate window for a `data:` address or when all existing tabs are busy or block opening tabs. A site may also open its own popup window.

The current CLI has no command to merge existing Camoufox windows or move a page between them. Do not claim that a page list proves windows were combined. Preserve pages containing sign-in progress, unsaved input or one-time keys. With authorization to consolidate, recreate only pages whose state can be discarded, verify their replacements, then close the original task-owned pages. Report any window that remains separate.
