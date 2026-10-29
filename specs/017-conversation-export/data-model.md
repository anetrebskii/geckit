# Data model

- ConversationSnapshot: existing `ChatSession` metadata plus ordered readonly `SessionItem` history and capture timestamp. Source must exist and have exportable history.
- ConversationExport: persistent file path, capture timestamp and history-item count. File is UTF-8 Markdown in app-owned storage. Image data URLs are embedded when available; ref-only attachments remain identified references.
- ConversationContinuation: source chat ID plus chosen provider, optional model/reasoning and next instruction, composed from existing SessionMessage fields. Target must be enabled and compatible with source host.
- Source/destination relationship is descriptive metadata and first-message provenance; source work/queue/draft/goal remains untouched.
- State: editing -> exporting/exported or creating -> destination; errors retain editing choices. No automatic duplicate start retry.
- Prepared copy: app-owned dormant identifier, target provider/model/project and a persistently editable first-message draft. Metadata marks it prepared but does not broadcast the full draft per board row. No provider-native thread exists until explicit Send.
- Draft read/write preserves an intentionally empty string. Restore/list/open/delete stay local. Explicit first send creates the actual target and retires the placeholder only after existing send acceptance; failed preparation cannot leave a ready-looking copy.
- A retired note keeps `preparedDestination` pointing to the accepted destination, so a stale desktop or phone cannot send the same placeholder again.
