---
type: spec
status: draft
owner: Alex
created: 2026-10-20
---

# UX: Opening a local page or file from Telegram

## 1. Why

Manager in Telegram often ends a job with "it runs at http://localhost:5173" or "the report is /Users/alex/Projects/app/report.html". Alex reads that on his phone, or on another computer, and neither the address nor the path opens there: localhost there is the phone itself, and the path is on the Mac. Today the only way to see the result is to go to the Mac, or to open the GeckIt phone app if it is paired and installed. What he asked for: "if I open, it opens website which shows local files or localhost website".

## 2. User path

1. **Entry.** Manager writes a message that names a localhost address or a file or folder on the computer, as it always has. It knows nothing about sharing.
2. **On the way out.** GeckIt reads the message it is about to send, checks each thing it names on the computer (something answers on that port, the file is still there and is not private), shares the ones that pass, and puts the link in place of the words. The message arrives reading as Manager wrote it, with `localhost:5173` and `report.html` as tappable links. A check that fails leaves those words as plain text.
3. **Ready.** Each link has a key after the `#`. The key reaches the browser and never the web server, and it opens that one target and nothing else.
4. **Use.** The link opens a GeckIt page in any browser: Safari, Chrome, Telegram's own browser, a laptop. The page reaches the computer the same way the GeckIt phone app does, through the encrypted pairing service and its relay, and shows the website or the file. A website keeps working as it is browsed: its pages, scripts, pictures, forms and API calls go to the same localhost port on the computer. A file shows a preview or a Download button. A folder lists its files.
5. **End.** The link ends after 12 hours, on "Stop sharing", on `/links` > Stop, when Telegram is disconnected or Manager is turned off, or when GeckIt quits. An ended link opens a page that says it has ended.

"Saved" and "ready" are one moment here: a word only becomes a link once its target was checked. Sharing is still not proof that the browser can reach the computer. The page proves that by connecting.

Who does what:

```mermaid
sequenceDiagram
  participant T as Telegram chat
  participant M as GeckIt on the computer
  participant S as Pairing service (Firestore + relay)
  participant B as Browser elsewhere
  M->>M: reads the message, checks the port, makes a key, waits in its room
  M->>T: the message, with localhost:5173 as a link
  B->>S: offer sealed with the key from the link
  S->>M: offer
  M->>S: answer sealed with the same key
  B->>M: page and asset requests over the encrypted channel
  M->>B: answers from localhost:5173 only
```

The shape is the message itself, not a button, a command or a setting. The thing to open is already named in what Alex is reading, so the link belongs on those words. There is no switch: this is how the bot behaves. A `/share <path>` command was weighed and rejected (section 10).

## 3. What is added

| Surface | What appears | When |
| --- | --- | --- |
| Telegram, inside a Manager message | The words naming a localhost address, file or folder become links to the GeckIt link page | The message names one, it is there and may be shared |
| Telegram, `/links` | The live links with the time left, and a "Stop <target>" button for each | Any time; "/links" is in the bot's command menu |
| Settings > Manager, under the four steps | "Shared links" list: target, time left, Stop | While at least one link is live; not inside the Telegram step, which is folded once set up and would hide a live link |
| Link page (`https://geckit-signal.web.app/#<key>`), phone and desktop browsers | Connecting, then a thin bar (target, time left, Reload) over the site, file preview or folder list | The link is opened |

## 4. States

### On the computer (per link)

| State | When | What Alex sees | What to do |
| --- | --- | --- | --- |
| Live | A message named it and the check passed | The words are a link; a row in Settings and `/links` | Open the link anywhere; Stop when done |
| Not shared | Nothing answers there, the file is gone, or it is private | The words stay plain text; nothing is said about why | Start the server or ask Manager for a different path |
| Ended | 12 h passed, Stop, Telegram disconnected, Manager off, GeckIt quit, or the oldest link made room | The row leaves Settings; the words in the old message stay a link that no longer opens | Ask Manager again to get a fresh link |

### On the link page

| State | When | What the viewer sees | What to do |
| --- | --- | --- | --- |
| Incomplete | No key after `#` | "This link is incomplete. Open it again from Telegram." | Reopen from Telegram |
| Connecting | Dialing | "Reaching your computer..." and the step | Wait |
| No answer | 45 s with no answer | "Your computer did not answer. The link may have ended, or GeckIt is closed or offline there." + Try again | Check the computer, Try again |
| Ended | The computer says the link is unknown or past its time | "This link has ended. Ask Manager in Telegram again for a new one." | Go back to Telegram |
| Site | Live site link, browser has service workers | The website under the bar | Use it |
| Site, browser cannot | No service workers (some in-app browsers) | "This browser cannot show shared websites. Open the link in Safari, Chrome or Firefox." | Open in a full browser |
| Nothing on the port | The local server stopped | The site area says "Nothing answers at localhost:5173 on the computer. The server may have stopped." | Restart it there, Reload |
| File preview | Picture, PDF, text, Markdown, HTML | The preview, and Download | Read, or Download |
| File, no preview | Any other kind | Name, size, Download | Download |
| Too big | Over 32 MB | "<name> is larger than 32 MB, too big to send over this link." | Get it on the computer |
| Folder | Folder link, or a folder inside it | List of its files and folders, Up when below the shared folder | Open a file or folder |
| Empty folder | No visible entries | "This folder is empty." | Up |
| Dropped | The channel closed while open | "The connection to your computer was lost." + Reconnect | Reconnect |

## 5. Transitions

```mermaid
stateDiagram-v2
  direction LR
  state "Named" as named
  state "Live" as live
  state "Not shared" as plain
  state "Ended" as ended
  [*] --> named: a message names it
  named --> live: check passes, on send
  named --> plain: check fails, on send
  live --> live: named again, same link
  live --> ended: 12 h, Stop, disconnect, quit, evicted
  ended --> live: named again
  plain --> live: named again after it is fixed
  classDef auto fill:#dbeafe
  classDef hands fill:#fee2e2
  classDef idle fill:#e5e7eb
  class named idle
  class live auto
  class plain hands
  class ended idle
```

| From | Event | To | What Alex sees |
| --- | --- | --- | --- |
| (none) | A Manager message names a localhost address or a shareable path; GeckIt checks it as the message goes out, without Manager | Live | Those words arrive as a link |
| (none) | The same, and nothing answers there, the file is gone or it is private | Not shared | Those words arrive as plain text |
| Not shared | Named again once the server runs or the path is right | Live | A link this time |
| Live | Named again in a later message | Live, same link | The same link on the new words |
| Live | `/links` Stop, or Stop in Settings | Ended | "Stopped sharing <target>. The link no longer opens."; the words in the old message stay but no longer open |
| Live | 12 hours pass, automatically | Ended | Nothing is sent; the row leaves Settings |
| Live | A new link is needed and 20 are live, automatically | Ended, oldest first | Nothing is sent; the oldest row leaves Settings |
| Live | Telegram disconnected or Manager turned off | Ended | Nothing in Telegram (it is disconnected); the Settings list empties |
| Live | GeckIt quits | Ended | Nothing; after restart the old link page says it has ended or got no answer |
| Ended | Named again in a later message | Live | A new link; the old one stays dead |

```mermaid
stateDiagram-v2
  direction LR
  state "Connecting" as connecting
  state "Shown" as shown
  state "No answer" as noanswer
  state "Ended" as ended
  state "Dropped" as dropped
  state "Incomplete" as incomplete
  [*] --> incomplete: no key
  [*] --> connecting: key in link
  connecting --> shown: computer answered
  connecting --> noanswer: 45 s
  connecting --> ended: link unknown
  noanswer --> connecting: Try again
  shown --> dropped: channel closed
  shown --> ended: Stop or 12 h
  dropped --> connecting: Reconnect
  classDef wait fill:#fef3c7
  classDef auto fill:#dbeafe
  classDef hands fill:#fee2e2
  classDef idle fill:#e5e7eb
  classDef done fill:#dcfce7
  class connecting auto
  class shown done
  class noanswer hands
  class dropped hands
  class ended idle
  class incomplete hands
```

| From | Event | To | What the viewer sees |
| --- | --- | --- | --- |
| (none) | Page opened without a key | Incomplete | "This link is incomplete..." |
| (none) | Page opened with a key | Connecting | "Reaching your computer..." |
| Connecting | Computer answered and the link is live | Shown | Bar and content |
| Connecting | Computer answered, link unknown or expired (only in the moment a link ends; afterwards nothing waits in its room, so an ended link reads as No answer) | Ended | "This link has ended..." |
| Connecting | 45 s pass with no answer | No answer | Message + Try again |
| No answer | Try again | Connecting | Steps again |
| Shown | Viewer presses Reload | Shown | The site starts again at its first page; a file or folder is read again |
| Shown | Channel closes (network, computer asleep, GeckIt quit) | Dropped | Message + Reconnect |
| Shown | Link stopped or expired: the computer says so on the open channel, then closes it | Ended | "This link has ended..." |
| Dropped | Reconnect | Connecting | Steps again |
| Folder | Opens a folder or file | Folder / File | The list, or the preview |
| File / Folder | Up or the browser's Back | Folder above | The list it came from |

Every state has a way out: an action, the 45 s limit, or going back to Telegram.

## 6. What stays silent

- **Who opened a link.** No "someone opened your link" message. The link is Alex's own, opened mostly by Alex. A notice for every visit would be noise, and Stop is always at hand.
- **Expiry in Telegram.** Nothing is sent and the old message is not edited. Expiry is expected, so a message about it would be noise, and an edited message is no longer the record of what was said.
- **A path that is not there or is private.** Its words stay plain text, with nothing said about why. A reason would be a second message about something Alex did not ask for, and often about a path Manager mentioned only in passing.
- **The key.** It is never written as text of its own. It sits inside the address the words link to, and Telegram's link previews stay off.
- **Live reload.** WebSockets do not cross the link, the same as in the phone app, so a dev server's hot reload stays quiet. The page still works and Reload fetches the new version.

## 7. Thresholds and time

| Number | Why |
| --- | --- |
| 12 hours per link | A working day of checking a running app from elsewhere without asking again. It matches the 12 h after which GeckIt already stops a host run nobody looked at, so a forgotten link dies on the same scale as forgotten work. |
| 20 live links | Each live link keeps a room open in the pairing service and a check-in every 30 s. Since every message that names something now makes one, the twenty-first ends the oldest rather than being refused: a message is never sent with some of its words linked and others not for want of room. |
| 8 links per message | A message naming more than eight paths is a listing, not a result, and linking every line of it would fill the cap from one message. The first eight become links and the rest stay plain text. |
| 45 s to connect | The phone app's dial limit, long enough for a cold pairing service on both sides. |
| 32 MB per answer | The phone app's localhost limit. A dev server's largest bundle is well under it. |

## 8. Exact wording

Telegram:

- In a Manager message, the words themselves are the link: `localhost:5173`, `report.html`, `docs/` keep the spelling Manager used and gain nothing around them. GeckIt says nothing about having shared them.
- A target that cannot be shared is silent: those words arrive as plain text, with no note and no reason. The reason is in `/links` only if Alex asks there; nothing can be wrong with a message that simply reads as Manager wrote it.
- Stopped: "Stopped sharing localhost:5173. The link no longer opens."
- `/links` with links: "**Shared links** (2)\n• localhost:5173 - ends in 11 h\n• report.html - ends in 2 h", buttons "Stop localhost:5173", "Stop report.html".
- `/links` with none: "Nothing is shared. A link appears in a Manager message that names a localhost address or a file."
- Command menu: "links - What is shared and how to stop it"

Settings > Manager:

- Heading "Shared links"; row "<target>" and "Ends in 11 h"; button "Stop" (read as "Stop sharing <target>").
- After the last one is stopped there: "Nothing is shared now." It takes the focus the Stop had and goes when Settings is next opened. Stopping one that is not last moves the focus to the next Stop.

Link page:

- Connecting steps: "Reaching your computer..." with "Asking the pairing service...", "Waiting for your computer...", "Connecting..."
- Bar: "<target>" and "Ends in 11 h"; button "Reload". A single file's Download is in the bar too; inside a folder each file has its own line with its name, size and Download.
- The other states use the texts in the link page states table above.
- Download button: "Download"
- Folder up: "Up"

## 9. Edge cases

- **Two Manager messages name the same target.** Both lead to the one live link; the second message does not make a second key, and the first message's words keep working.
- **The target inside a code span.** Manager usually writes a path in backticks. Those words become the link and lose their monospace, because Telegram does not read a link inside code.
- **The target inside a fenced code block.** Left alone. It is code, and a link in the middle of it would be wrong to copy.
- **A URL on another loopback name** (`127.0.0.1`, `0.0.0.0`, `[::1]`) is the same port on the computer, and the words that named it are the link.
- **A path relative to a project** ("`src/report.html`") is not offered. Manager's messages are not tied to one project root, and guessing a folder could share the wrong file. Only absolute and `~/` paths are offered.
- **A redirect** from the site to another port or host is not followed; it reaches the viewer as the redirect itself. Redirects within the same port are followed, as in the phone app.
- **A folder holding hidden files** (`.env`, `.git`): they are left out of the list and refused if asked for by name. A symlink that leads out of the shared folder is refused.
- **A file renamed or deleted after sharing:** the page says it is no longer on the computer.
- **Several links open in one browser.** Each tab keeps its own connection. A page from one site that navigates by a root address (`/about`) goes to the site most recently opened in that browser. Both are links the viewer already holds, so nothing new is exposed.
- **A link inside the site opened in a new tab** lands on a GeckIt page that says to go back to the tab the link opened. The new tab has no connection of its own.
- **Another link pasted into the same tab** changes only what is after the #: the page loads again for the new link.
- **GeckIt restarts.** Every link ended. The words in the old messages still look like links and no longer open; a new message from Manager carries new ones.
- **The phone app is paired too.** Unrelated: the phone keeps its own room and key, and a link key opens none of the phone's calls.
- **A conversation on an SSH host** names its own localhost. Manager's messages run on this computer, so a link always means this computer's localhost. Opening a host's port from here stays the existing forward in the phone app.

## 10. Deliberately not included

- **A `/share <path>` command.** It would let a message typed in Telegram, or a stolen Telegram session, pick any path on the computer. Linking only what GeckIt's own message already names keeps the choice to what Manager showed.
- **A public tunnel (ngrok, Cloudflare Tunnel).** It needs a new account and a public address per port, and anyone who finds it reaches the server directly. The pairing service already reaches this computer from anywhere, encrypted end to end.
- **The page served from the computer over the local network.** It works only on the same Wi-Fi, which is not where Alex reads Telegram.
- **The GeckIt phone app as the only way.** Telegram does not open custom app links from bot buttons on every platform, and a laptop has no phone app. Links on the GeckIt app remain as they are.
- **Hot reload / WebSockets.** A service worker cannot carry them. It is the same limit as in the phone app.
- **Links that survive a restart.** Keeping keys on disk adds a secret store for convenience, and old links would come back to life behind Alex. Asking Manager again is one message.
- **A notice for every visit**, see section 6.

## 11. Decisions

| Question | Verdict | Why |
| --- | --- | --- |
| Transport | The existing pairing service: Firestore rooms, sealed offers, Cloudflare relay | Already reaches this computer from anywhere, encrypted, and its rules take any room without a change |
| Where the page lives | A static page on Firebase Hosting in `geckit-signal` (`geckit-signal.web.app`) | Same project as the rooms and relay; hosting is free there. Deployed 2026-10-20. |
| Key per link, not the phone key | Per link | The phone key opens every phone call; a link must open one target only |
| Who may create | GeckIt itself, as a Manager message goes out | **Reversed on 2026-10-20, at Alex's decision.** It was a button the paired account pressed, so that nothing was shared without a deliberate act. He asked for the link to be in the words instead, with no setting and no way to turn it off: a button is a second tap on a decision he has already made by asking Manager to run the thing. The cost is accepted: anything Manager names and that passes the checks becomes a live link for up to 12 hours, whether or not it is opened, and the link travels through Telegram. What does not change: Manager is never told, nothing outside the refusal rules is ever shared, and `/links` and Settings still end any of them. |
| Manager's part in it | None | GeckIt reads its outgoing message; Manager has no instruction about sharing and cannot ask for it. A model that could name a link would be a model that could be talked into naming one. |
| Lifetime | 12 h, Stop, disconnect, quit | See section 7 |
| Preview in Telegram | Off for share replies | A preview fetch never runs the page, but it would show a blank card |

## 12. Requirements check

Covers: open a localhost site or an explicitly chosen file or folder in a browser on another device, from the paired Telegram chat. Access is scoped to the pressed target. The link has a lifetime and can be revoked. The unavailable states are named. Assets, navigation and API calls are proxied, WebSockets are not. Files are previewed or downloaded safely, with path traversal refused.

Not covered: real use from another network needs the relay keys already used by the phone app, and has not been exercised.
