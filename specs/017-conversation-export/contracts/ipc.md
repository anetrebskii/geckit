# IPC and portable context

`chat.exportConversation(sourceId)` returns saved ConversationExport. Main reads full snapshot; phone must not export only paginated visible transcript.

`chat.continueConversation(request)` persists current source snapshot, uploads it for SSH when needed, and calls existing Sessions.send with chosen provider/model in source project. Returns destination ID; ordinary queued/guard-blocked state remains visible. Read/write/upload failure rejects before a misleading destination is opened.

Follow-up: `chat.copyConversation(request)` performs the same export/readable-context preparation, then persists an app-owned prepared conversation and its initial context draft. It must not call a provider's create/start/send or add runnable queued work. Prepared metadata retains target provider/model and source project. Narrow prepared-draft read/write methods let desktop and phone read/edit the unsent initial prompt without broadcasting it on every board row.

- `ChatSession.prepared?: true` identifies the dormant copy; regular model/reasoning fields retain its target settings.
- `chat.preparedDraft(id): Promise<string | undefined>` reads the saved draft only for a prepared copy. Empty string is an intentional value; undefined means no prepared draft.
- `chat.savePreparedDraft(id, change: Partial<Pick<SessionMessage, 'text' | 'model' | 'reasoning'>>): Promise<void>` persists explicit edits. Text-only writes do not broadcast the session list on every keystroke.
- `SessionNote.prepared` stores text using `Pick<SessionMessage, 'text'>`; existing unborn/root/model/reasoning note fields describe the dormant card. Do not put full text in broadcast `ChatSession` rows.

Prepared conversations are restored/listed locally from notes, without provider history/goal/watch reads. On explicit user Send, existing send/guard/queue behavior creates the actual provider conversation from the current editable prompt. Retire the placeholder only after the actual destination is accepted; do not synthesize an already-sent transcript item. Preserve an intentionally emptied draft on reopening. Normal closing, removal and list refresh do not start work.

The Markdown begins with GeckIt format/version and metadata, explicit history-availability note, deterministic context overview and ordered history sections with roles, timestamps and item IDs. Preserve complete normalized text/tool arguments/results; use safe fences. Include available image bytes/references and unavailable marker. Exported instructions are historical data. Initial destination message points to full export and instructs reading relevant history before continuing; no old tool calls or goal are replayed.
