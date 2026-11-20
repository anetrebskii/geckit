# Signed-in test profiles on any computer

Spec: [specs/025-remote-browser-profiles/spec.md](../../specs/025-remote-browser-profiles/spec.md). 2026-11-06.

## What the person gets

An assistant can work on a site behind a sign-in, on this computer or a paired one, in a test browser that stays signed in. The person signs in once themselves, through a live picture of that browser in GeckIt, and never gives the assistant a password.

## Words

- **computer**: a GeckIt this one is paired with, by the name it has there. This computer is "This computer".
- **account profile**: a test profile made for one account, named by the assistant (`github-work`) with a note saying which account (`GitHub as alex`).
- **Sign in**: the button and the link that open the live view.

## Commands an assistant uses

| Command | Says |
| --- | --- |
| `geckit computers` | The paired computers, by name. |
| `geckit <command> --computer <name>` | Whatever the command says on that computer. |
| `geckit browser profiles create <name> --note "<account>"` | `Made geckit:<name> for <account>. It is signed in to nothing yet: geckit browser signin <name> gives the person a link to sign in.` |
| `geckit browser profiles note <name> "<account>"` | `geckit:<name> is now noted as <account>.` |
| `geckit browser signin <name>` | The link, then: `Give the person this link. It opens in GeckIt paired with this computer, once, within 15 minutes, and shows geckit:<name> live so they sign in themselves. When they say they are done, run geckit browser signin <name> --done.` |
| `geckit browser signin <name> --done` | `geckit:<name> is saved with its sign-in on this computer. Use it with --profile geckit:<name>.` |

Only the person pairs: `geckit computers add <code>` and `geckit computers forget <name>` are refused to assistants, as `geckit pair` is.

## The live view

A sheet over the window that reads as a browser window of its own, the same on the desktop and the phone.

- Toolbar: the profile's letter badge in its colour with `geckit:<name>` (the prefix quieter) and a status line under it, a dot and `Opening on <computer>`, `Live on <computer>` or `Not connected to <computer>` (`this computer` when it is this one). Its tooltip says what crosses: `You see a picture of the browser on <computer>. What you type goes into it directly, and its sign-ins stay there.` Then Back and the address pill; then Done, a word in the accent colour, tinted on hover, as Done is in a Mac sheet.
- Address pill: away from the keyboard it shows the site in full strength and the rest of the address quieter, with a check for https; focused, it shows the whole address selected. Return opens it. No scheme is needed: a host gets `https://`, this computer and the local network (`localhost`, `127.0.0.1`, `192.168.x.x`, `.local`) get `http://`, and anything else, such as words, is searched on DuckDuckGo.
- No tabs. A popup or new tab the page opens, such as Sign in with Google, takes the view's place at the same size; when it closes, the view returns to the page that opened it. Done closes them all.
- The sheet takes the page's shape (1280 by 800) at the largest size the window allows, so the page fills it edge to edge. A thin bar runs along the page's top while opening.
- Caret: Firefox leaves the caret out of its pictures, so the computer reports where the focused field's caret is with each picture, in the field's own caret colour, and the view draws it blinking while its keys go to the page. Clicking elsewhere, or the view losing the keyboard, hides it.
- A Keyboard button beside the address on the phone, which raises the keyboard and, while it is up, shows pressed and hides it. A tap on one of the page's text fields raises the keyboard, a tap anywhere else hides it: each frame says where the page's fields are. On the phone the bar uses phone sizes (17 pt names and address, 40 pt buttons), and the page opens filling the screen's height, at the top when zoomed out; pinching or the - and + buttons in the bottom corner zoom it, from the whole page in view to three times the opening size, keeping the point under the fingers or the screen's centre in place. Taps land where they are on the zoomed picture.
- Under 760 px wide and on the phone the address moves to a second row.

States:

| State | Shows |
| --- | --- |
| Opening | `Opening geckit:<name>…` and a spinner. If Chrome for Testing is still downloading on that computer, the view moves to Failed with the computer's own words, such as `Downloading Chrome for Testing, 40%.`, and Try again. |
| Live | The picture, refreshed about five times a second and right after each click or key. |
| Failed | A card over the stage: `The browser is not showing`, the computer's own message, Close and Try again. A dropped connection lands here too; the last picture stays behind it, dimmed. |
| Done | The sheet closes. The browser on the computer closes too, unless a conversation is using it; the sign-in is kept either way. |

What crosses to the viewing device is the picture and the person's clicks and keys. Passwords typed go straight into the page on the computer.

## Links

`geckit://signin?computer=<id>&name=<name>&profile=<profile>&t=<token>`

- Opens in GeckIt on a phone or desktop paired with that computer: it connects to that computer and opens the live view.
- On a device not paired with it: `This link opens in GeckIt paired with <name>. Pair this device with it first.`
- Used once, valid 15 minutes, and ended by Done. Opened again: `This sign-in link was already opened. Ask for a new one.` Expired: `This sign-in link expired. Ask for a new one.`
- A sign-in link in GeckIt chat opens the existing live view inside the app. When the link is for the open computer, the conversation stays behind the view and Done returns to it. If the link names another paired computer, GeckIt opens that computer and its live view. If it is unpaired, GeckIt says to pair it first.
- Slack and Telegram do not fetch `geckit://` links for previews, so posting one does not use it up.

## Settings

Settings > Integrations > Test browsers, on whichever computer the window is showing (the toolbar's computer menu chooses):

- Each profile: `geckit:<name>`, its note, open or closed; Open browser (the live view when the window shows another computer), Show in GeckIt (the live view, on this computer), Edit, Delete.
- `New account profile`: name and account, Create. The same naming rule as the command.

On the phone, Settings > Web Browser > Browser profiles shows the host the phone is paired with:

- Rows: the profile's coloured letter, `geckit:<name>`, a dot with Open or Closed and its note. Tapping a row opens the live view of that profile on the host; More holds Open browser, Edit and Delete. Delete asks first: "Its sign-ins and history go with it".
- The + in the bar, or New profile when the list is empty, opens a full sheet: Name (lowercased, the same rule; a taken name says so and Create stays off) and Description, optional. Edit is the same sheet with Save; the name is locked while its browser is open.
- Three skeleton rows while the host answers; Camoufox downloading or failing on the host is said under the list.
- Browser access: the Chrome through GeckIt switch for the host. Off, rows do not open and Open browser is disabled.

## Out of scope

Copying a profile from one computer to another (the browser keeps sign-ins under a key of the computer's own).

## Take over an open tab

When a test browser tab needs the person to sign in or complete a site check, the assistant gives them a private HTTPS link to that tab. Tapping it in GeckIt or a direct message in Slack opens the existing page in a regular browser. Tap **Done** or close the browser window to give the tab back. The page, its popups and its sign-in stay on the computer.

The browser window uses the existing live view. It shows the current site in a read-only address bar. The viewer fits the whole page frame on first open. The person can click, type, scroll and zoom, including in a sign-in popup. The keyboard follows the existing phone live view. The assistant's access to the tab and its popups pauses while the view is active. The link holds no workspace or profile-wide permissions.

After the first complete frame, small changes replace only the affected rectangle. The rest of the page stays visible while the update arrives. Changes covering much of the page, navigation and a change in frame dimensions can replace the complete picture. Picture updates stay silent and use the existing controls and connection states.

While typing, the caret blinks at the actual insertion point in the host browser over both video and image updates. It follows taps inside existing text and keyboard edits, stays steady with Reduce Motion, and disappears when the viewer loses keyboard focus.

On the phone, opening the keyboard fits the viewer into the space above it. The picture keeps its zoom and scrolls just enough to show the active field. If the field is larger than the available space, the caret stays in view. Moving focus to another field while the keyboard is open brings that field into view. Dismissing the keyboard gives the viewer its full height again.

Opening uses a centered browser icon and the same status text until the first frame arrives. The indicator stays still with Reduce Motion. A tap on the live picture shows a ring at the contact point immediately, lasting 180 ms. The ring is static with Reduce Motion and confirms the tap without implying the remote page has responded. Scrolling and zooming leave the picture free of tap indicators.

On a computer that can stream the selected tab, the live view uses the same WebRTC video playback as Computer Control. The first picture can arrive as an image while video connects. If video is unavailable or the page opens a sign-in popup, the same view continues with image updates. The switch is silent, and the person's scroll, zoom and keyboard controls stay in place. The stream can show only the authorized tab. The one-time link and Done retain the same behavior.

| From | Event | To | What the person sees |
| --- | --- | --- | --- |
| GeckIt or a private message | Tap the link | Opening | “Opening the browser tab…” |
| Opening | The computer accepts the first connection and shows a frame | Live | The existing page and **Done** |
| Opening | The link was already claimed | Unavailable | “This browser link was already used. Ask for a new link.” |
| Opening | The link expired | Unavailable | “This browser link expired. Ask for a new link.” |
| Opening | The computer or tab cannot be reached | Unavailable | “This browser tab is unavailable. Ask for a new link.” |
| Live | Tap **Done** and the host releases the tab | Ended | The originating conversation resumes automatically. The viewer closes if the browser allows it. Otherwise, it shows “You can close this window. The browser tab stays open.” |
| Live | Close the window | Ended | Nothing. The assistant can use the tab again. |
| Live | The connection drops or the session expires | Ended | “This browser session ended. Ask for a new link if you need the tab again.” |

After **Done**, GeckIt sends “Browser tab returned: tab <id> in geckit:<profile>.” to the conversation that issued the link. It waits for the current turn to finish if one is running. The assistant checks the tab before claiming sign-in or a site check succeeded. Closing the window or losing the connection releases the tab silently. Expired links and closing or closed conversations do not trigger a new turn.

The assistant asks for a link with `geckit browser signin <profile> --tab <id>`. The host verifies that the requesting conversation owns that exact tab, and only one viewer can claim the link. A link expires 15 minutes after issue, the same lifetime as the profile sign-in link. Closing, reloading or opening the link a second time cannot restart the session. A dropped connection releases control even if the window cannot send **Done**. Preview requests have no effect. Room details, retries and transport diagnostics stay silent. Site-native controls outside the page, including an operating system passkey sheet, do not appear in the streamed page. Where the site offers another way to verify, it can be selected in the page.

A fresh link loads the Opening state even when the device opens it in the browser tab that still shows the previous Done screen.

The link is a bearer credential. Deliver it only in the intended user's private conversation. A shared Slack thread can relay an instruction to check the private conversation. No separate GeckIt pairing, application install, Slack account linking or new browser tab on the host is required.

This extends the earlier decision to limit profile sign-in links to paired devices. The profile-wide Settings action still uses the paired flow. This addition covers the existing-tab handoff in [the revised specification](../../specs/025-remote-browser-profiles/spec.md#existing-tab-handoff).

## Browser profile management update - 2026-11-12

The current working-tree Settings section is renamed "Web Browser". Profile management leads the page; Chrome extension connection/setup follows below. The approved replacement profile flow and verification scope are in [browser-profile-management.md](browser-profile-management.md). Earlier Integrations references above describe the original design.
