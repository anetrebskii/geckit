# Implementation Plan: Hosts on the phone

**Spec**: `spec.md` · **Design**: `docs/ux/remote-hosts-phone.md`, `docs/design/remote-hosts-phone.html`

## Technical Context

Same stack as `001-remote-hosts`. The phone already runs the Chat window's own sources with `html.phone`, and already has `window.geckit.hosts` over the link (list, states, prompts, answer, folders, addFolder, connect, reconnect, disconnect). So the phone half is almost entirely renderer work; main gains one phone call (`hosts.forwardLink`) and the iOS view one optional argument.

## Constitution Check

- I. Own plan: unchanged; no secret crosses to the phone except the password the person types into the sheet, which goes to the computer as the computer's own card would.
- II. One contract: new abilities are `hosts.update`, `hosts.forget` (computer only) and the phone call `hosts.forwardLink`, all in the preload API / `phoneCalls()`.
- III. Recorded output: the listing cache and "not up, no ssh" logic are pure and tested.
- IV. UX before pixels: the design is approved.
- V. One word: host; the computer is Local on the computer and its name on the phone.
- VI. Tokens only in `styles.css` and `phone-home.css`.

## Structure

| Area | Files |
|---|---|
| Phone rows, header, pill, composer | `chat/PhoneBoard.tsx`, `chat/PhoneNav.tsx`, `chat/Chat.tsx`, `chat/Composer.tsx` |
| Sign-in sheet | `chat/PhoneHostSheet.tsx` (new), rendered by `Chat.tsx` on the phone in place of the cards |
| Settings, Hosts; Where; host folders | `chat/PhoneSettings.tsx`, `chat/PhoneHosts.tsx` (new), `chat/PhoneProject.tsx` |
| localhost | `renderer/src/phone.ts`, `local-page.ts`, `mobile/src/main.ts`, `mobile/ios/App/App/LocalPage.swift`, `main/index.ts` |
| Cmd+K groups, Profiles, Edit host | `chat/Projects.tsx`, `ui/SettingsDialog.tsx`, `chat/Hosts.tsx` |
| Main leftovers | `main/hosts/disk.ts`, `main/hosts/hosts.ts`, `main/index.ts`, `main/updates.ts`, search, hidden, voice orders, recording note |

## Order

Main and renderer are independent files and proceed in parallel; the phone's link forwarding meets in `phone.ts`. Then the whole suite, a run of the dev instance with the owner's host, and the phone view of the same dev instance.
