## Actions beyond click and type

Each command acts as a person does: pointer, keyboard and the browser's own file chooser, downloads and dialogs. Use these before `eval`. `{{said}} browser help` gives every flag.

### Files

- `upload <tab> <ref> <file>...` clicks the button or field that opens a file chooser and picks the files, several at once for a carousel. A hidden `input[type=file]` behind a button works through the button's ref. Check the previews.
- `drop <tab> <ref> <file>...` drags files from the computer onto a drop zone.
- `download <tab> <ref> [-o <folder>]` clicks and waits for the download, then prints the saved file's path. It never overwrites a file.

### Keyboard and pointer

- `key <tab> Meta+Enter`, `Shift+Tab`, `Control+a`: a key with modifiers. Use Meta on macOS and Control elsewhere for select all, copy, cut, paste and undo.
- `type <tab> <ref> <text> --append` types after what a field or an editor (Threads, LinkedIn, Notion) already holds; without it the field is cleared first.
- `click <tab> <ref> --double` or `--right`; `select <tab> <ref> <option>` chooses in a native list by its shown text or value.
- `drag <tab> <ref> <ref>` drags one element onto another; `drag <tab> <ref> --by <dx>,<dy>` moves a slider or a handle.

### Clipboard

- `paste <tab> [<ref>] --text <text>` or `paste <tab> [<ref>] <image file>` pastes as a person does; the person's own clipboard is put back afterwards.
- `clipboard [-o <file>]` prints what was copied last, or the path of a PNG of a copied image.

### Waiting, dialogs, tabs and frames

- `wait <tab> --text <text>`, `--gone <text>`, `--url <part>` or `--load`, with `--timeout <s>` (15 by default), instead of reading again and again.
- When a click or key opens an alert, confirm, prompt or a leave-page question, the command says so; every other command is refused until `dialog <tab> accept|dismiss [--text <answer>]`.
- `permission <tab> notifications|geolocation|camera|microphone|clipboard allow|block|ask` answers a site's permission request only when the person asked for that. It holds from the page's next load. In a test browser, camera and microphone apply to the whole profile from its next start, and Firefox has no clipboard permission.
- A click that opens a tab or a sign-in window says its id; `pages` shows which tab opened it. Work there, then go back to the first tab.
- When the person asks to use their Incognito tab, find its ID with `pages` and use `go <tab> <https://url>` to load the site in that tab, even from New Incognito Tab. The `[incognito]` label identifies Incognito tabs, and `*` marks the active tab in each window. If the requested tab is missing, check that the person enabled Chrome's Allow in Incognito for GeckIt Browser.
- `read` lists what is inside frames, such as payment forms and embedded editors, with refs like `57.12`; use them as any ref.
