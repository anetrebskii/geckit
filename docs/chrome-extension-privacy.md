# GeckIt Browser privacy policy

GeckIt Browser is the Chrome extension of GeckIt, a desktop app. It lets conversations the person runs in GeckIt on their own computer read and use the tabs of their Chrome.

## What the extension handles

- **Page content and tab details**: the title, address and text of a tab, the list of what can be clicked or typed into, screenshots and recordings of a tab. The extension reads them only when a GeckIt conversation asks for that tab.
- **What it does in a tab**: clicks, typing, scrolling, key presses and scripts run in the page, each only when a GeckIt conversation asks.
- **The email address of the Chrome profile**: so GeckIt can tell the person's Chrome profiles apart when more than one has the extension.

## Where it goes

All of it goes to the GeckIt app on the same computer, through Chrome's native messaging, and nowhere else. The extension sends nothing to a server of its own, has no analytics and loads no remote code.

The GeckIt app hands what a conversation asked for to the AI assistant that conversation runs on, such as Claude Code or Codex, under the person's own account with that provider. What that provider does with it is set by the person's agreement with them.

## What is kept

The toolbar panel keeps the last 30 actions and the tabs GeckIt worked in, in Chrome's session storage on this computer. Chrome clears them when it closes. The "Let GeckIt use Chrome" switch is kept in Chrome's local storage. Typed text is never kept.

## Control

Turning off "Let GeckIt use Chrome" in the extension's panel refuses every request until it is turned back on. Turning off Chrome through GeckIt in GeckIt's Settings disconnects the extension. Removing the extension removes everything it kept.

## Contact

Questions go to the issues of https://github.com/anetrebskii/geckit.
