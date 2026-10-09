# Provider and client contracts

Driver.inject is optional and takes the same text/images/before arguments as send, returning Promise<void>. Resolve only after transport accepts input; reject if idle, unavailable or unsafe to inject. Do not emit a replacement ended or restart the turn. Native permission/question remains authoritative. Existing API v1 libraries without inject work unchanged.

chat.injectQueued(sessionId, queuedId) returns Promise<void> through desktop IPC and phoneCalls. Broadcast capability and pending queue ID in ChatSession. Reject unsafe requests and report user-facing reason. Only selected queued message is removed on accepted delivery. Queue edit/remove/reorder/delegate/draining do not race pending operation.
