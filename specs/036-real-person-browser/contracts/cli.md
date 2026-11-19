# Contract: `geckit browser` for test browsers

Only what changes is listed. Every other command keeps its current output.

## `profiles device <name> --desktop`

New. Linux server only.

| Situation | Output | Exit |
|---|---|---|
| Profile is `previous` | `geckit:<name> now presents this server's desktop. Sites it is signed in to will see a new device and may ask to confirm the sign-in.` | 0 |
| Profile is already `desktop` | `geckit:<name> already presents this server's desktop.` | 0 |
| Profile is open | `Close geckit:<name> first: geckit browser stop geckit:<name>.` | 1 |
| Not a Linux server | `Only a Linux computer without a screen presents a desktop identity. Here every test browser shows this computer as it is.` | 1 |
| No such profile | existing message: `There is no geckit:<name>. ...` | 1 |

## `profiles`

On a Linux server, each test profile line gains `server desktop` or `as before (profiles device <name> --desktop)` after its state. Elsewhere unchanged.

## `start geckit[:<name>]` and any command that starts a test browser

New failures, Linux server only:

| Situation | Message |
|---|---|
| Xvfb missing | `Test browsers on a Linux computer without a screen need a virtual display. Install it with: sudo apt install xvfb` |
| Xvfb did not start | `The virtual display did not start: <Xvfb's own last line>.` |
| `device.json` damaged | `This server's desktop identity in ~/.geckit/camoufox/device.json cannot be read: <reason>. Fix or restore it; GeckIt does not make a new one, since every signed-in site would see a new device.` |

New log lines in `~/.geckit/camoufox/<name>.log` (not shown in the conversation):

- `uBlock Origin is not installed: <reason>. The browser started without it; the next start tries again.`
- `Dropped desktop identity settings this Camoufox does not know: <keys>.`

## `help`

`profiles device <name> --desktop` is added under `profiles`, with: `on a Linux server, move a profile made before the desktop identity to it; sites see a new device`.

## Unchanged on purpose

- No option to turn uBlock Origin off; the person turns it off per site in the browser, as any uBlock Origin user does.
- No flag to choose a fake operating system, screen or graphics card.
