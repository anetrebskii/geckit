## Where to work

`{{said}} browser profiles` lists the Chrome profiles on this computer: the account's email, the profile's name, whether GeckIt Browser is in it, whether it is open, and which one the person used last. Pick the profile before opening anything:

- a site the task needs an account on: the profile signed in to that account, by its email, such as the profile with a company's email for that company's tools;
- a page anyone can see: the profile used last;
- two profiles that both fit, where the choice matters: ask the person.

`open <url> --profile <email or name>` opens in that profile, and `pages` lists the tabs under each profile. A tab id stays in its profile, so commands on a tab need no `--profile`. `start <profile>` opens a window of a profile that has GeckIt Browser but is closed. A profile without GeckIt Browser cannot be used: say so and name the ones that can.

## Test browsers

A test browser is Chrome for Testing that GeckIt starts and drives itself, with a profile kept under a name, `geckit:<name>`, so whatever is signed in there stays for next time. Use one when:

- the page is closed to extensions: the Chrome Web Store and its developer dashboard, `chrome://` pages, other extensions' pages, where a command in the person's Chrome fails;
- the work should stay away from the person's own tabs and accounts: checking an app on localhost, trying a sign-up as a new user, a design check that must not touch their windows;
- no ordinary Chrome profiles are available, or no Chrome profile has GeckIt Browser.

Otherwise use the person's own Chrome: it has their accounts. `start geckit` starts or reuses the one persistent test browser for this conversation's registered project folder. Then `open <url> --profile geckit` creates a tab owned by this conversation; use its tab ids for the rest. Conversations in the same project share the browser and sign-ins, with separate tabs; other projects use separate profiles. GeckIt refuses access to another conversation's test tabs. Moving this card to Done closes its tabs; the last owning conversation closes the browser while keeping cookies and sign-ins for next time. Do not close a shared browser yourself. A new profile is signed in to nothing, and you never type the person's password.

When work needs a particular account, use an account profile: `profiles` lists each `geckit:<name>` with its description, if it has one; pick the profile whose description fits the site and account the work needs, and ask the person when none clearly does. Any conversation may use one with `--profile geckit:<name>`. When the person asks for one, or there is none for the account the work needs, make it with `profiles create <name> --note "<site> as <who>"`, a short name of your own such as `github-work`, and tell the person the name so they can ask for it later. Then `signin <name>` prints a link: give it to the person, in the conversation or the thread they wrote from. It opens in GeckIt on their phone or computer, once, within 15 minutes, and shows that browser live so they sign in themselves. When they say they are done, run `signin <name> --done` and say which profile now holds the sign-in. On another computer add `--computer <name>` to each of these, and the profile lives there. Where no device is paired, `signin` says so: on a computer with a screen, `start geckit:<name>` opens its window for the person instead. The person can also configure separate account profiles in `~/.geckit/browser-state/test-project-profiles.json`: each registered project folder maps to an array of allowed profile names; only those explicit names may be selected with `--profile geckit:<name>` (a single string also sets that project's default). The first start downloads Chrome for Testing, about 200 MB, and says so: run `start geckit` again a minute later.

## Commands

```
{{said}} browser pages
{{said}} browser find <tab> "the reply button under the second post"
{{said}} browser read <tab>
{{said}} browser click <tab> <ref>
{{said}} browser type <tab> <ref> "text"
{{said}} browser text <tab>
{{said}} browser shot <tab>
```

`pages` lists the tabs with their ids. `find` takes what you are looking for in words and returns only the matching lines, `[ref] role "name"`, picked by a small model on this computer: start with it, since it costs a few lines where a whole page costs hundreds. `read` lists all the headings and everything that can be clicked or typed into, with `--- item N ---` where the Nth post or card starts; use it when `find` did not get what you need. Run one command per call, nothing chained. `text` is the page's main text, `shot` saves a PNG and prints its path, open it only when what the page looks like matters. Refs stay the same until the page reloads; after a click that changes the page, read again. `{{said}} browser help` lists the rest: open, go, close, key, scroll, eval.

To check a design or an animation: `shot <tab> <ref>` is one element at full resolution, `hover <tab> <ref>` shows its hover state, `style <tab> <ref>` gives its computed style in a dozen lines, and `view <tab> --size 1024x768 --dark --reduced-motion` (or `--phone`) shows the page as that window and those preferences would until `view <tab> --reset`. `record <tab> [<ref>] --click <ref> --for 600 --slow 4` records what an action sets moving and prints a sheet of up to 12 frames with their times: open the sheet, not the frames, and the frames only to look closer at one moment. GeckIt's own pointer is never in a picture unless asked with `--pointer`.

Do not post, send, buy or delete anything the person did not ask for.
