# Chrome Web Store listing: GeckIt Browser

What goes into each field of the Chrome Web Store Developer Dashboard. The package is `client/out/geckit-browser-<version>.zip` from `client/scripts/extension-store.sh`, which drops `key` from the manifest because the store refuses it. The store gives the item its own id; that id has to be added to `allowed_origins` of the native host (`STORE_EXTENSION_IDS` in `client/src/cli/browser.ts`) before a store install can reach GeckIt.

## Store listing

- **Name** (from the manifest): GeckIt Browser
- **Summary** (from the manifest): Lets GeckIt conversations read, check and use your Chrome tabs. Click the icon to see which tabs they used and what they did.
- **Category**: Developer Tools
- **Language**: English
- **Description**:

  GeckIt Browser connects your Chrome to GeckIt, the desktop app for Claude Code and Codex conversations. With it, a conversation can work in the tabs you are already signed in to: read a page, find a button, click, type, scroll, take a screenshot, check an element's style, see the page as a phone or in dark mode, and record an animation.

  Everything goes through GeckIt on your computer. The extension talks to no server of its own.

  Click the toolbar button to see what is going on:
  - whether Chrome is connected to GeckIt
  - what a conversation is doing right now, and in which tab
  - every tab it worked in, one click away
  - the last 30 actions, with the reason when one failed
  - a switch that pauses GeckIt in Chrome

  Tabs GeckIt opens go into a green GeckIt tab group, and a pointer on the page shows where it clicks and types.

  Needs the GeckIt app for macOS or Linux, with Chrome through GeckIt turned on in Settings > Assistants.

- **Icon**: `client/extension/icons/128.png`
- **Screenshot**: `screenshot-1280x800.png`
- **Small promo tile**: `promo-440x280.png`
- **Homepage**: https://github.com/anetrebskii/geckit
- **Support**: https://github.com/anetrebskii/geckit/issues

## Privacy practices

- **Single purpose**: Lets the GeckIt desktop app's conversations read and use the person's Chrome tabs, and shows the person what they did.
- **Permission justifications**:
  - `tabs`: list the tabs with their titles and addresses, open, switch and close tabs when a conversation asks.
  - `tabGroups`: put the tabs GeckIt opens into one GeckIt group, so the person sees them.
  - `scripting`: read a page's text and controls and click, type and scroll in it when a conversation asks.
  - `debugger`: real mouse and key input, element screenshots, recordings, and window size, dark mode and reduced-motion emulation for design checks.
  - `nativeMessaging`: the only channel to the GeckIt app on the same computer.
  - `alarms`: reconnect to the GeckIt app every 30 seconds after it starts or restarts.
  - `storage`: keep the panel's recent actions for the session and the pause switch.
  - `identity`, `identity.email`: name the Chrome profile to GeckIt when several profiles have the extension, so a command reaches the profile that owns the tab.
  - Host permission `<all_urls>`: a conversation works on whatever site the person asks about.
- **Remote code**: No.
- **Data usage**: Personally identifiable information (the profile's email address), Website content, User activity (clicks, typing and scrolling done on the person's request). Not sold, not used for anything other than the single purpose, not used for creditworthiness or lending.
- **Privacy policy**: https://github.com/anetrebskii/geckit/blob/main/docs/chrome-extension-privacy.md

## Distribution

- **Visibility**: Unlisted until a store install has been checked against GeckIt end to end, then Public.
- **Regions**: All.
