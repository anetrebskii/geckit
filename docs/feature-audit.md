# GeckIt product features

This is the supporting audit. The concise, user-approved feature list is [docs/features.md](features.md).

Source paths shown as code rather than links refer to files inspected in the source working tree that are not included in this documentation publication. Provider-library and context-item availability remains qualified below.

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
| Pluggable assistant workspace | Add independent assistant libraries while retaining GeckIt's board, phone, scheduling and input workflows | Code: libraries (`client/src/main/sessions/plugins.ts`); uncommitted additions |

The first 24 workflows are supported by the inspected website/source. The library workflow is present in uncommitted code. GitHub/Linear context-item attachment remains a proposal and is excluded from this current product list. Builtin Codex is local-only; the remote-work claims above concern Claude Code.

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
- Type standalone `@Computer` in a Codex prompt to dispatch its structured Computer Use plugin mention. [Codex driver](../client/src/main/sessions/codex.ts), [protocol](../client/src/main/sessions/codex-protocol.ts), [regressions](../client/test/codex.test.ts), [UX](ux/codex.md). Added at Alex's explicit request on 2026-10-05; current working-tree support only. Installed Codex 0.159.3 exposes mention inputs and reports `computer-use@openai-bundled` installed and enabled. Text, images, browser guidance and retry input are retained. Live verification on 2026-10-05 used the actual updated chat driver without runtime overrides: thread `01a10bc3-c931-7e22-97f4-c378e9e238d3` called `cua_repl.js`, opened Bitwarden and verified its window. No vault navigation, unlocking, changes or copying occurred. A Calculator command through the same driver respected an app-access denial. Initial native pipe/tool availability failures were transient; no global configuration or app grants were changed. The development app process started on October 4 needs a restart to load the main-process patch. No renderer layout or styling changed; Chrome was unavailable for visual review.
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
- Stream transport for builtin Claude; optional Claude tmux transport via a provider library.

Builtin Codex is local-only in the current provider definition. SSH support must not be advertised as builtin Codex support. MCP, browser integration, Remote Control, history branching and other optional operations depend on the selected provider's capabilities.

### Provider libraries

Sources: [SettingsDialog](../client/src/renderer/src/ui/SettingsDialog.tsx), plugins (`client/src/main/sessions/plugins.ts`), provider author guide (`provider-plugins.md`), standalone Codex example (`examples/codex-provider/README.md`).

These additions are present in the working tree but have uncommitted implementation files; their presence does not establish release availability.

- Install several independent assistant libraries from public GitHub repository URLs.
- Enable/disable installed assistants independently and select them in new conversations.
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

## Agent VPN configuration - working-tree support

Added at Alex's explicit request to implement configuration and server selection on 2026-10-04. This covers saved profiles only. Desktop Settings imports native single-server AmneziaWG configurations through the OS picker, validates known fields including current AWG3 options, encrypts them separately from settings using safeStorage, names/checks/removes profiles, and persists selection. Invalid imports, insecure encryption, malformed encrypted storage and failed atomic writes retain previous data. Renderer and phone receive no raw configuration. The phone does not expose these controls.

Sources: [non-secret contract](../client/src/shared/vpn.ts), [parser](../client/src/main/vpn/config.ts), [encrypted storage](../client/src/main/vpn/store.ts), [desktop IPC](../client/src/main/vpn/index.ts), [settings](../client/src/renderer/src/ui/AgentVpn.tsx), [configuration tests](../client/test/vpn-config.test.ts), [storage tests](../client/test/vpn-store.test.ts). Offline validation is not a connection test. Configuration-field labels are compatibility summaries, not proof of the remote server's protocol version. Unknown fields and backend-unsupported Peer AdvancedSecurity are rejected explicitly.

Native routing is unavailable and Connect is disabled with an explicit statement that saved servers do not change agent networking. No provider, tmux, command, DNS, browser or remote agent protection is claimed. No system routes, VPN identity, provider credentials, proxy environment or assistant prompts are changed. No release support is established by this working-tree implementation.

Chrome reviewed real SettingsDialog/AgentVpn and stylesheet in light/dark at 1352x706 and390x844 using non-secret fixture metadata. Reviewed selection/rename/offline check, import/invalid/cancel, encryption/corrupt-store/write errors, removal confirmation/cancel/Escape, help/focus and scrolling. Fixed a125pixel narrow content column with a VPN-only responsive layout, and fixed native-white dark input styling using the existing text-input selector. [Screenshot](design/agent-vpn-settings.jpg) is configuration-only preview evidence, not a live tunnel.

Performance review: no per-conversation work, polling, formatter creation or continuous animation. Saved servers are bounded to32 and displayed in a native select. Narrow navigation and page scroll separately. Phone rebuilt after shared UI changes. Native routing requirements and packet-capture acceptance tests remain unfinished in [tasks](../specs/004-agent-vpn/tasks.md).

### Setup clarity and demonstration - historical, demo removed

The demonstration described below was removed at Alex's request. See the removal evidence at the end of this audit.

At Alex's explicit request on2026-10-04, setup now shows a visible3-step Amnezia native export/import guide, a primary Import .conf file action, Configuration only notice and Configuration to use later selection. The disabled Connect dead end is removed. Offline checking is labelled Check file. Action feedback appears near its triggering controls; secure-storage failures appear before setup.

The former `AgentVpnDemo.tsx` provided an on-demand export/import/saved-not-connected demonstration with Play/Pause/Replay, manual scenes and Close/Escape. It never called profile APIs. Playback ran once, used HTML transform/opacity only, paused out of view or when document.hidden, and cleaned up on unmount. Reduced motion used static manual scenes. Hidden-tab behavior was source-reviewed; offscreen pause and the remaining controls were exercised in Chrome, because browser automation activates observed tabs.

Real components reviewed in Chrome light/dark at 1352x706 and390x844, including invalid/storage/write errors, selection/rename/check/removal/cancel/focus, finite playback and fixture reduced motion. No horizontal document overflow. [Setup evidence](design/agent-vpn-setup.jpg), [demonstration evidence](design/agent-vpn-demo.jpg). Final688tests/61files, lint, typecheck, desktop and phone builds passed. No native Electron UI/CPU verification or VPN routing claim is made.

The Apple UI revision replaces the rejected swapped-card illustration with persistent Amnezia/GeckIt surfaces and one configuration file traveling to the import slot and saved row. Named steps and one playback action retain finite playback, pause/restart, static reduced-motion navigation and profile independence. Chrome review in both themes and viewports fixed observed layout and animation specificity defects; final motion reaches the saved row. [Revised walkthrough evidence](design/agent-vpn-walkthrough.jpg) and [UX/review](../specs/004-agent-vpn/design.md). The same 688 tests, lint/typecheck and both builds passed after this revision; native routing remains unfinished.

### Bottom-bar status and settings entry

At Alex's explicit request, desktop Chat now shows a quiet VPN status control across provider footer branches. [AgentVpnStatus](../client/src/renderer/src/ui/AgentVpnStatus.tsx) reads the existing non-secret configuration view, subscribes to broadcasts, refreshes on focus and guards stale reads. Loading and read failure remain explicit. Current runtime displays VPN unavailable; saved names are tooltip metadata, never connected status. [Chat](../client/src/renderer/src/chat/Chat.tsx) opens existing Settings directly at Agent VPN and restores focus on dismissal. Phone renders no VPN control or API calls.

Real Status/Settings preview reviewed light/dark at 1352x706 and 390x844: click/Enter/Space, Escape/Done/scrim focus return, ordinary General entry, live selection/rename, loading/error/empty/storage states and quota overflow. VPN control stayed visible after horizontal scrolling; typing caused no extra fixture view reads. [Screenshot](design/agent-vpn-footer.jpg), [design evidence](../specs/004-agent-vpn/design.md). 688 tests/61 files, lint/typecheck, desktop/mobile builds and diff check passed. Native Electron interaction remains unverified; native routing, reconnect and live switching remain unimplemented.

### Mobile VPN status - 2026-10-04

Implemented at Alex's explicit request. `chat/PhoneAgentVpn.tsx` mounts one memoized status/sheet instance in the visible home or conversation location. `PhoneHome.tsx` places it above the tab bar; `Chat.tsx` places it below the composer. `PhoneSettings.tsx` adds Settings > Host > Agent VPN. The sheet names the paired computer, shows saved selection without a connected claim and offers Refresh status. Keyboard state hides the footer; conversation safe-area inset is held by the footer rather than duplicated in the composer.

`main/vpn/index.ts` supplies existing non-secret AgentVpnView; `main/index.ts` exposes only `agentVpn.view` in the phone allowlist and forwards `vpn:changed` through the existing peer. `phone.ts` implements the read/subscription, immediate offline rejection and connection events, and ignores stale old-link VPN traffic. Import/select/rename/remove/check reject locally. No VPN view is persisted on the phone, no keys/configuration are forwarded, and no polling, native routing or reconnect action is added. `phone-vpn.test.ts` covers the read/mutation boundary, disconnect/reconnect, stale traffic, send failure and old-host errors.

Chrome reviewed real footer/sheet with synthetic metadata in dark/light at 390x844 and 375x667: loading, unknown, offline/reconnect, empty/saved configurations, live rename, long names, scrolling, touch target, keyboard fixture, typing without extra reads, direct Host settings entry, Tab cycling, Escape/Done/swipe dismissal and return focus. Review found and fixed Done return-focus timing with layout cleanup before the parent's focus callback. Desktop direct Settings and focus return passed in dark/light. [Footer screenshot](design/agent-vpn-mobile-footer.jpg), [settings screenshot](design/agent-vpn-mobile-settings.jpg), [design evidence](../specs/004-agent-vpn/design.md). Final checks: 691 tests/62 files, lint, typecheck, desktop/mobile builds and diff check passed. Physical iPhone, native Electron interaction, real network protection and runtime switching remain unverified or unimplemented as stated above. No installed/released mobile update is claimed.

### Required VPN admission - 2026-10-04

Alex explicitly requires configured agents to stay stopped without a connection. This supersedes earlier configuration-only behavior above. [VpnAdmission](../client/src/main/vpn/admission.ts) starts closed; [main startup](../client/src/main/index.ts) loads encrypted configuration before provider construction and recovery. Any saved profile or unreadable retained file requires VPN, regardless of selection. Current runtime remains unavailable, so required admission rejects GeckIt agent/provider dispatch, correction and SSH handoffs. Phone calls reach the same main-process guards; the renderer preserves draft text and shows the VPN reason.

[Sessions](../client/src/main/sessions/index.ts) rechecks asynchronous dispatch, retains queued messages and pending handoffs on denial, and preserves recovery metadata. Activation requests cancellation of owned drivers, commands and corrections. [Provider wrapper](../client/src/main/sessions/admitted-provider.ts) guards provider control; [Codex RPC](../client/src/main/sessions/codex-rpc.ts) checks requests, including existing-daemon calls, while permitting cancellation. Plugin modules are not evaluated on blocked startup; final readable profile removal reloads providers and releases application admission. Built-in disk reads and already loaded renderer history remain available; cold Codex history uses provider RPC and is blocked.

Desktop shows VPN required and mobile Host VPN required. Setup instructions and demo explain that saving a profile blocks work. Refresh status remains a status read, not Reconnect. Native tunnel routing, packet isolation, real connection/reconnect, external/detached processes and existing shared tmux protection remain unimplemented or unverified. No operating-system network protection is claimed. No installed or released update is claimed.

Chrome reviewed real components and stylesheet with synthetic metadata at desktop1352x706 and mobile390x844/375x667 in light/dark. Verified required, empty, offline, unknown, corrupt and insecure-storage states; direct footer/Host settings entry; refresh, keyboard focus/return, long-name scrolling, removal with another profile retained and final removal; demo endpoint. No horizontal overflow; typing did not add view reads. [Desktop evidence](design/agent-vpn-required.jpg), [phone evidence](design/agent-vpn-mobile-required.jpg). Performance review found no new per-row work, polling, formatter construction or continuous motion. Native Electron/iPhone performance remains unmeasured. Final705tests/63files, lint/typecheck, desktop/mobile builds and diff check passed. Tests include closed startup, local/SSH dispatch denial, asynchronous activation, RPC refusal, queue/recovery retention, pending handoff accounting, correction refusal and plugin reload races.

### Footer visual integration correction - 2026-10-04

Alex rejected the outlined VPN control in the board screenshot. Earlier Settings screenshots did not establish footer quality. The current working-tree footer uses a borderless gear-first action, 32-pixel utility strip with 24-pixel action, and separate labeled keyboard-scrollable provider group. State/read/admission behavior remains unchanged. Real Board/TopBar/Status preview supports sparse and dense synthetic cards for full-context review.

Chrome visual and interaction review covered full dense/sparse boards in both themes, 1394x1124 supplied screenshot dimensions, 1352x706, 760x520 supported desktop minimum, independent 390x844 footer stress, hover, focus, direct Settings, dismissal/return focus and provider quota overflow. Shared mobile status retained 44-pixel target in both themes. [Dark screenshot](design/agent-vpn-footer-integrated.jpg), [light screenshot](design/agent-vpn-footer-integrated-light.jpg), [detailed review/limits](../specs/004-agent-vpn/design.md#footer-visual-self-review-result). Typecheck, changed-file ESLint, both builds and diff check passed. Performance checklist found no new per-row work or continuous animation. No installed/released update or native-app verification is claimed.

### Setup demo removal - 2026-10-04

Alex explicitly rejected the demonstration and requested removal. Removed Watch setup demo, AgentVpnDemo.tsx, demo state/ref/Escape handling, playback/scene controls, animation CSS and the preview-only reduced-motion override. Numbered export/import instructions, real Import .conf file and saved-server operations remain. The canonical feature entry no longer advertises a demonstration. Earlier demo artifacts are historical.

Chrome review used real SettingsDialog/AgentVpn and stylesheet with synthetic profile metadata: light/dark at 1352x706 and 390x844, plus the supplied 1062x848 dimensions. Reviewed full-screen hierarchy/alignment/spacing, empty/saved states, import, selection, rename, offline check, keyboard focus, scrolling, direct footer entry and Escape return focus. No demo controls or horizontal document overflow remained. [Simplified settings evidence](design/agent-vpn-no-demo.jpg). Typecheck, focused ESLint, desktop/mobile builds and diff check passed. Native Electron/iPhone interaction remains unverified; VPN runtime remains unimplemented.

Performance review: no problems found. Removed animation/timer/observer work; no new per-row work, formatter, polling or animation. Compositor/hidden-animation requirements hold through removal; ten other checklist items are unchanged or not applicable. Native performance measurement remains unavailable. Phone rebuilt.

### Encrypted packet transport progress - 2026-10-04

The user renewed the request for a complete working VPN. Implemented a host-owned AmneziaWG packet helper in [native transport](../client/native/agent-vpn/README.md), with [build script](../client/scripts/agent-vpn.sh). Race tests exercised generated AWG1/2/3 peers, TCP/UDP/IPv6/DNS, gateway-down and wrong-key refusal, fresh restart, closed/malformed pipes, startup cancellation and secret-free configuration failure. macOS ARM/Intel, Linux ARM/Intel and Windows Intel compilation passed, plus go vet, module verification, shell syntax and diff checks. [Detailed evidence and remaining work](../specs/004-agent-vpn/research.md#encrypted-transport-progress---2026-10-04).

This is not a working user-visible connection and is not packaged or wired to agent admission. No native arbitrary-process isolation, real self-hosted-server use, PC VPN independence or plugin/SSH protection is established. Alex subsequently selected native macOS execution; no VM was created or substituted. The canonical feature entry stays unchanged because no additional user-visible VPN workflow is working.

### Native macOS qualification bundle - 2026-10-04

Implemented [native controller, packet-tunnel system extension and agent runner](../client/native/macos-vpn/README.md), with [reproducible bundle/signing script](../client/scripts/macos-vpn.sh). Private packet pipes connect the extension to the tested AmneziaWG transport. The controller requires provisioned signatures and source-application routing, matches the signed runner and its spawned tools, and stores no private configuration in VPN preferences. Startup timeout and serialized lifecycle prevent a stopped start from launching an untracked helper or completing a later connection generation.

Swift warnings-as-errors compilation, ad-hoc bundle signature verification, native metadata/dual-stack route/DNS/framing checks and four provisioning/metadata tests passed. Ad-hoc restricted-entitlement execution was killed by macOS with exit 137; no extension was installed or preference saved. Existing profiles still do not authorize this extension. Apple Developer team MQKD7Z7V2L is signed in; automatic approval review rejected selecting Network Extensions and System Extension capabilities without specific authorization. Requested approval for the two App IDs and their Developer ID profiles. Installed eligibility, packet capture, kill-switch behavior, app integration and real reconnect remain unfinished.

### Intended routing explanation - 2026-10-05

At Alex's explicit request, desktop Agent VPN settings and the paired-computer phone sheet explain the separate agent connection and intended internet blocking after disconnection. [AgentVpnRouting](../client/src/renderer/src/ui/AgentVpnRouting.tsx) reuses the SSH-host visual pattern with persistent agent, AmneziaWG and internet nodes, one finite request/reply sequence, a disconnected waiting state, manual state controls and Pause/Resume/Replay. It pauses offscreen/hidden, honors reduced motion and makes no backend call. The rejected setup demo remains removed. Current admission-only enforcement is stated separately from the illustration; no working tunnel or packet kill switch is claimed.

[UX and visual review](../specs/004-agent-vpn/design.md#routing-explanation-review---2026-10-05) records full-context Chrome review in both themes across desktop, narrow settings and compact phone sizes, keyboard/dismissal/scrolling, loading/read failure, profile operations, motion and reduced-motion fixtures. Fixed state-dependent node movement and narrow-label space. Typecheck, focused ESLint, 11 admission/phone-boundary tests, both production builds and diff check passed. Native app/iPhone execution and hidden-tab timing remain unavailable; installed routing still requires the pending provisioning approval and runtime qualification.
