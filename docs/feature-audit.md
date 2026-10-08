# GeckIt product features

This is the supporting audit. The concise, user-approved feature list is [docs/features.md](features.md).

Source paths shown as code rather than links refer to files inspected in the source working tree that are not included in this documentation publication. Released provider-library availability and proposed context-item attachment remain qualified below.

Reviewed on 2026-10-04 against the live [homepage](https://geckit.app/), its expanded workflow FAQs, the [Kanban page](https://geckit.app/claude-code-kanban-board/), and the source inventory below. The live pages were read in Chrome because the web retrieval tool could not access the domain.

GeckIt gives a person one place to supervise work across AI conversations, projects and computers, and to intervene from their phone. The underlying assistants generate answers, reason, use tools and enforce their permission rules. GeckIt's contribution is how that work is organized, reached, scheduled, supplied with input and handed back to the person.

## Product feature list

These are product workflows, rather than individual model capabilities. "Site" means the workflow is described on the live website. "Code" means it appears in the inspected source but is absent or only briefly mentioned on the homepage; it does not establish release availability.

| GeckIt feature | What it gives the person | Evidence |
|---|---|---|
| Cross-project work board | See conversations from multiple projects and assistants together, with In progress, In review and Done | [Site: board](https://geckit.app/#board) |
| Attention and review tracking | Identify which conversation is working, needs an answer or is ready to review; open it from a card or notification | [Site: board](https://geckit.app/#board) |
| Card organization | Drag, reorder, move/hide/delete several conversations, group completed work by day, keep favorites or switch to List | [Site: Kanban page](https://geckit.app/claude-code-kanban-board/) |
| Project scopes and profiles | Narrow the whole workspace to chosen projects, or keep work and personal projects apart | [Site: profiles](https://geckit.app/claude-code-kanban-board/) |
| Cross-conversation search | Recover a past decision by searching conversation content without remembering its project | [Site: search](https://geckit.app/claude-code-kanban-board/) |
| Goals connected to task state | Set/view/edit the task's completion condition and see its completion reflected on the board; native goal execution remains the assistant's responsibility | [Site: demo](https://geckit.app/), [code](../client/src/renderer/src/chat/Composer.tsx) |
| Work queues and priority | Leave several follow-ups, drag to reorder them on desktop or phone, edit/cancel them, cap simultaneous work and use board order to prioritize waiting tasks. Message reordering is present in the current working tree | [Code: queue](../client/src/main/sessions/index.ts), [composer](../client/src/renderer/src/chat/Composer.tsx), [phone bridge](../client/src/renderer/src/phone.ts) |
| Delegation and task handoffs | Turn a queued message into another conversation, or review tasks an assistant proposes to start; retain parent/child links | [Code: requests](../client/src/renderer/src/chat/Request.tsx), [CLI](../client/src/cli/start.ts) |
| Recovery after closing | Identify interrupted conversations and selectively continue them; retain pending messages | [Code: recovery](../client/src/renderer/src/chat/CutOff.tsx) |
| General questions apart from work | Ask without adding a project task to the board; keep a question or let it expire | [Site: Ask](https://geckit.app/claude-code-kanban-board/), [code](../client/src/renderer/src/chat/Questions.tsx) |
| Saved prompts and schedules | Turn repeated work into a shortcut, run it from desktop/phone/tray, or schedule it while GeckIt is open | [Site: shortcuts](https://geckit.app/#more) |
| Reusable phrases | Build a follow-up from saved phrases without retyping frequent instructions | [Code: composer](../client/src/renderer/src/chat/Composer.tsx) |
| Screen recording to task | Show a problem and narrate it, then turn the captured words/frames/video into a question or project task | [Site: recording](https://geckit.app/#more), [code](../client/src/main/plans.ts) |
| Spoken work control | Speak a request to start, message, stop or mark work; review the interpreted actions before they run | [Site: Say it](https://geckit.app/#more), [code](../client/src/main/orders.ts) |
| Correct selected text anywhere | Invoke grammar, improvement, translation or explanation without copying text manually into a separate AI chat; restore/copy the result | [Site: Correct](https://geckit.app/#more) |
| Dictation into other applications | Speak where the cursor is and paste the transcription back; also import audio and keep transcription history | [Site: Transcribe](https://geckit.app/#more), [code](../client/src/renderer/src/panel/Transcribe.tsx) |
| Remote Claude work over SSH | Run work on several servers using existing SSH setup; show local and remote tasks on the same board | [Site: hosts](https://geckit.app/#hosts) |
| Remote-run continuity | Keep host work running while the laptop sleeps or disconnects and catch up after reconnection | [Site: hosts](https://geckit.app/#hosts) |
| Phone supervision | See tasks, start work, reply to conversations and answer pending permissions from an iPhone | [Site: phone](https://geckit.app/#phone) |
| Phone access to working files | Open files/folders from a conversation on the phone, including files on a connected host | [Site: files](https://geckit.app/#phone) |
| Phone access to localhost | Open development pages on the phone through the paired computer, including forwarded host links | [Site: localhost](https://geckit.app/#phone), [code](../client/src/main/hosts/forward.ts) |
| Mac control from the phone | Handle a browser/OS dialog that needs a person by viewing the Mac and controlling its pointer/keyboard | [Site: control](https://geckit.app/#phone) |
| Encrypted phone connection and notices | Pair by QR, reach the computer over WebRTC and receive attention notices without a GeckIt conversation-storage service | [Site: pairing](https://geckit.app/#phone), [code: push](../client/src/main/push.ts) |
| Work records available to agents/CLI | Read sessions, board moves and linked work; let agents request new tasks using GeckIt's own command | [Code: CLI](../client/src/cli/index.ts) |
| Pluggable assistant workspace | Add independent assistant libraries while retaining GeckIt's board, phone, scheduling and input workflows | [Code: libraries](../client/src/main/sessions/plugins.ts); main integration on 2026-10-08 |

The first 24 workflows are supported by the inspected website/source. The library workflow was extracted from `feat/agent-vpn` into main on 2026-10-08, independently of the paused VPN feature. GitHub/Linear context-item attachment remains a proposal and is excluded from this current product list. Builtin Codex is local-only; the remote-work claims above concern Claude Code.

## What the previous list misclassified

| Underlying assistant capability | GeckIt's contribution |
|---|---|
| Model answers, reasoning and tool execution | Display and navigation in a shared workspace |
| Manual/Auto/Plan behavior and safety decisions | Controls for the provider's modes and an interface for requests that reach the app |
| Model catalog and reasoning levels | Selection controls; reported metadata and account visibility |
| Native goal execution | Editable completion condition and connection to board state |
| MCP tools, browser tools and Claude Remote Control | Connection selection/management and integration controls |
| Assistant background agents/commands | A discoverable list with output and stop/clear controls |
| Native transcript persistence | Read/resume/search integration and GeckIt's own card metadata |
| AI text transformation and speech recognition | Global invocation, selection/cursor handling, recording/import, clipboard, history and result review |

These integrations belong in a compatibility or interface appendix. They should not be presented as evidence that GeckIt adds reasoning, coding, tool use or model intelligence.

## Website analysis

The hero states the product category and attention problem clearly: a board covering both assistants and every project, with replies available from the phone. The demo ties task creation, another conversation's approval and review state into a workflow. The board page strengthens that with bulk actions, search, profiles and List view.

The strongest product evidence is in Hosts and Phone. Host continuity is a concrete outcome: remote work survives a sleeping/disconnected laptop. Phone screenshots show the intervention itself: pressing a Mac browser button, viewing a changed file and opening a development page. Those are more useful feature descriptions than a catalog of model controls.

The weaker part is the Conversations section: its bullets mix navigation with familiar assistant operations such as file mentions, images and model choices. Read in isolation, that section can make the app sound like another chat interface. The rest of the page supplies the missing product context.

Several substantial workflows receive little attention or none: editable work queues, board-based scheduling priority, selective restart recovery, assistant-requested task handoffs and reusable phrases. Screen recording and schedules are present, but grouped far down the page after the policy section. A product summary should give them explicit workflow descriptions rather than treating every keyboard control as another feature.

The website's principal benefits are supervising parallel work, intervening away from the desk, continuing remote work through disconnection and starting repeatable work with less input. These are analysis of the demonstrated workflows, not claims of measured productivity gains.

## Detailed interface and implementation inventory

The following appendix retains the source-level coverage from the original inventory. It includes inherited capabilities exposed by GeckIt and supporting behavior; it is not a second list of GeckIt-specific product benefits.


Checked on 2026-10-04 against the current checkout, including uncommitted changes. This is a source inventory, not a runtime acceptance test or a claim that every feature is in the installed release. Features are grouped by what the person can do; implementation details and bug fixes are not counted separately.

Evidence: README, the renderer/main IPC contract and handlers, desktop and phone components, main-process modules, UX documents, specifications, and available Git history across local refs. The semantic-search catalog has no GeckIt index, so this inventory uses direct source reads. Some UX files still say `draft` despite having corresponding code; a document's status alone was not treated as proof of implementation.

### Board and projects

Sources: [Board](../client/src/renderer/src/chat/Board.tsx), [Sidebar](../client/src/renderer/src/chat/Sidebar.tsx), [Projects](../client/src/renderer/src/chat/Projects.tsx), [Hidden conversations](../client/src/renderer/src/chat/HiddenChats.tsx), [settings contract](../client/src/shared/api.ts).

- One Kanban board for conversations across projects and enabled assistants.
- In progress, In review and Done columns; blocked state and working, waiting, unread, failed and limit indicators.
- Drag cards between columns and reorder In progress; move cards to the top or bottom.
- Done conversations grouped by date.
- Cards show title, project, assistant state, recent reply, goal, collected links and background activity.
- Select several conversations with Cmd/Ctrl-click or Shift-click; move, hide or delete together.
- Switch between Board and List; retain the chosen view.
- List grouping by project or time; collapse groups and resize the sidebar.
- Favorites at the top of the list, with numbered keyboard access.
- Add or forget local project folders; include conversations from nested folders under their parent project.
- Filter to all projects, one project or a selection; keyboard project picker.
- Persistent project colors and project tags.
- Named profiles containing sets of projects, applied to the board, search, new tasks and shortcuts.
- Hidden-conversation browser, grouped by folder, with reasons, older results, restore to board and add-folder-as-project actions.

### Conversations and input

Sources: [Chat](../client/src/renderer/src/chat/Chat.tsx), [Composer](../client/src/renderer/src/chat/Composer.tsx), [Transcript](../client/src/renderer/src/chat/Transcript.tsx), [Prose](../client/src/renderer/src/chat/Prose.tsx), [Preview](../client/src/renderer/src/chat/Preview.tsx), [session drivers](../client/src/main/sessions/index.ts).

- New task with project, prompt, assistant, mode, model and optional goal.
- Open a conversation over the board or beside the list; rename it.
- Resume conversations started outside GeckIt from supported native assistant history.
- Streaming answers, progress updates, thinking, tool activity, command output, changed-file links and permission/question cards.
- Expand tool details and grouped steps; read assistant-produced images.
- Render formatted text and code; copy answers with text and HTML formatting.
- Paste or drop images, add photos on phone, remove pending attachments, and enlarge/zoom pictures.
- Mention project files or folders with `@`; drop files and carry files to SSH projects.
- Bring back previous messages with Up/Down.
- Dictate directly into the composer, with language switching and stop/cancel controls.
- Save a short message as a reusable phrase; insert several phrases into a draft and edit/remove them in Settings.
- Stop the current answer and retry an unsent message.
- Compact the conversation through `/compact`, with confirmation in the composer.
- Find within a conversation and navigate matches.
- Switch recent conversations with Ctrl+Tab, move to previous/next, or use numbered favorites.
- Open project GitHub repository, file and web links from conversation controls.

### Goals, queues and recovery

Sources: [Composer](../client/src/renderer/src/chat/Composer.tsx), [sessions](../client/src/main/sessions/index.ts), [lineup](../client/src/main/lineup.ts), [CutOff](../client/src/renderer/src/chat/CutOff.tsx), [goals UX](ux/chat-goals.md), [queue UX](ux/conversation-queue.md).

- Set, view, edit or clear a goal in an open project conversation on desktop and phone.
- Keep working toward a goal; native goal updates are reflected in the conversation and card.
- Move completed work to In review automatically; expose blocked goal state.
- Queue multiple follow-up messages while an assistant works.
- Edit queued text without losing its place or pictures; cancel a queued message.
- Delegate a queued message to a new conversation, with or without existing history where the provider supports it.
- Limit conversations working at once: six by default, or no limit.
- Queue new tasks when slots are full; board order determines which waiting conversation goes next.
- Retain queued messages across application restarts.
- Detect work interrupted by GeckIt closing; show affected cards and offer selective Continue on startup.

### Search and general questions

Sources: [Switcher](../client/src/renderer/src/chat/Switcher.tsx), [search](../client/src/main/sessions/search.ts), [Questions](../client/src/renderer/src/chat/Questions.tsx), [asked](../client/src/main/asked.ts), [PhoneQuestions](../client/src/renderer/src/chat/PhoneQuestions.tsx).

- Search conversation titles, project/folder names and text said in conversations.
- Open search with Cmd/Ctrl+P in Chat or the global search shortcut from another application.
- Navigate results by keyboard and open the matching conversation.
- Ask a general question outside any project, kept off the task board.
- List general questions separately, including working/waiting/unread state.
- Delete ordinary questions a day after their last answer; keep selected questions indefinitely.
- Show remaining retention time and keep/delete swipe actions on phone.

### Assistants, models and account information

Sources: providers (`client/src/shared/providers.ts`), provider contract (`client/src/main/sessions/provider.ts`), [Claude](../client/src/main/sessions/claude.ts), [Codex](../client/src/main/sessions/codex.ts), [Status](../client/src/renderer/src/chat/Status.tsx), ModelDetails (`client/src/renderer/src/chat/ModelDetails.tsx`), ProviderUsage (`client/src/renderer/src/chat/ProviderUsage.tsx`).

- Builtin Claude Code and Codex on the person's own signed-in subscription; select which assistants are enabled.
- Choose the assistant for a new conversation; existing conversations keep their provider identity.
- Manual, Auto and Plan modes, mapped to the provider's own permissions.
- Choose models from the provider's catalog; show unavailable models with their reason.
- Choose supported Codex reasoning effort.
- Show account/sign-in state, installed CLI version and installation source.
- Show plan limits, quota windows and reset times, including measurements for connected hosts.
- Show conversation context usage/capacity and reported cost, distinguishing API-equivalent and billed values where provided.
- Show Git branch and checkout changes in the status bar.
- Model details show reported model identity/version, context capacity, maximum output, reasoning, modes and token pricing with source/date when available.
- View and toggle Claude MCP servers.
- Pick a Claude in Chrome browser connection and give connections persistent local names.
- Codex Chrome connection picker and persistent local names are present in the uncommitted tree.
- Claude Remote Control can continue a conversation through claude.ai or the Claude app.
- Hand over a supported conversation to a terminal using the provider's resume command.
- Stream transport for builtin Claude; optional Claude tmux transport via a provider library. Choose the default for new local conversations in Settings > Assistants and change transport on individual conversations in the composer.

Claude tmux history correction (2026-10-08, current working tree): shared Claude transcripts do not establish ownership by the tmux assistant. Its board, search and Hidden results require a GeckIt-created or explicitly restored tmux conversation, using namespaced saved notes and active GeckIt session state. Builtin Claude retains its external-history behavior. Evidence: `Sessions.list`, `Sessions.search`, `Sessions.hidden` and tmux history regression cases in `client/test/sessions.test.ts`; [visibility rules](ux/provider-libraries.md#claude-tmux-conversation-ownership). Transcript and note deletion are not part of this correction. Native full-window light/dark, keyboard, scrolling and viewport verification was unavailable because Computer Use access to GeckIt was denied.

Builtin Codex is local-only in the current provider definition. SSH support must not be advertised as builtin Codex support. MCP, browser integration, Remote Control, history branching and other optional operations depend on the selected provider's capabilities.

### Provider libraries

Sources: [SettingsDialog](../client/src/renderer/src/ui/SettingsDialog.tsx), plugins (`client/src/main/sessions/plugins.ts`), provider author guide (`provider-plugins.md`), standalone Codex example (`examples/codex-provider/README.md`).

Provider libraries and the independent external-provider example were extracted into main on 2026-10-08. Source support does not establish availability in a released installer. The integration excludes Agent VPN settings, admission gates and native routing. Validation passed: 668 tests, typecheck, source/test lint, desktop/mobile builds and the independent provider example test. Light/dark fixture review and keyboard/scroll checks are recorded in [Libraries UX](ux/provider-libraries.md#integration-verification); native runtime profiling and released-installer availability remain unverified.

- Install several independent assistant libraries from public GitHub repository URLs.
- Enable/disable installed independent assistants and select them in new conversations. Claude tmux extends Claude's existing identity, with a default transport choice and a per-conversation transport choice.
- Validate manifests, provider contract and prebuilt entry points during installation.
- Display library identity, repository and update state in Settings > Libraries.
- Automatic update checks at startup and every 24 hours; manual Check now.
- Stage and validate updates, then load them after application restart.
- Confirm removal, move the installed copy to Trash and remove it from new assistant choices; restart unloads existing code.
- Retain conversation notes and native history after library removal.
- Support provider-specific account quotas, cost, model information and pricing.
- Configure generated GeckIt instructions for providers.
- Provide a standalone Codex Mirror example and a documented provider/Driver contract.
- Supply AI-readable build guidance through `geckit instructions providers` and `geckit instructions app`.

### Commands, background jobs and task handoffs

Sources: [shell](../client/src/main/sessions/shell.ts), [Tasks](../client/src/renderer/src/chat/Tasks.tsx), [tasks reader](../client/src/main/sessions/tasks.ts), [Request](../client/src/renderer/src/chat/Request.tsx), [CLI start](../client/src/cli/start.ts).

- A message starting with `!` runs a command in the project and retains its output with the conversation.
- Send input to a running command; stop it or open an interactive command in a terminal.
- Put a long-running command in the background with Ctrl+B.
- List background commands, watches and helper agents; show status and output/helper transcript, stop active work and clear finished entries.
- Let an assistant request new conversations through `geckit start`, singly or in batches of up to 20.
- Review requested tasks, select which to start, add individual notes or a reply, start all or refuse.
- Track parent/child conversation links and request outcomes.
- Carry provider/title/project choices through task handoffs, including explicit provider requests.

### Saved prompts and schedules

Sources: [ShortcutList](../client/src/renderer/src/chat/ShortcutList.tsx), [PhoneShortcuts](../client/src/renderer/src/chat/PhoneShortcuts.tsx), [shortcut runner](../client/src/main/shortcuts.ts), [schedule](../client/src/shared/schedule.ts), [tray](../client/src/main/tray.ts).

- Saved prompts with name, project, goal, assistant, mode, model and supported reasoning choice.
- Create a shortcut from an existing conversation's initial prompt and settings.
- Run from Chat, the menu bar/tray or phone.
- Daily, weekday, weekly and custom cron schedules; enable/pause timetables.
- Show next run, previous run and its conversation.
- Edit/delete shortcuts and run manually without changing the timetable.
- Skip an automatic run if the previous run is still working.
- Timetables run while GeckIt is open; the phone manages the paired computer's schedules.

### Correct

Sources: [Correct](../client/src/renderer/src/panel/Correct.tsx), [correction runner](../client/src/main/correct.ts), [correct session](../client/src/main/correct-session.ts).

- Pick up selected text from another application with Cmd/Ctrl+C then D, or type/paste text into the panel.
- Grammar, Improve, Translate, Explain and Custom instruction actions.
- Choose an enabled correction assistant and model.
- Configure native and second languages for language-sensitive actions.
- Copy the corrected result automatically; restore the prior text with Undo.
- Keyboard access to correction actions.
- Keep correction work out of the normal project board.

### Dictation and transcription

Sources: [Transcribe](../client/src/renderer/src/panel/Transcribe.tsx), [Voice](../client/src/renderer/src/voice/Voice.tsx), [dictate](../client/src/renderer/src/dictate.ts), [transcribe](../client/src/main/transcribe.ts), [Whisper](../client/src/main/whisper.ts).

- Dictate into another application with Cmd/Ctrl+Alt+V; stop and paste, or cancel.
- Record microphone audio in the Transcribe panel, with duration and input-level display.
- Select a microphone.
- Import or drop audio/video files for transcription, including MP3, MP4, M4A, WAV, WebM, Ogg, FLAC and AAC when the platform decoder supports them.
- Retain transcription history with source, time and duration; copy or delete entries.
- Run Whisper locally without an API key.
- Download the speech model on first use, show progress, resume/retry interrupted downloads and verify the completed file.
- Choose dictation language; phone can choose iPhone recognition or the paired computer where supported.

### Screen recording, screenshots and spoken control

Sources: [Record](../client/src/renderer/src/voice/Record.tsx), [recording plans](../client/src/main/plans.ts), [recordings](../client/src/main/recordings.ts), [orders](../client/src/main/orders.ts), [PhoneRecord](../client/src/renderer/src/chat/PhoneRecord.tsx), [PhoneSay](../client/src/renderer/src/chat/PhoneSay.tsx).

- Record the screen while explaining a problem with Cmd/Ctrl+Alt+R.
- Transcribe speech and extract timestamped frames; keep a video file available to the assistant.
- Review the words/frames; Ask about the recording or turn it into a task with project and goal.
- Fill the New task form from a recording.
- Capture a screenshot of the screen under the pointer into a task or question via a global shortcut.
- Import an iPhone screen recording/video and send its words, frames and video through the paired computer.
- Say it with Cmd/Ctrl+Alt+G or phone: start tasks, send messages, stop/open/delete conversations or mark their state.
- Show recognized words and proposed actions; execute after the person agrees.
- Discard unused recording files; clean up retained recording videos older than a week at app startup.

### SSH hosts

Sources: [Hosts](../client/src/renderer/src/chat/Hosts.tsx), [host manager](../client/src/main/hosts/hosts.ts), [SSH transport](../client/src/main/hosts/ssh.ts), [host runs](../client/src/main/hosts/run.ts), [host disk](../client/src/main/hosts/disk.ts), [forwarding](../client/src/main/hosts/forward.ts).

- Add, rename, edit, connect, reconnect, disconnect or remove SSH hosts.
- Offer hosts from the person's SSH configuration; use their SSH agent, config and jump hosts.
- Check host reachability and assistant readiness; offer the host installation action.
- Answer password, passphrase, verification-code and host-key trust requests inside GeckIt; remember/forget encrypted passwords.
- Browse host folders and add remote projects alongside local projects.
- Run supported assistant conversations and commands remotely.
- Keep remote runs alive across network drops, closed lids and app restarts; reattach after reconnect.
- Mirror remote transcripts incrementally and retain last listings for disconnected hosts.
- Read/search cached remote conversations and hidden conversations while disconnected.
- Forward localhost links from the host through SSH to the computer, including phone access through the paired computer.
- Show host labels, connection state, running-work counts and per-host plan usage.
- On phone, browse remote folders and answer host prompts through the paired computer; host management remains on desktop.

### iPhone companion and remote computer control

Sources: [PhoneHome](../client/src/renderer/src/chat/PhoneHome.tsx), [PhoneBoard](../client/src/renderer/src/chat/PhoneBoard.tsx), [phone bridge](../client/src/renderer/src/phone.ts), [pairing](../client/src/shared/pairing.ts), [Screen](../client/src/renderer/src/chat/Screen.tsx), [control](../client/src/main/control.ts), [FileView](../client/src/renderer/src/chat/FileView.tsx), [local pages](../client/src/main/local-page.ts), [push](../client/src/main/push.ts).

- Enable Phone on the computer, scan its QR code, renew the pairing code and connect over WebRTC.
- Pair with/select computers in the phone app.
- Tasks, Questions, Search and Settings tabs; waiting/unread indicators.
- Browse the board by status, project/profile, favorites and date; open conversations and change their status.
- Start tasks/questions, send messages/images, stop work and edit goals.
- Answer permission requests, assistant questions and task-start requests.
- Search conversations and manage profiles, projects, hidden conversations, phrases and shortcuts.
- View assistant/model/account/context information and background jobs.
- Cache previously loaded state, reconnect and load conversation tails before earlier history; fetch older items, grouped tool details and images on demand.
- Browse the paired computer's folders to add projects.
- Open linked files and folders in the phone file viewer.
- Open the computer's localhost web pages inside the phone app; requests, redirects and cookies go through the computer. WebSocket/hot reload does not cross this bridge.
- View the Mac screen, zoom/pan and use Look or Control mode.
- Control the Mac pointer as a trackpad: clicks, multiple clicks, right-click, drag and scroll.
- Type on the Mac and send modifier keys, Escape, Tab and arrows from the phone.
- Remote pointer/keyboard control is implemented for macOS; it is not cross-platform desktop control.
- Receive encrypted push notices when attention is needed away from the Mac, and open the relevant conversation.
- Phone-specific appearance, dictation and consent settings.

### Files, settings, notifications and distribution

Sources: [open with](../client/src/main/open-with.ts), [SettingsDialog](../client/src/renderer/src/ui/SettingsDialog.tsx), [store](../client/src/main/store.ts), [updates](../client/src/main/updates.ts), [Consent](../client/src/renderer/src/ui/Consent.tsx), [Welcome](../client/src/renderer/src/chat/Welcome.tsx), [local data](../client/src/main/local-data.ts), [README](../README.md).

- Open conversation files with system defaults or chosen applications; persist rules by extension or wildcard.
- Open With for one file and Show in Finder/folder.
- Light, dark and system appearance; remembered window bounds and sidebar width.
- First-start setup for projects and permissions; keyboard-shortcut reference and tips.
- Enable/disable individual global shortcuts, useful when installed and Local copies coexist.
- Desktop notifications for completed work and in-app notices from other conversations.
- Shared, persisted settings across windows and reload of external settings-file changes.
- Optional analytics consent; redacted error preview with Never, Later and Send; separate phone consent.
- Automatic/manual updates, Stable and Development channels, download progress and restart after working conversations finish.
- Desktop packaging for macOS Apple Silicon/Intel, Windows and Linux; iPhone companion sources.
- Development copy uses separate `geckit-local` data and CLI, with initial settings/notes copied from the installed app and phone disabled initially.

### Command-line interface and migration

Sources: [CLI](../client/src/cli/index.ts), [start](../client/src/cli/start.ts), [migration](../client/src/main/session-migration.ts), [generated guide](../client/src/main/guide.ts).

- `geckit sessions`: list conversations; filter by today, elapsed time, project, provider, state or favorites; JSON includes creation and board-move history.
- `geckit show`: read conversation text and history, with ID-prefix matching, last-N and JSON forms.
- `geckit start`: request one task or a batch from JSON/stdin, with project, title, goal and provider; report started, queued or refused outcomes.
- `geckit linked`: inspect parent/child tasks and request outcomes.
- `geckit migrate-codex`: transfer GeckIt metadata for Claude conversations already imported by Codex, preserving titles, status, dates, visibility, links, favorites and board order; dry-run and backup. This command migrates metadata, not conversation content itself.
- `geckit instructions providers|app`: self-contained build guidance.
- Generated GeckIt guides for enabled assistants, individually configurable in Settings.

### Proposals and historical differences

- Context items specification (`specs/003-context-items/spec.md`): planned GitHub/Linear/custom context search, issue labels attached to tasks/messages, reusable past selections, named projects containing several folders, context plugins, credential handling/cache and expanded project/provider CLI. No matching context-item implementation is present in the inspected contract, handlers or renderer. These are proposed features, not current assistant libraries.
- API-key correction/transcription settings from older versions are explicitly removed by [store migration](../client/src/main/store.ts). Current builtin correction uses the signed-in assistant; desktop speech uses local Whisper.
- Older architecture docs describe Claude alone, or incorrectly describe Codex as Claude's stream-json process. Current code has separate Claude and Codex drivers; use the current provider definitions for support claims.
- Earlier phone designs used a Shortcuts tab; current code uses Questions and opens shortcuts from Tasks/Settings.
- Optional Claude tmux transport and standalone Codex Mirror are library integrations, not additional builtin assistants shipped unconditionally.

### History checked

The reachable local Git history begins at the 2026-09-30 root snapshot. It is not a complete record of earlier releases. Local refs extend beyond the checked-out HEAD; entries on another ref do not prove the checkout contains them.

| Date | Commit | Relevant change |
|---|---|---|
| 2026-09-30 | `e33f94b`, `c7ffd9a` | Board/list rendering and search/menu selection performance |
| 2026-09-30 | `700ace6` | Previous/next navigation over the board |
| 2026-09-30 | `c948be2` | Interactive command handling after `!` |
| 2026-10-01 | `d576b9f` | Codex support on desktop and mobile |
| 2026-10-01 | `241ca23` | Codex correction and assistant controls |
| 2026-10-01 | `3c73ddd` | Assistant guides moved to Settings |
| 2026-10-01 | `b310735` | View/edit Codex goals in chat |
| 2026-10-01 | `4cf835b`, `d287fad` | Task-start feedback and mobile task/question controls |
| 2026-10-02 | `6a9e158`, `ce10a1b`, `8a05c19` | External settings reload, Codex terminal commands, mobile visibility |
| 2026-10-03 | `2430494`, `238a956` | Progress/final distinction and unloaded Codex thread recovery |
| 2026-10-03, other local refs | `eb46124`, `ce8c76e` | Provider/title inheritance for handoffs and turn-scoped progress |

No application code was changed for this inventory. Runtime behavior, installed-app versions, hosted services and App Store/TestFlight availability were not reverified.
