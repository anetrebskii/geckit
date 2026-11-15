# Destination contract

Existing Shortcut/ShortcutDraft gain optional destination. Shared destination types compose existing ChannelId and Shortcut fields. Settings advertise version support; save/readback rejects an old host dropping the field.

Channel gains optional destinations discovery and publishShortcut operation. Discovery returns stable place IDs, names and actual native thread semantics. Publish receives the immutable run UUID, destination, title, cleaned result and a bind callback restricted to that run. After creating a native place, the module invokes bind with its ChannelThread, registers the module's ordinary inbound/watch route, posts the result and returns native receipt identities/link. Existing libraries without these hooks continue unchanged and are unavailable in the result selector.

Channels validates the active module, current connection and destination, invokes publication, and enforces the scoped Manager binding and cleaned output. No module may bind arbitrary source workers. Discord uses its existing author allowlist and no-mention inbound path for known threads. Slack uses its existing human membership gate, extended only for known scheduled-result threads. Telegram remains explicitly unsupported by the destination selector, without claiming nonexistent threads.

Existing shortcuts CLI --draft and employees shortcut add/edit advertise, validate, save and read back the same optional destination. Removing destination is explicit; unrelated edits preserve it. Shortcut run listing reports persisted source, completion and delivery state without implying live success. New core methods propagate through authenticated RPC, desktop IPC/preload and phone allowlist. No new permission or provider capability is implied.
