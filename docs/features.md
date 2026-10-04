# GeckIt features

Combined product feature list agreed with Alex on 2026-10-04. Describe what GeckIt adds to the workflow; model reasoning, coding and tool execution belong to the underlying assistants. Supporting evidence and implementation details are in [the feature audit](feature-audit.md).

## Desktop and work management

- **Kanban for AI sessions.** Conversations are tasks on one board across projects: In progress, In review and Done, with working, waiting and blocked states. Open a card to continue the conversation; move, reorder, favorite, hide or manage several cards together. List view is available too.
- **Multiple AI providers.** Codex and Claude Code sessions share the same workspace. Independent provider libraries extend the available assistants; library support is present in the current working tree, with release availability still to be confirmed.
- **Remote AI over SSH.** Manage conversations on remote computers alongside local sessions on one board, using existing SSH configuration, agent and jump hosts. Builtin remote execution currently supports Claude Code; builtin Codex runs locally.
- **Remote work survives disconnection.** Jobs on SSH hosts keep running when the laptop sleeps or loses its connection. GeckIt catches up when it reconnects.
- **Goals and review.** Set, view and edit a task's completion condition, follow it on the board and see completed work move to In review. The assistant executes the goal; GeckIt connects it to the task workflow.
- **Work orchestration.** Queue follow-up messages, edit or cancel them, limit simultaneous conversations and use board order to prioritize waiting work. Delegate a queued message into another conversation or review new tasks requested by an assistant.
- **Scheduled work.** Save prompts as shortcuts, including their project, goal and assistant settings. Run them manually or on daily, weekday, weekly or cron schedules while GeckIt is open.
- **Screen recording to task.** Show a problem and narrate it; turn the words, frames and video into a question or task with context. Capture screenshots into tasks and questions too.
- **Cross-session search and profiles.** Find past decisions across conversations without remembering their project. Separate work and personal projects with profiles.
- **Recovery and attention.** Identify and continue sessions interrupted by closing GeckIt; retain pending messages. Receive notifications when work finishes or needs an answer.
- **Voice workflows.** Speak commands to start, message, stop or mark work, with a review before execution. Dictate directly into conversations or other applications; import audio and retain transcription history.
- **Selected-text correction.** Correct grammar, improve, translate or explain text selected in another application, then copy the result or restore the original.
- **Reusable phrases.** Keep frequent instructions and add them to follow-up messages without retyping.

## iPhone app

- **Encrypted P2P connection.** Pair by QR code and connect to the computer over WebRTC. Use a direct connection when possible, with an encrypted relay fallback when required.
- **Remote Kanban and conversations.** Access the board away from the desk, follow work across projects and providers, start tasks, reply and stop work. Remote access requires the paired computer and GeckIt to be online.
- **AI approvals from the phone.** Answer permission requests, questions and proposed task handoffs without returning to the computer.
- **Computer control for manual actions.** View the Mac screen and use the phone as a trackpad and keyboard to handle browser buttons, system dialogs and other actions requiring a person. Pointer and keyboard control currently supports macOS.
- **Computer localhost access.** Open development pages in the phone app through the paired computer, including SSH-forwarded host pages. WebSocket and hot reload traffic do not cross this bridge.
- **Computer file access.** Open files and folders linked in conversations, read from the paired computer or an SSH host.
- **Work management and notifications.** Search conversations, switch profiles, manage shortcuts and schedules, edit goals, and receive push notices when attention is needed.

## Keeping this list current

When a new implemented product feature is missing, propose its exact entry to Alex and ask whether to include it. After approval, append it to the relevant section automatically, without asking again. Merge an expansion into an existing entry when appropriate, and keep implementation evidence in [the audit](feature-audit.md). Proposals and inherited assistant capabilities are not current GeckIt features.
