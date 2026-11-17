# Design handoff

Use the existing public Channel API v2, not internal Manager imports or a new external control API. Manifest declares conversations, manager, replies, delivery and files; no control or shares. Each route and generation creates one shared non-owner Manager thread. Private chats have one admitted actor; the topic has admitted actors and a smaller approval list.

Visible flow: owner installs the local library, supplies one configuration-file path in the existing Channels form, enables it. Teammates write to the bot or configured topic and receive answers in place. No new application layout exists, so no standalone panel prototype is applicable. Existing channel UX: ../../docs/ux/channels.md. Detailed setup, commands, limits and limitations: ../../adapters/telegram-team/README.md.

SQLite owns durable offset/intake, generation bindings, outgoing intents, reply references and callback tokens. Native delivery receipts reconcile known handoffs. Unknown effects remain uncertain. Current membership is checked before dispatch/send. Disable revokes bindings and waits for in-flight operations; it does not stop already running native workers.
