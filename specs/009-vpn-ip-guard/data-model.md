# Data model

- Settings.vpnIpCheck:boolean, default false; off retains list.
- Settings.vpnIpCheck also governs active-session monitoring/stopping. Legacy vpnStopOnFailure preferences are discarded; false cannot bypass the main setting.
- Settings.vpnAllowedIps:readonly string[], default empty; exact canonical public IPv4/IPv6, deduplicated. Invalid edit rejected atomically. Enabled unusable list blocks.
- Verification dependencies: family discovery and abortable probe; result scoped to attempted dispatch, never persisted.
- Held operation: union composed from SessionMessage and existing answer/mode/destination types. Preserve text/images/answer selection and queue identity. Distinguish unsent from started failure. One active promise/cancel identity per destination. Persist held messages/queue in NotesStore; ephemeral provider answers only while process/card exists.
- Renderer rejected new submission: retain exact attempted submission separately from newer draft edits using existing draft/attachment state.
- Session marker: minimal checking/guard-held metadata alongside existing attention state; preserve asks and avoid generic failed-turn queue extraction.

- Periodic policy identity: effective switch/address fingerprint, generation and one timer/in-flight check. Shared across active sessions, never persisted or reusable for a send.
- Periodic session pause: retained stop explanation, parked queue and continuation marker; persisted recovery survives provider finish and restart. Existing unsent-operation metadata takes precedence.
