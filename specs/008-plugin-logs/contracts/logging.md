# Logging contract

Factory: create(context), compatible with create() and older hosts.
Context: {log:{path:string,write(level,event,fields?)}}.
Fields: dynamic scalar dictionary (string, finite number, boolean, null). Records: {at,level,plugin,event,fields?}.
Logger is synchronous/nonthrowing; file writes are asynchronous and serialized. Current file <=2MiB, one .1 backup. No builtin provider objects, upload or new IPC.

Host: plugin.load.started/completed/failed and limits.host.requested/completed/failed.
Tmux: usage.check.started/completed/failed/skipped, usage.command.sent, message.sent, session lifecycle/turn events. Skips identify no-new-messages/cooldown/in-flight; checks include checkId/messagesSinceCheck/nextCheckAt where available.
Mirror: limits.backend.requested/completed/failed, safe session/turn outcomes.
OpenCode: limits.cache.returned (no remote limit check), transport start/stop/request/error and safe session/turn outcomes. Route templates omit session IDs/query/body; never log authorization headers or backend bodies.
