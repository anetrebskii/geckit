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
| Attention and review tracking | Identify which conversation is working, needs an answer or is ready to review; open it from a card or notification. In the working tree, on Windows the count of conversations waiting is on the taskbar icon, the window flashes for a question, and a sound can be turned on | [Site: board](https://geckit.app/#board), [working tree](#attention-on-windows---2026-10-13) |
| Card organization | Drag, reorder, move/hide/delete several conversations, group completed work by day, keep favorites or switch to List. In the working tree, show one column on its own, open a conversation below the board, or let a quiet conversation's process go without hiding its card | [Site: Kanban page](https://geckit.app/claude-code-kanban-board/), [board layout](#board-layout---2026-10-13), [letting go](#letting-a-process-go---2026-10-13) |

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
- Send a selected queued message into active work through "Send now" on desktop or phone. Main implements builtin Codex `turn/steer` and builtin Claude next-priority input through optional [Driver.inject](../client/src/main/sessions/heard.ts), [atomic queue delivery](../client/src/main/sessions/index.ts), [composer](../client/src/renderer/src/chat/Composer.tsx) and the phone bridge. Delivery failure retains the message; pending delivery locks competing queue actions. Existing API v1 libraries without the method keep normal queue behavior. The independent Codex example is rebuilt with steering; the external tmux implementation and deterministic tests are preserved in [its reviewable patch](claude-tmux-steer.patch). This describes main source support; released installers and installed external-library versions must be checked separately. Requested explicitly by Alex on 2026-10-09.
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

Assistant status update (2026-10-08, current working tree): desktop compact summaries cover every enabled assistant independently; the phone Tasks footer opens all accounts in a sheet. Plan, program version/installation, every reported quota and reset time remain in details. Claude SSH usage retains account grouping and disconnected last-measured labels. Evidence: `chat/AssistantStatus.tsx`, `chat/accounts.ts`, `chat/Status.tsx`, `chat/PhoneBoard.tsx`, `test/accounts.test.ts`, [UX](ux/assistant-status.md), [design and visual review](../specs/004-assistant-status/design.md). No released installer or device deployment is claimed.

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
- Builtin Claude Code and Claude Code (tmux) from its provider library appear as separately enabled assistants. The library runs Claude account, model and native-history operations from its own copy of GeckIt's Claude code and reads plan limits from `/usage` in its own tmux session every 15 to 30 minutes; its GeckIt session IDs are distinct. Existing conversations remain associated with the assistant they use.

Claude tmux history correction (2026-10-08, current working tree): shared Claude transcripts do not establish ownership by the tmux assistant. Its board, search and Hidden results require a GeckIt-created or explicitly restored tmux conversation, using namespaced saved notes and active GeckIt session state. Builtin Claude retains its external-history behavior. Evidence: `Sessions.list`, `Sessions.search`, `Sessions.hidden` and tmux history regression cases in `client/test/sessions.test.ts`; [visibility rules](ux/provider-libraries.md#claude-tmux-conversation-ownership). Transcript and note deletion are not part of this correction. Native full-window light/dark, keyboard, scrolling and viewport verification was unavailable because Computer Use access to GeckIt was denied.

Builtin Codex is local-only in the current provider definition. SSH support must not be advertised as builtin Codex support. MCP, browser integration, Remote Control, history branching and other optional operations depend on the selected provider's capabilities.

### Provider libraries

Sources: [SettingsDialog](../client/src/renderer/src/ui/SettingsDialog.tsx), plugins (`client/src/main/sessions/plugins.ts`), provider author guide (`provider-plugins.md`), standalone Codex example (`examples/codex-provider/README.md`).

Provider libraries and the independent external-provider example were extracted into main on 2026-10-08. Source support does not establish availability in a released installer. The integration excludes Agent VPN settings, admission gates and native routing. Validation passed: 668 tests, typecheck, source/test lint, desktop/mobile builds and the independent provider example test. Light/dark fixture review and keyboard/scroll checks are recorded in [Libraries UX](ux/provider-libraries.md#integration-verification); native runtime profiling and released-installer availability remain unverified.

- Install several independent assistant libraries from public GitHub repository URLs.
- Every installed library adds its own assistant entry and can be enabled or disabled without replacing a builtin or other library; select it for new conversations.
- Validate manifests, provider contract and prebuilt entry points during installation.
- Display library identity, repository and update state in Settings > Libraries.
- Show load errors for installed libraries and offer Reinstall from the same GitHub repository when the provider ID and source are known. Reinstallation validates the replacement before swapping it in and preserves the failed copy if loading fails.
- Automatic update checks at startup and every 24 hours; manual Check now.
- Stage and validate updates, then apply them in Settings without restarting. Active turns finish on the old code; the next message resumes with the new version.
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

### Phone companion (iPhone and Android) and remote computer control

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
- View the computer's screen, zoom/pan and use Look or Control mode.
- Control the computer's pointer as a trackpad: clicks, multiple clicks, right-click, drag and scroll.
- Type on the computer and send modifier keys, Escape, Tab and arrows from the phone; a Windows computer's keys read Ctrl, Alt, Win and Shift.
- Remote pointer/keyboard control is implemented for macOS (`osascript` over CoreGraphics) and Windows (`main/control-windows.ts`: one PowerShell running `userData/phone-hand.ps1` over `SendInput`, per-monitor DPI aware, text typed as Unicode whatever the layout); not on Linux. On Windows it cannot press in windows run as administrator or in the UAC prompt, and where a policy or antivirus stops PowerShell compiling it (Constrained Language Mode, AppLocker) the phone is told Windows would not let it, after three quick failures, for a minute at a time.
- Receive encrypted push notices when attention is needed away from the Mac, and open the relevant conversation (iPhone only; Android has no push yet).
- Android app (`mobile/android`, working tree, built as an APK, not in Google Play): pairing by QR or a `geckit://` link, the board and conversations, sending, dictation heard by the phone or the host, the computer's screen and control, localhost pages through the computer, and screen recordings with frames and their words heard by the host; Android's Back closes what is open last; Android 8 and later.
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
- Generated GeckIt guides for enabled assistants, individually configurable in Settings. The command itself is written as `~/.geckit/bin/geckit`, a shell script; in the working tree, on Windows a `.cmd` beside it as well, and the application there listens on a named pipe rather than a socket file ([working tree](#the-command-line-on-windows-2026-10-19-working-tree)).

### Proposals and historical differences

- Context items specification (`specs/003-context-items/spec.md`): planned GitHub/Linear/custom context search, issue labels attached to tasks/messages, reusable past selections, named projects containing several folders, context plugins, credential handling/cache and expanded project/provider CLI. No matching context-item implementation is present in the inspected contract, handlers or renderer. These are proposed features, not current assistant libraries.
- API-key correction/transcription settings from older versions are explicitly removed by [store migration](../client/src/main/store.ts). Current builtin correction uses the signed-in assistant; desktop speech uses local Whisper.
- Older architecture docs describe Claude alone, or incorrectly describe Codex as Claude's stream-json process. Current code has separate Claude and Codex drivers; use the current provider definitions for support claims.
- Earlier phone designs used a Shortcuts tab; current code uses Questions and opens shortcuts from Tasks/Settings.
- Claude Code (tmux) and Codex Mirror are optional library assistants, not builtin assistants shipped unconditionally.

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

## Plugin diagnostic logs - 2026-10-09

Alex explicitly requested plugin logging for all current plugins. The source adds a scoped logger to API v1 library factories, per-library JSONL files under `userData/provider-logs`, ordered asynchronous writes, redaction, nonfatal failures and 2 MiB current/previous file rotation. Host loading and `limits.host.*` events identify app requests; plugin events identify backend activity separately. Updated Claude tmux audits actual `/usage` submission, skip reasons, sent-message counters and cooldown times. Codex Mirror records actual rate-limit RPC outcomes. OpenCode + Ollama records cached capacities and transport/turn outcomes. Normal instrumentation excludes prompts, replies, tool arguments, credentials and backend bodies.

Evidence: [logger](../client/src/main/sessions/plugin-logs.ts), [factory API](../client/src/main/sessions/plugin-api.ts), [loader](../client/src/main/sessions/plugins.ts), [guide](provider-plugins.md#local-diagnostic-logs), [UX](ux/plugin-logs.md), [spec and verification](../specs/008-plugin-logs/), and both maintained provider examples. The published external tmux, OpenCode + Ollama and Codex Mirror sources also implement logging. Files are inspected locally; there is no new app viewer or upload. This is source support, not a released/installed app claim.

## Assistant status overview - 2026-10-08

Alex requested design and implementation for all enabled assistants on desktop and mobile. In the working tree, independent labeled desktop summaries and the phone Tasks Assistants disclosure open shared account details. The overview preserves each assistant identity, reports missing information explicitly, and keeps Claude host account grouping and disconnected measurements. Plan, CLI version/installation and every reported quota are available in details; opening status does not switch the conversation assistant.

Evidence: `client/src/renderer/src/chat/AssistantStatus.tsx`, `Status.tsx`, `PhoneBoard.tsx`, `docs/ux/assistant-status.md`, `specs/004-assistant-status/`. Validation results are recorded in that feature's design handoff; this does not establish released installer availability.

## Settings-only limits and compact queued send - 2026-10-09

Phone Kanban correction (2026-10-12, working tree): Alex again requested removing the restored mobile limits footer. `chat/PhoneBoard.tsx` no longer imports or renders `AssistantStatus`; `chat/PhoneSettings.tsx` retains its assistant summary and full details sheet. Desktop status is unchanged. See the 2026-10-12 revision in `docs/ux/assistant-status.md` for UI and build verification.

Alex requested a smaller Send now control and account limits only in Settings. The working tree uses a send-arrow icon (spinner during delivery) with the existing accessible action label, a 24px desktop control and 44px phone target. Desktop and phone board footers, phone high-usage alerts, model-details quota sections and conversation-info account limits are removed. Settings > Assistants > Account and limits opens the shared account details for builtin providers, libraries and Claude host accounts. Conversation context and actionable provider failures remain on the conversation.

Evidence: `chat/Composer.tsx`, `chat/AssistantStatus.tsx`, `chat/Chat.tsx`, `chat/PhoneBoard.tsx`, `chat/PhoneInfo.tsx`, `chat/ModelDetails.tsx`, `chat/PhoneSettings.tsx`, `ui/SettingsDialog.tsx`, and `styles.css`. UX revisions: [queued send](ux/send-queued-now.md#revision---2026-10-09), [Settings-only limits](ux/assistant-status.md#revision---2026-10-09-limits-in-settings). This supersedes earlier footer-placement descriptions for the working tree; no installed/device release is claimed.

## Letting a process go - 2026-10-13

Anton asked for a way to end a finished conversation's process without hiding or deleting its card, as closing a terminal would. In the working tree the card menu on the board and the row menu in the sidebar offer "Let the process go" while a process holds the conversation, no turn or background task is running, and Remote Control is off; it does what the ten quiet minutes do, sooner. The card stays, the conversation on disk is whole, and the next message takes it up again from the tool's file. The summary sent to the window now says whether a process holds a conversation (`held`), and says so again when one is let go, by hand or by the quiet time.

Evidence: `client/src/main/sessions/index.ts` (`handOver`, `held` in the list), `client/src/shared/api.ts` (`letsGo`), `chat/Board.tsx`, `chat/Sidebar.tsx`, `chat/useChat.ts`, `client/test/sessions.test.ts`, `docs/ux/let-go.md`. Tried by hand on Windows 11 from the source; this is source support, not a released-app claim.

## Attention on Windows - 2026-10-13

Proposed by Anton, who works on Windows with many conversations open. In the working tree, on Windows the count of conversations waiting for the person is drawn over the Chat window's taskbar icon, the window flashes in the taskbar for a notice while it is behind another (Settings, General: for questions by default), and a sound can be chosen for a notice on every platform (off by default). The defaults keep the notices as they were; the Mac's Dock and the phone are unchanged.

Evidence: `client/src/main/overlay.ts`, `client/src/main/index.ts`, `client/src/main/windows.ts`, `client/src/renderer/src/ui/SettingsDialog.tsx`, `client/src/shared/api.ts`, tests `client/test/overlay.test.ts` and `client/test/notices.test.ts`, UX in [attention on Windows](ux/windows-attention.md). Tried by hand on Windows 11 from the source; not on macOS or Linux. This is source support, not a released/installed app claim.

## Board layout - 2026-10-13

Proposed by Anton, who works on Windows with many conversations open. In the working tree the board gains a Columns control in the top bar (every column, or In progress, In review or Done alone across the board, its cards as tiles), and a button in an open conversation's head that opens conversations below the board instead of over it, the board kept as a strip across the top whose lower edge is dragged. Every default keeps the board as it was; the phone is unchanged.

Evidence: `client/src/renderer/src/chat/Board.tsx`, `Chat.tsx`, `styles.css`, `ui/Icon.tsx`, `ui/Shortcuts.tsx`, `client/src/shared/api.ts`, `client/src/shared/order.ts`, tests `client/test/board-columns.test.ts`, UX in [board layout](ux/board-layout.md) and the [views revision](ux/views.md#revision---2026-10-13-the-columns-control). Tried by hand on Windows 11 from the source. On macOS, the actual renderer was reviewed in a browser with native IPC fixtures in light and dark themes; native app UI inspection was unavailable. Alex tested the isolated desktop build and requested a larger resize target. The target is now 20 px tall with a visible center grip and immediate hover feedback; offset grabs and double-click reset were verified. Linux UI was not reviewed. This is source support, not a released/installed app claim.

## VPN IP check and session error retry - 2026-10-11

Alex requested this feature and then requested a separate Settings tab. Working-tree implementation adds disabled-by-default public IP checking, canonical exact IPv4/IPv6 lists, atomic policy saves and explicit fail-closed explanations. Computer settings apply to phone session requests. Main gates session creation/resume, messages, queued dispatch/injection, permission answers and automatic grants, mode escalation, goals, task handoffs/delegation, restart/reattach and Remote Control. Failed checks retain the operation for deliberate Try again. Cancelling the check prevents late dispatch; queue edit/cancellation preserves identity. Provider errors offer continuation through Try again, while Stop retains Continue. Unrelated drafts and attachments survive retry.

Evidence: `client/src/main/vpn-ip.ts`, `shared/vpn-ip.ts`, `main/store.ts`, `main/sessions/index.ts`, `main/index.ts`, `ui/VpnIpSettings.tsx`, `ui/SettingsDialog.tsx`, `chat/PhoneSettings.tsx`, `chat/Transcript.tsx`, `chat/Composer.tsx`, `chat/useChat.ts`, preload and phone bridge. Tests: `client/test/vpn-ip.test.ts`, `store.test.ts`, `sessions.test.ts`, `requests.test.ts`, `transcript.test.ts`. [Approved UX](ux/vpn-ip-guard.md), [prototype](design/vpn-ip-guard.html), [design and verification](../specs/009-vpn-ip-guard/verification.md).

Periodic protection, approved with "implement it" and then made automatic under the main VPN IP check flag on 2026-10-11, adds one immediate/ten-second shared check while owned work is active. Silent successes do not broadcast session lists. Failure interrupts supported active drivers, requests background/Remote Control stops, pauses native Codex goals and parks existing queues. Held recovery survives late provider finishes and restart; started work continues without prompt replay, known unsent operations retain exact content, expired cards are removed and Try again stays disabled through pending recovery. Native pause acknowledgement precedes explicit fresh-check/resume; cancellation prevents late dispatch. Evidence: `client/src/main/sessions/vpn-monitor.ts`, `sessions/{index,codex,provider}.ts`, `shared/api.ts`, `ui/VpnIpSettings.tsx`, and `test/{vpn-monitor,sessions,codex,store,transcript}.test.ts`.

Send again correction: resolve the selected saved message before IP checks and queue persistence; renderer preserves unrelated draft/photos. Five added session regressions cover busy queue payloads, refusal/retry, restart and legacy recovery; full suite passes 827 tests. Accepted queued retries now hide only their original Send again action; cancellation restores it. Queue/provider-history identity reconciliation prevents duplicate copies and stale retry actions after successful resend and reopening. Full suite passes 831 tests. See verification for component-review and live-hook limits.

This verifies the GeckIt computer via family-specific ipify probes and does not establish every destination route, verify SSH-host egress or guard selected-text correction/account lookups. Polling and supported-provider interruption cannot prevent traffic between checks. SSH/offline host and native control failures remain best effort, not guaranteed immediate termination. Automated fakes and isolated real-component previews were used; installed app, device/VPN and release availability are not claimed.

Single-switch correction (2026-10-11): VPN IP check automatically enables active-work monitoring/stopping. Removed independent Settings field/control; legacy false is discarded on load/write. Evidence: production policy in main/index.ts, store migration, master-on/off integrations in test/store.test.ts and shared VpnIpSettings desktop/phone component. Full 828 tests and desktop/mobile builds pass; full-window light/dark desktop and phone review recorded in specs/009-vpn-ip-guard/verification.md. Local phone build is a development snapshot; paired desktop must load the updated backend separately.

### Lookup recovery (2026-10-14, working tree)

Alex requested the Claude VPN plugin improvements in GeckIt too. The shared verifier now gives each required family three attempts inside the original ten-second deadline: ipify, Amazon HTTPS (IPv4) or icanhazip HTTPS (IPv6), then ipify again. Per-attempt cancellation bounds even an unresponsive transport. A stable-policy valid mismatch rejects immediately and cancels the other family; unavailable verification still blocks. Existing policy revalidation, disabled behavior, fresh sends and shared periodic cadence remain. Existing electron-log application logs retain failed attempts, endpoint, family, elapsed time, network error code/message, recovery and final exhaustion; first-attempt success stays silent, log failure cannot alter the result, and response bodies are excluded.

Evidence: `client/src/main/vpn-ip.ts`, `client/test/vpn-ip.test.ts`, updated service disclosure in `ui/VpnIpSettings.tsx`, [UX](ux/vpn-ip-guard.md#lookup-recovery---2026-10-14) and [verification](../specs/009-vpn-ip-guard/verification.md). Focused VPN tests pass 66 cases. Types, full npm lint and desktop/mobile builds pass. The full suite passes 940 tests across 71 files. An initial file-watcher timing failure passed in isolation and in the final full run. Actual Settings components were inspected in Chrome: light desktop 1440x900, dark desktop 1024x768, light phone 390x844, dark phone 320x844; disclosure wrapping, keyboard save, validation and Escape/reopening passed using a fixture native settings boundary. No active app restart or installed-device verification is claimed.

Main integration verification: isolated delivery contains only the eight VPN files; 941 tests across 71 files, types, full lint and desktop/mobile builds pass on current remote main. The extra test comes from an upstream settings change. Reviewed VPN implementation/component files match the earlier snapshot.

### Computer Use app-access remembering (2026-10-14, working tree)

Alex approved the conversation-scoped UX revision with "Implement it". Recognized empty `cua_repl` app-access confirmations show Decline, Allow once and Allow for this session on desktop and phone; Escape cancels. Alex requested this direct session action instead of the initial checkbox. Explicit remembered acceptance caches exact server, mode, message, schema and metadata in one live driver; subsequent identical requests receive `accept` with empty content without a card. Allow once remains one-time. Other apps, changed requests, already-visible concurrent cards and other conversations retain independent approval. Completed turns keep the choice; Stop, interrupted completion, disconnect, driver end/replacement and app restart clear it. No persistent grant or reviewer bypass is introduced.

Evidence: [UX](ux/codex-mcp-approvals.md), `client/src/shared/elicitation.ts`, `client/src/main/sessions/codex.ts`, `client/src/renderer/src/chat/Elicitation.tsx`, `client/test/elicitation.test.ts` and `client/test/codex.test.ts`. The focused protocol/form suite passes 105 tests; the full suite passes 926 tests across 71 files. Typecheck, direct `eslint src test`, desktop build and phone build pass. Initial browser review was blocked; browser access recovered and the actual renderer preview was verified on desktop/phone in both themes, including all three actions, identical repeats, keyboard/focus, cancellation and scrolling. Preview native/provider APIs are fixtures; real Mail integration remains unverified. No release, installation or active-session restart is claimed.

Main delivery verification, October 14: isolated snapshot contains only this task's nine files. All 921 tests across 71 files, typecheck, direct source/test lint and desktop/phone builds pass. One initial settings file-watch timeout passed separately and on the full-suite rerun. Earlier 926-test verification included unrelated concurrent checkout changes, excluded from this delivery.

### Commands after / and Clear on the board (2026-10-16, working tree)

Anton found that typing / in a conversation offered nothing, and that Clear, confirmed, only closed the conversation on the board. A skill sent as `/name` already ran: a recorded `claude -p --input-format stream-json` 2.1.300 turn with a project skill answered as the skill said. What was missing was the list. The `system/init` line names everything that may follow a / (`slash_commands`, with `terminal_slash_commands` for those only a terminal runs); `claude-read.ts` passes them on the `started` signal, without the terminal-only ones and the tool's own `_` names, and `main/commands.ts` keeps the last list per project in `userData/commands.json`. A project the tool has not started in gets the last list from anywhere, less the skills and commands that list's project keeps in its own `.claude` folder. The composer offers them like files after @: at the very start of a message, filtered by what is typed (a name that starts with it first, then one that holds it, in the tool's order); Tab or Enter puts one in, Enter on a name typed out in full sends it, Escape puts the list away until more is typed. Codex offers none. On the board a new conversation is no conversation shown, so Clear now opens New task in the cleared conversation's project, as the phone already did.

Evidence: `client/src/main/commands.ts`, `client/src/shared/commands.ts`, `client/src/main/sessions/claude-read.ts`, `client/src/renderer/src/chat/Composer.tsx`, `client/src/renderer/src/chat/Chat.tsx`, `client/test/commands.test.ts` and the new cases in `client/test/claude-read.test.ts`. Typecheck and `eslint src test` pass; the full suite passes 939 tests, with the same four failures in untouched tests as on `main` on this Windows machine with a Russian locale. By hand on Windows 11 from the source, beside the installed copy: / lists the project's skills first, `/comm` leaves three, Tab puts `/commit ` in the field, and Clear confirmed on a docked conversation opens New task in its project. The list in that run was the one recorded from the tool, put in place by hand, since no message was sent there; a list read from a live start is covered by the reader test only. Not tried: macOS, Linux, a host, the phone.

### The command line on Windows (2026-10-19, working tree)

Anton wanted `geckit start` from another program on Windows, where it could not work: `keepGuide` wrote no command there ("left with the guide alone until there is one it can run"), and `asked.ts` listened on `userData/geckit.sock` as a path, which Node on Windows refuses (`listen EACCES`), so even a command written by hand was told GeckIt is not running. Now `cli/endpoint.ts` names the meeting point for both sides: the socket file as before, and on Windows the pipe `\\.\pipe\geckit-<folder name>-<hash>`, the hash of the data folder as written in any case or slashes, since pipes are one namespace for the whole machine and a name cannot carry a person's name in another alphabet; nothing is removed from disk for a pipe. `guide.ts` writes the shell script on every platform, with forward slashes in the paths since Git Bash, which Claude Code runs on Windows, reads a backslash as an escape, and on Windows a `geckit.cmd` beside it for cmd and PowerShell: `setlocal` keeps its variables out of the shell it ran in, a path under the profile is written as `%USERPROFILE%` and the rest, which cmd expands itself in the console's code page, and a `%` elsewhere is doubled. `cliPath` says the path with forward slashes for the same reason; a path with a space in it is quoted in GECKIT.md, and the permission that lets `geckit start` through without a card knows a quoted path and one that begins with a drive letter. Codex on Windows runs PowerShell, so its guide names the `.cmd` and sends a batch from a file instead of a heredoc. `migrate-codex` sends its request at once and migrates here when nothing listens, since a pipe is not a file to look for.

Evidence: `client/src/cli/endpoint.ts`, `client/src/main/asked.ts`, `client/src/main/guide.ts`, `client/src/cli/index.ts`, `client/src/cli/migrate.ts`, `client/src/main/sessions/index.ts`; tests `client/test/endpoint.test.ts`, the launcher and Codex cases in `client/test/guide.test.ts`, the Windows and quoted paths in `client/test/requests.test.ts`, and `client/test/cli-codex.test.ts` now listening where the command connects, so it passes on Windows too. Typecheck and `eslint` pass; the suite passes 982 tests, with the same three failures in untouched tests as on `main` on this Windows machine. By hand on Windows 11 from the source, beside the installed copy: the dev copy listens on `\\.\pipe\geckit-geckit-local-<hash>` and writes `geckit-local` and `geckit-local.cmd`; `sessions --today` answers through both, from Git Bash, cmd and PowerShell, and cmd's variables are as they were after the batch; `start` reaches the application and is answered by it (here with "not one of your folders", since the conversation asked from belongs to the installed copy's board, so the request card itself was not seen); against a folder with no GeckIt it says GeckIt is not running. Not tried: macOS, Linux, Codex, a host, a profile with a space or another alphabet in its name.

## Manager and personal Telegram bot - 2026-10-17 (working tree)

Alex requested a first version after the spec/UX/UI handoff. Following the latest correction, Manager conversation and decisions are Telegram-only. Desktop Settings provides assistant/model selection, automatic or approval-based delegation, bot pairing/status and pause/retry/restart/disable recovery. No Desktop/phone Manager chat or backing-session navigation is exposed; current and archived backing sessions are hidden from ordinary discovery, history and routes. Ordinary managed workers remain accessible. Manager is a special session on any enabled builtin/library provider; workers use explicit enabled provider routing (task override, project preference, global default), with disabled/host-incompatible selections blocked without substitution. All registered projects across profiles are included.

Manager instructions require CLI administration and delegated deep work; normal provider tools, authentication and permissions remain. No universal tool sandbox is claimed. The session submits validated literal requests to the authenticated GeckIt CLI for project/file/provider-preference and managed-worker operations. Capability discovery names unsupported advanced settings and remote file operations. A dedicated user-owned Telegram bot uses protected local credentials, private pairing plus exact desktop confirmation, sender authorization, delayed-message decisions and durable uncertainty handling. Disabling Manager revokes Telegram access.

Evidence: `client/src/main/manager*.ts`, `main/telegram*.ts`, special-session creation/context, shared contracts, CLI/native/preload/phone bridges and `chat/Manager*.tsx`. [Specification and design](../specs/011-manager-telegram/design.md), [UX](ux/manager-telegram.md), [implementation verification](../specs/011-manager-telegram/verification.md). The final integrated suite passes 1,041 tests across 76 files; typecheck, lint and Desktop/mobile production builds pass. Provider-specific creation/models, confirmed replacement/recovery and delayed outcomes are tested with Codex RPC and library fixtures. Offline runtime tests, real temporary persistence/CLI socket checks and actual renderer fixtures are distinguished from live integration in the verification record. No real provider task, bot token/Telegram account, native credential store or installed device flow has been verified. This is local working-tree support, with no release or publication claim. The updated Telegram-only feature-list entry awaits Alex's response; this evidence does not add a proposal as released support.

### Telegram native approvals and setup - 2026-10-19 (working tree)

Alex requested Telegram approval for the displayed Computer Use request, repaired empty message spacing and a better bot setup flow. The paired private account can now answer supported managed-worker and current Manager native permissions, plans, listed question choices and empty elicitation, including exact live-session Computer Use remembering. Native request identity, ownership, enabled providers, lifecycle and VPN checks remain authoritative; stale/duplicate/revoked answers do not grant access. Typed/URL/error/oversized forms retain explicit GeckIt handoff without buttons. `/status` refreshes current requests. Reproducible blank-output and chunk-edge paths are normalized; the screenshot's raw historical message was unavailable. Settings guides official BotFather creation, masked token entry, pairing and exact account confirmation, with an existing-bot shortcut and cancellation/recovery. Shared bot routing needs a hosted service; none is deployed.

Evidence: `main/manager-approvals.ts`, `telegram-text.ts`, `manager.ts`, `telegram.ts`, `sessions/index.ts`, native wiring and actual `chat/ManagerTelegram.tsx`. [UX amendment](ux/manager-telegram.md#telegram-approvals-and-guided-setup---2026-10-19), [verification](../specs/011-manager-telegram/verification.md#telegram-approvals-formatting-and-guided-setup---2026-10-19). All 1,074 tests/80 files, typecheck, lint and Desktop/mobile builds pass. Fake Bot API plus real Sessions/injected drivers and Codex RPC fixtures establish contract behavior; production renderer reviewed in both themes and two window sizes. Live Telegram/provider/Mail/native credential-store and installed app flows remain unverified. Source-only changes; no restart, installation, commit, push or release. Feature-list inclusion awaits Alex's response.


### Desktop Manager inspection - 2026-10-19 (working tree)

Alex requested access to the Manager session from the bottom bar. A deliberate Desktop entry now opens a read-only view of the actual current provider-backed transcript, assistant/model/ID and live status, with Settings recovery. This supersedes the earlier absence of all Desktop inspection; Telegram remains the task/approval channel. Opening preserves the worker/draft and starts no work. Disabled retained history, empty/error/retry, live loading and session replacement are handled. Ordinary discovery/direct chat routes and phone remain protected; archived backing sessions are not exposed.

Evidence: `chat/ManagerInspection.tsx`, `Transcript.tsx`, `AssistantStatus.tsx`, dedicated current-only main/preload contracts and runtime tests. [UX](ux/manager-telegram.md#desktop-manager-inspection---2026-10-19), [verification](../specs/011-manager-telegram/verification.md#desktop-manager-session-inspection---2026-10-19). All 1,079 tests/80 files, typechecks, lint and Desktop/mobile builds pass. Actual renderer fixtures reviewed in both themes and two desktop sizes; worker preservation, focus/keyboard, live/replacement and paging checked. Live provider/Telegram and installed app behavior remain unverified. Local changes only, no restart/install/commit/push/release. Feature-list inclusion awaits Alex's response.

### Telegram message formatting and Manager panel - 2026-10-19 (working tree)

Alex asked for a better Manager panel and for Telegram messages that look right and use Telegram's own features. Everything GeckIt sends is now rendered to Telegram HTML by a dedicated module: bold, italic, strikethrough, inline code, fenced code with language, links, quotes folded past ten lines, bullets and checkboxes, and markdown tables padded into monospace blocks. A refused formatted send is repeated once as the plain words, so no message is lost to a parse error. Answered questions keep their words and lose their buttons, acknowledgements reply to what they acknowledge, the bot fills Telegram's command menu and profile line, and `/status` lists each worker with what it is doing. The Desktop Manager panel replaces its assistant/model/session list with a state dot beside the title, one facts line and a quiet session id, and centres its loading, empty and failed bodies. Its way to the settings is a gear beside the close rather than a text button next to the title.

The panel's transcript also stops showing what GeckIt wrote into the Manager session as the JSON the manager was handed: what came from Telegram, a worker's news and the result of a GeckIt command are each drawn as what they say, with the raw text one fold below.

Evidence: `main/telegram-render.ts` (new), `telegram.ts`, `telegram-text.ts`, `index.ts` status wiring, `chat/ManagerInspection.tsx`, `chat/manager-label.ts`, `chat/manager-said.ts` (new), `chat/ManagerSaid.tsx` (new), `chat/Transcript.tsx`, `styles.css`. [UX amendment](ux/manager-telegram.md#telegram-messages-and-the-manager-panel---2026-10-19), [verification](../specs/011-manager-telegram/verification.md#telegram-messages-and-the-manager-panel---2026-10-19). All 1,097 tests/81 files, typecheck, lint and the Desktop build pass; sixteen of those tests are new. Rendering is established by the module's own output and by the fake Bot API, and the panel by the actual renderer in both themes and at a forced narrow width. No message was sent to a real Telegram bot or account, so Telegram's own rendering of this HTML is not observed. Local changes only, no restart, install, commit, push or release. Feature-list inclusion awaits Alex's response.

### Telegram reply context - 2026-10-20 (working tree)

Alex explicitly requested contextual replies. The paired bot remembers successful Manager prose chunks and known-origin acknowledgements with their original Manager session, message identity/text and causal managed-worker candidates. Replies to earlier messages retain that context across protected-state reload, while the current Manager coordinates; no manual session is attached or directly controlled. Mixed worker events retain all candidates. Unknown/ambiguous/cross-chat/foreign-author/external/quote-only references fail safely, custom quote text never supplies identity, delayed instructions retain confirmation, and native decisions retain their bound answer flow. Status/setup/error messages without reliable origin remain unmapped. Telegram message deletion is not detected; inaccessible references fall back and unowned/deleted task origins are rejected.

Evidence: `main/manager.ts`, `telegram.ts`, `telegram-bot.ts`, `index.ts`, `shared/manager.ts`, tests `manager.test.ts` and `telegram.test.ts`, [UX amendment](ux/manager-telegram.md#telegram-reply-context---2026-10-20), [focused verification](../specs/011-manager-telegram/telegram-replies-verification.md). Final full suite: 1,104 tests/81 files passed; typecheck, source/test lint and Electron production build passed. Actual ingestion through real Manager/Sessions uses fake Bot API/provider drivers and real temporary disk reload of Manager and sealed Telegram adapters; NotesStore/Sessions remain in memory. No live Telegram/provider/credential-store/installed-app restart or released availability is claimed. Narrow feature-list entry is authorized by this explicit request; older pending Manager inventory is unchanged.

### Telegram attachments - 2026-10-20 (working tree, In review)

Alex explicitly requested two-way images/files. Paired private photo and document messages now preserve captions, message/group identity and authorized reply context. PNG/JPEG/GIF/WebP bytes use existing native provider image input; other documents are real local files for supported provider tools, with a bounded UTF-8 excerpt where applicable. Manager can deliberately import retained input to an owned local worker and select an intended project deliverable for photo/document upload. Successful upload saves a Telegram message ID and Manager/worker origin. Unowned/manual/SSH/private-path transfers are rejected; media cannot answer native approvals. Files and transcript links do not trigger automatic upload.

Cache payload is bounded to 20 MiB per input, 200 MiB and 256 files, with 24h unpinned retention, queued-reference pins, startup/access/periodic cleanup and disconnect clearing. Explicit worker imports are permanent project inputs until user/project cleanup, separately documented and acknowledged. Definite upload rejection and uncertain outcomes are surfaced without blind retry. No release availability is claimed.

Evidence: `main/telegram-attachments.ts`, `telegram-bot.ts`, `telegram.ts`, `manager.ts`, `manager-operations.ts`, `sessions/index.ts`, Manager instructions, authenticated CLI command validation and tests. [UX](../specs/014-telegram-attachments/ux.md), [contracts](../specs/014-telegram-attachments/contracts/commands.md), [verification and logs](../specs/014-telegram-attachments/verification.md). Full controlled suite: 1,118 tests/82 files; typecheck, lint and Electron production build passed. The composed test uses actual Manager/Sessions, filesystem, parser/cache, authenticated operation and multipart bridge with fake Telegram fetch and provider driver. Live Telegram/provider accounts, credential storage and installed-build loading remain unverified; no live send or app restart. At initial review there was no commit, push, merge or deploy; Alex subsequently authorized pushing to main. Sharing PR #27 and formatting branch are preserved; transport integration requirements are recorded. The explicit request authorizes expanding the existing feature-list entry.

## Local links from Telegram - 2026-10-20

Open what Manager names: `main/shares.ts` (what may be shared, 12 h links, at most 20, refused paths, folder traversal and symlink checks, origin-pinned site fetch), `shared/share.ts`, `main/telegram.ts` (Open, Stop sharing, `/links`), `renderer/src/peer/main.ts` (share rooms over the phone pairing transport), `viewer/` (the link page, built into `signal/public`), `chat/ManagerTelegram.tsx` (Shared links in Settings). Tests: `test/shares.test.ts`, `test/telegram-links.test.ts`, `test/peer.test.ts`. A local harness ran the real `Shares`, peer page and viewer over Firestore and WebRTC in Chrome on this machine: site with assets, API, form redirect and navigation; folder, HTML and download files; refused traversal and hidden files; Stop, reconnect, no answer, a site whose server stopped and came back, and a press on a port nothing answers on. Not verified: another network or a real phone, the Telegram in-app browser, the Electron app. [UX](ux/telegram-local-links.md)

The link page is deployed at `geckit-signal.web.app` from `signal/public`; the hosted bundle and service worker match the build of this branch byte for byte, and only the viewer is served there (the Firestore rules and the functions are not).

Amendment, same day: Alex asked for the link to be in the words rather than behind a button, with no setting and no way to turn it off. GeckIt now reads its own outgoing message, shares what passes the checks and puts the link in place of the words (`shared/share.ts` `shareMentions`, `main/telegram.ts` `linked`); the Open and Stop sharing buttons, the `share` callback and the refusal when twenty links are live are gone, and the twenty-first link ends the oldest (`main/shares.ts`). A path written as code is linked with its backticks dropped, a path inside a fenced block is left alone, and at most eight targets in one message become links. What cannot be shared stays plain text and says nothing. Evidence: `test/shares.test.ts`, `test/telegram-links.test.ts` (five tests over the fake Bot API, including the code span, the fenced block and the eviction); the messages the real `ManagerTelegram` and `Shares` produced were rendered in a Telegram-like mock at phone width in both themes. Telegram's own rendering is still unobserved: no message was sent to a real bot or account.

## Session grants no longer flicker a conversation into asking - 2026-10-21

Alex reported that allowing a session in the Ollama library let later requests through by themselves, but the board flickered to "asking you" and back each time. The cause was in the core, not the library: an ask covered by a session grant was answered on the spot, but only after the card had been drawn and the row had been put into the asking state. The card was folded a moment later, so the request was allowed and the row still said it was asking for a moment.

An ask a session grant covers is now answered without a card at all. The public IP check still runs before the answer, and a refused check still holds it for a deliberate Try again, now under its own held operation so the retry redelivers the same answer.

Evidence: `client/src/main/sessions/index.ts` (`#asked`, `#allowed`, the `allowed` held operation and its retry), `client/test/sessions.test.ts` (two tests: the command shape and the tool shape a library sends, both asserting the row never says it is asking). Before the change the same scenario reported the states `asks` then `working`; after it, only `working`. The real core, the real OpenCode library, a real OpenCode 2 server and a real Ollama model were run together: the permission card appeared, "Allow for session" folded it, and the repeated command produced no second card and no asking state. Full suite: 1,145 tests/84 files; typecheck and lint passed. No installed-app or released availability is claimed.

## Auto mode for the OpenCode + Ollama library - 2026-10-21

Alex asked whether Auto could be simulated in the library, which had run as Manual and said so. It now runs as Auto: the tools that only look - reading a file, searching, listing and asking the person a question - go through without a card, and everything that changes something - running a command, changing a file, opening a page - is still asked about, one card at a time. There is no safety reviewer behind it, so nothing that changes anything is let through on its own. Choosing Auto while a card is up sends that card back to be asked about again under the same rule.

The rules are OpenCode's own, and its own order matters: it takes the last rule that matches, so the wildcard that asks comes first and the tools that may run on their own come after it. This was confirmed against a live OpenCode 2.0.25 server, which also confirmed the tool names it asks with (`read`, `glob`, `grep`, `list`, `shell`, `edit`).

Evidence: `examples/opencode-provider/src/transcript.mjs` (`autoPermissions`, `autoAllows`), `src/driver.mjs` (the mode, the rules and `permit`), `test/provider.test.mjs` (Auto rules, and the switch to Auto allowing what only reads while asking about the rest), the library README and `docs/ux/opencode-llama.md`. Library suite: 49 tests. Against a live OpenCode 2 server and a real Ollama model, Auto reported mode `auto`, read a file without a card and asked about the command. The published library was updated and pushed; no installed-app or released availability is claimed.

## Automatic Manager recovery - 2026-10-21 (working tree)

Alex explicitly requested automatic recovery from "Manager unavailable". The local Manager record contained "Did not finish" with queued input and no uncertain operations; the runtime previously latched that error until manual retry. Ordinary turn/send/setup failures now schedule one retry after 5 seconds, doubling to a 60-second cap until a turn completes. Recovery retains the selected backing assistant/model and session, reconciles current work, then continues queued input in order. Begun inputs and CLI effects are not replayed. Pauses, disabled assistants, native approvals/refusals, non-transient VPN/hook guards, missing role metadata, provider mismatches and uncertain operations remain protected; manual-recovery refusals persist across restart. Lifecycle changes invalidate pending recovery work.

Evidence: `client/src/main/manager.ts`, `client/test/manager.test.ts`, [UX amendment](ux/manager-telegram.md#automatic-manager-recovery---2026-10-21), [verification](../specs/011-manager-telegram/manager-recovery-verification.md). All 1,166 tests, typecheck, package lint, production build and diff check pass. Focused tests exercise the real Manager/Sessions with injected provider drivers, actual temporary disk reload and timer control, including ordering, identity, worker preservation, backoff/reset, reload, interrupted sends, late results, cancellation, guard/native refusals and delayed creation races. The existing real CLI socket test also passes. No renderer layout or control wording changes; live inference, Telegram and installed-app loading are not established by these fixtures. Feature-list expansion is authorized by the explicit request; no release availability is claimed.

### Manager VPN lookup correction - 2026-10-21

Alex reproduced the unavailable state with the exact public-IP lookup failure. Read-only inspection of the local durable records confirmed an enabled, unpaused Manager with `manualRecovery: true`, a retained message and `VPN_IP_UNAVAILABLE_ERROR`. The initial recovery excluded all guard failures; manual Manager retry could also queue reconciliation behind the retained send. Manager now automatically revalidates this exact transient failure, including old manual-only records. Sessions retries the authorized retained Manager message through its existing IP checks, or sends reconciliation for an already-started turn interrupted by the monitor. Verified unapproved IPs, invalid configuration, native answers and hook blocks remain held. Ordinary worker recovery is unchanged.

Evidence: `client/src/main/manager.ts`, `client/src/main/sessions/index.ts`, `client/test/manager.test.ts`, [UX correction](ux/manager-telegram.md#vpn-lookup-recovery-correction---2026-10-21) and [verification](../specs/011-manager-telegram/manager-recovery-verification.md). Runtime tests use real Manager/Sessions with substituted IP checks and provider drivers. They cover repeated lookup failure, approved recovery and FIFO delivery, old saved holds, manual retry, mismatch, native approval answers, monitor interruption without prompt replay and cancellation during a pending check. Live inference, actual VPN/network recovery and installed-app loading are not established by these fixtures. No renderer layout or wording changed. Full suite: 1,177 tests; typecheck, actual package lint, production build and diff checks pass.

### Manager CLI delivery recovery correction - 2026-10-21 (working tree)

Alex explicitly requested unattended recovery from the screenshot's paused state. Read-only inspection found enabled Manager, the retained Codex identity, 16 queued requests and one uncertain `telegram send-file` rejected by the bridge's earlier connection-wide uncertainty flag. Manager now recovers coordination without replaying that action. Old automatic delivery pauses migrate automatically; explicit user pauses are separately persisted. Interrupted reads become failed reads with no review decision. Authenticated host results are saved before the CLI reply, so a lost reply uses its receipt and late completion resolves uncertainty without another mutation. Unresolved operations stay available to reconciliation and do not block other work. Telegram retains individual upload fingerprints before sending and after an uncertain outcome, including across restart. Uncertain text messages and other files no longer block all uploads.

Evidence: `client/src/main/manager.ts`, `client/src/main/manager-operations.ts`, `client/src/main/manager-protocol.ts`, `client/src/main/telegram.ts`, `client/test/manager.test.ts`, `client/test/telegram.test.ts`, [UX correction](ux/manager-telegram.md#cli-delivery-recovery-correction---2026-10-21) and [verification](../specs/011-manager-telegram/manager-recovery-verification.md). Final validation: all 1,206 tests in 85 files, all TypeScript targets, package lint, production build, Mermaid and diff checks passed. The new composed recovery and fresh-upload regressions fail on the pre-fix source for the reported reasons. One unchanged settings-file watcher timed out on a full run, then passed in isolation and on the final full rerun. Providers and Telegram network remain substituted; no live inference, real Telegram send or running-app reload is claimed. This expands the recovery feature Alex explicitly requested. Availability remains working-tree only; active app and conversations are not restarted.


## Worker retry and immediate Manager steering - 2026-10-24 (working tree)

Alex explicitly requested Sol implementation of truthful worker delivery results, deliberate CLI recovery after VPN pauses and immediate corrections into current work. Ordinary Send keeps its follow-up queue. Explicit `sessions retry` shares the app recovery path and VPN/native checks. Explicit `sessions steer` uses the working driver's native injection, refuses unsupported or blocked states without silently queueing, and leaves other queued work in place. A host-accepted dispatch does not prove native transport acceptance or model application; a steered receipt means native injection resolved, not that the model consumed it. Persisted attempt metadata and immutable command receipts allow current state to be distinguished from earlier notifications/results.

Evidence: `client/src/main/sessions/index.ts`, `manager-operations.ts`, `manager-protocol.ts`, `manager.ts`, [UX](ux/manager-retry-steering.md), [incident and verification](../specs/011-manager-telegram/retry-steering-verification.md). This expands existing orchestration/recovery entries under Alex's explicit request. Availability remains working-tree only; live app and worker sessions are not restarted.

### Manager VPN address-change recovery - 2026-10-24 (working tree)

Read-only persisted Manager state matched Alex's screenshot: enabled, not user-paused, retained exact unapproved-address error, manual recovery, and a held message. Both Manager recovery eligibility and Sessions.retryManager recognized unavailable lookup errors only. Automatic revalidation now includes exact canonical public-IP mismatch errors through the existing guarded retry path, without dispatch while verification fails. Configuration/hooks/native answers remain outside automatic recovery. See [UX decision](ux/manager-retry-steering.md#manager-recovery-after-a-changed-vpn-address) and [verification evidence](../specs/011-manager-telegram/retry-steering-verification.md). This extends the approved recovery workflow rather than adding another product feature.

## Manager task sources - 2026-10-25 (working tree)

Explicitly requested by Alex: external sources, working hours and first Voice Memos confirmation flow. The new feature entry describes only this working-tree slice, not released support. Shared typed source/cursor/read/capability contract, atomic intake state, baseline/cutoff, schedule and durable confirmed handoff live in `shared/manager-intake.ts` and `main/manager-intake.ts`; `main/voice-memos.ts` queries a temporary copy of observed private macOS storage and converts copied audio. Only enabled builtin restricted classifiers can analyze transcripts, behind the existing VPN check. Existing paired Telegram decisions authorize task/note/ignore; actual Manager delegation and native permissions remain. Settings uses existing components/tokens.

Evidence: `test/manager-intake.test.ts`, `test/voice-memos.test.ts`, `test/intake-classify.test.ts`, source additions in `test/manager.test.ts` and `test/telegram.test.ts`; actual Settings renderer fixture `test/browser/manager-sources/`. Native SQLite and afconvert exercise synthetic recordings only. The local real Voice Memos read-only probe was denied; no private recording, real classifier call or live Telegram was exercised. Full verification results are recorded in [the feature quickstart](../specs/015-manager-sources/quickstart.md). Linear remains an extension contract, not an integration.

Manager source connection follow-up: automatic current-user Voice Memos discovery, compact source-first Settings, permission-pane action and local transcription readiness. Legacy source IDs/paths and intake state remain supported. Actual-library read is access-blocked on this host; connection and migration regressions use isolated fixtures.

## Desktop gecko - 2026-10-28 (feat/gecko-character branch)

Alex approved the entry on 2026-10-28 after asking for the demo gecko to be built into the app with resize, move and hide/show. The floating window and its menu window are `client/src/main/windows.ts`; state, cursor, menu choices, screenshot, voice task and tray item are `client/src/main/gecko.ts` and `client/src/main/tray.ts`; the state rules and menu layout are `client/src/shared/gecko.ts`; the drawing from the demo's frames is `client/src/renderer/src/gecko/`. Behaviour and wording: [UX](../specs/016-gecko-character/ux.md).

Evidence: commits ba1e6c8 and 2ebd3cc; lint, typecheck and 1378 tests pass (`client/test/gecko*.test.ts`). Checked in the preview page and an Electron harness with the gecko's own window options (`docs/design/gecko/frames-electron.jpg`, `menu-electron.jpg`). Not exercised: real speech through to New task, the crosshair after the camera, a file dragged from Finder, the real menu bar item, and other systems. Not merged or released.
