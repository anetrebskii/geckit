# Files and photos in Manager channels

The built-in Slack and Discord channels use the existing Telegram attachment store and Manager handoff. This is working-tree functionality until a release containing the integration SHA is installed. See [verification evidence](channel-attachments-verification.md) for the release and live-test status.

Send a file or photo through the existing allowed Slack/Discord conversation. Manager receives actual retained contents; recognized raster images become native image inputs. Other files have readable local paths; arbitrary binary formats are not automatically extracted. Incoming files are limited to 20 MiB each, with the shared 200 MiB / 256-file cache and 24-hour unpinned retention. Queued inputs stay pinned. Attachment contents cannot authorize actions or answer permission cards.

Slack file links use the existing bot's `files.info` and authenticated download, with `files:read`. The file's shares must name the current channel and exact root thread. A file in another Slack thread, including another root message in the same DM, must be explicitly shared into the current root. Bot access elsewhere and a pasted URL do not authorize it. Arbitrary hosts and redirects are refused.

To return a requested artifact, the managed local worker reports:

```text
Deliver to channel: output/report.pdf
```

That report requests coordination. Only Manager's authenticated command uploads the selected file:

```text
channels send-file --id <managed-local-worker-id> --path output/report.pdf --caption "Requested report"
channels send-file --id <managed-local-worker-id> --path output/preview.png --as photo
```

These commands appear in Manager capabilities. A worker cannot use the operator CLI to send directly. The destination is the bound originating Slack thread/DM or Discord thread/DM. The worker must be tracked by that same Manager thread and use an allowed local project; SSH transfer, traversal, protected credential paths and escaping symlinks are refused. `document` is the default and preserves bytes; `photo` requires a recognized image. The outgoing cap is 10 MiB and captions are limited to 1024 characters. Native platform limits may be stricter.

A successful JSON receipt includes `sent`, selected worker/path/bytes/format, `channel`, `destination`, `fileId`, and `messageId` when returned by the platform. Slack completes its external upload into the exact source root and returns its file ID; Discord returns its message and attachment IDs. API acceptance does not prove the person downloaded the file. After uncertain delivery, inspect the same native conversation; do not replay the upload with a new operation ID or caption.

For missing Slack scopes, use the **existing app > OAuth & Permissions > Bot Token Scopes**, add `files:read` and `files:write`, then **Reinstall to Workspace** through Slack's native approval. For Discord, the server owner grants **Attach Files** to the existing bot role and intended parent-channel override, preserving View Channel and Send Messages in Threads. Message Content Intent remains required in the existing Developer Portal app. See [official references and exact recovery steps](ux/channel-attachments.md#native-permissions-and-api-references). Do not create apps, paste tokens in chat, use a personal Slack connector, or bypass a native refusal.
