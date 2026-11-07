# Discord channel: verification evidence, 2026-11-07

What was checked on branch `feat/discord-channel`, and how. Nothing here touched a real Discord server or bot.

## Renderer

The real `Channels` and `DiscordSetup` components and `styles.css`, mounted by `client/src/renderer/settings-preview.html` under plain Vite with the channels API replaced by fixtures (`discord=new|ready|nointent|empty|refused|failed|connected|reconnecting|offline`, `many` for a long server list). Viewed in Chrome through GeckIt Browser in a background tab.

| File | What it shows |
| --- | --- |
| `light-desktop-channels-chosen.png` | 900 px, light: bot checked, Only the channels I choose with two channels ticked, people being added |
| `light-desktop-people-reach.png` | 900 px, light: a found and an unknown person, step 4 with More open, Save and turn on |
| `light-desktop-servers-scroll.png` | 900 px, light: eleven servers in a list that scrolls inside the step |
| `dark-narrow-nointent.png` | 560 px, dark: Message Content Intent warning with Open Bot settings and Check again |
| `dark-narrow-empty.png` | 560 px, dark: bot in no server, Add to server and Check again |
| `dark-narrow-refused-wrapped.png` | 560 px, dark: refused token, the token form wrapping on a narrow window |
| `dark-narrow-failed.png` | 560 px, dark: the row stopped by Discord, the whole reason above step 1 |

Interactions performed in the page: replacing a saved token with one Discord refuses (the alert appears, the field empties, Cancel returns to the checked bot and the saved token stays), opening Set up (focus goes to the token field, or to the panel when a token is saved), switching to chosen channels and ticking chips (step 2 turns done), adding a malformed ID (the error appears), adding a pasted mention and an unknown ID (names resolve, the unknown one is marked), the footer switching to Save and turn on only when every step is ready, Escape closing only the Discord setup with focus back on Set up, and no horizontal scroll at 560 px. Key presses sent to a background tab did not reach the page, so Enter and Tab were exercised through DOM events rather than the keyboard itself.

## Automated

- `npx vitest run`: 1765 passed, 10 skipped after the review fixes (1770 and 2 before them, on a smaller base). `test/headless-service.test.ts` and `test/core-application.test.ts` both run `vite build` into `out/service` and failed together once in a parallel run; they pass alone and in the next full run. `client/test/discord.test.ts` covers the gateway (identify, intents, resume, fatal 4014, a missed heartbeat, a fresh identify after 4009), thread and direct message isolation, allow list, token refusal, chosen channels, direct messages off, repeated and replayed events across a restart, buttons bound to person, thread, message and open question, 2000 character chunks, attachments, a missing thread permission, earlier thread context, Manager unavailable, a 429 wait, the Set up check, a pasted token checked without the saved one, interaction tokens kept out of errors, buttons bound to the part that carries them and refused outside the chosen channels.
- `npm run typecheck`, `npm run lint` (`eslint src test`), `npm run build`: clean.

## Not verified

- A real Discord bot, server, gateway connection and button presses.
- The Electron app itself: the dev app was not restarted.
