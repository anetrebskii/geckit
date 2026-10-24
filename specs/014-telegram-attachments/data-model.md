# Data model

Attachment metadata derives from existing SessionImage and Manager reply/session identities where applicable. Opaque IDs and generated owned paths are distinct from sanitized display filenames. Retained record identifies original type, observed byte size, creation/expiration, source message/group and materialized bytes. Validate every persisted record again when reopening.

Manager inbox messages may reference retained attachment IDs and source context; dispatch resolves readable bytes then uses existing SessionMessage native images for supported raster content. Generic file context points to real local content, labelled untrusted. Queued references cannot be silently evicted; failed resolution must stop dispatch visibly.

Explicit worker handoff validates current managed ownership and local real project root before copying bytes and delivering instruction. Its input copy lifecycle must be documented and bounded separately from app cache; cleanup never removes arbitrary project files.

Outgoing delivery carries selected worker/session, relative path, optional caption and chosen photo/document kind. Pairing is captured before asynchronous work and revalidated before send. A returned Telegram message ID creates an existing ManagerTelegramReply origin mapping. Definite failure throws; unknown outcome is durable uncertainty and never automatically replayed.
