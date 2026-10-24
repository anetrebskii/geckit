---
type: marketing
stage: listing
status: draft for review
product: GeckIt
destination: alternativeto.net
created: 2026-10-19
---

# GeckIt on AlternativeTo

Built from `audience.md`. The job of this listing is to be the answer somebody finds when they search "Vibe Kanban alternative" or "Conductor alternative", so it leads with the struggling moment and answers the four anxieties in the first three paragraphs.

Form: user icon, top right, "Suggest new application". Email must be verified first. Their FAQ forbids URLs inside the descriptions; links go in the dedicated URL fields only.

## Name

GeckIt

## Short description

Local Kanban board for parallel Claude Code and Codex agents: see which are working, which are waiting for you and which are done. No server, no login, no API key.

## Long description

Four agents running, and you cannot say which one is waiting for you without clicking through four terminal tabs. GeckIt puts every Codex and Claude Code conversation on one board, across all your projects, in three columns: In progress, In review, Done. A card carries its project, its goal, and whether the assistant is working or waiting for you, so the ones waiting are the ones you look at.

Start a task with a goal and the assistant keeps working until the goal holds, then the card moves to In review by itself. A notification arrives when it finishes or when it needs an answer.

It is a desktop app and nothing else. No server, no login, no account, no board in somebody's cloud. Conversations stay in the files the CLIs already write on your disk, so one started in a terminal appears here and carries on, and one started here carries on in a terminal, as long as not both at once. Delete GeckIt and your history is still there.

GeckIt runs the claude and codex you already installed, as they are, and you sign in with their own login. An API key set in your environment is left out when GeckIt starts them, so a conversation runs on the account you signed in with. It does not make a worktree or a copy of your repository for each task either; a conversation runs in the project folder you point it at, and nothing appears in your tree that you did not put there.

Press a card and the conversation opens over the board, so you work there instead of switching between terminal tabs. Ctrl+Tab moves between conversations the way VS Code moves between files. The status bar shows the plan's limits, context size, cost, and the branch and changes in git. @ picks a file or folder, a message starting with ! runs a command, and images can be pasted or dropped in.

The rest of it:

- Search finds the conversation where something was decided, by its title, its project, or anything said in it.
- Profiles keep work and your own projects apart, each with its own set of projects.
- Shortcuts are saved prompts for a project, run from the board or the menu bar, or on a timetable.
- A conversation can run on another machine over SSH, with your own ssh config, agent and jump hosts.
- Screen recording: press a shortcut, show the problem and say what is wrong, and GeckIt turns the recording into a question or a task with a goal.
- Say it starts or stops work by voice from any app, and shows what it understood before doing it.
- Correct fixes the grammar of text selected in any app, improves, translates or explains it. Transcribe dictates into whatever you are typing in. Both hear you on the computer with Whisper and need no key.
- Other assistants are added as libraries from a GitHub repository. There is one for OpenCode on a local Ollama model.

Mac, Windows and Linux, with a release most days. Free, and the source is public under the Functional Source License, which turns into MIT two years after each release.

## Links

- Official website: **https://geckit.app**. Changed on 2026-10-19 from the GitHub repository. geckit.app is the product's own page, it carries the download buttons for all three systems, and the form asks for the official website rather than a code host. The repository keeps its own field under Source code, so nothing is lost by the swap.
- Creator website: https://github.com/anetrebskii
- No app store link. On the TestFlight link, see "The iPhone app and TestFlight" below.

## Videos

The field takes several, and the order is the order they are shown in. All four are on the netalex channel, @anetrebskii. Their titles carry hashtags on YouTube, which read as spam on a listing, so each one is entered with the hashtags stripped and nothing else changed.

| # | Video | Length | Visibility | Views | Entered as |
|---|---|---|---|---|---|
| 1 | https://www.youtube.com/watch?v=Pr4-uMMj1jQ | 1:51 | unlisted | 3 | Too many Claude Code chats to manage? Not a problem |
| 2 | https://www.youtube.com/watch?v=d1xHiO6E7zY | 1:00 | public | 103 | Stop using one Claude Code session for different tasks |
| 3 | https://www.youtube.com/watch?v=D-TzPdqwFPw | 0:36 | public | 200 | GeckIt notifies you when your Claude Code session is waiting |
| 4 | https://www.youtube.com/watch?v=P4Od6HqxWTI | 0:35 | public | 285 | AI needs your computer? Control it from your phone |

The first one is the 16:9 cut and it goes first on purpose: it is the only one that fills the player, and its own title names the problem this listing is built on. The other three are Shorts, so they are vertical and will sit letterboxed in the embed. That is worth it, because each one shows a different thing and together they cover the board, the notification and the phone.

Two notes on the first video. It is unlisted, which embeds normally, so the listing works as it stands; making it public would also let it be found in YouTube search, and that is your call rather than mine. Paste the `watch?v=` form and never a `/shorts/` URL.

A fifth GeckIt Short exists, https://www.youtube.com/watch?v=n_QYiGxJUk0, the vertical cut of the same promo as video 1, 212 views. It is left out because it would say the same thing twice.

Two assets are still unpublished if you ever want to swap something:

- `~/Movies/GeckIt/Deliveries/geckit-short.mp4`, the 1:50 vertical short with your voice and captions.
- `~/Movies/GeckIt/geckit-board-demo-1080p.mp4`, 0:38, 1920x1080, silent, rendered from `docs/video/geckit-light.webp`, which is the README demo.

## The iPhone app and TestFlight

The TestFlight link, https://testflight.apple.com/join/7B7vbk2e, is on geckit.app and is deliberately not on this form. Three reasons, and none of them is an oversight:

- There is no field for it. The form offers a Mac App Store, Microsoft Store and Linux AppStore link, and TestFlight is none of those.
- Their own rules decline "apps that aren't released yet", which they spell out as closed beta, invite-only or early access. A TestFlight build is all three.
- Descriptions may not contain URLs, so it cannot be smuggled into the text either.

It is still one click away, because the Website field now points at geckit.app and the Phone section there links to TestFlight. When the iPhone app clears App Store review, add iOS to Platforms, add the App Store link, and the phone can go into the description as well.

## Platforms

Mac, Windows, Linux

Not iPhone. The iOS app is TestFlight only, and their FAQ rejects apps in closed beta or invite-only. Leave the phone out of the description too; naming a beta risks the whole submission.

## License

Pricing: **Free**. Source code: **Source available**.

The form splits these. Under Source code it offers Proprietary ("the source is not published"), Open source ("published under an OSI-approved licence") and Source available ("the source is published, but the licence is not OSI-approved (BUSL, SSPL, Elastic, ...)"). FSL-1.1-MIT is the third one exactly, so Source available is right and better than the Proprietary label I first recommended from reading other listings.

## Categories

Not a field. The form derives them from the tags and shows what it will use: **Development** (from developer-tools), **AI Tools & Services** (from claude-code and claude), **Office & Productivity** (from kanban-board). That is the right set, and it is what Vibe Kanban sits in too.

## Tags

ai-code-assistant, Claude Code, Claude, OpenAI Codex, coding-agent, AI-agents, Kanban, Developer Tools, Artificial intelligence, speech-to-text

## Features

Nothing to fill. The section says it highlights features relevant to the app type, and for these tags it offered no checkboxes at all. Features will come from the tags; their FAQ says the system converts tags that are really features by itself.

## Alternative to

This is the part that brings traffic, not the search page. Add GeckIt as an alternative on each of these:

| Page | Why GeckIt belongs there |
|---|---|
| Vibe Kanban | dead since 2026-04-10, its issue tracker is people asking what to use instead |
| Conductor | Mac only, and "no linux version :(" is a real comment on its HN thread |
| Claude Code | the top of the funnel, 164 alternatives already listed |
| opcode | same audience |
| Omnara | same audience |
| Sculptor | same audience |
| Paseo AI | same audience |

Check whether Crystal, Claude Squad, emdash and Multica have pages; they are named in the same threads and were not on the first page of Conductor's alternatives.

## Icon

Uploaded by URL rather than by file, which the form supports and which avoids any upload dialog:

```
https://raw.githubusercontent.com/anetrebskii/geckit/main/client/assets/icon.png
```

1024x1024 PNG with transparency; the form asks for 128x128 or bigger and square.

## Screenshots, in this order

Seven. The first one is the only one most people see, because AlternativeTo uses it as the card image wherever the app is listed.

1. `docs/design/social-preview/geckit-devices.png`, the site's own preview image, added 2026-10-19
2. `docs/screenshots/board-light.png`
3. `docs/screenshots/board-open-light.png`
4. `docs/screenshots/search-light.png`
5. `docs/screenshots/shortcuts-light.png`
6. `docs/screenshots/record-screen-light.png`
7. `docs/screenshots/correct-light.png`

The preview image goes first because it is the only one that works at card size. It carries the logo, the name and the line "A Kanban board for Codex and Claude Code" baked into the image, where a raw window screenshot shrinks into unreadable grey rectangles. It is the same file as the og:image on geckit.app.

Uploading it by URL failed twice, from geckit.app and from raw.githubusercontent.com, both times with "Something went wrong when trying to fetch the file", so all seven went up as files instead. The URL field does work for the icon.

Reordering is by dragging the green handle on each tile, which needs both ends on screen at once, so the practical way to change the order is Delete all screenshots and upload the set again in the order you want. Uploading several files in one go keeps the order of the selection.

## Screenshot descriptions

Each screenshot takes its own description. As entered:

1. See which conversation is working or waiting for you across all your projects. Answer from your iPhone.
2. The board: Codex and Claude Code conversations from several projects as cards in In progress, In review and Done.
3. A card opened over the board: the conversation itself, marked In review.
4. Search at the top of the board, finding a conversation by its title, its project or anything said in it.
5. Shortcuts: saved prompts for a project, run by hand or on a timetable.
6. Screen recording: show the problem and say what is wrong, and it becomes a question or a task with a goal.
7. Correct: fix the grammar of text selected in any app, or improve, translate or explain it.

The first line is yours, taken word for word from the hero of geckit.app, because it describes that picture better than anything I would write for it.

## Other

- Company / Author: **Aleksandr Netrebskii**, created new on the site, matching the name on Product Hunt. Author website set to `https://github.com/anetrebskii`.
- Country of origin: left empty. It is their field, not a guess to make.
- Supported languages: English, which the form fills in by default.
- Platform store links, platform notes, social media and package managers: all left empty. GeckIt is not in winget, Homebrew, Flathub or any store, and the form says to leave those blank.
- Meta note to the reviewers: says this is the developer submitting, that it drives the user's own installed CLIs on their own subscription rather than wrapping a hosted model, why Source available rather than Open source, where the images and videos come from, and that the first screenshot shows an iPhone whose app is in TestFlight review, which is why iOS is left out of the platforms. Saying that first is cheaper than being asked.
- Social media: the YouTube channel is left out. It is Alex's own channel and carries Notula as well, and the guidance under the field says to add only the networks the app itself has a profile on. The four videos already carry the channel.

## Status

Filled in at https://alternativeto.net/manage-item/ on 2026-10-19, signed in as anetrebskii. Every required field validates and the Submit button is live. **Not submitted.**

Second pass on 2026-10-19 changed four things: the Website field now points at geckit.app instead of the repository, three more videos went in and all four titles lost their hashtags, the site's preview image went in as screenshot 1 and the other six were re-uploaded behind it to get the order right, and the reviewer note was rewritten to match. The icon disappeared from the form during that pass, which showed as a red "Application Icon is required", and was uploaded again from a file; worth a look before submitting in case it happens again.

Still open before you press Submit:

- Country of origin is empty. It is your field and not a guess for me to make.
- Whether to make video 1 public rather than unlisted.
- Whether `claude -p` draws on a separate credit pool. The listing's strongest sentence rests on it, and it is still unverified.
