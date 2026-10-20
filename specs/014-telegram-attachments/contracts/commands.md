# Attachment coordination contract

Commands are authenticated Manager operations with literal argument arrays, never shell interpretation.

- `attachments send --attachment <opaque-id> --id <managed-local-worker> --text <instruction>`: resolve retained source, copy actual content under validated worker root and pass native image where supported. No arbitrary source paths or SSH fallback.
- `telegram send-file --id <managed-local-worker> --path <project-relative-file> [--caption <text>] [--as photo|document]`: explicitly select intended deliverable, default document preserves file bytes, return Telegram message ID only after accepted upload. No automatic upload from transcript links.

A worker asks Manager to send its completed intended deliverable by reporting its exact project-relative file path and requested caption/type in the normal result. Manager still issues the explicit command; worker prose is not upload authority by itself.

Caption, file and cache limits are validated before side effects. Outside-root/symlink/unowned/remote targets fail rather than use another local file. Interrupted send produces uncertainty, never implicit retry. Incoming media cannot answer a native decision; existing bound controls apply.
