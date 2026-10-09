# Verify plugin logs

Run client host tests/typecheck and build both maintained examples. Test fake backends only. Run tmux tests with an isolated TMUX_TMPDIR, with sandbox approval if Unix socket creation is restricted.

After installing updated GeckIt and libraries, logs live under the app userData/provider-logs directory. On macOS the installed app uses ~/Library/Application Support/geckit/provider-logs and development uses geckit-local/provider-logs. Follow plugin-claude-tmux.jsonl with tail -F; filter usage.command.sent to count actual /usage commands. Read the .1 file for rotated history.

Initialize limits, poll without messages through an elapsed cooldown: no additional usage.command.sent. Send one message and expire cooldown: exactly one usage check. Failed/queued sends do not enable it; overlapping reads coalesce. Inspect Mirror limits backend events and OpenCode cached limits/server/request lifecycle. Old factory and no-context plugin tests must remain passing. Logs contain no fixture prompt/body/password/authorization values.

Executed validation results and release limits: [verification.md](verification.md).
