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
| `geckit browser profiles create <name> --note "<account>"` | `Made test:<name> for <account>. It is signed in to nothing yet: geckit browser signin <name> gives the person a link to sign in.` |
| `geckit browser profiles note <name> "<account>"` | `test:<name> is now noted as <account>.` |
| `geckit browser signin <name>` | The link, then: `Give the person this link. It opens in GeckIt paired with this computer, once, within 15 minutes, and shows test:<name> live so they sign in themselves. When they say they are done, run geckit browser signin <name> --done.` |
| `geckit browser signin <name> --done` | `test:<name> is saved with its sign-in on this computer. Use it with --profile test:<name>.` |

Only the person pairs: `geckit computers add <code>` and `geckit computers forget <name>` are refused to assistants, as `geckit pair` is.

## The live view

A sheet over the window, the same on the desktop and the phone.

- Title: `Sign in: test:<name>`, with the computer's name under it when it is not this one.
- An address row: Back, the page's address (editable; Return opens it), and Done.
- The picture of the page, at its own width, scaled to fit; on the phone it pinches to zoom.
- A Keyboard button on the phone, which raises the keyboard. On the desktop, typing goes to the page once it has been clicked.

States:

| State | Shows |
| --- | --- |
| Opening | `Opening test:<name>…` and a spinner. If Chrome for Testing is still downloading on that computer, the view moves to Failed with the computer's own words, such as `Downloading Chrome for Testing, 40%.`, and Try again. |
| Live | The picture, refreshed about five times a second and right after each click or key. |
| Failed | The computer's own message, with Try again and Close. A dropped connection lands here too; the last picture stays, dimmed. |
| Done | The sheet closes. The browser on the computer closes too, unless a conversation is using it; the sign-in is kept either way. |

What crosses to the viewing device is the picture and the person's clicks and keys. Passwords typed go straight into the page on the computer.

## Links

`geckit://signin?computer=<id>&name=<name>&profile=<profile>&t=<token>`

- Opens in GeckIt on a phone or desktop paired with that computer: it connects to that computer and opens the live view.
- On a device not paired with it: `This link opens in GeckIt paired with <name>. Pair this device with it first.`
- Used once, valid 15 minutes, and ended by Done. Opened again: `This sign-in link was already opened. Ask for a new one.` Expired: `This sign-in link expired. Ask for a new one.`
- Slack and Telegram do not fetch `geckit://` links for previews, so posting one does not use it up.

## Settings

Settings > Integrations > Test browsers, on whichever computer the window is showing (the toolbar's computer menu chooses):

- Each profile: `test:<name>`, its note, open or closed; Sign in, Open, Delete.
- `New account profile`: name and account, Create. The same naming rule as the command.

## Out of scope

Copying a profile from one computer to another (the browser keeps sign-ins under a key of the computer's own); links that open in a plain web browser.
