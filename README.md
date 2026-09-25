<p align="center"><img src="client/assets/icons/128x128.png" width="96" alt=""></p>

<h1 align="center">GeckIt</h1>

GeckIt makes your Claude Code chats into a Kanban board with tasks and projects. The chats are your local Claude Code sessions, run on your Claude subscription. It also corrects the text you select and transcribes what you say by a shortcut.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/board-dark.png">
  <img src="docs/screenshots/board-light.png" alt="The board: Claude Code conversations from three projects as cards in In progress, In review and Done">
</picture>

## Board

You work with Claude Code sessions like with tasks on a Kanban board. You can keep track of them and see how the work goes on different projects.

- Three columns: In progress, In review, Done. A card is dragged from one to the next, and Done is grouped by the day.
- A card shows its project, whether Claude is working, asks you something or waits for you, the goal, and the links written in the conversation.
- New task starts a conversation in a project, with a goal if you give one. Claude keeps working until the goal holds, then the card moves to In review by itself.
- All projects on one board, or one project at a time with Cmd+K.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/board-open-dark.png">
  <img src="docs/screenshots/board-open-light.png" alt="A card opened over the board: the Claude Code conversation, marked In review">
</picture>

## Conversations

Press a card and the conversation opens over the board. You can use it instead of iTerm2 + Claude Code.

- Ctrl+Tab switches between conversations as it works in VS Code between files.
- A notification when AI has finished its job, so you never miss it waiting for you.
- The status bar shows the 5-hour and weekly limits, the context size out of the maximum, the total price and git information.
- @ picks a file or folder from the project, a message starting with ! runs a command, Up brings back your past message, images can be pasted or dropped in.
- Background jobs are managed as the Claude Code terminal does.
- The board can be switched to a list, grouped by project, with favorites at the top and Cmd+1... between them.

## Correct and Transcribe

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/correct-dark.png">
    <img src="docs/screenshots/correct-light.png" width="49%" alt="The Correct tab with a message to fix and the Grammar, Improve, Translate, Explain and Custom buttons">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/transcribe-dark.png">
    <img src="docs/screenshots/transcribe-light.png" width="49%" alt="The Transcribe tab recording, with past transcriptions under it">
  </picture>
</p>

- **Correct.** Select text anywhere and press Cmd+C+D. GeckIt corrects the grammar, improves, translates or explains it.
- **Transcribe.** Press Cmd+Alt+V, speak, and the text is pasted where you were typing. Audio files can be transcribed too, and you choose the microphone.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/voice-dark.png">
  <img src="docs/screenshots/voice-light.png" width="340" alt="The dictation capsule Cmd+Alt+V opens">
</picture>

On Windows and Linux the shortcuts use Ctrl instead of Cmd.

## Install

Download it from [Releases](https://github.com/anetrebskii/geckit/releases/latest): a dmg for Apple Silicon or Intel Macs, an installer for Windows, an AppImage for Linux. It updates itself.

The board and Correct need [Claude Code](https://code.claude.com/docs/en/overview) installed and signed in with a Claude subscription. Correct can run on an OpenAI, Anthropic or OpenRouter key instead. Transcribe needs an OpenRouter key, set in Settings.

The Windows installer is not signed, so SmartScreen warns about it: More info, then Run anyway. It installs for your user only, into `%LOCALAPPDATA%\Programs\geckit`, without administrator rights.

Do not keep one conversation open in GeckIt and in a terminal at the same time: two `claude` processes would write to the same history file.

## Build from source

Node 22 or later.

```bash
cd client
npm install
npm run dev
```
