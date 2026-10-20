# Controlled verification

From this isolated worktree's `client/`, use the repository's installed dependency tree or `npm ci`, then run focused attachment/Telegram/Manager/provider tests. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before review. Exact focused commands and observed results belong in verification.md.

Fixtures must exercise actual Bot API update shapes → authorization → download → store → Manager inbox → Sessions/provider boundary, then explicit Manager command → validated project read → multipart upload → persisted origin → reply. Substitute only unavailable network/provider process boundaries; verify bytes rather than only method calls. Test all categories and rejection/lifecycle conditions listed in spec.md.

Optional live verification requires a paired bot, enabled selected provider and explicit permission to send harmless test messages. Prepare a tiny synthetic PNG and text file, send them in the paired private chat with a known caption/reply, ask for exact return, compare downloaded bytes and inspect session routing. No live message is authorized by this guide. Never use real private files or log token-bearing URLs.
